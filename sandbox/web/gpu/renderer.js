/**
 * Presenter → WebGL2 contract
 *
 * drawFrame(canvas, {
 *   cam,
 *   map,
 *   solids,
 *   casters, // optional; roofs that stay hidden still cast
 *   marks: { grid, shadows[], paths[], rings[], lines[], rects[],
 *            disks[], polys[], edges[], labels[] },
 * })
 */
import { camBasis, fovOf } from "./camera.js";
import { FOG, LAMP_FACES, LAMP_SHADOW_SIZE, MAX_LAMP_SHADOWS, MAX_LIGHTS, MAX_SPOT_SHADOWS, SUN, SUN_SHADOW_SIZE } from "./theme.js";
import { FS_DEPTH, FS_LIT, FS_OVERLAY, FS_SKY, FS_TEXT, VS_DEPTH, VS_LIT, VS_OVERLAY, VS_SKY, VS_TEXT } from "./shaders.js";
import { LIT_STRIDE, MeshWriter, OVERLAY_STRIDE, TEXT_STRIDE } from "./mesh.js";
import { rasterFontAtlas } from "./font.js";
import { collectLights, pushCasters, pushGround, pushLampCasters, pushSolids } from "./world.js";
import { buildLabels, buildOverlay, pushOverlayGrid } from "./overlay.js";
import { assignShadowLayers, assignSpotLayers, cubeFaceCam, spotShadowCam, sunShadowCam } from "./shadow.js";

const surfaces = new WeakMap();
const litMesh = new MeshWriter(LIT_STRIDE);
const casterMesh = new MeshWriter(LIT_STRIDE);
const lampCasterMesh = new MeshWriter(LIT_STRIDE);
const ghostMesh = new MeshWriter(LIT_STRIDE);
const overlayMesh = new MeshWriter(OVERLAY_STRIDE);
const textMesh = new MeshWriter(TEXT_STRIDE);

let ready = false;
let lastError = "";
let fontCanvas = null;
let frameData = new Float32Array(28);
const LIGHT_FLOATS = 4 + MAX_LIGHTS * 4 * 3;
let lightData = new Float32Array(LIGHT_FLOATS);
const SHADOW_FLOATS = 20;
let shadowData = new Float32Array(SHADOW_FLOATS);
const DEPTH_CAM_FLOATS = 24;
let depthCamData = new Float32Array(DEPTH_CAM_FLOATS);

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
  const frame = gl.getUniformBlockIndex(p, "Frame");
  if (frame !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, frame, 0);
  const lights = gl.getUniformBlockIndex(p, "Lights");
  if (lights !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, lights, 1);
  const shadow = gl.getUniformBlockIndex(p, "Shadow");
  if (shadow !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, shadow, 2);
  const shadowCam = gl.getUniformBlockIndex(p, "ShadowCam");
  if (shadowCam !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, shadowCam, 3);
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

function bindDepth(gl, prog) {
  gl.useProgram(prog);
  const b = LIT_STRIDE * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, b, 0);
  gl.disableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.disableVertexAttribArray(3);
}

function makeDepthTex(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  return tex;
}

