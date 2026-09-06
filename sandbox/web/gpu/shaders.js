const FRAME = /* glsl */ `
layout(std140) uniform Frame {
  vec4 frame_r;
  vec4 frame_u;
  vec4 frame_f;
  vec4 frame_eye;
  vec4 frame_sun;
  vec4 frame_fog;
  vec4 frame_params;
  vec4 frame_prev_r;
  vec4 frame_prev_u;
  vec4 frame_prev_f;
  vec4 frame_prev_eye;
  vec4 frame_restir;
  vec4 frame_map;
};

vec4 to_clip_basis(vec3 p, vec3 eye, vec3 r, vec3 u, vec3 f) {
  vec3 v = p - eye;
  float vx = dot(v, r);
  float vy = dot(v, u);
  float vz = dot(v, f);
  float fov = frame_params.z;
  float aspect = frame_params.x / max(frame_params.y, 1.0);
  float near = max(frame_params.w, 0.02);
  float far = 250.0;
  float z_clip = ((far + near) / (far - near)) * vz + (-2.0 * far * near / (far - near));
  return vec4(vx / (fov * aspect), vy / fov, z_clip, vz);
}

vec4 to_clip(vec3 p) {
  return to_clip_basis(p, frame_eye.xyz, frame_r.xyz, frame_u.xyz, frame_f.xyz);
}

vec2 to_uv(vec3 p, vec3 eye, vec3 r, vec3 u, vec3 f) {
  vec4 c = to_clip_basis(p, eye, r, u, f);
  if (c.w < 0.05) return vec2(-1.0);
  return vec2(c.x / c.w, c.y / c.w) * 0.5 + 0.5;
}

float aerial_fog(vec3 world) {
  float view_z = max(dot(world - frame_eye.xyz, frame_f.xyz), 0.05);
  float focus = max(frame_fog.w, 1.0);
  float density = 0.0105 * min(1.0, 12.0 / focus);
  return min(0.48, 1.0 - exp(-view_z * density));
}

vec3 god_view_grade(vec3 lit) {
  float god = smoothstep(24.0, 80.0, max(frame_fog.w, 1.0));
  if (god < 0.001) return lit;
  vec3 opened = pow(max(lit, vec3(0.0)), vec3(mix(1.0, 0.78, god)));
  lit = mix(lit, opened, god * 0.85);
  float lum = dot(lit, vec3(0.3, 0.59, 0.11));
  return mix(lit, mix(vec3(lum), lit, 1.22), god * 0.65);
}
`;

export const VS_LIT = /* glsl */ `#version 300 es
${FRAME}
layout(location = 0) in vec4 a_pos;
layout(location = 1) in vec4 a_normal;
layout(location = 2) in vec4 a_color;
layout(location = 3) in vec4 a_mat;
out vec3 v_world;
out vec3 v_normal;
out vec4 v_color;
out vec4 v_shade;
out vec4 v_extra;
void main() {
  gl_Position = to_clip(a_pos.xyz);
  v_world = a_pos.xyz;
  v_normal = a_normal.xyz;
  v_color = a_color;
  v_shade = vec4(a_mat.x, a_mat.y, a_mat.z, a_normal.w);
  v_extra = vec4(a_pos.w, max(dot(a_pos.xyz - frame_eye.xyz, frame_f.xyz), 0.05), 0.0, 0.0);
}
`;

