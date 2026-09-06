const FRAME = /* glsl */ `
layout(std140) uniform Frame {
  vec4 frame_r;
  vec4 frame_u;
  vec4 frame_f;
  vec4 frame_eye;
  vec4 frame_sun;
  vec4 frame_fog;
  vec4 frame_params;
};

vec4 to_clip(vec3 p) {
  vec3 v = p - frame_eye.xyz;
  float vx = dot(v, frame_r.xyz);
  float vy = dot(v, frame_u.xyz);
  float vz = dot(v, frame_f.xyz);
  float fov = frame_params.z;
  float aspect = frame_params.x / max(frame_params.y, 1.0);
  float near = max(frame_params.w, 0.02);
  float far = 250.0;
  float z_clip = ((far + near) / (far - near)) * vz + (-2.0 * far * near / (far - near));
  return vec4(vx / (fov * aspect), vy / fov, z_clip, vz);
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
