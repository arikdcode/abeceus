/**
 * Presenter → WebGL2 contract
 *
 * drawFrame(canvas, {
 *   cam, map, sun, solids, casters,
 *   marks: { grid, shadows[], paths[], rings[], lines[], rects[],
 *            disks[], polys[], edges[], labels[] },
 * })
 *
 * Lighting is ReSTIR-style: sample a few lights, reuse across time/space,
 * and test the winner with an AABB occupancy ray instead of cube maps.
 */
import { camBasis, fovOf } from "./camera.js";
import { FOG, SUN, SUN_SHADOW_SIZE } from "./theme.js";
import { FS_BLIT, FS_DEPTH, FS_GBUF, FS_GHOST, FS_OVERLAY, FS_RESTIR, FS_SKY, FS_TEXT, VS_DEPTH, VS_LIT, VS_OVERLAY, VS_SKY, VS_TEXT } from "./shaders.js";
import { LIT_STRIDE, MeshWriter, OVERLAY_STRIDE, TEXT_STRIDE } from "./mesh.js";
import { rasterFontAtlas } from "./font.js";
import { mergeLights, pushGround, pushSolids } from "./world.js";
import { buildLabels, buildOverlay, pushOverlayGrid } from "./overlay.js";
import { buildLightGrid, buildOccluderGrid, collectOccluders, packLights, packOccluders } from "./restir.js";

const surfaces = new WeakMap();
const litMesh = new MeshWriter(LIT_STRIDE);
const casterMesh = new MeshWriter(LIT_STRIDE);
const ghostMesh = new MeshWriter(LIT_STRIDE);
const overlayMesh = new MeshWriter(OVERLAY_STRIDE);
const textMesh = new MeshWriter(TEXT_STRIDE);

let ready = false;
let lastError = "";
let fontCanvas = null;
let frameData = new Float32Array(52);
const SHADOW_FLOATS = 20;
let shadowData = new Float32Array(SHADOW_FLOATS);
const DEPTH_CAM_FLOATS = 24;
let depthCamData = new Float32Array(DEPTH_CAM_FLOATS);
let frameIndex = 0;

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

function makeTex(gl, internal, format, type, w, h, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return tex;
}

function uploadFloatTex(gl, tex, w, h, data) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
}

function setRestirMaps(gl, prog) {
  gl.useProgram(prog);
  gl.uniform1i(gl.getUniformLocation(prog, "u_sun_shadow"), 1);
  gl.uniform1i(gl.getUniformLocation(prog, "u_g_albedo"), 2);
  gl.uniform1i(gl.getUniformLocation(prog, "u_g_normal"), 3);
  gl.uniform1i(gl.getUniformLocation(prog, "u_g_world"), 4);
  gl.uniform1i(gl.getUniformLocation(prog, "u_lights"), 5);
  gl.uniform1i(gl.getUniformLocation(prog, "u_occluders"), 6);
  gl.uniform1i(gl.getUniformLocation(prog, "u_grid"), 7);
  gl.uniform1i(gl.getUniformLocation(prog, "u_index"), 8);
  gl.uniform1i(gl.getUniformLocation(prog, "u_lgrid"), 9);
  gl.uniform1i(gl.getUniformLocation(prog, "u_lindex"), 10);
  gl.uniform1i(gl.getUniformLocation(prog, "u_prev_res"), 11);
  gl.uniform1i(gl.getUniformLocation(prog, "u_prev_color"), 12);
}