export const FS_LIT = /* glsl */ `#version 300 es
precision highp float;
${FRAME}
const int MAX_LIGHTS = 16;
layout(std140) uniform Lights {
  vec4 light_count;
  vec4 light_pos_range[16];
  vec4 light_color_int[16];
  vec4 light_misc[16];
};
layout(std140) uniform Shadow {
  vec4 shadow_sun_r;
  vec4 shadow_sun_u;
  vec4 shadow_sun_f;
  vec4 shadow_sun_eye;
  vec4 shadow_sun_params;
};
uniform highp sampler2DShadow u_sun_shadow;
uniform highp sampler2DArrayShadow u_lamp_shadow;
uniform highp sampler2DArrayShadow u_spot_shadow;
in vec3 v_world;
in vec3 v_normal;
in vec4 v_color;
in vec4 v_shade;
in vec4 v_extra;
out vec4 frag;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 face_uv(vec3 p, vec3 n) {
  vec3 an = abs(n);
  if (an.z >= an.x && an.z >= an.y) return p.xy;
  if (an.y >= an.x) return p.xz;
  return p.yz;
}

vec3 apply_tex(vec3 base, vec3 p, vec3 n, float tex) {
  int id = int(tex + 0.5);
  if (id == 0) return base;
  vec2 uv = face_uv(p, n);
  if (id == 1) {
    float g = abs(fract(uv.x * 3.2) - 0.5);
    return mix(base, base * vec3(0.55, 0.52, 0.48), 1.0 - smoothstep(0.04, 0.1, g));
  }
  if (id == 2) {
    float g = abs(fract(uv.y * 2.1) - 0.5);
    float v = abs(fract(uv.x * 0.55) - 0.5);
    vec3 rgb = mix(base, base * 0.62, 1.0 - smoothstep(0.06, 0.14, g));
    rgb = mix(rgb, rgb * 0.78, 1.0 - smoothstep(0.02, 0.07, v));
    return rgb;
  }
  if (id == 3) {
    float row = floor(uv.y * 1.4);
    float g = length(vec2(fract(uv.x * 1.15 + row * 0.35) - 0.5, fract(uv.y * 1.4) - 0.5));
    return mix(base * 0.7, base, smoothstep(0.28, 0.42, g));
  }
  if (id == 4) {
    float g = abs(fract(uv.y * 4.5) - 0.5);
    return mix(base, base * 0.72, 1.0 - smoothstep(0.03, 0.08, g));
  }
  if (id == 5) {
    float g = abs(fract(uv.x * 2.4 + uv.y * 0.18) - 0.5);
    return mix(base, base * 0.8, 1.0 - smoothstep(0.08, 0.16, g));
  }
  if (id == 6) {
    float gx = abs(fract(uv.x * 5.0) - 0.5);
    float gy = abs(fract(uv.y * 5.0) - 0.5);
    float line = 1.0 - smoothstep(0.03, 0.08, min(gx, gy));
    return mix(base, base * vec3(0.28, 0.3, 0.32), line * 0.7);
  }
  if (id == 7) {
    float band = step(0.32, fract(uv.y * 0.55)) * (1.0 - step(0.58, fract(uv.y * 0.55)));
    return mix(base, vec3(0.82, 0.67, 0.16), band * 0.45);
  }
  vec2 cell = floor(uv * 2.6);
  float speck = hash21(cell + vec2(floor(p.z * 3.0), 0.0));
  return mix(base * 0.78, base * 1.08, speck);
}

vec3 aces_tonemap(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float wrap_n(float ndot, float wrap_k) {
  if (wrap_k > 0.0) ndot = (ndot + wrap_k) / (1.0 + wrap_k);
  return max(ndot, 0.0);
}

float pcf_sun(vec3 world, float ndot) {
  if (shadow_sun_params.x < 0.5) return 1.0;
  vec3 to = world - shadow_sun_eye.xyz;
  float lx = dot(to, shadow_sun_r.xyz);
  float ly = dot(to, shadow_sun_u.xyz);
  float lz = dot(to, shadow_sun_f.xyz);
  vec2 uv = vec2(lx / shadow_sun_params.x, ly / shadow_sun_params.y) * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  float ref = (lz - shadow_sun_params.z) / max(shadow_sun_params.w - shadow_sun_params.z, 0.01);
  float bias = 0.0014 + 0.0045 * (1.0 - clamp(ndot, 0.0, 1.0));
  ref = clamp(ref - bias, 0.0, 1.0);
  float texel = 1.0 / 1024.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      s += texture(u_sun_shadow, vec3(uv + vec2(float(i), float(j)) * texel, ref));
    }
  }
  return s / 9.0;
}

void cube_basis(int face, out vec3 r, out vec3 u, out vec3 f) {
  if (face == 0) { r = vec3(0.0, -1.0, 0.0); u = vec3(0.0, 0.0, 1.0); f = vec3(1.0, 0.0, 0.0); }
  else if (face == 1) { r = vec3(0.0, 1.0, 0.0); u = vec3(0.0, 0.0, 1.0); f = vec3(-1.0, 0.0, 0.0); }
  else if (face == 2) { r = vec3(1.0, 0.0, 0.0); u = vec3(0.0, 0.0, 1.0); f = vec3(0.0, 1.0, 0.0); }
  else if (face == 3) { r = vec3(-1.0, 0.0, 0.0); u = vec3(0.0, 0.0, 1.0); f = vec3(0.0, -1.0, 0.0); }
  else if (face == 4) { r = vec3(-1.0, 0.0, 0.0); u = vec3(0.0, 1.0, 0.0); f = vec3(0.0, 0.0, 1.0); }
  else { r = vec3(1.0, 0.0, 0.0); u = vec3(0.0, 1.0, 0.0); f = vec3(0.0, 0.0, -1.0); }
}

int cube_face(vec3 d) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) return d.x >= 0.0 ? 0 : 1;
  if (a.y >= a.z) return d.y >= 0.0 ? 2 : 3;
  return d.z >= 0.0 ? 4 : 5;
}

float lamp_occluded(int cube, vec3 world, vec3 eye, float range) {
  vec3 to = world - eye;
  int face = cube_face(to);
  vec3 r, u, f;
  cube_basis(face, r, u, f);
  float vz = dot(to, f);
  float near = 0.08;
  float far = max(range, 4.0);
  if (vz < near || vz > far) return 0.0;
  vec2 uv = vec2(dot(to, r), dot(to, u)) / vz * 0.5 + 0.5;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return 1.0;
  float ref = (vz - near) / max(far - near, 0.01);
  ref = clamp(ref - 0.0009, 0.0, 1.0);
  float layer = float(cube * 6 + face);
  return texture(u_lamp_shadow, vec4(uv, layer, ref));
}

void basis_from_f(vec3 f, out vec3 r, out vec3 u) {
  vec3 up = abs(f.z) > 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  r = cross(f, up);
  if (dot(r, r) < 1e-8) r = cross(f, vec3(0.0, 1.0, 0.0));
  r = normalize(r);
  u = normalize(cross(r, f));
}

float spot_occluded(int layer, vec3 world, vec3 eye, vec3 dir, float range) {
  vec3 f = normalize(dir);
  vec3 r, u;
  basis_from_f(f, r, u);
  vec3 to = world - eye;
  float vz = dot(to, f);
  float near = 0.14;
  float far = max(range, 3.0);
  if (vz < near || vz > far) return 0.0;
  float hx = 0.726542528;
  vec2 uv = vec2(dot(to, r), dot(to, u)) / (vz * hx) * 0.5 + 0.5;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return 0.0;
  float ref = (vz - near) / max(far - near, 0.01);
  ref = clamp(ref - 0.0014, 0.0, 1.0);
  return texture(u_spot_shadow, vec4(uv, float(layer), ref));
}

void main() {
  vec3 n = normalize(v_normal);
  vec3 view_dir = normalize(frame_eye.xyz - v_world);
  vec3 albedo = apply_tex(v_color.rgb, v_world, n, v_extra.x);
  float spec_k = v_shade.x;
  float shine = max(v_shade.y, 1.0);
  float wrap_k = v_shade.z;
  float emit_k = v_shade.w;

  vec3 sky = vec3(0.40, 0.50, 0.64);
  vec3 ground = vec3(0.26, 0.18, 0.11);
  float hemi = n.z * 0.5 + 0.5;
  vec3 sun_dir = frame_sun.xyz;
  vec3 sun_col = vec3(1.02, 0.84, 0.60);
  float sun_n = wrap_n(dot(n, sun_dir), wrap_k);
  vec3 sun_h = normalize(sun_dir + view_dir);
  float sun_spec = pow(max(dot(n, sun_h), 0.0), shine) * spec_k;
  float sun_on = frame_sun.w;
  float sun_vis = sun_on > 0.5 ? pcf_sun(v_world, sun_n) : 0.0;
  vec3 ambient = mix(ground, sky, hemi) * 0.20 + vec3(0.075, 0.068, 0.058);
  vec3 lit = albedo * (ambient + sun_col * sun_n * 0.86 * sun_vis) + sun_col * sun_spec * 0.4 * sun_vis;

  vec3 fill_dir = normalize(-sun_dir + vec3(0.0, 0.0, 0.42));
  float fill_n = max(dot(n, fill_dir), 0.0);
  lit += albedo * vec3(0.20, 0.26, 0.36) * fill_n * 0.22 * sun_on;

  int n_lights = int(light_count.x + 0.5);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= n_lights) break;
    vec3 to_l = light_pos_range[i].xyz - v_world;
    float dist = length(to_l);
    float range = max(light_pos_range[i].w, 0.01);
    float fall = max(1.0 - dist / range, 0.0);
    fall *= fall;
    vec3 ldir = to_l / max(dist, 1e-4);
    float nd = wrap_n(dot(n, ldir), wrap_k);
    vec3 lcol = light_color_int[i].rgb * light_color_int[i].w;
    vec3 lh = normalize(ldir + view_dir);
    float lspec = pow(max(dot(n, lh), 0.0), shine) * spec_k * 0.4;
    float vis = 1.0;
    if (light_misc[i].x >= 0.0) {
      vis = lamp_occluded(int(light_misc[i].x + 0.5), v_world, light_pos_range[i].xyz, range);
    } else if (light_misc[i].x < -1.5) {
      int spot_i = int(-light_misc[i].x + 0.5) - 2;
      vis = spot_occluded(spot_i, v_world, light_pos_range[i].xyz, vec3(light_misc[i].yz, 0.0), range);
    }
    vec3 spot = vec3(light_misc[i].yz, 0.0);
    float cone = 1.0;
    if (dot(spot, spot) > 0.05) {
      cone = smoothstep(0.42, 0.78, dot(-ldir, normalize(spot)));
    }
    lit += (albedo * nd + lspec) * lcol * fall * vis * cone;
  }

  if (emit_k > 0.001) {
    lit += albedo * (0.45 + emit_k * 1.15) + vec3(0.14, 0.09, 0.03) * emit_k;
  }

  lit = aces_tonemap(lit * 0.96);
  float fog_a = min(0.55, 1.0 - exp(-v_extra.y * 0.0105));
  lit = mix(lit, frame_fog.rgb, fog_a);
  frag = vec4(lit, v_color.a);
}
`;

