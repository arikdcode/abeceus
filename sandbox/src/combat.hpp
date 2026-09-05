#pragma once

#include "rng.hpp"
#include "world.hpp"

#include <string>
#include <vector>

struct SilRegion {
    const char* name;
    float x0, x1, z0, z1; // target-plane local: x left-right, z up from feet
};

struct ShotSample {
    bool hit_unit = false;
    bool hit_cover = false;
    UnitId unit = 0;
    int cover_index = -1;
    Vec2 point{};
    Vec2 shot_dir{};
    float t = 0;
    float height = 1.1f;
    float lateral = 0;
    std::string region = "miss";
    float remaining_pen = 0;
    std::string armor = "";
    std::string armor_result = "";
};

struct WoundResult {
    Wound wound;
    bool incapacitate = false;
    bool kill = false;
};

float accuracy_angle(const Unit& attacker, ShotMode mode, Gait last_gait);
float silhouette_scale_z(Posture p);
float silhouette_scale_x(Posture p);
std::vector<SilRegion> silhouette_for(Posture p);
Vec2 aim_point_offset(AimRegion aim, Posture p); // (lateral, height)

bool cover_blocks_height(const Cover& c, Vec2 origin, Vec2 dir, float max_t, float height, float& t_hit);

ShotSample resolve_cone_sample(const World& w, const Unit& attacker, const Unit& target, ShotMode mode,
                               AimRegion aim, float err_lat, float err_vert, float acc_rad);

WoundResult generate_wound(const Unit& victim, const ShotSample& sample, float weapon_pen);

void apply_armor_hit(Unit& victim, ShotSample& sample, float weapon_pen);
void apply_cover_hit(Cover& cover, float weapon_pen);

Vec2 path_move(const Map& map, Vec2 from, Vec2 to); // walks around cover when possible

float gait_speed(Gait g, const Unit& u);
float gait_leg_time(float dist, Gait g, const Unit& u);
float movement_cone_mult(Gait g);
bool spend_channels(Unit& u, float hands, float legs, float focus, float voice, std::string& err);

bool los_2d(const Map& map, Vec2 a, Vec2 b);