function makeDepthArray(gl, size, layers) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH_COMPONENT24, size, size, layers, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  return tex;
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
    preserveDrawingBuffer: canvas.dataset.capture === "1",
  });
  if (!gl) throw new Error("canvas has no webgl2 context");
  const lit = linkProgram(gl, VS_LIT, FS_LIT);
  const depth = linkProgram(gl, VS_DEPTH, FS_DEPTH);
  const sky = linkProgram(gl, VS_SKY, FS_SKY);
  const overlay = linkProgram(gl, VS_OVERLAY, FS_OVERLAY);
  const text = linkProgram(gl, VS_TEXT, FS_TEXT);
  const ubo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferData(gl.UNIFORM_BUFFER, 112, gl.DYNAMIC_DRAW);
  const lightUbo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, lightUbo);
  gl.bufferData(gl.UNIFORM_BUFFER, LIGHT_FLOATS * 4, gl.DYNAMIC_DRAW);
  const shadowUbo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, shadowUbo);
  gl.bufferData(gl.UNIFORM_BUFFER, SHADOW_FLOATS * 4, gl.DYNAMIC_DRAW);
  const depthCamUbo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, depthCamUbo);
  gl.bufferData(gl.UNIFORM_BUFFER, DEPTH_CAM_FLOATS * 4, gl.DYNAMIC_DRAW);
  const sunShadow = makeDepthTex(gl, SUN_SHADOW_SIZE);
  const lampShadow = makeDepthArray(gl, LAMP_SHADOW_SIZE, MAX_LAMP_SHADOWS * LAMP_FACES);
  const spotShadow = makeDepthArray(gl, LAMP_SHADOW_SIZE, MAX_SPOT_SHADOWS);
  const shadowFbo = gl.createFramebuffer();
  gl.useProgram(lit);
  gl.uniform1i(gl.getUniformLocation(lit, "u_sun_shadow"), 1);
  gl.uniform1i(gl.getUniformLocation(lit, "u_lamp_shadow"), 2);
  gl.uniform1i(gl.getUniformLocation(lit, "u_spot_shadow"), 3);
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
    depth,
    sky,
    overlay,
    text,
    ubo,
    lightUbo,
    shadowUbo,
    depthCamUbo,
    sunShadow,
    lampShadow,
    spotShadow,
    shadowFbo,
    fontTex,
    litVbo: makeVbo(),
    casterVbo: makeVbo(),
    lampCasterVbo: makeVbo(),
    ghostVbo: makeVbo(),
    overlayVbo: makeVbo(),
    textVbo: makeVbo(),
  };
  surfaces.set(canvas, s);
  return s;
}

function writeFrame(gl, ubo, cam, w, h, sunOn) {
  const { eye, f, r, u } = camBasis(cam);
  frameData.set([r.x, r.y, r.z, 0], 0);
  frameData.set([u.x, u.y, u.z, 0], 4);
  frameData.set([f.x, f.y, f.z, 0], 8);
  frameData.set([eye.x, eye.y, eye.z, 0], 12);
  frameData.set([SUN.x, SUN.y, SUN.z, sunOn ? 1 : 0], 16);
  frameData.set([FOG.r, FOG.g, FOG.b, 0], 20);
  frameData.set([w, h, fovOf(cam), 0.04], 24);
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, frameData);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
}

function writeLights(gl, ubo, lights) {
  lightData.fill(0);
  const n = Math.min(lights.length, MAX_LIGHTS);
  lightData[0] = n;
  for (let i = 0; i < n; i++) {
    const L = lights[i];
    const po = 4 + i * 4;
    const co = 4 + MAX_LIGHTS * 4 + i * 4;
    const mo = 4 + MAX_LIGHTS * 8 + i * 4;
    lightData[po] = L.x;
    lightData[po + 1] = L.y;
    lightData[po + 2] = L.z;
    lightData[po + 3] = L.range;
    lightData[co] = L.r;
    lightData[co + 1] = L.g;
    lightData[co + 2] = L.b;
    lightData[co + 3] = L.intensity;
    lightData[mo] = L.shadowLayer ?? -1;
    lightData[mo + 1] = L.dx || 0;
    lightData[mo + 2] = L.dy || 0;
    lightData[mo + 3] = L.radius || 0;
  }
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, lightData);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, ubo);
}

function writeShadow(gl, ubo, sunCam) {
  shadowData.fill(0);
  if (sunCam) {
    shadowData.set([sunCam.r.x, sunCam.r.y, sunCam.r.z, 0], 0);
    shadowData.set([sunCam.u.x, sunCam.u.y, sunCam.u.z, 0], 4);
    shadowData.set([sunCam.f.x, sunCam.f.y, sunCam.f.z, 0], 8);
    shadowData.set([sunCam.eye.x, sunCam.eye.y, sunCam.eye.z, 0], 12);
    shadowData.set([sunCam.hx, sunCam.hy, sunCam.near, sunCam.far], 16);
  }
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, shadowData);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, ubo);
}

function writeDepthCam(gl, ubo, cam) {
  depthCamData.set([cam.r.x, cam.r.y, cam.r.z, 0], 0);
  depthCamData.set([cam.u.x, cam.u.y, cam.u.z, 0], 4);
  depthCamData.set([cam.f.x, cam.f.y, cam.f.z, 0], 8);
  depthCamData.set([cam.eye.x, cam.eye.y, cam.eye.z, 0], 12);
  depthCamData.set([cam.hx, cam.hy, cam.near, cam.far], 16);
  depthCamData.set([cam.perspective ? 1 : 0, 0, 0, 0], 20);
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, depthCamData);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 3, ubo);
}