export const FS_GBUF = /* glsl */ `#version 300 es
precision highp float;
${FRAME}
in vec3 v_world;
in vec3 v_normal;
in vec4 v_color;
in vec4 v_shade;
in vec4 v_extra;
layout(location = 0) out vec4 out_albedo;
layout(location = 1) out vec4 out_normal;
layout(location = 2) out vec4 out_world;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 face_uv(vec3 p, vec3 n) {
  vec3 an = abs(n);
  if (an.z >= an.x && an.z >= an.y) return p.xy;
  if (an.y >= an.x) return p.xz;
  return p.yz;
}
vec3 apply_tex(vec3 base, vec3 p, vec3 n, float tex) {
  int id = int(tex + 0.5);
  if (id == 0) return base;
  vec2 uv = face_uv(p, n);
  if (id == 1) {
    float g = abs(fract(uv.x * 3.2) - 0.5);
    return mix(base, base * vec3(0.55, 0.52, 0.48), 1.0 - smoothstep(0.04, 0.1, g));
  }
  if (id == 2) {
    float g = abs(fract(uv.y * 2.1) - 0.5);
    float v = abs(fract(uv.x * 0.55) - 0.5);
    vec3 rgb = mix(base, base * 0.62, 1.0 - smoothstep(0.06, 0.14, g));
    return mix(rgb, rgb * 0.78, 1.0 - smoothstep(0.02, 0.07, v));
  }
  if (id == 3) {
    float row = floor(uv.y * 1.4);
    float g = length(vec2(fract(uv.x * 1.15 + row * 0.35) - 0.5, fract(uv.y * 1.4) - 0.5));
    return mix(base * 0.7, base, smoothstep(0.28, 0.42, g));
  }
  if (id == 4) {
    float g = abs(fract(uv.y * 4.5) - 0.5);
    return mix(base, base * 0.72, 1.0 - smoothstep(0.03, 0.08, g));
  }
  if (id == 5) {
    float g = abs(fract(uv.x * 2.4 + uv.y * 0.18) - 0.5);
    return mix(base, base * 0.8, 1.0 - smoothstep(0.08, 0.16, g));
  }
  if (id == 6) {
    float gx = abs(fract(uv.x * 5.0) - 0.5);
    float gy = abs(fract(uv.y * 5.0) - 0.5);
    float line = 1.0 - smoothstep(0.03, 0.08, min(gx, gy));
    return mix(base, base * vec3(0.28, 0.3, 0.32), line * 0.7);
  }
  if (id == 7) {
    float band = step(0.32, fract(uv.y * 0.55)) * (1.0 - step(0.58, fract(uv.y * 0.55)));
    return mix(base, vec3(0.82, 0.67, 0.16), band * 0.45);
  }
  vec2 cell = floor(uv * 2.6);
  float speck = hash21(cell + vec2(floor(p.z * 3.0), 0.0));
  return mix(base * 0.78, base * 1.08, speck);
}

void main() {
  vec3 n = normalize(v_normal);
  out_albedo = vec4(apply_tex(v_color.rgb, v_world, n, v_extra.x), v_color.a);
  out_normal = vec4(n, v_shade.w);
  out_world = vec4(v_world, v_extra.x);
}
`;

