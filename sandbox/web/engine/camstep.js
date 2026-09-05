export const ORBIT_YAW = 0.014;

export function heldFromKeys(keys) {
  const has = (a, b) => keys.has(a) || keys.has(b);
  return {
    q: has("q", "Q") || keys.has("KeyQ"),
    e: has("e", "E") || keys.has("KeyE"),
    left: has("a", "A") || keys.has("ArrowLeft") || keys.has("KeyA"),
    right: has("d", "D") || keys.has("ArrowRight") || keys.has("KeyD"),
    up: has("w", "W") || keys.has("ArrowUp") || keys.has("KeyW"),
    down: has("s", "S") || keys.has("ArrowDown") || keys.has("KeyS"),
  };
}

export function applyHeldCam(cam, held, panSpeed, orbit = ORBIT_YAW) {
  const next = {
    target: { x: cam.target.x, y: cam.target.y, z: cam.target.z },
    yaw: cam.yaw,
    pitch: cam.pitch,
    dist: cam.dist,
    fpv: cam.fpv,
  };
  let dx = 0;
  let dy = 0;
  if (held.left) dx -= panSpeed;
  if (held.right) dx += panSpeed;
  if (held.up) dy += panSpeed;
  if (held.down) dy -= panSpeed;
  if (dx || dy) {
    const alongX = Math.cos(next.yaw + Math.PI);
    const alongY = Math.sin(next.yaw + Math.PI);
    const rightX = Math.cos(next.yaw + Math.PI * 0.5);
    const rightY = Math.sin(next.yaw + Math.PI * 0.5);
    next.target.x += rightX * dx + alongX * dy;
    next.target.y += rightY * dx + alongY * dy;
  }
  if (held.q) next.yaw -= orbit;
  if (held.e) next.yaw += orbit;
  return next;
}

export function writeCam(cam, next) {
  cam.target.x = next.target.x;
  cam.target.y = next.target.y;
  cam.target.z = next.target.z;
  cam.yaw = next.yaw;
  cam.pitch = next.pitch;
  cam.dist = next.dist;
}

export function stepHeldCam(cam, keys, panSpeed, orbit = ORBIT_YAW) {
  const next = applyHeldCam(cam, heldFromKeys(keys), panSpeed, orbit);
  const moved = next.yaw !== cam.yaw || next.pitch !== cam.pitch
    || next.target.x !== cam.target.x || next.target.y !== cam.target.y
    || next.dist !== cam.dist;
  writeCam(cam, next);
  return moved;
}

export function stepOrbitKey(cam, which, orbit = ORBIT_YAW) {
  const held = { q: which === "q", e: which === "e" };
  const next = applyHeldCam(cam, held, 0, orbit);
  writeCam(cam, next);
  return next.yaw;
}
