export const SHADER = /* wgsl */ `
struct Frame {
  r: vec4f,
  u: vec4f,
  f: vec4f,
  eye: vec4f,
  sun: vec4f,
  fog: vec4f,
  params: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;

struct LitIn {
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) color: vec4f,
  @location(3) mat: vec4f,
};

struct LitOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec4f,
  @location(3) shade: vec4f,
  @location(4) extra: vec4f,
};

fn to_clip(p: vec3f) -> vec4f {
  let v = p - frame.eye.xyz;
  let vx = dot(v, frame.r.xyz);
  let vy = dot(v, frame.u.xyz);
  let vz = dot(v, frame.f.xyz);
  let fov = frame.params.z;
  let aspect = frame.params.x / max(frame.params.y, 1.0);
  let near = frame.params.w;
  return vec4f(vx / (fov * aspect), vy / fov, near, vz);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn face_uv(p: vec3f, n: vec3f) -> vec2f {
  let an = abs(n);
  if (an.z >= an.x && an.z >= an.y) { return p.xy; }
  if (an.y >= an.x) { return p.xz; }
  return p.yz;
}

fn apply_tex(base: vec3f, p: vec3f, n: vec3f, tex: f32) -> vec3f {
  let id = i32(tex + 0.5);
  if (id == 0) { return base; }
  let uv = face_uv(p, n);
  if (id == 1) {
    let g = abs(fract(uv.x * 3.2) - 0.5);
    return mix(base, base * vec3f(0.55, 0.52, 0.48), 1.0 - smoothstep(0.04, 0.1, g));
  }
  if (id == 2) {
    let g = abs(fract(uv.y * 2.1) - 0.5);
    let v = abs(fract(uv.x * 0.55) - 0.5);
    var rgb = mix(base, base * 0.62, 1.0 - smoothstep(0.06, 0.14, g));
    rgb = mix(rgb, rgb * 0.78, 1.0 - smoothstep(0.02, 0.07, v));
    return rgb;
  }
  if (id == 3) {
    let row = floor(uv.y * 1.4);
    let g = length(vec2f(fract(uv.x * 1.15 + row * 0.35) - 0.5, fract(uv.y * 1.4) - 0.5));
    return mix(base * 0.7, base, smoothstep(0.28, 0.42, g));
  }
  if (id == 4) {
    let g = abs(fract(uv.y * 4.5) - 0.5);
    return mix(base, base * 0.72, 1.0 - smoothstep(0.03, 0.08, g));
  }
  if (id == 5) {
    let g = abs(fract(uv.x * 2.4 + uv.y * 0.18) - 0.5);
    return mix(base, base * 0.8, 1.0 - smoothstep(0.08, 0.16, g));
  }
  if (id == 6) {
    let gx = abs(fract(uv.x * 5.0) - 0.5);
    let gy = abs(fract(uv.y * 5.0) - 0.5);
    let line = 1.0 - smoothstep(0.03, 0.08, min(gx, gy));
    return mix(base, base * vec3f(0.28, 0.3, 0.32), line * 0.7);
  }
  if (id == 7) {
    let band = step(0.32, fract(uv.y * 0.55)) * (1.0 - step(0.58, fract(uv.y * 0.55)));
    return mix(base, vec3f(0.82, 0.67, 0.16), band * 0.45);
  }
  let cell = floor(uv * 2.6);
  let speck = hash21(cell + vec2f(floor(p.z * 3.0), 0.0));
  return mix(base * 0.78, base * 1.08, speck);
}

@vertex
fn vs_lit(input: LitIn) -> LitOut {
  var out: LitOut;
  out.clip = to_clip(input.pos.xyz);
  out.world = input.pos.xyz;
  out.normal = input.normal.xyz;
  out.color = input.color;
  out.shade = vec4f(input.mat.x, input.mat.y, input.mat.z, input.normal.w);
  out.extra = vec4f(input.pos.w, max(dot(input.pos.xyz - frame.eye.xyz, frame.f.xyz), 0.2), 0.0, 0.0);
  return out;
}

@fragment
fn fs_lit(input: LitOut) -> @location(0) vec4f {
  var n = normalize(input.normal);
  let toward = -frame.f.xyz;
  if (dot(n, toward) < 0.0) { n = -n; }
  var rgb = apply_tex(input.color.rgb, input.world, n, input.extra.x);
  let spec_k = input.shade.x;
  let shine = max(input.shade.y, 1.0);
  let wrap_k = input.shade.z;
  let emit_k = input.shade.w;
  if (emit_k > 0.001) {
    rgb = min(rgb * (1.15 + 0.35 * emit_k) + vec3f(0.16, 0.11, 0.03) * emit_k, vec3f(1.0));
  } else {
    var ndot = dot(n, frame.sun.xyz);
    if (wrap_k > 0.0) { ndot = (ndot + wrap_k) / (1.0 + wrap_k); }
    let lambert = max(ndot, 0.0);
    let hemi = n.z * 0.5 + 0.5;
    let under = max(-n.z, 0.0);
    let ambient = 0.16 + 0.22 * hemi + 0.07 * under;
    let diffuse = 0.78 * lambert;
    let h = normalize(frame.sun.xyz + toward);
    let spec = pow(max(dot(n, h), 0.0), shine) * spec_k;
    let warm = 0.55 * lambert;
    rgb = rgb * (ambient * vec3f(0.86, 0.90, 0.96) + diffuse * vec3f(0.92 + 0.16 * warm, 0.90 + 0.08 * warm, 0.82));
    rgb = rgb * vec3f(1.08, 0.92, 0.72);
    rgb = rgb + spec * vec3f(0.72, 0.60, 0.48);
  }
  let fog_a = min(0.62, 1.0 - exp(-input.extra.y * 0.0115));
  rgb = mix(rgb, frame.fog.rgb, fog_a);
  return vec4f(rgb, input.color.a);
}

@vertex
fn vs_sky(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

@fragment
fn fs_sky(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let w = max(frame.params.x, 1.0);
  let hgt = max(frame.params.y, 1.0);
  let fov = frame.params.z;
  let t = pos.y / hgt;
  let top = vec3f(0.078, 0.118, 0.157);
  let mid = vec3f(0.165, 0.235, 0.282);
  let hor = vec3f(0.690, 0.455, 0.251);
  var rgb = mix(top, mid, clamp(t * 1.6, 0.0, 1.0));
  rgb = mix(rgb, hor, smoothstep(0.45, 1.0, t));
  let nx = (pos.x - w * 0.5) * 2.0 * fov / hgt;
  let ny = -(pos.y - hgt * 0.5) * 2.0 * fov / hgt;
  let dir = normalize(frame.f.xyz + frame.r.xyz * nx + frame.u.xyz * ny);
  let sun = pow(max(dot(dir, frame.sun.xyz), 0.0), 48.0);
  let glow = pow(max(dot(dir, frame.sun.xyz), 0.0), 8.0);
  rgb = rgb + vec3f(1.0, 0.78, 0.42) * sun * 0.95 + vec3f(0.92, 0.55, 0.22) * glow * 0.28;
  return vec4f(rgb, 1.0);
}

struct OverlayIn {
  @location(0) pos: vec3f,
  @location(1) color: vec4f,
};

struct OverlayOut {
  @builtin(position) clip: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs_overlay(input: OverlayIn) -> OverlayOut {
  var out: OverlayOut;
  out.clip = to_clip(input.pos);
  out.color = input.color;
  return out;
}

@fragment
fn fs_overlay(input: OverlayOut) -> @location(0) vec4f {
  return input.color;
}

struct TextIn {
  @location(0) pos: vec3f,
  @location(1) uv: vec2f,
  @location(2) color: vec4f,
};

struct TextOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
};

@group(1) @binding(0) var font_tex: texture_2d<f32>;
@group(1) @binding(1) var font_samp: sampler;

@vertex
fn vs_text(input: TextIn) -> TextOut {
  var out: TextOut;
  let w = max(frame.params.x, 1.0);
  let h = max(frame.params.y, 1.0);
  let z = max(input.pos.z, 0.2);
  let ndc_x = (input.pos.x / w) * 2.0 - 1.0;
  let ndc_y = 1.0 - (input.pos.y / h) * 2.0;
  out.clip = vec4f(ndc_x * z, ndc_y * z, frame.params.w, z);
  out.uv = input.uv;
  out.color = input.color;
  return out;
}

@fragment
fn fs_text(input: TextOut) -> @location(0) vec4f {
  let a = textureSample(font_tex, font_samp, input.uv).a;
  if (a < 0.12) { discard; }
  return vec4f(input.color.rgb, input.color.a * a);
}
`;