export const FS_RESTIR = /* glsl */ `#version 300 es
precision highp float;
${FRAME}
layout(std140) uniform Shadow {
  vec4 shadow_sun_r;
  vec4 shadow_sun_u;
  vec4 shadow_sun_f;
  vec4 shadow_sun_eye;
  vec4 shadow_sun_params;
};
uniform highp sampler2DShadow u_sun_shadow;
uniform sampler2D u_g_albedo;
uniform sampler2D u_g_normal;
uniform sampler2D u_g_world;
uniform sampler2D u_lights;
uniform sampler2D u_occluders;
uniform sampler2D u_grid;
uniform sampler2D u_index;
uniform sampler2D u_lgrid;
uniform sampler2D u_lindex;
uniform sampler2D u_prev_res;
uniform sampler2D u_prev_color;
uniform int u_exact;
layout(location = 0) out vec4 frag;
layout(location = 1) out vec4 out_res;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float luma(vec3 c) {
  return dot(c, vec3(0.3, 0.59, 0.11));
}

float wrap_n(float ndot, float wrap_k) {
  if (wrap_k > 0.0) ndot = (ndot + wrap_k) / (1.0 + wrap_k);
  return max(ndot, 0.0);
}

float pcf_sun(vec3 world, float ndot) {
  if (shadow_sun_params.x < 0.5) return 1.0;
  vec3 to = world - shadow_sun_eye.xyz;
  float lx = dot(to, shadow_sun_r.xyz);
  float ly = dot(to, shadow_sun_u.xyz);
  float lz = dot(to, shadow_sun_f.xyz);
  vec2 uv = vec2(lx / shadow_sun_params.x, ly / shadow_sun_params.y) * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  float ref = (lz - shadow_sun_params.z) / max(shadow_sun_params.w - shadow_sun_params.z, 0.01);
  float bias = 0.0014 + 0.0045 * (1.0 - clamp(ndot, 0.0, 1.0));
  ref = clamp(ref - bias, 0.0, 1.0);
  float texel = 1.0 / 1024.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      s += texture(u_sun_shadow, vec3(uv + vec2(float(i), float(j)) * texel, ref));
    }
  }
  return s / 9.0;
}

vec4 light_pos(int i) { return texelFetch(u_lights, ivec2(0, i), 0); }
vec4 light_col(int i) { return texelFetch(u_lights, ivec2(1, i), 0); }
vec4 light_dir(int i) { return texelFetch(u_lights, ivec2(2, i), 0); }
vec4 light_rad(int i) { return texelFetch(u_lights, ivec2(3, i), 0); }

float light_cone(int i, vec3 ldir) {
  vec4 dd = light_dir(i);
  if (dd.w < 0.5 || dot(dd.xyz, dd.xyz) < 0.05) return 1.0;
  vec4 rad = light_rad(i);
  float outer = rad.y;
  float inner = rad.z;
  if (inner <= outer) inner = min(outer + 0.12, 0.98);
  return smoothstep(outer, inner, dot(-ldir, normalize(dd.xyz)));
}

float light_contrib(int i, vec3 world, vec3 n, vec3 view_dir, vec3 albedo, float spec_k, float shine, float wrap_k) {
  if (i < 0) return 0.0;
  vec4 pr = light_pos(i);
  vec4 ci = light_col(i);
  vec4 dd = light_dir(i);
  vec3 to_l = pr.xyz - world;
  float dist = length(to_l);
  float range = max(pr.w, 0.01);
  float fall = max(1.0 - dist / range, 0.0);
  fall *= fall;
  vec3 ldir = to_l / max(dist, 1e-4);
  float nd = wrap_n(dot(n, ldir), wrap_k);
  float cone = light_cone(i, ldir);
  vec3 lcol = ci.rgb * ci.w;
  vec3 lh = normalize(ldir + view_dir);
  float lspec = pow(max(dot(n, lh), 0.0), shine) * spec_k * 0.4;
  return luma((albedo * nd + lspec) * lcol * fall * cone);
}

vec3 light_shade(int i, vec3 world, vec3 n, vec3 view_dir, vec3 albedo, float spec_k, float shine, float wrap_k) {
  vec4 pr = light_pos(i);
  vec4 ci = light_col(i);
  vec4 dd = light_dir(i);
  vec3 to_l = pr.xyz - world;
  float dist = length(to_l);
  float range = max(pr.w, 0.01);
  float fall = max(1.0 - dist / range, 0.0);
  fall *= fall;
  vec3 ldir = to_l / max(dist, 1e-4);
  float nd = wrap_n(dot(n, ldir), wrap_k);
  float cone = light_cone(i, ldir);
  vec3 lcol = ci.rgb * ci.w;
  vec3 lh = normalize(ldir + view_dir);
  float lspec = pow(max(dot(n, lh), 0.0), shine) * spec_k * 0.4;
  return (albedo * nd + lspec) * lcol * fall * cone;
}

float ray_aabb(vec3 o, vec3 d, vec3 mn, vec3 mx, float max_t) {
  vec3 inv = vec3(
    abs(d.x) < 1e-6 ? (d.x < 0.0 ? -1e6 : 1e6) : 1.0 / d.x,
    abs(d.y) < 1e-6 ? (d.y < 0.0 ? -1e6 : 1e6) : 1.0 / d.y,
    abs(d.z) < 1e-6 ? (d.z < 0.0 ? -1e6 : 1e6) : 1.0 / d.z
  );
  vec3 t0 = (mn - o) * inv;
  vec3 t1 = (mx - o) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float enter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float leave = min(min(tmax.x, tmax.y), min(tmax.z, max_t));
  return leave >= enter ? enter : -1.0;
}

bool light_owns(vec3 lp, float rad, vec3 mn, vec3 mx) {
  vec3 c = (mn + mx) * 0.5;
  vec3 e = mx - mn;
  return distance(lp, c) < rad + length(e) * 0.15;
}

int index_at(int k) {
  return int(texelFetch(u_index, ivec2(k % 2048, k / 2048), 0).r + 0.5);
}

int lindex_at(int k) {
  return int(texelFetch(u_lindex, ivec2(k % 2048, k / 2048), 0).r + 0.5);
}

int fetch_local_count(vec3 world) {
  float cell = max(frame_restir.w, 1.0);
  vec2 origin_xy = frame_map.xy;
  int cols = int(frame_map.z + 0.5);
  int rows = int(frame_map.w + 0.5);
  int cx = int(floor((world.x - origin_xy.x) / cell));
  int cy = int(floor((world.y - origin_xy.y) / cell));
  if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 0;
  return int(texelFetch(u_lgrid, ivec2(cx, cy), 0).y + 0.5);
}

int fetch_local_at(vec3 world, int k) {
  float cell = max(frame_restir.w, 1.0);
  vec2 origin_xy = frame_map.xy;
  int cx = int(floor((world.x - origin_xy.x) / cell));
  int cy = int(floor((world.y - origin_xy.y) / cell));
  vec4 head = texelFetch(u_lgrid, ivec2(cx, cy), 0);
  return lindex_at(int(head.x + 0.5) + k);
}

bool occ_hit(vec3 o, vec3 d, float reach, vec3 skip_lp, float skip_rad) {
  int n_occ = int(frame_restir.z + 0.5);
  if (n_occ <= 0) return false;
  float cell = max(frame_restir.w, 1.0);
  vec2 origin_xy = frame_map.xy;
  float cols = max(frame_map.z, 1.0);
  float rows = max(frame_map.w, 1.0);
  int cx = int(floor((o.x - origin_xy.x) / cell));
  int cy = int(floor((o.y - origin_xy.y) / cell));
  int step_x = d.x > 0.0 ? 1 : -1;
  int step_y = d.y > 0.0 ? 1 : -1;
  float t = 0.0;
  const int MAX_HOPS = 48;
  int seen0 = -1;
  int seen1 = -1;
  int seen2 = -1;
  int seen3 = -1;
  for (int hop = 0; hop < MAX_HOPS; hop++) {
    if (t > reach) break;
    if (cx >= 0 && cy >= 0 && cx < int(cols + 0.5) && cy < int(rows + 0.5)) {
      vec4 head = texelFetch(u_grid, ivec2(cx, cy), 0);
      int off = int(head.x + 0.5);
      int cnt = int(head.y + 0.5);
      for (int k = 0; k < 24; k++) {
        if (k >= cnt) break;
        int id = index_at(off + k);
        if (id == seen0 || id == seen1 || id == seen2 || id == seen3) continue;
        if (seen0 < 0) seen0 = id;
        else if (seen1 < 0) seen1 = id;
        else if (seen2 < 0) seen2 = id;
        else seen3 = id;
        vec4 a = texelFetch(u_occluders, ivec2(0, id), 0);
        vec4 b = texelFetch(u_occluders, ivec2(1, id), 0);
        vec3 mn = a.xyz;
        vec3 mx = vec3(a.w, b.x, b.y);
        if (skip_rad > 0.0 && light_owns(skip_lp, skip_rad, mn, mx)) continue;
        float hit = ray_aabb(o, d, mn, mx, reach);
        if (hit > 0.001) return true;
      }
    } else if (cx < -1 || cy < -1 || cx > int(cols + 1.5) || cy > int(rows + 1.5)) {
      break;
    }
    float nx = origin_xy.x + float(cx + (step_x > 0 ? 1 : 0)) * cell;
    float ny = origin_xy.y + float(cy + (step_y > 0 ? 1 : 0)) * cell;
    float tx = abs(d.x) > 1e-6 ? (nx - o.x) / d.x : 1e9;
    float ty = abs(d.y) > 1e-6 ? (ny - o.y) / d.y : 1e9;
    if (tx < ty) { t = tx; cx += step_x; }
    else { t = ty; cy += step_y; }
  }
  return false;
}

bool occ_hidden(vec3 origin, int li) {
  if (li < 0) return false;
  vec3 lp = light_pos(li).xyz;
  float rad = max(light_rad(li).x, 0.2);
  vec3 delta = lp - origin;
  float max_t = length(delta);
  if (max_t < 0.08) return false;
  vec3 d = delta / max_t;
  return occ_hit(origin + d * 0.10, d, max(max_t - 0.16, 0.02), lp, rad);
}

bool sun_hidden(vec3 origin) {
  if (frame_sun.w < 0.5) return false;
  vec3 d = normalize(frame_sun.xyz);
  return occ_hit(origin + d * 0.12, d, 96.0, vec3(0.0), 0.0);
}

void restir_add(inout vec4 res, int y, float phat, float w, float u) {
  res.y += w;
  res.z += 1.0;
  if (res.x < 0.0 || u * max(res.y, 1e-6) < w) {
    res.x = float(y);
    res.w = phat;
  }
}

void add_visible(inout vec3 lit, int li, vec3 world, vec3 n, vec3 view_dir, vec3 albedo, float spec_k, float shine, float wrap_k) {
  if (li < 0) return;
  float ph = light_contrib(li, world, n, view_dir, albedo, spec_k, shine, wrap_k);
  if (ph < 1e-5) return;
  if (occ_hidden(world, li)) return;
  lit += light_shade(li, world, n, view_dir, albedo, spec_k, shine, wrap_k);
}

void main() {
  vec2 resxy = max(frame_params.xy, vec2(1.0));
  ivec2 pix = ivec2(gl_FragCoord.xy);
  vec2 uv = (vec2(pix) + 0.5) / resxy;
  vec4 albedo_a = texelFetch(u_g_albedo, pix, 0);
  if (albedo_a.a < 0.01) {
    frag = vec4(0.0);
    out_res = vec4(-1.0, 0.0, 0.0, 0.0);
    return;
  }
  vec3 albedo = albedo_a.rgb;
  vec4 ns = texelFetch(u_g_normal, pix, 0);
  vec3 n = normalize(ns.xyz);
  vec3 world = texelFetch(u_g_world, pix, 0).xyz;
  float emit_k = ns.w;
  vec3 view_dir = normalize(frame_eye.xyz - world);
  float spec_k = 0.08;
  float shine = 16.0;
  float wrap_k = 0.04;

  vec3 sky = vec3(0.40, 0.50, 0.64);
  vec3 ground = vec3(0.26, 0.18, 0.11);
  float hemi = n.z * 0.5 + 0.5;
  vec3 sun_dir = frame_sun.xyz;
  vec3 sun_col = vec3(1.02, 0.84, 0.60);
  float sun_n = wrap_n(dot(n, sun_dir), wrap_k);
  float sun_on = frame_sun.w;
  float sun_vis = sun_on > 0.5 && !sun_hidden(world) ? 1.0 : 0.0;
  vec3 ambient = mix(ground, sky, hemi) * 0.20 + vec3(0.075, 0.068, 0.058);
  vec3 lit = albedo * (ambient + sun_col * sun_n * 0.86 * sun_vis);
  vec3 fill_dir = normalize(-sun_dir + vec3(0.0, 0.0, 0.42));
  lit += albedo * vec3(0.20, 0.26, 0.36) * max(dot(n, fill_dir), 0.0) * 0.22 * sun_on;

  int n_local = min(fetch_local_count(world), 32);
  int frame_i = int(frame_restir.x + 0.5);
  vec4 reservoir = vec4(-1.0, 0.0, 0.0, 0.0);
  float seed = hash21(gl_FragCoord.xy + float(frame_i) * 19.7);
  const int EXACT = 8;
  bool use_exact = u_exact == 1 || n_local <= EXACT;

  if (n_local > 0 && use_exact) {
    for (int i = 0; i < 32; i++) {
      if (i >= n_local) break;
      int li = fetch_local_at(world, i);
      add_visible(lit, li, world, n, view_dir, albedo, spec_k, shine, wrap_k);
      if (reservoir.x < 0.0) {
        reservoir = vec4(float(li), 1.0, 1.0, 1.0);
      }
    }
  } else if (n_local > EXACT) {
    int nearest = fetch_local_at(world, 0);
    float nearest_p = -1.0;
    for (int i = 0; i < 32; i++) {
      if (i >= n_local) break;
      int li = fetch_local_at(world, i);
      float ph = light_contrib(li, world, n, view_dir, albedo, spec_k, shine, wrap_k);
      if (ph > nearest_p) { nearest_p = ph; nearest = li; }
    }
    add_visible(lit, nearest, world, n, view_dir, albedo, spec_k, shine, wrap_k);

    const int CAND = 8;
    float psel = 1.0 / float(max(n_local - 1, 1));
    for (int c = 0; c < CAND; c++) {
      seed = hash21(vec2(seed * 13.1, float(c) + 0.7));
      int li = fetch_local_at(world, int(floor(seed * float(n_local))) % n_local);
      if (li == nearest) continue;
      float phat = light_contrib(li, world, n, view_dir, albedo, spec_k, shine, wrap_k);
      if (phat < 1e-5) continue;
      seed = hash21(vec2(seed, 3.3 + float(c)));
      restir_add(reservoir, li, phat, phat / max(psel, 1e-4), seed);
    }

    vec2 puv = to_uv(world, frame_prev_eye.xyz, frame_prev_r.xyz, frame_prev_u.xyz, frame_prev_f.xyz);
    if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
      vec4 prev = texture(u_prev_res, puv);
      int py = int(prev.x + 0.5);
      if (prev.x >= 0.0 && prev.z > 0.5 && py != nearest) {
        float ph = max(prev.w, light_contrib(py, world, n, view_dir, albedo, spec_k, shine, wrap_k));
        float w = ph * max(prev.y / max(prev.z * ph, 1e-4), 0.0) * min(prev.z, 12.0);
        seed = hash21(vec2(seed, 8.8));
        restir_add(reservoir, py, max(ph, 1e-5), w, seed);
        reservoir.z = min(20.0, reservoir.z + min(prev.z, 12.0));
      }
      for (int s = 0; s < 3; s++) {
        seed = hash21(vec2(seed, float(s) + 11.0));
        vec2 off = (vec2(seed, hash21(vec2(seed, 4.2))) - 0.5) * 18.0 / resxy;
        vec4 nei = texture(u_prev_res, uv + off);
        vec3 nw = texture(u_g_world, uv + off).xyz;
        int ny = int(nei.x + 0.5);
        if (nei.x < 0.0 || ny == nearest || distance(nw, world) > 1.4) continue;
        float ph = max(nei.w, light_contrib(ny, world, n, view_dir, albedo, spec_k, shine, wrap_k));
        float w = ph * max(nei.y / max(nei.z * ph, 1e-4), 0.0);
        seed = hash21(vec2(seed, 21.0));
        restir_add(reservoir, ny, max(ph, 1e-5), w, seed);
      }
    }

    int chosen = int(reservoir.x + 0.5);
    float W = 0.0;
    if (chosen >= 0 && chosen != nearest && reservoir.z > 0.0 && reservoir.w > 1e-6) {
      W = min(reservoir.y / (reservoir.z * reservoir.w), 6.0);
    }
    if (chosen >= 0 && W > 0.0 && !occ_hidden(world, chosen)) {
      lit += light_shade(chosen, world, n, view_dir, albedo, spec_k, shine, wrap_k) * W;
    }
  }

  if (emit_k > 0.001) {
    lit += albedo * (0.45 + emit_k * 1.15) + vec3(0.14, 0.09, 0.03) * emit_k;
  }

  if (!use_exact && n_local > EXACT) {
    vec2 puv = to_uv(world, frame_prev_eye.xyz, frame_prev_r.xyz, frame_prev_u.xyz, frame_prev_f.xyz);
    if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
      vec4 hist = texture(u_prev_color, puv);
      if (hist.a > 0.5) lit = mix(hist.rgb, lit, 0.35);
    }
  }
  frag = vec4(lit, 1.0);
  out_res = reservoir;
}
`;

