#include "combat.hpp"

#include <algorithm>
#include <cmath>
#include <queue>
#include <sstream>

namespace {

constexpr float kPersonR = 0.28f;
constexpr float kClear = 0.12f;

bool blocked(const Map& map, Vec2 p) {
    Vec2 inset_min = map.min + Vec2{kPersonR, kPersonR};
    Vec2 inset_max = map.max - Vec2{kPersonR, kPersonR};
    if (!point_in_aabb(p, inset_min, inset_max)) return true;
    for (const Cover& c : map.cover) {
        if (c.durability <= 0) continue;
        Vec2 mn = c.min - Vec2{kClear, kClear};
        Vec2 mx = c.max + Vec2{kClear, kClear};
        if (point_in_aabb(p, mn, mx)) return true;
    }
    return false;
}

Vec2 slide(const Map& map, Vec2 from, Vec2 to) {
    Vec2 delta = to - from;
    float dist = length(delta);
    if (dist < 1e-5f) return from;
    Vec2 dir = delta / dist;
    int steps = std::max(8, static_cast<int>(dist / 0.06f));
    Vec2 last = from;
    for (int i = 1; i <= steps; ++i) {
        Vec2 p = from + dir * (dist * (float)i / steps);
        if (blocked(map, p)) break;
        last = p;
    }
    return last;
}

} // namespace

void finalize_unit(Unit& u) {
    int init = (int)std::lround(u.initiative_base + u.loadout_init);
    if (init < 1) init = 1;
    if (init > 6) init = 6;
    u.initiative = init;
    u.reaction_max = 1.0f + u.awareness * 0.55f + u.experience * 1.6f;
    u.reaction_left = u.reaction_max;
    u.pain_tolerance = 38.0f + u.endurance * 12.0f + u.experience * 22.0f;
    u.stress_tolerance = 28.0f + u.experience * 48.0f + u.endurance * 6.0f;
    if (u.armor.empty()) {
        u.armor.push_back({"chest plate", "torso", 18, 7, 7});
        u.armor.push_back({"abdomen panel", "abdomen", 12, 5, 5});
    }
    if (u.mag_size <= 0) u.mag_size = 8;
    if (u.mag <= 0) u.mag = u.mag_size;
    reset_channels(u);
}

void reset_channels(Unit& u) {
    u.ch = Channels{};
    // Pain / blood stretch action times by reducing remaining budget slightly next turn
    // (applied as a spend multiplier at action time, not here).
}

float surprise_for(const World& w, int team) { return team == 0 ? w.map.surprise0 : w.map.surprise1; }

float silhouette_scale_z(Posture p) {
    if (p == Posture::Crouching) return 0.62f;
    if (p == Posture::Prone) return 0.22f;
    return 1.0f;
}

float silhouette_scale_x(Posture p) {
    if (p == Posture::Prone) return 1.45f;
    if (p == Posture::Crouching) return 1.08f;
    return 1.0f;
}

std::vector<SilRegion> silhouette_for(Posture p) {
    float sz = silhouette_scale_z(p);
    float sx = silhouette_scale_x(p);
    std::vector<SilRegion> r = {
        {"head", -0.12f, 0.12f, 1.50f, 1.80f},
        {"torso", -0.22f, 0.22f, 1.05f, 1.50f},
        {"abdomen", -0.20f, 0.20f, 0.75f, 1.05f},
        {"l_arm", -0.38f, -0.22f, 0.75f, 1.50f},
        {"r_arm", 0.22f, 0.38f, 0.75f, 1.50f},
        {"l_leg", -0.20f, 0.00f, 0.00f, 0.75f},
        {"r_leg", 0.00f, 0.20f, 0.00f, 0.75f},
    };
    for (auto& s : r) {
        s.x0 *= sx;
        s.x1 *= sx;
        s.z0 *= sz;
        s.z1 *= sz;
    }
    if (p == Posture::Prone) {
        // Mostly head + torso slab.
        r = {
            {"head", -0.14f, 0.14f, 0.18f, 0.40f},
            {"torso", -0.28f, 0.28f, 0.06f, 0.22f},
            {"abdomen", -0.22f, 0.22f, 0.00f, 0.08f},
        };
    }
    return r;
}

