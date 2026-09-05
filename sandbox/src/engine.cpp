#include "engine.hpp"

#include "combat.hpp"
#include "json_io.hpp"
#include "log.hpp"

#include <algorithm>
#include <cmath>
#include <sstream>

using std::clamp;

namespace {

int living_on_team(const World& w, int team) {
    int n = 0;
    for (const Unit& u : w.units) {
        if (u.team == team && unit_alive(u)) ++n;
    }
    return n;
}

bool teams_present(const World& w, int& a, int& b) {
    a = b = -1;
    for (const Unit& u : w.units) {
        if (a < 0) a = u.team;
        else if (u.team != a) {
            b = u.team;
            return true;
        }
    }
    return false;
}

void rebuild_turn_order(World& w, Rng& rng) {
    std::vector<int> tiers;
    for (const Unit& u : w.units) tiers.push_back(u.initiative);
    std::sort(tiers.begin(), tiers.end());
    tiers.erase(std::unique(tiers.begin(), tiers.end()), tiers.end());
    std::reverse(tiers.begin(), tiers.end());

    w.turn_order.clear();
    for (int tier : tiers) {
        std::vector<UnitId> a, b;
        for (const Unit& u : w.units) {
            if (u.initiative != tier) continue;
            (u.team == 0 ? a : b).push_back(u.id);
        }
        auto shuffle = [&](std::vector<UnitId>& v) {
            for (size_t i = v.size(); i > 1; --i) {
                size_t j = (size_t)(rng.u64() % i);
                std::swap(v[i - 1], v[j]);
            }
        };
        shuffle(a);
        shuffle(b);
        bool a_first = rng.uniform() < 0.5f;
        if (a.empty()) a_first = false;
        if (b.empty()) a_first = true;
        size_t ia = 0, ib = 0;
        bool take_a = a_first;
        while (ia < a.size() || ib < b.size()) {
            if (take_a && ia < a.size()) w.turn_order.push_back(a[ia++]);
            else if (!take_a && ib < b.size()) w.turn_order.push_back(b[ib++]);
            take_a = !take_a;
            if (take_a && ia >= a.size()) take_a = false;
            if (!take_a && ib >= b.size()) take_a = true;
        }
    }
}

const Unit* nearest_enemy(const World& w, const Unit& self) {
    const Unit* best = nullptr;
    float best_d = 1e30f;
    for (const Unit& u : w.units) {
        if (u.team == self.team || !unit_alive(u)) continue;
        float d = length(u.pos - self.pos);
        if (d < best_d) {
            best_d = d;
            best = &u;
        }
    }
    return best;
}

Vec2 nearest_cover_point(const World& w, Vec2 from) {
    Vec2 best = from;
    float best_d = 1e30f;
    for (const Cover& c : w.map.cover) {
        if (c.durability <= 0) continue;
        Vec2 cand[4] = {{c.min.x - 0.45f, (c.min.y + c.max.y) * 0.5f},
                        {c.max.x + 0.45f, (c.min.y + c.max.y) * 0.5f},
                        {(c.min.x + c.max.x) * 0.5f, c.min.y - 0.45f},
                        {(c.min.x + c.max.x) * 0.5f, c.max.y + 0.45f}};
        for (Vec2 p : cand) {
            p = clamp_to_aabb(p, w.map.min + Vec2{0.3f, 0.3f}, w.map.max - Vec2{0.3f, 0.3f});
            float d = length(p - from);
            if (d < best_d) {
                best_d = d;
                best = p;
            }
        }
    }
    return best;
}

bool segment_in_cone(Vec2 origin, Vec2 dir, float half, float range, Vec2 a, Vec2 b) {
    for (int i = 0; i <= 8; ++i) {
        Vec2 p = a + (b - a) * (i / 8.0f);
        Vec2 v = p - origin;
        float d = length(v);
        if (d < 0.2f || d > range) continue;
        float ang = std::acos(std::clamp(dot(dir, v / d), -1.0f, 1.0f));
        if (ang <= half) return true;
    }
    return false;
}

} // namespace

bool Engine::load_world(World world) {
    if (world.units.empty()) {
        LOG_ERROR("engine: no units");
        return false;
    }
    for (Unit& u : world.units) finalize_unit(u);
    world_ = std::move(world);
    initial_ = world_;
    rng_ = Rng(world_.seed);
    world_.rng_state = rng_.s;
    rebuild_turn_order(world_, rng_);
    world_.turn_index = 0;
    world_.round = 1;
    world_.combat_over = false;
    world_.winner_team = -1;
    world_.last_shot = {};
    world_.history.clear();
    world_.pending_react = {};
    world_.pending_ow = {};
    start_contact();
    LOG_INFO("engine: loaded '%s' seed=%llu units=%zu order=%zu", world_.scenario_name.c_str(),
             (unsigned long long)world_.seed, world_.units.size(), world_.turn_order.size());
    return true;
}

