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
  float vz = max(dot(v, frame_f.xyz), 0.05);
  float fov = frame_params.z;
  float aspect = frame_params.x / max(frame_params.y, 1.0);
  float near = max(frame_params.w, 0.05);
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
  v_extra = vec4(a_pos.w, max(dot(a_pos.xyz - frame_eye.xyz, frame_f.xyz), 0.2), 0.0, 0.0);
}
`;

export const FS_LIT = /* glsl */ `#version 300 es
precision highp float;
${FRAME}
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

void main() {
  vec3 n = normalize(v_normal);
  vec3 toward = -frame_f.xyz;
  if (dot(n, toward) < 0.0) n = -n;
  vec3 rgb = apply_tex(v_color.rgb, v_world, n, v_extra.x);
  float spec_k = v_shade.x;
  float shine = max(v_shade.y, 1.0);
  float wrap_k = v_shade.z;
  float emit_k = v_shade.w;
  if (emit_k > 0.001) {
    rgb = min(rgb * (1.15 + 0.35 * emit_k) + vec3(0.16, 0.11, 0.03) * emit_k, vec3(1.0));
  } else {
    float ndot = dot(n, frame_sun.xyz);
    if (wrap_k > 0.0) ndot = (ndot + wrap_k) / (1.0 + wrap_k);
    float lambert = max(ndot, 0.0);
    float hemi = n.z * 0.5 + 0.5;
    float under = max(-n.z, 0.0);
    float ambient = 0.16 + 0.22 * hemi + 0.07 * under;
    float diffuse = 0.78 * lambert;
    vec3 h = normalize(frame_sun.xyz + toward);
    float spec = pow(max(dot(n, h), 0.0), shine) * spec_k;
    float warm = 0.55 * lambert;
    rgb = rgb * (ambient * vec3(0.86, 0.90, 0.96) + diffuse * vec3(0.92 + 0.16 * warm, 0.90 + 0.08 * warm, 0.82));
    rgb = rgb * vec3(1.08, 0.92, 0.72);
    rgb = rgb + spec * vec3(0.72, 0.60, 0.48);
  }
  float fog_a = min(0.62, 1.0 - exp(-v_extra.y * 0.0115));
  rgb = mix(rgb, frame_fog.rgb, fog_a);
  frag = vec4(rgb, v_color.a);
}
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