Vec2 aim_point_offset(AimRegion aim, Posture p) {
    auto sil = silhouette_for(p);
    const char* want = aim == AimRegion::Head ? "head" : (aim == AimRegion::Legs ? "l_leg" : "torso");
    for (const auto& s : sil) {
        if (std::string(s.name) == want || (aim == AimRegion::Legs && std::string(s.name) == "abdomen")) {
            return {(s.x0 + s.x1) * 0.5f, (s.z0 + s.z1) * 0.5f};
        }
    }
    return {0, 1.15f * silhouette_scale_z(p)};
}

float accuracy_angle(const Unit& attacker, ShotMode mode, Gait last_gait) {
    float a = attacker.weapon_spread;
    float skill = 0.55f + attacker.firearms * 0.28f; // 1 → 0.83, 5 → 1.95
    a /= skill;
    if (mode == ShotMode::Aimed) a *= 0.48f;
    if (mode == ShotMode::Snap) a *= 1.15f;
    if (mode == ShotMode::Burst) a *= 1.55f;
    a *= movement_cone_mult(last_gait);
    if (attacker.posture == Posture::Prone && mode == ShotMode::Aimed) a *= 0.82f;
    if (attacker.posture == Posture::Crouching) a *= 0.92f;
    float pain_ratio = attacker.pain / std::max(20.0f, attacker.pain_tolerance);
    if (pain_ratio > 1.0f) a *= 1.0f + (pain_ratio - 1.0f) * 0.6f;
    else if (pain_ratio > 0.7f) a *= 1.15f;
    if (attacker.blood > 50) a *= 1.12f;
    if (attacker.blood > 70) a *= 1.2f;
    if (attacker.stress > attacker.stress_tolerance) a *= 1.25f;
    if (!attacker.weapon_ready) a *= 1.8f;
    return a;
}

float movement_cone_mult(Gait g) {
    if (g == Gait::Run) return 1.65f;
    if (g == Gait::Sprint) return 3.2f;
    return 1.0f;
}

float gait_speed(Gait g, const Unit& u) {
    float base = 1.25f;
    if (g == Gait::Run) base = 2.15f;
    if (g == Gait::Sprint) base = 3.4f;
    if (u.posture == Posture::Crouching) base *= 0.7f;
    if (u.posture == Posture::Prone) base *= 0.35f;
    for (const Wound& w : u.wounds) {
        if (w.impairment.find("leg") != std::string::npos || w.impairment.find("limp") != std::string::npos)
            base *= 0.65f;
    }
    if (u.blood > 50) base *= 0.75f;
    if (u.pain > u.pain_tolerance) base *= 0.7f;
    return base;
}

float gait_leg_time(float dist, Gait g, const Unit& u) {
    float spd = gait_speed(g, u);
    return dist / std::max(0.15f, spd);
}

bool spend_channels(Unit& u, float hands, float legs, float focus, float voice, std::string& err) {
    float stretch = 1.0f;
    if (u.pain >= u.pain_tolerance) stretch += 0.25f;
    if (u.blood > 50) stretch += 0.15f;
    hands *= stretch;
    focus *= stretch;
    if (u.ch.hands + 1e-4f < hands) {
        err = "not enough Hands time";
        return false;
    }
    if (u.ch.legs + 1e-4f < legs) {
        err = "not enough Legs time";
        return false;
    }
    if (u.ch.focus + 1e-4f < focus) {
        err = "not enough Focus time";
        return false;
    }
    if (u.ch.voice + 1e-4f < voice) {
        err = "not enough Voice time";
        return false;
    }
    u.ch.hands -= hands;
    u.ch.legs -= legs;
    u.ch.focus -= focus;
    u.ch.voice -= voice;
    return true;
}

bool cover_blocks_height(const Cover& c, Vec2 origin, Vec2 dir, float max_t, float height, float& t_hit) {
    if (c.durability <= 0) return false;
    if (height >= c.height - 0.02f) return false;
    return ray_aabb(origin, dir, c.min, c.max, max_t, t_hit);
}

namespace {

const char* region_of(const std::vector<SilRegion>& sil, float x, float z) {
    for (const auto& s : sil) {
        if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.name;
    }
    return nullptr;
}

} // namespace