void Engine::start_contact() {
    world_.phase = Phase::Contact;
    world_.active = 0;
    for (Unit& u : world_.units) {
        u.contact_ready = false;
        float sur = surprise_for(world_, u.team);
        float var = 0.9f + rng_.uniform() * 0.2f;
        u.reaction_left = std::max(0.35f + u.experience * 0.8f, u.reaction_max * sur * var);
        u.weapon_ready = sur >= 0.8f;
        LOG_INFO("engine: contact budget %s = %.2fs (surprise=%.2f)", u.name.c_str(), u.reaction_left, sur);
    }
}

void Engine::maybe_finish_contact(std::vector<Event>& events) {
    if (world_.phase != Phase::Contact) return;
    for (const Unit& u : world_.units) {
        if (unit_alive(u) && !u.contact_ready) return;
    }
    events.push_back(ev(EventKind::Contact, "Contact phase over — initiative begins"));
    world_.phase = Phase::Play;
    for (Unit& u : world_.units) u.reaction_left = u.reaction_max;
    world_.turn_index = 0;
    begin_play_turn();
    if (const Unit* u = find_unit(world_, world_.active)) {
        events.push_back(ev(EventKind::TurnStarted, std::string("First turn: ") + u->name));
    }
}

void Engine::begin_play_turn() {
    if (world_.turn_order.empty()) return;
    for (size_t n = 0; n < world_.turn_order.size(); ++n) {
        UnitId id = world_.turn_order[world_.turn_index % world_.turn_order.size()];
        Unit* u = find_unit(world_, id);
        if (u && unit_alive(*u) && !u->panicked) {
            world_.active = id;
            reset_channels(*u);
            u->last_gait = Gait::Walk;
            u->overwatch = false;
            if (u->pain > u->pain_tolerance * 2.0f) {
                u->downed = true;
                LOG_INFO("engine: %s drops from pain at turn start", u->name.c_str());
                world_.turn_index++;
                continue;
            }
            LOG_INFO("engine: turn %s round=%d", u->name.c_str(), world_.round);
            return;
        }
        world_.turn_index++;
        if (!world_.turn_order.empty() && world_.turn_index % world_.turn_order.size() == 0) world_.round++;
    }
    world_.active = 0;
}

void Engine::tick_physiology(Unit& u, std::vector<Event>& events) {
    float bleed = 0;
    for (const Wound& w : u.wounds) {
        if (!w.treated) bleed += w.bleed_rate;
    }
    if (bleed > 0) {
        u.blood = std::min(100.0f, u.blood + bleed);
        Event e = ev(EventKind::Bleed, u.name + " bleeds");
        e.other = u.id;
        e.n = bleed;
        events.push_back(e);
    }
    u.pain = std::max(0.0f, u.pain - 6.0f);
    u.stress = std::max(0.0f, u.stress - 3.0f);
    if (u.blood >= 90) {
        u.downed = true;
        events.push_back(ev(EventKind::Downed, u.name + " collapses from blood loss"));
    } else if (u.blood >= 70 && rng_.uniform() < 0.25f) {
        events.push_back(ev(EventKind::Bleed, u.name + " nearly blacks out"));
        u.ch.legs *= 0.5f;
        u.ch.focus *= 0.5f;
    }
    if (u.stress > u.stress_tolerance * 1.35f) {
        u.panicked = true;
        events.push_back(ev(EventKind::Wound, u.name + " breaks and freezes"));
    }
}

void Engine::advance_turn(std::vector<Event>& events) {
    if (world_.combat_over) return;
    world_.turn_index++;
    if (!world_.turn_order.empty() && world_.turn_index % world_.turn_order.size() == 0) {
        world_.round++;
        for (Unit& u : world_.units) u.reaction_left = u.reaction_max;
    }
    begin_play_turn();
    Unit* u = find_unit(world_, world_.active);
    if (u) {
        tick_physiology(*u, events);
        if (!unit_alive(*u)) {
            check_end(events);
            if (!world_.combat_over) advance_turn(events);
            return;
        }
        events.push_back(ev(EventKind::TurnStarted, std::string("Turn: ") + u->name));
    }
    check_end(events);
}

void Engine::check_end(std::vector<Event>& events) {
    int a = -1, b = -1;
    if (!teams_present(world_, a, b)) return;
    int la = living_on_team(world_, a);
    int lb = living_on_team(world_, b);
    if (la == 0 || lb == 0) {
        world_.combat_over = true;
        world_.phase = Phase::Over;
        world_.winner_team = la > 0 ? a : (lb > 0 ? b : -1);
        world_.active = 0;
        std::ostringstream os;
        os << "Combat ended. Winner team " << world_.winner_team;
        events.push_back(ev(EventKind::CombatEnded, os.str()));
        LOG_INFO("engine: %s", os.str().c_str());
    }
}

Event Engine::ev(EventKind kind, const std::string& text) const {
    Event e;
    e.kind = kind;
    e.actor = world_.active;
    e.text = text;
    return e;
}

