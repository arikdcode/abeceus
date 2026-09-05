#pragma once

#include <cmath>

struct Vec2 {
    float x = 0;
    float y = 0;

    Vec2 operator+(Vec2 o) const { return {x + o.x, y + o.y}; }
    Vec2 operator-(Vec2 o) const { return {x - o.x, y - o.y}; }
    Vec2 operator*(float s) const { return {x * s, y * s}; }
    Vec2 operator/(float s) const { return {x / s, y / s}; }
    Vec2& operator+=(Vec2 o) {
        x += o.x;
        y += o.y;
        return *this;
    }
};

inline float dot(Vec2 a, Vec2 b) { return a.x * b.x + a.y * b.y; }
inline float length_sq(Vec2 v) { return dot(v, v); }
inline float length(Vec2 v) { return std::sqrt(length_sq(v)); }

inline Vec2 normalize(Vec2 v) {
    float l = length(v);
    if (l < 1e-8f) return {1, 0};
    return v / l;
}

inline Vec2 rotate(Vec2 v, float rad) {
    float c = std::cos(rad);
    float s = std::sin(rad);
    return {v.x * c - v.y * s, v.x * s + v.y * c};
}

inline float angle_of(Vec2 v) { return std::atan2(v.y, v.x); }

inline Vec2 clamp_to_aabb(Vec2 p, Vec2 mn, Vec2 mx) {
    return {std::fmin(mx.x, std::fmax(mn.x, p.x)), std::fmin(mx.y, std::fmax(mn.y, p.y))};
}

inline bool point_in_aabb(Vec2 p, Vec2 mn, Vec2 mx) {
    return p.x >= mn.x && p.x <= mx.x && p.y >= mn.y && p.y <= mx.y;
}

// Slab test. d should be normalized. Returns true if the segment [0, max_t] hits.
inline bool ray_aabb(Vec2 o, Vec2 d, Vec2 mn, Vec2 mx, float max_t, float& t_hit) {
    float tmin = 0.0f;
    float tmax = max_t;
    for (int i = 0; i < 2; ++i) {
        float oi = i == 0 ? o.x : o.y;
        float di = i == 0 ? d.x : d.y;
        float a = i == 0 ? mn.x : mn.y;
        float b = i == 0 ? mx.x : mx.y;
        if (std::fabs(di) < 1e-8f) {
            if (oi < a || oi > b) return false;
            continue;
        }
        float t1 = (a - oi) / di;
        float t2 = (b - oi) / di;
        if (t1 > t2) {
            float tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        tmin = std::fmax(tmin, t1);
        tmax = std::fmin(tmax, t2);
        if (tmax < tmin) return false;
    }
    if (tmin > max_t || tmax < 0) return false;
    t_hit = tmin >= 0 ? tmin : tmax;
    return t_hit >= 0 && t_hit <= max_t;
}

// Oriented ellipse: half-width (perp to facing) and half-depth (along facing).
inline bool ray_ellipse(Vec2 o, Vec2 d, Vec2 c, float facing, float hw, float hd, float max_t, float& t_hit) {
    if (hw < 1e-6f || hd < 1e-6f) return false;
    float ca = std::cos(-facing);
    float sa = std::sin(-facing);
    auto to_local = [&](Vec2 p) {
        Vec2 t = p - c;
        return Vec2{t.x * ca - t.y * sa, t.x * sa + t.y * ca};
    };
    Vec2 ol = to_local(o);
    Vec2 dl = {d.x * ca - d.y * sa, d.x * sa + d.y * ca};
    ol.x /= hw;
    ol.y /= hd;
    dl.x /= hw;
    dl.y /= hd;
    float A = dot(dl, dl);
    if (A < 1e-12f) return false;
    float B = 2.0f * dot(ol, dl);
    float C = dot(ol, ol) - 1.0f;
    float disc = B * B - 4.0f * A * C;
    if (disc < 0) return false;
    float s = std::sqrt(disc);
    float t0 = (-B - s) / (2.0f * A);
    float t1 = (-B + s) / (2.0f * A);
    float best = 1e30f;
    if (t0 > 1e-4f && t0 <= max_t) best = t0;
    if (t1 > 1e-4f && t1 <= max_t && t1 < best) best = t1;
    if (best > max_t) return false;
    t_hit = best;
    return true;
}