function drawShadowMap(gl, s, cam, vbo, count, attach2D, layer, arrayTex) {
  writeDepthCam(gl, s.depthCamUbo, cam);
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.shadowFbo);
  if (attach2D) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, s.sunShadow, 0);
  } else {
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, arrayTex || s.lampShadow, 0, layer);
  }
  gl.drawBuffers([gl.NONE]);
  gl.viewport(0, 0, attach2D ? SUN_SHADOW_SIZE : LAMP_SHADOW_SIZE, attach2D ? SUN_SHADOW_SIZE : LAMP_SHADOW_SIZE);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.colorMask(false, false, false, false);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(0.8, 1.2);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  if (count > 0 && vbo?.buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo.buf);
    bindDepth(gl, s.depth);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.colorMask(true, true, true, true);
  gl.enable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
  if (!s.lampCasterVbo) s.lampCasterVbo = makeVbo();
  if (!s.spotShadow) {
    s.spotShadow = makeDepthArray(s.gl, LAMP_SHADOW_SIZE, MAX_SPOT_SHADOWS);
    s.gl.useProgram(s.lit);
    s.gl.uniform1i(s.gl.getUniformLocation(s.lit, "u_spot_shadow"), 3);
  }
  const gl = s.gl;
  gl.viewport(0, 0, w, h);
  const sunOn = frame.sun !== false;
  writeFrame(gl, s.ubo, frame.cam, w, h, sunOn);
  const marks = frame.marks || {};
  const lights = collectLights(marks.shadows);
  const cubed = assignShadowLayers(lights);
  const spots = assignSpotLayers(lights);
  writeLights(gl, s.lightUbo, lights);

  litMesh.reset();
  casterMesh.reset();
  lampCasterMesh.reset();
  ghostMesh.reset();
  overlayMesh.reset();
  textMesh.reset();
  if (frame.map) pushGround(litMesh, frame.map);
  pushSolids(litMesh, ghostMesh, frame.solids);
  const casterSrc = frame.casters || frame.solids;
  pushCasters(casterMesh, casterSrc);
  pushLampCasters(lampCasterMesh, casterSrc);
  buildOverlay(overlayMesh, marks, frame.cam);
  if (marks.grid && frame.map) pushOverlayGrid(overlayMesh, frame.map);
  buildLabels(textMesh, marks, frame.cam, w, h);

  const litN = upload(gl, s.litVbo, litMesh.view());
  const casterN = upload(gl, s.casterVbo, casterMesh.view());
  const lampCasterN = upload(gl, s.lampCasterVbo, lampCasterMesh.view());
  const ghostN = upload(gl, s.ghostVbo, ghostMesh.view());
  const overlayN = upload(gl, s.overlayVbo, overlayMesh.view());
  const textN = upload(gl, s.textVbo, textMesh.view());
  const litVerts = litN / LIT_STRIDE;
  const casterCount = casterN / LIT_STRIDE;
  const lampCasterCount = lampCasterN / LIT_STRIDE;

  const sunCam = frame.map ? sunShadowCam(frame.map) : null;
  writeShadow(gl, s.shadowUbo, sunOn ? sunCam : null);
  if (sunCam && sunOn) {
    drawShadowMap(gl, s, sunCam, s.casterVbo, casterCount, true, 0);
  }
  if (frame.map) {
    for (const L of cubed) {
      for (let face = 0; face < LAMP_FACES; face++) {
        drawShadowMap(gl, s, cubeFaceCam(L, face), s.lampCasterVbo, lampCasterCount, false, L.shadowLayer * LAMP_FACES + face);
      }
    }
    for (const L of spots) {
      drawShadowMap(gl, s, spotShadowCam(L), s.lampCasterVbo, lampCasterCount, false, L.spotLayer, s.spotShadow);
    }
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.078, 0.118, 0.157, 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(s.sky);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  if (litN) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, s.sunShadow);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.lampShadow);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.spotShadow);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.litVbo.buf);
    bindLit(gl, s.lit, LIT_STRIDE);
    gl.depthMask(true);
    gl.drawArrays(gl.TRIANGLES, 0, litVerts);
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