ApplyResult Engine::reject(const Action& action, const char* why) {
    ApplyResult r;
    Event e;
    e.kind = EventKind::Rejected;
    e.actor = action.actor;
    e.text = why;
    r.events.push_back(e);
    LOG_WARN("engine: reject %s", why);
    return r;
}

Unit* Engine::acting(const Action& a, const char* need) {
    Unit* u = find_unit(world_, a.actor ? a.actor : world_.active);
    if (!u) return nullptr;
    if (need && std::string(need) == "turn") {
        if (world_.phase != Phase::Play || u->id != world_.active) return nullptr;
    }
    return u;
}

ApplyResult Engine::apply(const Action& action) {
    world_.rng_state = rng_.s;
    if (world_.combat_over) return reject(action, "combat is over");

    ApplyResult r;
    if (world_.pending_ow.active) {
        if (action.type != ActionType::OverwatchFire && action.type != ActionType::OverwatchHold)
            return reject(action, "resolve overwatch first (fire or hold)");
        r = do_ow_decision(action);
    } else if (world_.pending_react.active) {
        switch (action.type) {
        case ActionType::ReactShift:
        case ActionType::ReactDrop:
        case ActionType::ReactTrack:
        case ActionType::ReactBrace:
        case ActionType::ReactSkip:
            r = do_react(action);
            break;
        default:
            return reject(action, "resolve reaction first");
        }
    } else if (world_.phase == Phase::Contact) {
        switch (action.type) {
        case ActionType::Move:
        case ActionType::SetPosture:
        case ActionType::ReadyWeapon:
        case ActionType::ContactReady:
            break;
        default:
            return reject(action, "contact phase: move, posture, ready, or ready-up only");
        }
        switch (action.type) {
        case ActionType::Move:
            r = do_move(action);
            break;
        case ActionType::SetPosture:
            r = do_posture(action);
            break;
        case ActionType::ReadyWeapon:
            r = do_ready(action);
            break;
        case ActionType::ContactReady:
            r = do_contact_ready(action);
            break;
        default:
            break;
        }
    } else {
        if (action.actor && action.actor != world_.active && action.type != ActionType::EndTurn)
            return reject(action, "not this unit's turn");
        switch (action.type) {
        case ActionType::Move:
            r = do_move(action);
            break;
        case ActionType::Shoot:
            r = do_shoot(action);
            break;
        case ActionType::EndTurn:
            r = do_end(action);
            break;
        case ActionType::Reload:
            r = do_reload(action);
            break;
        case ActionType::Bandage:
            r = do_bandage(action);
            break;
        case ActionType::SetPosture:
            r = do_posture(action);
            break;
        case ActionType::Overwatch:
            r = do_overwatch(action);
            break;
        case ActionType::ReadyWeapon:
            r = do_ready(action);
            break;
        default:
            return reject(action, "illegal during play");
        }
    }
    if (r.ok) {
        world_.history.push_back(action);
        world_.rng_state = rng_.s;
    }
    return r;
}

ApplyResult Engine::do_move(const Action& action) {
    Unit* actor = find_unit(world_, action.actor ? action.actor : world_.active);
    if (!actor || !unit_alive(*actor)) return reject(action, "actor down");
    if (world_.phase == Phase::Play && actor->id != world_.active) return reject(action, "not your turn");

    Gait gait = world_.phase == Phase::Contact ? Gait::Walk : action.gait;
    if (world_.phase == Phase::Play && gait == Gait::Sprint && actor->ch.focus < 2.0f)
        return reject(action, "sprint needs Focus");

    Vec2 dest = path_move(world_.map, actor->pos, action.dest);
    float dist = length(dest - actor->pos);
    if (dist < 0.05f) return reject(action, "path blocked");

    float time = gait_leg_time(dist, gait, *actor);
    if (world_.phase == Phase::Contact) {
        if (time > actor->reaction_left + 1e-3f) {
            float maxd = gait_speed(Gait::Walk, *actor) * actor->reaction_left;
            dest = path_move(world_.map, actor->pos, actor->pos + normalize(dest - actor->pos) * maxd);
            dist = length(dest - actor->pos);
            time = gait_leg_time(dist, Gait::Walk, *actor);
            if (dist < 0.05f) return reject(action, "no contact time left to move");
        }
        actor->reaction_left -= time;
    } else {
        std::string err;
        float focus = gait == Gait::Sprint ? std::min(3.0f, time) : (gait == Gait::Run ? time * 0.25f : 0);
        if (!spend_channels(*actor, 0, time, focus, 0, err)) return reject(action, err.c_str());
        actor->last_gait = gait;
        actor->overwatch = false;
    }

    Vec2 from = actor->pos;
    actor->pos = dest;
    actor->facing = angle_of(dest - from);
    ApplyResult r;
    r.ok = true;
    Event e = ev(EventKind::Moved, actor->name + std::string(" ") + gait_name(gait) + "s");
    e.actor = actor->id;
    e.a = from;
    e.b = dest;
    e.n = dist;
    r.events.push_back(e);
    LOG_INFO("engine: move %s (%.2f,%.2f)->(%.2f,%.2f)", actor->name.c_str(), from.x, from.y, dest.x, dest.y);

    if (world_.phase == Phase::Play) {
        queue_overwatch_after_move(*actor, from, dest);
        if (!world_.pending_ow.active) queue_reactions_after_move(*actor, from, dest);
    }
    return r;
}