ShotSample resolve_cone_sample(const World& w, const Unit& attacker, const Unit& target, ShotMode,
                               AimRegion aim, float err_lat, float err_vert, float acc_rad) {
    ShotSample out;
    Vec2 delta = target.pos - attacker.pos;
    float dist = length(delta);
    if (dist < 0.15f) dist = 0.15f;
    Vec2 aim_dir = delta / dist;
    Vec2 perp = rotate(aim_dir, 1.5707963f);
    Vec2 aim_off = aim_point_offset(aim, target.posture);
    float sigma = std::max(0.02f, dist * std::tan(acc_rad));
    float lat = aim_off.x + err_lat * sigma;
    float height = aim_off.y + err_vert * sigma;
    out.lateral = lat;
    out.height = height;
    Vec2 through = target.pos + perp * lat;
    Vec2 shot_dir = normalize(through - attacker.pos);
    out.shot_dir = shot_dir;
    out.point = through;
    float max_t = attacker.max_range;

    float best_t = max_t + 1;
    for (int i = 0; i < (int)w.map.cover.size(); ++i) {
        float t = 0;
        if (cover_blocks_height(w.map.cover[i], attacker.pos, shot_dir, max_t, height, t) && t < best_t &&
            t < dist + 0.15f) {
            best_t = t;
            out.hit_cover = true;
            out.cover_index = i;
            out.point = attacker.pos + shot_dir * t;
            out.t = t;
            out.region = "cover";
        }
    }
    if (out.hit_cover) return out;

    auto sil = silhouette_for(target.posture);
    const char* reg = region_of(sil, lat, height);
    if (reg) {
        out.hit_unit = true;
        out.unit = target.id;
        out.region = reg;
        out.t = dist;
        out.point = target.pos + perp * lat;
        return out;
    }

    // stray: first living unit whose ellipse is along the shot, then miss
    for (const Unit& u : w.units) {
        if (u.id == attacker.id || !unit_alive(u)) continue;
        float t = 0;
        if (ray_ellipse(attacker.pos, shot_dir, u.pos, u.facing, u.sil_w * 0.5f, u.sil_d * 0.5f, max_t, t) &&
            t < best_t && t > 0.2f) {
            best_t = t;
            out.hit_unit = true;
            out.unit = u.id;
            out.t = t;
            out.point = attacker.pos + shot_dir * t;
            out.region = "torso";
        }
    }
    if (!out.hit_unit) {
        out.t = max_t;
        out.point = attacker.pos + shot_dir * max_t;
        out.region = "miss";
    }
    return out;
}

void apply_cover_hit(Cover& cover, float weapon_pen) {
    float dmg = 1.0f;
    if (weapon_pen > cover.protection) dmg = 2.2f;
    cover.durability = std::max(0.0f, cover.durability - dmg);
}

void apply_armor_hit(Unit& victim, ShotSample& sample, float weapon_pen) {
    sample.remaining_pen = weapon_pen;
    ArmorPlate* plate = nullptr;
    for (ArmorPlate& p : victim.armor) {
        if (p.region == sample.region ||
            (p.region == "arm" && (sample.region == "l_arm" || sample.region == "r_arm")) ||
            (p.region == "leg" && (sample.region == "l_leg" || sample.region == "r_leg"))) {
            plate = &p;
            break;
        }
    }
    if (!plate || plate->durability <= 0) {
        sample.armor_result = "unarmored";
        return;
    }
    sample.armor = plate->name;
    float prot = plate->protection * (plate->durability / std::max(1.0f, plate->durability_max));
    if (weapon_pen > prot * 1.25f) {
        sample.armor_result = "full_pen";
        sample.remaining_pen = weapon_pen - prot * 0.25f;
        plate->durability = std::max(0.0f, plate->durability - 2.4f);
    } else if (weapon_pen > prot) {
        sample.armor_result = "pen";
        sample.remaining_pen = (weapon_pen - prot) + prot * 0.35f;
        plate->durability = std::max(0.0f, plate->durability - 1.8f);
    } else if (weapon_pen > prot * 0.75f) {
        sample.armor_result = "partial";
        sample.remaining_pen = weapon_pen * 0.35f;
        plate->durability = std::max(0.0f, plate->durability - 1.2f);
    } else if (weapon_pen > prot * 0.4f) {
        sample.armor_result = "stopped";
        sample.remaining_pen = 0;
        plate->durability = std::max(0.0f, plate->durability - 0.7f);
    } else {
        sample.armor_result = "deflected";
        sample.remaining_pen = 0;
        plate->durability = std::max(0.0f, plate->durability - 0.2f);
    }
}