export const FS_GHOST = /* glsl */ `#version 300 es
precision highp float;
${FRAME}
in vec3 v_world;
in vec3 v_normal;
in vec4 v_color;
in vec4 v_shade;
in vec4 v_extra;
out vec4 frag;
float wrap_n(float ndot, float wrap_k) {
  if (wrap_k > 0.0) ndot = (ndot + wrap_k) / (1.0 + wrap_k);
  return max(ndot, 0.0);
}
void main() {
  vec3 n = normalize(v_normal);
  vec3 albedo = v_color.rgb;
  float wrap_k = v_shade.z;
  float hemi = n.z * 0.5 + 0.5;
  vec3 ambient = mix(vec3(0.26, 0.18, 0.11), vec3(0.40, 0.50, 0.64), hemi) * 0.20 + vec3(0.075, 0.068, 0.058);
  float sun_n = wrap_n(dot(n, frame_sun.xyz), wrap_k);
  vec3 lit = albedo * (ambient + vec3(1.02, 0.84, 0.60) * sun_n * 0.5 * frame_sun.w);
  frag = vec4(lit, v_color.a);
}
`;

export const FS_BLIT = /* glsl */ `#version 300 es
precision highp float;
${FRAME}
uniform sampler2D u_color;
uniform sampler2D u_g_world;
out vec4 frag;
void main() {
  ivec2 pix = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(u_color, pix, 0);
  if (c.a < 0.01) discard;
  vec3 lit = c.rgb * 0.96;
  lit = clamp((lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14), 0.0, 1.0);
  vec3 world = texelFetch(u_g_world, pix, 0).xyz;
  lit = mix(lit, frame_fog.rgb, aerial_fog(world));
  lit = god_view_grade(lit);
  frag = vec4(lit, 1.0);
}
`;

