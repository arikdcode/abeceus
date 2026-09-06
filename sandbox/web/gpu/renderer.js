/**
 * Presenter → WebGL2 contract
 *
 * drawFrame(canvas, {
 *   cam,
 *   map,
 *   solids,
 *   marks: { grid, shadows[], paths[], rings[], lines[], rects[],
 *            disks[], polys[], edges[], labels[] },
 * })
 */
import { camBasis, fovOf } from "./camera.js";
import { FOG, SUN } from "./theme.js";
import { FS_LIT, FS_OVERLAY, FS_SKY, FS_TEXT, VS_LIT, VS_OVERLAY, VS_SKY, VS_TEXT } from "./shaders.js";
import { LIT_STRIDE, MeshWriter, OVERLAY_STRIDE, TEXT_STRIDE } from "./mesh.js";
import { rasterFontAtlas } from "./font.js";
import { pushEmitPools, pushGround, pushShadows, pushSolids } from "./world.js";
import { buildLabels, buildOverlay, pushOverlayGrid } from "./overlay.js";

const surfaces = new WeakMap();
const litMesh = new MeshWriter(LIT_STRIDE);
const ghostMesh = new MeshWriter(LIT_STRIDE);
const overlayMesh = new MeshWriter(OVERLAY_STRIDE);
const textMesh = new MeshWriter(TEXT_STRIDE);

let ready = false;
let lastError = "";
let fontCanvas = null;
let frameData = new Float32Array(28);

export function rendererReady() {
  return ready;
}

export function initError() {
  return lastError;
}

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "shader compile failed";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "program link failed";
    gl.deleteProgram(p);
    throw new Error(log);
  }
  const block = gl.getUniformBlockIndex(p, "Frame");
  if (block !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, block, 0);
  return p;
}

function makeVbo() {
  return { buf: null, cap: 0 };
}

function upload(gl, slot, data) {
  if (!data.length) return 0;
  if (!slot.buf) slot.buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, slot.buf);
  const bytes = data.byteLength;
  if (slot.cap < bytes) {
    slot.cap = Math.max(bytes, 1 << 16);
    gl.bufferData(gl.ARRAY_BUFFER, slot.cap, gl.DYNAMIC_DRAW);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  return data.length;
}

function bindLit(gl, prog, stride) {
  gl.useProgram(prog);
  const b = stride * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, b, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, b, 16);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, b, 32);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, b, 48);
}

function bindOverlay(gl, prog) {
  gl.useProgram(prog);
  const b = OVERLAY_STRIDE * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, b, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, b, 16);
  gl.disableVertexAttribArray(2);
  gl.disableVertexAttribArray(3);
}

function bindText(gl, prog) {
  gl.useProgram(prog);
  const b = TEXT_STRIDE * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, b, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, b, 16);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, b, 32);
  gl.disableVertexAttribArray(3);
}

function surfaceOf(canvas) {
  let s = surfaces.get(canvas);
  if (s) return s;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("canvas has no webgl2 context");
  const lit = linkProgram(gl, VS_LIT, FS_LIT);
  const sky = linkProgram(gl, VS_SKY, FS_SKY);
  const overlay = linkProgram(gl, VS_OVERLAY, FS_OVERLAY);
  const text = linkProgram(gl, VS_TEXT, FS_TEXT);
  const ubo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferData(gl.UNIFORM_BUFFER, 112, gl.DYNAMIC_DRAW);
  const fontTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fontTex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fontCanvas);
  const fontLoc = gl.getUniformLocation(text, "u_font");
  gl.useProgram(text);
  gl.uniform1i(fontLoc, 0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  s = {
    gl,
    lit,
    sky,
    overlay,
    text,
    ubo,
    fontTex,
    litVbo: makeVbo(),
    ghostVbo: makeVbo(),
    overlayVbo: makeVbo(),
    textVbo: makeVbo(),
  };
  surfaces.set(canvas, s);
  return s;
}

function writeFrame(gl, ubo, cam, w, h) {
  const { eye, f, r, u } = camBasis(cam);
  frameData.set([r.x, r.y, r.z, 0], 0);
  frameData.set([u.x, u.y, u.z, 0], 4);
  frameData.set([f.x, f.y, f.z, 0], 8);
  frameData.set([eye.x, eye.y, eye.z, 0], 12);
  frameData.set([SUN.x, SUN.y, SUN.z, 0], 16);
  frameData.set([FOG.r, FOG.g, FOG.b, 0], 20);
  frameData.set([w, h, fovOf(cam), 0.2], 24);
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, frameData);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
}

export async function initRenderer() {
  lastError = "";
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", { alpha: false, depth: true });
    if (!gl) {
      lastError = "this browser has no WebGL2";
      ready = false;
      return false;
    }
    fontCanvas = rasterFontAtlas();
    ready = true;
    console.info("sandbox: WebGL2 ready");
    return true;
  } catch (err) {
    lastError = err?.message || String(err);
    console.error("WebGL2 init failed", err);
    ready = false;
    return false;
  }
}

export function resizeCanvas(canvas, w, h) {
  if (!canvas || !ready) return;
  const dw = Math.max(1, w);
  const dh = Math.max(1, h);
  if (canvas.width !== dw) canvas.width = dw;
  if (canvas.height !== dh) canvas.height = dh;
}

export function drawFrame(canvas, frame) {
  if (!ready || !frame?.cam) return false;
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const s = surfaceOf(canvas);
  const gl = s.gl;
  gl.viewport(0, 0, w, h);
  writeFrame(gl, s.ubo, frame.cam, w, h);

  const marks = frame.marks || {};
  litMesh.reset();
  ghostMesh.reset();
  overlayMesh.reset();
  textMesh.reset();
  if (frame.map) {
    pushGround(litMesh, frame.map);
    pushShadows(litMesh, marks.shadows);
    pushEmitPools(litMesh, marks.shadows);
  }
  pushSolids(litMesh, ghostMesh, frame.solids);
  buildOverlay(overlayMesh, marks, frame.cam);
  if (marks.grid && frame.map) pushOverlayGrid(overlayMesh, frame.map);
  buildLabels(textMesh, marks, frame.cam, w, h);

  const litN = upload(gl, s.litVbo, litMesh.view());
  const ghostN = upload(gl, s.ghostVbo, ghostMesh.view());
  const overlayN = upload(gl, s.overlayVbo, overlayMesh.view());
  const textN = upload(gl, s.textVbo, textMesh.view());

  gl.clearColor(0.078, 0.118, 0.157, 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(s.sky);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  if (litN) {
    gl.bindBuffer(gl.ARRAY_BUFFER, s.litVbo.buf);
    bindLit(gl, s.lit, LIT_STRIDE);
    gl.depthMask(true);
    gl.drawArrays(gl.TRIANGLES, 0, litN / LIT_STRIDE);
  }
  if (ghostN) {
    gl.bindBuffer(gl.ARRAY_BUFFER, s.ghostVbo.buf);
    bindLit(gl, s.lit, LIT_STRIDE);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, ghostN / LIT_STRIDE);
    gl.depthMask(true);
  }
  gl.disable(gl.DEPTH_TEST);
  if (overlayN) {
    gl.bindBuffer(gl.ARRAY_BUFFER, s.overlayVbo.buf);
    bindOverlay(gl, s.overlay);
    gl.drawArrays(gl.TRIANGLES, 0, overlayN / OVERLAY_STRIDE);
  }
  if (textN) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.fontTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.textVbo.buf);
    bindText(gl, s.text);
    gl.drawArrays(gl.TRIANGLES, 0, textN / TEXT_STRIDE);
  }
  return true;
}