WoundResult generate_wound(const Unit& victim, const ShotSample& sample, float) {
    WoundResult r;
    Wound& w = r.wound;
    w.region = sample.region;
    float pen = sample.remaining_pen;
    if (pen <= 0.01f) {
        w.depth = 0;
        w.description = "stopped by armor — bruise (" + sample.region + ")";
        w.pain = 6;
        w.stress = 3;
        w.bleed_rate = 0;
        return r;
    }
    int depth = 0;
    if (pen > 6) depth = 1;
    if (pen > 12) depth = 2;
    if (pen > 20) depth = 3;
    if (sample.region == "head" && pen > 10) depth = 3;
    w.depth = depth;

    const char* depth_n[] = {"graze", "shallow", "deep", "critical"};
    std::ostringstream os;
    os << depth_n[depth] << " kinetic hit to " << sample.region;
    if (!sample.armor_result.empty() && sample.armor_result != "unarmored")
        os << " (" << sample.armor_result << ")";
    w.description = os.str();

    if (depth == 0) {
        w.pain = 12;
        w.stress = 6;
        w.bleed_rate = 0.6f;
    } else if (depth == 1) {
        w.pain = 24;
        w.stress = 10;
        w.bleed_rate = 2.2f;
        if (sample.region.find("leg") != std::string::npos) w.impairment = "limp";
        if (sample.region.find("arm") != std::string::npos) w.impairment = "arm";
    } else if (depth == 2) {
        w.pain = 42;
        w.stress = 16;
        w.bleed_rate = 5.5f;
        if (sample.region.find("leg") != std::string::npos) w.impairment = "limp";
        if (sample.region.find("arm") != std::string::npos) w.impairment = "arm";
    } else {
        w.pain = 80;
        w.stress = 28;
        w.bleed_rate = 14.0f;
        if (sample.region == "head" || sample.region == "torso") {
            r.incapacitate = true;
            if (pen > 24) r.kill = true;
            w.impairment = "vital";
        }
    }
    (void)victim;
    return r;
}

Vec2 path_move(const Map& map, Vec2 from, Vec2 to) {
    Vec2 direct = slide(map, from, to);
    if (length(direct - to) < 0.15f) return direct;

    struct Node {
        Vec2 p;
        float g;
        int prev;
    };
    std::vector<Vec2> pts;
    pts.push_back(from);
    pts.push_back(to);
    float off = kPersonR + kClear + 0.08f;
    for (const Cover& c : map.cover) {
        if (c.durability <= 0) continue;
        Vec2 corners[4] = {{c.min.x - off, c.min.y - off},
                           {c.min.x - off, c.max.y + off},
                           {c.max.x + off, c.min.y - off},
                           {c.max.x + off, c.max.y + off}};
        for (Vec2 q : corners) {
            if (!blocked(map, q)) pts.push_back(q);
        }
    }

    auto reachable = [&](Vec2 a, Vec2 b) {
        Vec2 s = slide(map, a, b);
        return length(s - b) < 0.2f;
    };

    const int n = (int)pts.size();
    std::vector<float> dist(n, 1e30f);
    std::vector<int> prev(n, -1);
    dist[0] = 0;
    std::priority_queue<std::pair<float, int>, std::vector<std::pair<float, int>>, std::greater<>> pq;
    pq.push({0, 0});
    while (!pq.empty()) {
        auto [d, i] = pq.top();
        pq.pop();
        if (d > dist[i] + 1e-5f) continue;
        for (int j = 0; j < n; ++j) {
            if (j == i) continue;
            if (!reachable(pts[i], pts[j])) continue;
            float nd = d + length(pts[j] - pts[i]);
            if (nd + 1e-4f < dist[j]) {
                dist[j] = nd;
                prev[j] = i;
                pq.push({nd, j});
            }
        }
    }
    if (prev[1] < 0) return direct; // first hop toward dest via graph
    // walk first segment of the path
    int cur = 1;
    while (prev[cur] != 0 && prev[cur] != -1) cur = prev[cur];
    return slide(map, from, pts[cur]);
}

bool los_2d(const Map& map, Vec2 a, Vec2 b) {
    Vec2 d = b - a;
    float dist = length(d);
    if (dist < 1e-4f) return true;
    Vec2 dir = d / dist;
    for (const Cover& c : map.cover) {
        if (c.durability <= 0) continue;
        float t = 0;
        if (ray_aabb(a, dir, c.min, c.max, dist - 0.05f, t) && t > 0.05f) return false;
    }
    return true;
}