void Engine::queue_reaction_for(UnitId reactor, UnitId trigger) {
    if (world_.pending_react.active || world_.pending_ow.active) return;
    Unit* u = find_unit(world_, reactor);
    const Unit* t = find_unit(world_, trigger);
    if (!u || !t || !unit_alive(*u) || u->id == t->id) return;
    if (u->reaction_left < 0.4f) return;
    world_.pending_react.active = true;
    world_.pending_react.reactor = u->id;
    world_.pending_react.trigger = t->id;
    world_.pending_react.from = u->pos;
    world_.pending_react.to = t->pos;
    LOG_INFO("engine: reaction pending %s vs %s", u->name.c_str(), t->name.c_str());
}

void Engine::queue_reactions_after_move(const Unit& mover, Vec2 from, Vec2 to) {
    (void)from;
    (void)to;
    for (Unit& u : world_.units) {
        if (u.id == mover.id || !unit_alive(u) || u.team == mover.team) continue;
        if (length(u.pos - mover.pos) > 16) continue;
        queue_reaction_for(u.id, mover.id);
        if (world_.pending_react.active) return;
    }
}

void Engine::queue_overwatch_after_move(const Unit& mover, Vec2 from, Vec2 to) {
    for (Unit& u : world_.units) {
        if (!u.overwatch || !unit_alive(u) || u.team == mover.team) continue;
        if (segment_in_cone(u.ow_origin, u.ow_dir, u.ow_half_rad, u.ow_range, from, to)) {
            world_.pending_ow.active = true;
            world_.pending_ow.watcher = u.id;
            world_.pending_ow.mover = mover.id;
            LOG_INFO("engine: overwatch trigger %s on %s", u.name.c_str(), mover.name.c_str());
            return;
        }
    }
}

ApplyResult Engine::fire_shot(Unit& actor, Unit& target, ShotMode mode, AimRegion aim, bool from_overwatch) {
    ApplyResult r;
    int samples = mode == ShotMode::Burst ? 3 : 1;
    if (actor.mag < samples) samples = actor.mag;
    if (samples <= 0) return reject({}, "empty mag");

    float acc = accuracy_angle(actor, mode, from_overwatch ? Gait::Walk : actor.last_gait);
    actor.facing = angle_of(target.pos - actor.pos);
    actor.weapon_ready = true;

    LastShot ls;
    ls.valid = true;
    ls.attacker = actor.id;
    ls.intended = target.id;
    ls.origin = actor.pos;
    ls.aim_dir = normalize(target.pos - actor.pos);
    ls.cone_half_rad = acc * 2.0f;

    for (int i = 0; i < samples; ++i) {
        if (actor.mag <= 0) break;
        actor.mag--;
        float el = rng_.gauss();
        float evn = rng_.gauss();
        ShotSample s = resolve_cone_sample(world_, actor, target, mode, aim, el, evn, acc);
        ls.shot_dir = s.shot_dir;
        ls.t = s.t;
        ls.region = s.region;

        std::ostringstream os;
        os.setf(std::ios::fixed);
        os.precision(2);
        if (s.hit_cover && s.cover_index >= 0) {
            apply_cover_hit(world_.map.cover[s.cover_index], actor.weapon_pen);
            os << actor.name << " hits cover";
            ls.result = "cover";
            ls.blocked_cover = true;
            Event e = ev(EventKind::Shot, os.str());
            e.actor = actor.id;
            e.other = target.id;
            e.a = actor.pos;
            e.b = s.point;
            r.events.push_back(e);
            continue;
        }
        if (s.hit_unit) {
            Unit* struck = find_unit(world_, s.unit);
            if (!struck) continue;
            apply_armor_hit(*struck, s, actor.weapon_pen);
            WoundResult wr = generate_wound(*struck, s, actor.weapon_pen);
            struck->wounds.push_back(wr.wound);
            struck->pain += wr.wound.pain;
            struck->stress += wr.wound.stress;
            actor.stress = std::max(0.0f, actor.stress - 4.0f);
            os << actor.name << " hits " << struck->name << " " << wr.wound.description;
            ls.hit = true;
            ls.struck = struck->id;
            ls.result = s.region;
            Event e = ev(EventKind::Shot, os.str());
            e.actor = actor.id;
            e.other = struck->id;
            e.a = actor.pos;
            e.b = s.point;
            r.events.push_back(e);
            Event w = ev(EventKind::Wound, wr.wound.description);
            w.actor = actor.id;
            w.other = struck->id;
            w.n = wr.wound.pain;
            r.events.push_back(w);
            if (wr.kill) {
                struck->dead = true;
                struck->downed = true;
                r.events.push_back(ev(EventKind::Dead, struck->name + " is killed"));
            } else if (wr.incapacitate || struck->pain > struck->pain_tolerance * 2.0f) {
                struck->downed = true;
                r.events.push_back(ev(EventKind::Downed, struck->name + " is down"));
            }
            LOG_INFO("engine: %s", os.str().c_str());
        } else {
            os << actor.name << " misses " << target.name;
            ls.result = "miss";
            Event e = ev(EventKind::Shot, os.str());
            e.actor = actor.id;
            e.other = target.id;
            e.a = actor.pos;
            e.b = s.point;
            r.events.push_back(e);
        }
    }
    world_.last_shot = ls;
    r.ok = true;
    check_end(r.events);
    if (!world_.combat_over && unit_alive(target) && target.team != actor.team) {
        queue_reaction_for(target.id, actor.id);
    }
    return r;
}