function ensureTargets(s, w, h) {
  const gl = s.gl;
  if (s.bufW === w && s.bufH === h && s.gAlbedo) return;
  s.bufW = w;
  s.bufH = h;
  const mk8 = () => makeTex(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, w, h, gl.LINEAR);
  const mk16 = () => makeTex(gl, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, w, h, gl.LINEAR);
  const mk16n = () => makeTex(gl, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, w, h, gl.NEAREST);
  s.gAlbedo = mk8();
  s.gNormal = mk16();
  s.gWorld = mk16();
  s.gDepth = makeTex(gl, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, w, h, gl.NEAREST);
  if (!s.gFbo) s.gFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.gFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.gAlbedo, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, s.gNormal, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, s.gWorld, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, s.gDepth, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("g-buffer FBO incomplete");
  }
  s.litA = mk16();
  s.litB = mk16();
  s.resA = mk16n();
  s.resB = mk16n();
  if (!s.restirFbo) s.restirFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.restirFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.litA, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, s.resA, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    s.litA = mk8();
    s.litB = mk8();
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.litA, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, s.resA, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("restir FBO incomplete");
    }
  }
  for (const pair of [[s.litA, s.resA], [s.litB, s.resB]]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.restirFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pair[0], 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, pair[1], 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  s.ping = 0;
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
  gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("EXT_color_buffer_half_float");
  gl.getExtension("OES_texture_float_linear");
  const lit = linkProgram(gl, VS_LIT, FS_GHOST);
  const gbuf = linkProgram(gl, VS_LIT, FS_GBUF);
  const restir = linkProgram(gl, VS_SKY, FS_RESTIR);
  const blit = linkProgram(gl, VS_SKY, FS_BLIT);
  const depth = linkProgram(gl, VS_DEPTH, FS_DEPTH);
  const sky = linkProgram(gl, VS_SKY, FS_SKY);
  const overlay = linkProgram(gl, VS_OVERLAY, FS_OVERLAY);
  const text = linkProgram(gl, VS_TEXT, FS_TEXT);
  const ubo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferData(gl.UNIFORM_BUFFER, 208, gl.DYNAMIC_DRAW);
  const shadowUbo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, shadowUbo);
  gl.bufferData(gl.UNIFORM_BUFFER, SHADOW_FLOATS * 4, gl.DYNAMIC_DRAW);
  const depthCamUbo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, depthCamUbo);
  gl.bufferData(gl.UNIFORM_BUFFER, DEPTH_CAM_FLOATS * 4, gl.DYNAMIC_DRAW);
  const sunShadow = makeDepthTex(gl, SUN_SHADOW_SIZE);
  const shadowFbo = gl.createFramebuffer();
  setRestirMaps(gl, restir);
  gl.useProgram(blit);
  gl.uniform1i(gl.getUniformLocation(blit, "u_color"), 2);
  gl.uniform1i(gl.getUniformLocation(blit, "u_g_world"), 4);
  gl.useProgram(lit);
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
    gbuf,
    restir,
    blit,
    depth,
    sky,
    overlay,
    text,
    ubo,
    shadowUbo,
    depthCamUbo,
    sunShadow,
    shadowFbo,
    fontTex,
    litVbo: makeVbo(),
    casterVbo: makeVbo(),
    ghostVbo: makeVbo(),
    overlayVbo: makeVbo(),
    textVbo: makeVbo(),
    lightTex: gl.createTexture(),
    occTex: gl.createTexture(),
    gridTex: gl.createTexture(),
    indexTex: gl.createTexture(),
    lgridTex: gl.createTexture(),
    lindexTex: gl.createTexture(),
    exactLoc: gl.getUniformLocation(restir, "u_exact"),
    prevCam: null,
    sceneKey: "",
    sceneGrid: null,
    sceneLgrid: null,
    scenePacked: null,
    meshKey: "",
    litN: 0,
    ghostN: 0,
  };
  surfaces.set(canvas, s);
  return s;
}

function lookDepth(cam, eye) {
  const look = cam.fpv && cam.fpvLook ? cam.fpvLook : cam.target;
  if (!look) return 8;
  return Math.max(4, Math.hypot(look.x - eye.x, look.y - eye.y, (look.z || 0) - eye.z));
}

