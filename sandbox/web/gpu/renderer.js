/**
 * Presenter → GPU contract
 *
 * drawFrame(canvas, {
 *   cam,
 *   map,          // { min, max, ground, surfaces } or null
 *   solids,       // [{ corners[8], color, mat, tex, emit, ghost }]
 *   marks: {
 *     grid, shadows[], paths[], rings[], lines[], rects[],
 *     disks[], polys[], edges[], labels[],
 *   }
 * })
 *
 * Camera math lives in camera.js. This module owns the device and passes.
 */
import { camBasis, fovOf } from "./camera.js";
import { FOG, SUN } from "./theme.js";
import { SHADER } from "./shaders.js";
import { LIT_STRIDE, MeshWriter, OVERLAY_STRIDE, TEXT_STRIDE } from "./mesh.js";
import { createFontAtlas } from "./font.js";
import { pushEmitPools, pushGround, pushShadows, pushSolids } from "./world.js";
import { buildLabels, buildOverlay, pushOverlayGrid } from "./overlay.js";

let device = null;
let format = null;
let module = null;
let litPipe = null;
let ghostPipe = null;
let skyPipe = null;
let overlayPipe = null;
let textPipe = null;
let frameBuf = null;
let groups = null;
let font = null;
let litMesh = new MeshWriter(LIT_STRIDE);
let ghostMesh = new MeshWriter(LIT_STRIDE);
let overlayMesh = new MeshWriter(OVERLAY_STRIDE);
let textMesh = new MeshWriter(TEXT_STRIDE);
let litBuf = null;
let ghostBuf = null;
let overlayBuf = null;
let textBuf = null;
const surfaces = new WeakMap();

function growBuf(old, bytes, usage) {
  if (old && old.size >= bytes) return old;
  return device.createBuffer({
    size: Math.max(bytes, 1 << 16),
    usage,
  });
}

function writeMesh(bufRef, mesh, usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) {
  const view = mesh.view();
  if (!view.length) return { buf: bufRef, count: 0 };
  const bytes = view.byteLength;
  const buf = growBuf(bufRef, bytes, usage);
  device.queue.writeBuffer(buf, 0, view);
  return { buf, count: mesh.vertexCount() };
}

function surfaceOf(canvas) {
  let s = surfaces.get(canvas);
  if (!s) {
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("canvas has no webgpu context");
    ctx.configure({
      device,
      format,
      alphaMode: "opaque",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    s = { ctx, depth: null, dw: 0, dh: 0 };
    surfaces.set(canvas, s);
  }
  return s;
}

function ensureDepth(s, w, h) {
  if (s.depth && s.dw === w && s.dh === h) return;
  s.dw = w;
  s.dh = h;
  s.depth = device.createTexture({
    size: { width: w, height: h },
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

function writeFrame(cam, w, h) {
  const { eye, f, r, u } = camBasis(cam);
  const data = new Float32Array(28);
  data.set([r.x, r.y, r.z, 0], 0);
  data.set([u.x, u.y, u.z, 0], 4);
  data.set([f.x, f.y, f.z, 0], 8);
  data.set([eye.x, eye.y, eye.z, 0], 12);
  data.set([SUN.x, SUN.y, SUN.z, 0], 16);
  data.set([FOG.r, FOG.g, FOG.b, 0], 20);
  data.set([w, h, fovOf(cam), 0.2], 24);
  device.queue.writeBuffer(frameBuf, 0, data);
}

const BLEND = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

let lastError = "";

export function rendererReady() {
  return !!(device && litPipe && skyPipe);
}

export function initError() {
  return lastError;
}

function withTimeout(promise, ms, label) {
  let t = 0;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function requestGpuAdapter() {
  const tries = [
    { powerPreference: "high-performance" },
    { powerPreference: "low-power" },
    {},
  ];
  for (const opts of tries) {
    try {
      const adapter = await withTimeout(
        navigator.gpu.requestAdapter(opts),
        8000,
        "requestAdapter",
      );
      if (adapter) return adapter;
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }
  return null;
}

export async function initRenderer() {
  lastError = "";
  if (!navigator.gpu) {
    lastError = "this browser has no navigator.gpu";
    return false;
  }
  try {
    const adapter = await requestGpuAdapter();
    if (!adapter) {
      lastError = "no GPU adapter — launch Chrome with sandbox/chrome.sh (Vulkan)";
      return false;
    }
    device = await withTimeout(adapter.requestDevice(), 8000, "requestDevice");
    device.lost.then((info) => {
      console.warn("WebGPU device lost", info?.message || "");
      device = null;
      litPipe = null;
    });
    device.addEventListener("uncapturederror", (ev) => {
      console.error("WebGPU error", ev.error?.message || ev.error);
    });
    format = navigator.gpu.getPreferredCanvasFormat();
    module = device.createShaderModule({ code: SHADER });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");
    if (errors.length) {
      lastError = errors.map((m) => m.message).join("; ");
      console.error("WGSL compile failed", errors);
      return false;
    }
    const litLayout = {
      arrayStride: LIT_STRIDE * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x4" },
        { shaderLocation: 1, offset: 16, format: "float32x4" },
        { shaderLocation: 2, offset: 32, format: "float32x4" },
        { shaderLocation: 3, offset: 48, format: "float32x4" },
      ],
    };
    const overlayLayout = {
      arrayStride: OVERLAY_STRIDE * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 16, format: "float32x4" },
      ],
    };
    const textLayout = {
      arrayStride: TEXT_STRIDE * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 16, format: "float32x2" },
        { shaderLocation: 2, offset: 32, format: "float32x4" },
      ],
    };
    const pipe = (label, desc) => withTimeout(device.createRenderPipelineAsync(desc), 8000, label);
    litPipe = await pipe("lit pipeline", {
      layout: "auto",
      vertex: { module, entryPoint: "vs_lit", buffers: [litLayout] },
      fragment: { module, entryPoint: "fs_lit", targets: [{ format, blend: BLEND }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "greater" },
    });
    ghostPipe = await pipe("ghost pipeline", {
      layout: "auto",
      vertex: { module, entryPoint: "vs_lit", buffers: [litLayout] },
      fragment: { module, entryPoint: "fs_lit", targets: [{ format, blend: BLEND }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "greater" },
    });
    skyPipe = await pipe("sky pipeline", {
      layout: "auto",
      vertex: { module, entryPoint: "vs_sky" },
      fragment: { module, entryPoint: "fs_sky", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" },
    });
    overlayPipe = await pipe("overlay pipeline", {
      layout: "auto",
      vertex: { module, entryPoint: "vs_overlay", buffers: [overlayLayout] },
      fragment: { module, entryPoint: "fs_overlay", targets: [{ format, blend: BLEND }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" },
    });
    textPipe = await pipe("text pipeline", {
      layout: "auto",
      vertex: { module, entryPoint: "vs_text", buffers: [textLayout] },
      fragment: { module, entryPoint: "fs_text", targets: [{ format, blend: BLEND }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "greater" },
    });
    frameBuf = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    font = await createFontAtlas(device);
    groups = {
      sky: device.createBindGroup({
        layout: skyPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }],
      }),
      lit: device.createBindGroup({
        layout: litPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }],
      }),
      ghost: device.createBindGroup({
        layout: ghostPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }],
      }),
      overlay: device.createBindGroup({
        layout: overlayPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }],
      }),
      text0: device.createBindGroup({
        layout: textPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: frameBuf } }],
      }),
      text1: device.createBindGroup({
        layout: textPipe.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: font.tex.createView() },
          { binding: 1, resource: font.samp },
        ],
      }),
    };
    console.info("sandbox: WebGPU ready");
    return true;
  } catch (err) {
    lastError = err?.message || String(err);
    console.error("WebGPU init failed", err);
    device = null;
    litPipe = null;
    return false;
  }
}

