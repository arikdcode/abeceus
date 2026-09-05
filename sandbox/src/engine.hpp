#pragma once

#include "rng.hpp"
#include "world.hpp"

#include <string>
#include <vector>

struct ApplyResult {
    bool ok = false;
    std::vector<Event> events;
};

struct HitPreview {
    bool ok = false;
    UnitId actor = 0;
    UnitId target = 0;
    float distance = 0;
    float cone_half_rad = 0;
    float p_hit = 0;
    float p_cover = 0;
    Vec2 origin{};
    Vec2 aim_dir{};
    ShotMode mode = ShotMode::Snap;
    AimRegion aim = AimRegion::Torso;
};

struct MovePreview {
    bool ok = false;
    UnitId actor = 0;
    Vec2 from{};
    Vec2 dest{};
    Vec2 requested{};
    float dist = 0;
    float time = 0;
    float budget = 0;
    float speed = 0;
    bool truncated = false;
    std::string gait;
    std::string note;
};

class Engine {
public:
    bool load_world(World world);
    const World& world() const { return world_; }
    const World& initial() const { return initial_; }

    ApplyResult apply(const Action& action);
    std::vector<Event> auto_step();
    int auto_play(int max_actions);

    HitPreview preview_shot(UnitId actor, UnitId target, ShotMode mode, AimRegion aim) const;
    MovePreview preview_move(UnitId actor, Vec2 dest, Gait gait) const;
    void set_fog(bool on) { fog_ = on; }
    bool fog() const { return fog_; }
    void set_viewer(UnitId id) { viewer_ = id; }
    UnitId viewer() const { return viewer_; }
    std::string dump_state() const;
    std::string dump_replay() const;
    std::string dump_view() const;
    std::string dump_events_json(const std::vector<Event>& events) const;

    static World default_world();

private:
    void start_contact();
    void maybe_finish_contact(std::vector<Event>& events);
    void begin_play_turn();
    void advance_turn(std::vector<Event>& events);
    void tick_physiology(Unit& u, std::vector<Event>& events);
    void check_end(std::vector<Event>& events);
    void queue_reactions_after_move(const Unit& mover, Vec2 from, Vec2 to);
    void queue_reaction_for(UnitId reactor, UnitId trigger);
    void queue_overwatch_after_move(const Unit& mover, Vec2 from, Vec2 to);
    ApplyResult reject(const Action& action, const char* why);
    ApplyResult do_move(const Action& action);
    ApplyResult do_shoot(const Action& action);
    ApplyResult do_end(const Action& action);
    ApplyResult do_reload(const Action& action);
    ApplyResult do_bandage(const Action& action);
    ApplyResult do_posture(const Action& action);
    ApplyResult do_overwatch(const Action& action);
    ApplyResult do_ready(const Action& action);
    ApplyResult do_contact_ready(const Action& action);
    ApplyResult do_react(const Action& action);
    ApplyResult do_ow_decision(const Action& action);
    ApplyResult fire_shot(Unit& actor, Unit& target, ShotMode mode, AimRegion aim, bool from_overwatch);
    Event ev(EventKind kind, const std::string& text) const;
    Unit* acting(const Action& a, const char* need);

    World world_;
    World initial_;
    Rng rng_{1};
    bool fog_ = false;
    UnitId viewer_ = 0;
};
