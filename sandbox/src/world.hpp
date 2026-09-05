#pragma once

#include "vec2.hpp"

#include <cstdint>
#include <string>
#include <vector>

using UnitId = uint32_t;

constexpr float kTurnSeconds = 5.0f;

enum class ActionType {
    Move,
    Shoot,
    EndTurn,
    Reload,
    Bandage,
    SetPosture,
    Overwatch,
    ReadyWeapon,
    ContactReady,
    ReactShift,
    ReactDrop,
    ReactTrack,
    ReactBrace,
    ReactSkip,
    OverwatchFire,
    OverwatchHold,
};

enum class Gait { Walk, Run, Sprint };
enum class ShotMode { Snap, Aimed, Burst };
enum class AimRegion { Torso, Head, Legs };
enum class Posture { Standing, Crouching, Prone };
enum class Phase { Contact, Play, Over };

enum class EventKind {
    TurnStarted,
    Moved,
    Shot,
    Wound,
    Downed,
    Dead,
    TurnEnded,
    CombatEnded,
    Rejected,
    Contact,
    Reaction,
    Bleed,
    Treated,
    OverwatchSet,
};

struct Action {
    ActionType type = ActionType::EndTurn;
    UnitId actor = 0;
    Vec2 dest{};
    UnitId target = 0;
    Gait gait = Gait::Walk;
    ShotMode shot = ShotMode::Snap;
    AimRegion aim = AimRegion::Torso;
    Posture posture = Posture::Standing;
};

struct Event {
    EventKind kind = EventKind::Rejected;
    UnitId actor = 0;
    UnitId other = 0;
    Vec2 a{};
    Vec2 b{};
    float n = 0;
    std::string text;
};

struct Cover {
    Vec2 min{};
    Vec2 max{};
    float height = 1.1f;
    float protection = 16;
    float durability = 10;
    float durability_max = 10;
};

struct Map {
    Vec2 min{0, 0};
    Vec2 max{20, 16};
    float grid = 1.0f;
    std::vector<Cover> cover;
    float surprise0 = 1.0f;
    float surprise1 = 1.0f;
};

struct ArmorPlate {
    std::string name;
    std::string region; // head, torso, abdomen, arm, leg
    float protection = 14;
    float durability = 6;
    float durability_max = 6;
};

struct Wound {
    std::string region;
    std::string description;
    int depth = 0; // 0 surface .. 3 critical
    float bleed_rate = 0; // blood % per turn
    float pain = 0;
    float stress = 0;
    bool treated = false;
    std::string impairment;
};

struct Channels {
    float hands = kTurnSeconds;
    float legs = kTurnSeconds;
    float focus = kTurnSeconds;
    float voice = kTurnSeconds;
};

struct Unit {
    UnitId id = 0;
    std::string name;
    int team = 0;
    Vec2 pos{};
    float facing = 0;

    // Stats (1-5-ish). Derived fields filled by finalize_unit().
    float initiative_base = 3;
    float loadout_init = 0; // gear modifier
    int initiative = 3;     // effective tier after gear
    float awareness = 3;
    float endurance = 3;
    float firearms = 3;
    float medicine = 1;
    float experience = 0.35f; // 0 rookie .. 1 veteran

    Posture posture = Posture::Standing;
    Channels ch;
    float reaction_left = 2;
    float reaction_max = 2;
    bool contact_ready = false;
    bool weapon_ready = true;

    int ammo = 24;
    int ammo_max = 30;
    int mag = 8;
    int mag_size = 8;
    float weapon_spread = 0.038f; // base radians
    float weapon_pen = 16;
    float max_range = 40;

    float blood = 0;
    float pain = 0;
    float pain_tolerance = 70;
    float stress = 0;
    float stress_tolerance = 50;
    std::vector<Wound> wounds;
    std::vector<ArmorPlate> armor;

    bool downed = false;
    bool dead = false;
    bool panicked = false;

    Gait last_gait = Gait::Walk;
    bool overwatch = false;
    Vec2 ow_origin{};
    Vec2 ow_dir{1, 0};
    float ow_half_rad = 0.45f;
    float ow_range = 18;

    float sil_w = 0.55f;
    float sil_d = 0.35f;
};

struct LastShot {
    bool valid = false;
    UnitId attacker = 0;
    UnitId intended = 0;
    UnitId struck = 0;
    Vec2 origin{};
    Vec2 aim_dir{};
    Vec2 shot_dir{};
    float cone_half_rad = 0;
    float t = 0;
    bool hit = false;
    bool blocked_cover = false;
    std::string result;
    std::string region;
};

struct PendingReact {
    bool active = false;
    UnitId reactor = 0;
    UnitId trigger = 0;
    Vec2 from{};
    Vec2 to{};
};

struct PendingOverwatch {
    bool active = false;
    UnitId watcher = 0;
    UnitId mover = 0;
};

struct World {
    std::string scenario_name;
    uint64_t seed = 1;
    uint64_t rng_state = 1;
    Phase phase = Phase::Contact;
    Map map;
    std::vector<Unit> units;
    std::vector<UnitId> turn_order;
    size_t turn_index = 0;
    int round = 1;
    UnitId active = 0;
    bool combat_over = false;
    int winner_team = -1;
    LastShot last_shot;
    std::vector<Action> history;
    PendingReact pending_react;
    PendingOverwatch pending_ow;
};

inline Unit* find_unit(World& w, UnitId id) {
    for (Unit& u : w.units) {
        if (u.id == id) return &u;
    }
    return nullptr;
}

inline const Unit* find_unit(const World& w, UnitId id) {
    for (const Unit& u : w.units) {
        if (u.id == id) return &u;
    }
    return nullptr;
}

inline bool unit_alive(const Unit& u) { return !u.downed && !u.dead; }

inline const char* posture_name(Posture p) {
    switch (p) {
    case Posture::Crouching:
        return "crouch";
    case Posture::Prone:
        return "prone";
    default:
        return "stand";
    }
}

inline const char* gait_name(Gait g) {
    switch (g) {
    case Gait::Run:
        return "run";
    case Gait::Sprint:
        return "sprint";
    default:
        return "walk";
    }
}

inline const char* shot_name(ShotMode s) {
    switch (s) {
    case ShotMode::Aimed:
        return "aimed";
    case ShotMode::Burst:
        return "burst";
    default:
        return "snap";
    }
}

inline const char* aim_name(AimRegion a) {
    switch (a) {
    case AimRegion::Head:
        return "head";
    case AimRegion::Legs:
        return "legs";
    default:
        return "torso";
    }
}

void finalize_unit(Unit& u);
void reset_channels(Unit& u);
float surprise_for(const World& w, int team);