export function resizeCanvas(canvas, w, h) {
  if (!canvas || !device) return;
  const dw = Math.max(1, w);
  const dh = Math.max(1, h);
  if (canvas.width !== dw) canvas.width = dw;
  if (canvas.height !== dh) canvas.height = dh;
  const s = surfaceOf(canvas);
  s.ctx.configure({
    device,
    format,
    alphaMode: "opaque",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  ensureDepth(s, dw, dh);
}

export function drawFrame(canvas, frame) {
  if (!rendererReady() || !frame?.cam) return false;
  const w = canvas.width;
  const h = canvas.height;
  const s = surfaceOf(canvas);
  ensureDepth(s, w, h);
  writeFrame(frame.cam, w, h);

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

  const lit = writeMesh(litBuf, litMesh);
  litBuf = lit.buf;
  const ghost = writeMesh(ghostBuf, ghostMesh);
  ghostBuf = ghost.buf;
  const overlay = writeMesh(overlayBuf, overlayMesh);
  overlayBuf = overlay.buf;
  const text = writeMesh(textBuf, textMesh);
  textBuf = text.buf;

  const encoder = device.createCommandEncoder();
  let colorView;
  try {
    colorView = s.ctx.getCurrentTexture().createView();
  } catch (err) {
    throw new Error(`getCurrentTexture: ${err?.message || err}`);
  }
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: colorView,
      clearValue: { r: 0.078, g: 0.118, b: 0.157, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    }],
    depthStencilAttachment: {
      view: s.depth.createView(),
      depthClearValue: 0,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });
  pass.setPipeline(skyPipe);
  pass.setBindGroup(0, groups.sky);
  pass.draw(3);
  if (lit.count) {
    pass.setPipeline(litPipe);
    pass.setBindGroup(0, groups.lit);
    pass.setVertexBuffer(0, lit.buf);
    pass.draw(lit.count);
  }
  if (ghost.count) {
    pass.setPipeline(ghostPipe);
    pass.setBindGroup(0, groups.ghost);
    pass.setVertexBuffer(0, ghost.buf);
    pass.draw(ghost.count);
  }
  if (overlay.count) {
    pass.setPipeline(overlayPipe);
    pass.setBindGroup(0, groups.overlay);
    pass.setVertexBuffer(0, overlay.buf);
    pass.draw(overlay.count);
  }
  if (text.count) {
    pass.setPipeline(textPipe);
    pass.setBindGroup(0, groups.text0);
    pass.setBindGroup(1, groups.text1);
    pass.setVertexBuffer(0, text.buf);
    pass.draw(text.count);
  }
  pass.end();
  device.queue.submit([encoder.finish()]);
  return true;
}
