const port = 9348;
const { spawn } = await import("child_process");
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`,
  "--user-data-dir=/tmp/scifi-ui/chrome-profile-qeguard",
  "--window-size=1400,860", "--no-first-run", "--disable-cache",
], { stdio: "ignore" });

async function waitFor(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await new Promise((res) => setTimeout(res, 80));
  }
  throw new Error("cdp not ready");
}
function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener("message", onMsg);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function fail(msg, extra) {
  console.error(msg, extra || "");
  process.exitCode = 2;
}

try {
  const targets = await waitFor(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((t) => t.type === "page") || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await send(ws, 1, "Page.enable");
  await send(ws, 2, "Runtime.enable");
  await send(ws, 3, "Network.setCacheDisabled", { cacheDisabled: true });
  await send(ws, 4, "Page.navigate", { url: "http://127.0.0.1:8080/web/?t=" + Date.now() });
  await new Promise((res) => setTimeout(res, 1600));
  const evl = async (id, expr) => {
    const r = await send(ws, id, "Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result.value;
  };
  await evl(5, `document.getElementById('skipContact')?.click(); true`);
  const start = await evl(6, `window.__sandbox.snapshot()`);
  await evl(7, `(() => { window.__sandbox.press("d"); for (let i = 0; i < 12; i++) window.__sandbox.tick(); window.__sandbox.release("d"); true; })()`);
  const panned = await evl(8, `window.__sandbox.snapshot()`);
  const heldE = await evl(9, `(() => { const a = window.__sandbox.snapshot().yaw; window.__sandbox.press("e"); for (let i = 0; i < 8; i++) window.__sandbox.tick(); window.__sandbox.release("e"); return { before: a, after: window.__sandbox.snapshot().yaw, ticks: 8 }; })()`);
  const yawAfterE = await evl(10, `window.__sandbox.tapOrbit("e")`);
  const afterE = await evl(11, `window.__sandbox.snapshot()`);
  const yawAfterQ = await evl(12, `window.__sandbox.tapOrbit("q")`);
  const afterQ = await evl(13, `window.__sandbox.snapshot()`);
  const out = { start, panned, heldE, afterE, afterQ, yawAfterE, yawAfterQ };
  console.log(JSON.stringify({
    startYaw: start.yaw, startT: [start.tx, start.ty],
    pannedT: [panned.tx, panned.ty], pannedYaw: panned.yaw,
    afterE: { yaw: afterE.yaw, t: [afterE.tx, afterE.ty] },
    afterQ: { yaw: afterQ.yaw, t: [afterQ.tx, afterQ.ty] },
  }));
  if (Math.abs(panned.tx - start.tx) < 0.05 && Math.abs(panned.ty - start.ty) < 0.05) {
    fail("pan did not move look-at", out);
  }
  if (!(heldE.after > heldE.before + 0.07)) fail("held E via frame ticks did not rotate", out);
  const snappedE = Math.abs(afterE.tx - start.tx) < 1e-6 && Math.abs(afterE.ty - start.ty) < 1e-6
    && Math.abs(afterE.yaw - start.yaw) < 1e-6;
  if (snappedE) fail("E snapped camera back to the start pose", out);
  if (Math.abs(afterE.tx - panned.tx) > 1e-6 || Math.abs(afterE.ty - panned.ty) > 1e-6) {
    fail("E moved the look-at; it should only yaw", out);
  }
  if (!(afterE.yaw > panned.yaw + 0.01)) fail("E did not increase yaw", out);
  const snappedQ = Math.abs(afterQ.tx - start.tx) < 1e-6 && Math.abs(afterQ.ty - start.ty) < 1e-6
    && Math.abs(afterQ.yaw - start.yaw) < 1e-6;
  if (snappedQ) fail("Q snapped camera back to the start pose", out);
  if (!(afterQ.yaw < afterE.yaw - 0.01)) fail("Q did not decrease yaw", out);
  if (Math.abs(afterQ.tx - panned.tx) > 1e-6) fail("Q moved the look-at", out);
  console.log("qe_page_test ok");
  ws.close();
} finally {
  chrome.kill();
}