ApplyResult Engine::do_shoot(const Action& action) {
    Unit* actor = find_unit(world_, action.actor ? action.actor : world_.active);
    if (!actor || actor->id != world_.active) return reject(action, "not your turn");
    if (actor->last_gait == Gait::Sprint) return reject(action, "cannot shoot while sprinting this turn");
    Unit* target = find_unit(world_, action.target);
    if (!target || !unit_alive(*target)) return reject(action, "bad target");
    if (target->team == actor->team) return reject(action, "friendly fire off");
    if (length(target->pos - actor->pos) > actor->max_range) return reject(action, "out of range");
    if (actor->mag <= 0) return reject(action, "empty mag — reload");

    float hands = action.shot == ShotMode::Aimed ? 3.2f : (action.shot == ShotMode::Burst ? 1.8f : 1.0f);
    float focus = action.shot == ShotMode::Aimed ? 3.2f : (action.shot == ShotMode::Burst ? 1.0f : 0.5f);
    if (actor->firearms >= 4 && action.shot == ShotMode::Aimed) {
        hands = 2.5f;
        focus = 2.5f;
    }
    std::string err;
    if (!spend_channels(*actor, hands, 0, focus, 0.3f, err)) return reject(action, err.c_str());
    actor->overwatch = false;
    return fire_shot(*actor, *target, action.shot, action.aim, false);
}

ApplyResult Engine::do_end(const Action& action) {
    (void)action;
    ApplyResult r;
    r.ok = true;
    if (const Unit* u = find_unit(world_, world_.active)) {
        r.events.push_back(ev(EventKind::TurnEnded, u->name + std::string(" ends turn")));
    }
    advance_turn(r.events);
    return r;
}

ApplyResult Engine::do_reload(const Action& action) {
    Unit* u = find_unit(world_, action.actor ? action.actor : world_.active);
    if (!u || u->id != world_.active) return reject(action, "not your turn");
    int need = u->mag_size - u->mag;
    if (need <= 0) return reject(action, "mag full");
    int take = std::min(need, u->ammo);
    if (take <= 0) return reject(action, "no reserve ammo");
    float hands = 2.0f;
    float focus = u->firearms >= 3 ? 0.0f : 0.6f;
    std::string err;
    if (!spend_channels(*u, hands, 0, focus, 0, err)) return reject(action, err.c_str());
    u->ammo -= take;
    u->mag += take;
    ApplyResult r;
    r.ok = true;
    r.events.push_back(ev(EventKind::Treated, u->name + " reloads"));
    return r;
}

ApplyResult Engine::do_bandage(const Action& action) {
    Unit* u = find_unit(world_, action.actor ? action.actor : world_.active);
    if (!u || u->id != world_.active) return reject(action, "not your turn");
    Unit* tgt = action.target ? find_unit(world_, action.target) : u;
    if (!tgt) return reject(action, "no patient");
    if (length(tgt->pos - u->pos) > 1.2f && tgt->id != u->id) return reject(action, "too far to treat");
    Wound* open = nullptr;
    for (Wound& w : tgt->wounds) {
        if (!w.treated && w.bleed_rate > 0) {
            open = &w;
            break;
        }
    }
    if (!open) return reject(action, "no untreated bleed");
    float hands = u->medicine >= 3 ? 2.0f : 3.6f;
    float focus = u->medicine >= 3 ? 0.0f : 2.8f;
    std::string err;
    if (!spend_channels(*u, hands, 0.4f, focus, 0.4f, err)) return reject(action, err.c_str());
    open->treated = true;
    open->bleed_rate *= 0.15f;
    tgt->pain = std::max(0.0f, tgt->pain - 8);
    ApplyResult r;
    r.ok = true;
    r.events.push_back(ev(EventKind::Treated, u->name + " bandages " + tgt->name + " (" + open->region + ")"));
    return r;
}