function writeFrame(gl, ubo, cam, w, h, sunOn, prev, restir) {
  const { eye, f, r, u } = camBasis(cam);
  const p = prev || { r, u, f, eye };
  frameData.set([r.x, r.y, r.z, 0], 0);
  frameData.set([u.x, u.y, u.z, 0], 4);
  frameData.set([f.x, f.y, f.z, 0], 8);
  frameData.set([eye.x, eye.y, eye.z, 0], 12);
  frameData.set([SUN.x, SUN.y, SUN.z, sunOn ? 1 : 0], 16);
  frameData.set([FOG.r, FOG.g, FOG.b, lookDepth(cam, eye)], 20);
  frameData.set([w, h, fovOf(cam), 0.04], 24);
  frameData.set([p.r.x, p.r.y, p.r.z, 0], 28);
  frameData.set([p.u.x, p.u.y, p.u.z, 0], 32);
  frameData.set([p.f.x, p.f.y, p.f.z, 0], 36);
  frameData.set([p.eye.x, p.eye.y, p.eye.z, 0], 40);
  frameData.set([
    restir?.frame || 0,
    restir?.nLights || 0,
    restir?.nOcc || 0,
    restir?.cell || 2,
  ], 44);
  frameData.set([
    restir?.x0 || 0,
    restir?.y0 || 0,
    restir?.cols || 1,
    restir?.rows || 1,
  ], 48);
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, frameData);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
  return { r, u, f, eye };
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

function drawShadowMap(gl, s, cam, vbo, count) {
  writeDepthCam(gl, s.depthCamUbo, cam);
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, s.sunShadow, 0);
  gl.drawBuffers([gl.NONE]);
  gl.viewport(0, 0, SUN_SHADOW_SIZE, SUN_SHADOW_SIZE);
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

function packIndexTex(indices) {
  const w = 2048;
  const h = Math.max(1, Math.ceil(Math.max(indices.length, 1) / w));
  const data = new Float32Array(w * h * 4);
  for (let i = 0; i < indices.length; i++) data[i * 4] = indices[i];
  return { data, w, h };
}