export const VS_DEPTH = /* glsl */ `#version 300 es
layout(std140) uniform ShadowCam {
  vec4 depth_r;
  vec4 depth_u;
  vec4 depth_f;
  vec4 depth_eye;
  vec4 depth_params;
  vec4 depth_mode;
};
layout(location = 0) in vec4 a_pos;
void main() {
  vec3 v = a_pos.xyz - depth_eye.xyz;
  float vx = dot(v, depth_r.xyz);
  float vy = dot(v, depth_u.xyz);
  float vz = max(dot(v, depth_f.xyz), 0.02);
  float z_ndc = ((vz - depth_params.z) / max(depth_params.w - depth_params.z, 0.01)) * 2.0 - 1.0;
  if (depth_mode.x < 0.5) {
    gl_Position = vec4(vx / max(depth_params.x, 0.01), vy / max(depth_params.y, 0.01), z_ndc, 1.0);
  } else {
    gl_Position = vec4(vx / (vz * max(depth_params.x, 0.01)), vy / (vz * max(depth_params.y, 0.01)), z_ndc, 1.0);
  }
}
`;

export const FS_DEPTH = /* glsl */ `#version 300 es
precision highp float;
void main() {}
`;

export const VS_SKY = /* glsl */ `#version 300 es
${FRAME}
void main() {
  if (gl_VertexID == 0) gl_Position = vec4(-1.0, -1.0, 0.0, 1.0);
  else if (gl_VertexID == 1) gl_Position = vec4(3.0, -1.0, 0.0, 1.0);
  else gl_Position = vec4(-1.0, 3.0, 0.0, 1.0);
}
`;