ApplyResult Engine::do_posture(const Action& action) {
    Unit* u = find_unit(world_, action.actor ? action.actor : (world_.phase == Phase::Play ? world_.active : action.actor));
    if (!u) return reject(action, "no actor");
    if (world_.phase == Phase::Play && u->id != world_.active) return reject(action, "not your turn");
    float t = action.posture == Posture::Prone ? 0.8f : 0.45f;
    if (world_.phase == Phase::Contact) {
        if (u->reaction_left < t) return reject(action, "no contact time");
        u->reaction_left -= t;
    } else {
        std::string err;
        if (!spend_channels(*u, 0, t, 0, 0, err)) return reject(action, err.c_str());
    }
    u->posture = action.posture;
    ApplyResult r;
    r.ok = true;
    r.events.push_back(ev(EventKind::Moved, std::string(u->name) + " goes " + posture_name(u->posture)));
    return r;
}

ApplyResult Engine::do_overwatch(const Action& action) {
    Unit* u = find_unit(world_, world_.active);
    if (!u) return reject(action, "no actor");
    Vec2 dir = action.dest - u->pos;
    if (length(dir) < 0.1f) dir = {std::cos(u->facing), std::sin(u->facing)};
    dir = normalize(dir);
    std::string err;
    if (!spend_channels(*u, u->ch.hands, 0, std::max(1.5f, u->ch.focus), 0, err))
        return reject(action, err.c_str());
    u->overwatch = true;
    u->ow_origin = u->pos;
    u->ow_dir = dir;
    u->facing = angle_of(dir);
    ApplyResult r;
    r.ok = true;
    r.events.push_back(ev(EventKind::OverwatchSet, u->name + " watches a lane"));
    return r;
}

ApplyResult Engine::do_ready(const Action& action) {
    Unit* u = find_unit(world_, action.actor ? action.actor : world_.active);
    if (!u) return reject(action, "no actor");
    float t = 0.6f;
    if (world_.phase == Phase::Contact) {
        if (u->reaction_left < t) return reject(action, "no contact time");
        u->reaction_left -= t;
    } else if (u->id != world_.active) {
        return reject(action, "not your turn");
    } else {
        std::string err;
        if (!spend_channels(*u, t, 0, 0.2f, 0, err)) return reject(action, err.c_str());
    }
    u->weapon_ready = true;
    ApplyResult r;
    r.ok = true;
    r.events.push_back(ev(EventKind::Contact, u->name + " readies weapon"));
    return r;
}

ApplyResult Engine::do_contact_ready(const Action& action) {
    Unit* u = find_unit(world_, action.actor);
    if (!u) {
        // mark all remaining as ready if actor omitted? require explicit
        return reject(action, "who is ready?");
    }
    u->contact_ready = true;
    ApplyResult r;
    r.ok = true;
    r.events.push_back(ev(EventKind::Contact, u->name + " is set"));
    maybe_finish_contact(r.events);
    return r;
}

ApplyResult Engine::do_react(const Action& action) {
    if (!world_.pending_react.active) return reject(action, "no reaction");
    Unit* u = find_unit(world_, world_.pending_react.reactor);
    if (!u) return reject(action, "reactor gone");
    float cost = 0;
    if (action.type == ActionType::ReactDrop) cost = 0.55f;
    else if (action.type == ActionType::ReactTrack) cost = 0.4f;
    else if (action.type == ActionType::ReactBrace) cost = 0.45f;
    else if (action.type == ActionType::ReactShift) cost = 1.15f;

    ApplyResult r;
    r.ok = true;
    if (action.type == ActionType::ReactSkip || u->reaction_left < cost) {
        r.events.push_back(ev(EventKind::Reaction, u->name + " holds"));
        world_.pending_react.active = false;
        return r;
    }
    if (action.type == ActionType::ReactDrop) {
        u->posture = Posture::Prone;
        r.events.push_back(ev(EventKind::Reaction, u->name + " drops prone"));
    } else if (action.type == ActionType::ReactTrack) {
        if (const Unit* t = find_unit(world_, world_.pending_react.trigger))
            u->facing = angle_of(t->pos - u->pos);
        r.events.push_back(ev(EventKind::Reaction, u->name + " tracks the threat"));
    } else if (action.type == ActionType::ReactBrace) {
        u->stress = std::max(0.0f, u->stress - 4);
        r.events.push_back(ev(EventKind::Reaction, u->name + " braces"));
    } else if (action.type == ActionType::ReactShift) {
        Vec2 dest = action.dest;
        if (length(dest - u->pos) < 0.05f) dest = nearest_cover_point(world_, u->pos);
        Vec2 step = dest - u->pos;
        if (length(step) > 1.8f) dest = u->pos + normalize(step) * 1.8f;
        u->pos = path_move(world_.map, u->pos, dest);
        r.events.push_back(ev(EventKind::Reaction, u->name + " shifts"));
    }
    u->reaction_left -= cost;
    world_.pending_react.active = false;
    return r;
}