function packGridTex(grid) {
  const data = new Float32Array(grid.cols * grid.rows * 4);
  for (let i = 0; i < grid.cols * grid.rows; i++) {
    data[i * 4] = grid.header[i * 2];
    data[i * 4 + 1] = grid.header[i * 2 + 1];
  }
  return data;
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
    console.info("sandbox: WebGL2 ReSTIR lighting");
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
  ensureTargets(s, w, h);
  const sunOn = frame.sun !== false;
  const marks = frame.marks || {};
  const lights = mergeLights(marks.shadows, frame.lights);
  const occ = collectOccluders(frame.casters || frame.solids);
  const sceneKey = [
    lights.length, occ.length,
    lights[0]?.x ?? 0, lights[0]?.intensity ?? 0,
    occ[0]?.x0 ?? 0, occ[occ.length - 1]?.z1 ?? 0,
    frame.map?.max?.x ?? 0,
  ].join(":");
  if (s.sceneKey !== sceneKey) {
    const packedL = packLights(lights);
    const packedO = packOccluders(occ);
    const grid = buildOccluderGrid(occ, frame.map);
    const lgrid = buildLightGrid(lights, grid);
    const packedI = packIndexTex(grid.indices);
    const packedG = packGridTex(grid);
    const packedLI = packIndexTex(lgrid.indices);
    const packedLG = packGridTex(lgrid);
    uploadFloatTex(gl, s.lightTex, packedL.width, packedL.height, packedL.data);
    uploadFloatTex(gl, s.occTex, packedO.width, packedO.height, packedO.data);
    uploadFloatTex(gl, s.gridTex, grid.cols, grid.rows, packedG);
    uploadFloatTex(gl, s.indexTex, packedI.w, packedI.h, packedI.data);
    uploadFloatTex(gl, s.lgridTex, lgrid.cols, lgrid.rows, packedLG);
    uploadFloatTex(gl, s.lindexTex, packedLI.w, packedLI.h, packedLI.data);
    s.sceneKey = sceneKey;
    s.sceneGrid = grid;
    s.sceneLgrid = lgrid;
    s.scenePacked = { nLights: packedL.n, nOcc: packedO.n };
  }
  const grid = s.sceneGrid;
  const restir = {
    frame: frameIndex,
    nLights: s.scenePacked.nLights,
    nOcc: s.scenePacked.nOcc,
    cell: grid.cell,
    x0: grid.x0,
    y0: grid.y0,
    cols: grid.cols,
    rows: grid.rows,
  };
  const camNow = writeFrame(gl, s.ubo, frame.cam, w, h, sunOn, s.prevCam, restir);

  overlayMesh.reset();
  textMesh.reset();
  const meshKey = [
    (frame.solids || []).length,
    frame.map?.ground || "",
    frame.solids?.[0]?.corners?.[0]?.x ?? 0,
    frame.solids?.[frame.solids.length - 1]?.z1 ?? 0,
  ].join(":");
  if (s.meshKey !== meshKey) {
    litMesh.reset();
    ghostMesh.reset();
    if (frame.map) pushGround(litMesh, frame.map);
    pushSolids(litMesh, ghostMesh, frame.solids);
    s.litN = upload(gl, s.litVbo, litMesh.view());
    s.ghostN = upload(gl, s.ghostVbo, ghostMesh.view());
    s.meshKey = meshKey;
  }
  buildOverlay(overlayMesh, marks, frame.cam);
  if (marks.grid && frame.map) pushOverlayGrid(overlayMesh, frame.map);
  buildLabels(textMesh, marks, frame.cam, w, h);

  const litN = s.litN;
  const ghostN = s.ghostN;
  const overlayN = upload(gl, s.overlayVbo, overlayMesh.view());
  const textN = upload(gl, s.textVbo, textMesh.view());
  const litVerts = litN / LIT_STRIDE;

  writeShadow(gl, s.shadowUbo, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, s.gFbo);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.clearColor(0, 0, 0, 0);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (litN) {
    gl.bindBuffer(gl.ARRAY_BUFFER, s.litVbo.buf);
    bindLit(gl, s.gbuf, LIT_STRIDE);
    gl.drawArrays(gl.TRIANGLES, 0, litVerts);
  }

  const writeLit = s.ping ? s.litB : s.litA;
  const writeRes = s.ping ? s.resB : s.resA;
  const readLit = s.ping ? s.litA : s.litB;
  const readRes = s.ping ? s.resA : s.resB;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.restirFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeLit, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, writeRes, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, s.sunShadow);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, s.gAlbedo);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, s.gNormal);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, s.gWorld);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, s.lightTex);
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, s.occTex);
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, s.gridTex);
  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, s.indexTex);
  gl.activeTexture(gl.TEXTURE9);
  gl.bindTexture(gl.TEXTURE_2D, s.lgridTex);
  gl.activeTexture(gl.TEXTURE10);
  gl.bindTexture(gl.TEXTURE_2D, s.lindexTex);
  gl.activeTexture(gl.TEXTURE11);
  gl.bindTexture(gl.TEXTURE_2D, readRes);
  gl.activeTexture(gl.TEXTURE12);
  gl.bindTexture(gl.TEXTURE_2D, readLit);
  gl.useProgram(s.restir);
  gl.uniform1i(s.exactLoc, frame.exact === false ? 0 : 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.078, 0.118, 0.157, 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(s.sky);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, writeLit);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, s.gWorld);
  gl.useProgram(s.blit);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  if (ghostN) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, s.sunShadow);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.ghostVbo.buf);
    bindLit(gl, s.lit, LIT_STRIDE);
    gl.drawArrays(gl.TRIANGLES, 0, ghostN / LIT_STRIDE);
    gl.depthMask(true);
  }
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
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

  s.prevCam = camNow;
  s.ping = s.ping ? 0 : 1;
  frameIndex += 1;
  return true;
}