export const FS_SKY = /* glsl */ `#version 300 es
precision highp float;
${FRAME}
out vec4 frag;
void main() {
  float w = max(frame_params.x, 1.0);
  float hgt = max(frame_params.y, 1.0);
  float fov = frame_params.z;
  float t = gl_FragCoord.y / hgt;
  vec3 top = vec3(0.078, 0.118, 0.157);
  vec3 mid = vec3(0.165, 0.235, 0.282);
  vec3 hor = vec3(0.690, 0.455, 0.251);
  vec3 rgb = mix(top, mid, clamp(t * 1.6, 0.0, 1.0));
  rgb = mix(rgb, hor, smoothstep(0.45, 1.0, t));
  float nx = (gl_FragCoord.x - w * 0.5) * 2.0 * fov / hgt;
  float ny = -(gl_FragCoord.y - hgt * 0.5) * 2.0 * fov / hgt;
  vec3 dir = normalize(frame_f.xyz + frame_r.xyz * nx + frame_u.xyz * ny);
  float sun = pow(max(dot(dir, frame_sun.xyz), 0.0), 48.0);
  float glow = pow(max(dot(dir, frame_sun.xyz), 0.0), 8.0);
  rgb = rgb + vec3(1.0, 0.78, 0.42) * sun * 0.95 + vec3(0.92, 0.55, 0.22) * glow * 0.28;
  frag = vec4(rgb, 1.0);
}
`;

export const VS_OVERLAY = /* glsl */ `#version 300 es
${FRAME}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_color;
out vec4 v_color;
void main() {
  gl_Position = to_clip(a_pos);
  v_color = a_color;
}
`;

export const FS_OVERLAY = /* glsl */ `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 frag;
void main() {
  frag = v_color;
}
`;

export const VS_TEXT = /* glsl */ `#version 300 es
${FRAME}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
out vec2 v_uv;
out vec4 v_color;
void main() {
  float w = max(frame_params.x, 1.0);
  float h = max(frame_params.y, 1.0);
  float ndc_x = (a_pos.x / w) * 2.0 - 1.0;
  float ndc_y = 1.0 - (a_pos.y / h) * 2.0;
  gl_Position = vec4(ndc_x, ndc_y, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

export const FS_TEXT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_font;
in vec2 v_uv;
in vec4 v_color;
out vec4 frag;
void main() {
  float a = texture(u_font, v_uv).a;
  if (a < 0.12) discard;
  frag = vec4(v_color.rgb, v_color.a * a);
}
`;