ApplyResult Engine::do_ow_decision(const Action& action) {
    Unit* w = find_unit(world_, world_.pending_ow.watcher);
    Unit* m = find_unit(world_, world_.pending_ow.mover);
    world_.pending_ow.active = false;
    if (!w || !m) return reject(action, "overwatch stale");
    if (action.type == ActionType::OverwatchHold) {
        ApplyResult r;
        r.ok = true;
        r.events.push_back(ev(EventKind::Reaction, w->name + " holds fire"));
        queue_reactions_after_move(*m, m->pos, m->pos);
        return r;
    }
    w->overwatch = false;
    ApplyResult r = fire_shot(*w, *m, ShotMode::Aimed, AimRegion::Torso, true);
    if (!world_.combat_over) queue_reactions_after_move(*m, m->pos, m->pos);
    return r;
}

std::vector<Event> Engine::auto_step() {
    if (world_.combat_over) return {};
    if (world_.pending_ow.active) {
        return apply(Action{ActionType::OverwatchFire, world_.pending_ow.watcher, {}, 0}).events;
    }
    if (world_.pending_react.active) {
        Unit* u = find_unit(world_, world_.pending_react.reactor);
        Action a;
        a.actor = world_.pending_react.reactor;
        a.type = ActionType::ReactSkip;
        if (u && u->reaction_left >= 1.15f && length(u->pos - nearest_cover_point(world_, u->pos)) < 2.5f)
            a.type = ActionType::ReactShift;
        else if (u && u->reaction_left >= 0.55f && u->posture == Posture::Standing)
            a.type = ActionType::ReactDrop;
        else if (u && u->reaction_left >= 0.4f)
            a.type = ActionType::ReactTrack;
        a.dest = nearest_cover_point(world_, u ? u->pos : Vec2{});
        return apply(a).events;
    }
    if (world_.phase == Phase::Contact) {
        for (Unit& u : world_.units) {
            if (!unit_alive(u) || u.contact_ready) continue;
            if (!u.weapon_ready && u.reaction_left > 0.7f) {
                Action a{ActionType::ReadyWeapon, u.id, {}, 0};
                return apply(a).events;
            }
            Vec2 cover = nearest_cover_point(world_, u.pos);
            if (length(cover - u.pos) > 0.4f && u.reaction_left > 0.5f) {
                Action a{ActionType::Move, u.id, cover, 0};
                return apply(a).events;
            }
            if (u.posture == Posture::Standing) {
                Action a{ActionType::SetPosture, u.id, {}, 0};
                a.posture = Posture::Crouching;
                return apply(a).events;
            }
            Action a{ActionType::ContactReady, u.id, {}, 0};
            return apply(a).events;
        }
        return {};
    }
    Unit* self = find_unit(world_, world_.active);
    if (!self) return {};
    const Unit* enemy = nearest_enemy(world_, *self);
    if (!enemy) return apply(Action{ActionType::EndTurn, self->id, {}, 0}).events;

    bool bleeding = false;
    for (const Wound& w : self->wounds) {
        if (!w.treated && w.bleed_rate > 3) bleeding = true;
    }
    if (bleeding && self->ch.hands > 2.1f) {
        Action a{ActionType::Bandage, self->id, {}, self->id};
        ApplyResult r = apply(a);
        if (r.ok) return r.events;
    }
    if (self->mag <= 0) {
        ApplyResult r = apply(Action{ActionType::Reload, self->id, {}, 0});
        if (r.ok) return r.events;
    }
    float dist = length(enemy->pos - self->pos);
    HitPreview prev = preview_shot(self->id, enemy->id, ShotMode::Snap, AimRegion::Torso);
    if (self->mag > 0 && prev.p_hit > 0.18f && self->ch.hands > 1.0f && self->last_gait != Gait::Sprint) {
        Action a{ActionType::Shoot, self->id, {}, enemy->id};
        a.shot = prev.p_hit > 0.45f && self->ch.hands > 3.0f ? ShotMode::Aimed : ShotMode::Snap;
        return apply(a).events;
    }
    if (self->ch.legs > 0.6f) {
        Vec2 dest;
        if (prev.p_cover > 0.4f || prev.p_hit < 0.12f)
            dest = nearest_cover_point(world_, self->pos);
        else
            dest = self->pos + normalize(enemy->pos - self->pos) * std::min(4.0f, std::max(0.6f, dist - 3.0f));
        Action a{ActionType::Move, self->id, dest, 0};
        a.gait = Gait::Run;
        ApplyResult r = apply(a);
        if (r.ok) return r.events;
        a.gait = Gait::Walk;
        r = apply(a);
        if (r.ok) return r.events;
    }
    if (self->ch.focus > 1.6f && self->ch.hands > 1.0f) {
        Action a{ActionType::Overwatch, self->id, enemy->pos, 0};
        ApplyResult r = apply(a);
        if (r.ok) return r.events;
    }
    return apply(Action{ActionType::EndTurn, self->id, {}, 0}).events;
}

int Engine::auto_play(int max_actions) {
    int n = 0;
    while (!world_.combat_over && n < max_actions) {
        auto evs = auto_step();
        if (evs.empty()) break;
        ++n;
    }
    return n;
}

