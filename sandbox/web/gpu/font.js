const CW = 8;
const CH = 12;
const COLS = 16;
const ROWS = 6;

export async function createFontAtlas(device) {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * CW;
  canvas.height = ROWS * CH;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 32; i < 127; i++) {
    const x = ((i - 32) % COLS) * CW + 1;
    const y = Math.floor((i - 32) / COLS) * CH;
    ctx.fillText(String.fromCharCode(i), x, y);
  }
  const tex = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: canvas },
    { texture: tex },
    { width: canvas.width, height: canvas.height },
  );
  const samp = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  return { tex, samp };
}