HitPreview Engine::preview_shot(UnitId actor_id, UnitId target_id, ShotMode mode, AimRegion aim) const {
    HitPreview p;
    const Unit* actor = find_unit(world_, actor_id);
    const Unit* target = find_unit(world_, target_id);
    if (!actor || !target || !unit_alive(*actor) || !unit_alive(*target)) return p;
    Vec2 delta = target->pos - actor->pos;
    float dist = length(delta);
    if (dist < 0.2f) return p;
    p.ok = true;
    p.actor = actor_id;
    p.target = target_id;
    p.distance = dist;
    p.origin = actor->pos;
    p.aim_dir = delta / dist;
    p.mode = mode;
    p.aim = aim;
    float acc = accuracy_angle(*actor, mode, actor->last_gait);
    p.cone_half_rad = acc * 2.0f;
    Rng local(world_.seed ^ (0xC0FFEEULL + actor_id * 131 + target_id * 17 + (uint64_t)world_.round * 1009));
    const int samples = 80;
    int hits = 0, covers = 0;
    for (int i = 0; i < samples; ++i) {
        ShotSample s =
            resolve_cone_sample(world_, *actor, *target, mode, aim, local.gauss(), local.gauss(), acc);
        if (s.hit_cover) ++covers;
        else if (s.hit_unit && s.unit == target->id) ++hits;
    }
    p.p_hit = (float)hits / samples;
    p.p_cover = (float)covers / samples;
    return p;
}

MovePreview Engine::preview_move(UnitId actor_id, Vec2 dest, Gait gait) const {
    MovePreview p;
    const Unit* actor = find_unit(world_, actor_id);
    if (!actor || !unit_alive(*actor)) return p;
    p.actor = actor_id;
    p.from = actor->pos;
    p.requested = dest;
    if (world_.phase == Phase::Contact) {
        gait = Gait::Walk;
        p.note = "contact: walk only";
    }
    p.gait = gait_name(gait);
    float speed = gait_speed(gait, *actor);
    p.speed = speed;
    float budget = (world_.phase == Phase::Contact) ? actor->reaction_left : actor->ch.legs;
    p.budget = budget;
    if (world_.phase == Phase::Play && gait == Gait::Sprint && actor->ch.focus < 2.0f) {
        p.dest = actor->pos;
        p.note = "sprint needs Focus";
        return p;
    }
    if (speed <= 0.05f || budget < 0.05f) {
        p.dest = actor->pos;
        p.note = budget < 0.05f ? "no movement time left" : "cannot move";
        return p;
    }
    Vec2 goal = dest;
    float max_dist = speed * budget;
    Vec2 delta = goal - actor->pos;
    float want = length(delta);
    if (want > max_dist && want > 0.01f) {
        goal = actor->pos + (delta / want) * max_dist;
        p.truncated = true;
    }
    Vec2 landed = path_move(world_.map, actor->pos, goal);
    p.dest = landed;
    p.dist = length(landed - actor->pos);
    p.time = gait_leg_time(p.dist, gait, *actor);
    p.ok = p.dist > 0.04f;
    if (!p.ok) p.note = "blocked or too close";
    else if (p.truncated && p.note.find("contact") == std::string::npos)
        p.note = "truncated to remaining time";
    else if (p.truncated) p.note += "; truncated to remaining time";
    return p;
}

std::string Engine::dump_state() const { return world_to_json(world_); }
std::string Engine::dump_replay() const { return replay_to_json(initial_, world_.seed, world_.history); }
std::string Engine::dump_view() const { return view_to_json(world_, fog_, viewer_); }
std::string Engine::dump_events_json(const std::vector<Event>& events) const { return events_to_json(events); }

World Engine::default_world() {
    World w;
    w.scenario_name = "2v2 courtyard";
    w.seed = 1;
    w.map.min = {0, 0};
    w.map.max = {20, 16};
    w.map.grid = 1;
    w.map.cover = {
        {{7.5f, 3.0f}, {9.5f, 6.5f}, 1.15f, 16, 10, 10},
        {{11.0f, 9.5f}, {13.2f, 12.8f}, 1.2f, 16, 10, 10},
        {{4.0f, 11.0f}, {6.0f, 13.0f}, 0.9f, 10, 6, 6},
    };
    auto add = [&](const char* name, int team, Vec2 pos, float facing, float init, float exp) {
        Unit u;
        u.id = (UnitId)w.units.size() + 1;
        u.name = name;
        u.team = team;
        u.pos = pos;
        u.facing = facing;
        u.initiative_base = init;
        u.experience = exp;
        u.firearms = 2 + exp * 3;
        u.awareness = 2 + exp * 2.5f;
        u.endurance = 3;
        w.units.push_back(u);
    };
    add("Alpha-1", 0, {3.0f, 5.5f}, 0.0f, 4, 0.7f);
    add("Alpha-2", 0, {3.2f, 10.5f}, 0.15f, 3, 0.3f);
    add("Bravo-1", 1, {17.0f, 6.0f}, 3.14f, 4, 0.55f);
    add("Bravo-2", 1, {16.5f, 11.2f}, 3.0f, 2, 0.2f);
    return w;
}
