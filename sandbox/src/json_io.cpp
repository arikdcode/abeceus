#include "json_io.hpp"

#include "combat.hpp"
#include "engine.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>

namespace {

struct Parser {
    const std::string& t;
    size_t i = 0;
    std::string err;

    explicit Parser(const std::string& text) : t(text) {}

    void skip() {
        while (i < t.size() && std::isspace(static_cast<unsigned char>(t[i]))) ++i;
    }

    bool fail(const char* m) {
        err = m;
        return false;
    }

    bool parse_value(JsonValue& out) {
        skip();
        if (i >= t.size()) return fail("unexpected end");
        char c = t[i];
        if (c == '{') return parse_object(out);
        if (c == '[') return parse_array(out);
        if (c == '"') return parse_string(out);
        if (c == 't' || c == 'f') return parse_bool(out);
        if (c == 'n') return parse_null(out);
        if (c == '-' || std::isdigit(static_cast<unsigned char>(c))) return parse_number(out);
        return fail("invalid value");
    }

    bool parse_null(JsonValue& out) {
        if (t.compare(i, 4, "null") != 0) return fail("expected null");
        i += 4;
        out = {};
        return true;
    }

    bool parse_bool(JsonValue& out) {
        if (t.compare(i, 4, "true") == 0) {
            i += 4;
            out.type = JsonValue::Bool;
            out.b = true;
            return true;
        }
        if (t.compare(i, 5, "false") == 0) {
            i += 5;
            out.type = JsonValue::Bool;
            out.b = false;
            return true;
        }
        return fail("expected bool");
    }

    bool parse_number(JsonValue& out) {
        size_t start = i;
        if (t[i] == '-') ++i;
        if (i >= t.size() || !std::isdigit(static_cast<unsigned char>(t[i]))) return fail("bad number");
        while (i < t.size() && std::isdigit(static_cast<unsigned char>(t[i]))) ++i;
        if (i < t.size() && t[i] == '.') {
            ++i;
            while (i < t.size() && std::isdigit(static_cast<unsigned char>(t[i]))) ++i;
        }
        if (i < t.size() && (t[i] == 'e' || t[i] == 'E')) {
            ++i;
            if (i < t.size() && (t[i] == '+' || t[i] == '-')) ++i;
            while (i < t.size() && std::isdigit(static_cast<unsigned char>(t[i]))) ++i;
        }
        out.type = JsonValue::Number;
        out.n = std::strtod(t.c_str() + start, nullptr);
        return true;
    }

    bool parse_string(JsonValue& out) {
        if (t[i] != '"') return fail("expected string");
        ++i;
        std::string s;
        while (i < t.size()) {
            char c = t[i++];
            if (c == '"') {
                out.type = JsonValue::String;
                out.s = std::move(s);
                return true;
            }
            if (c == '\\') {
                if (i >= t.size()) return fail("bad escape");
                char e = t[i++];
                switch (e) {
                case '"':
                case '\\':
                case '/':
                    s.push_back(e);
                    break;
                case 'n':
                    s.push_back('\n');
                    break;
                case 't':
                    s.push_back('\t');
                    break;
                case 'r':
                    s.push_back('\r');
                    break;
                default:
                    s.push_back(e);
                    break;
                }
            } else {
                s.push_back(c);
            }
        }
        return fail("unterminated string");
    }

    bool parse_array(JsonValue& out) {
        if (t[i] != '[') return fail("expected array");
        ++i;
        out.type = JsonValue::Array;
        skip();
        if (i < t.size() && t[i] == ']') {
            ++i;
            return true;
        }
        while (true) {
            JsonValue v;
            if (!parse_value(v)) return false;
            out.a.push_back(std::move(v));
            skip();
            if (i >= t.size()) return fail("unterminated array");
            if (t[i] == ',') {
                ++i;
                continue;
            }
            if (t[i] == ']') {
                ++i;
                return true;
            }
            return fail("expected comma or ]");
        }
    }

    bool parse_object(JsonValue& out) {
        if (t[i] != '{') return fail("expected object");
        ++i;
        out.type = JsonValue::Object;
        skip();
        if (i < t.size() && t[i] == '}') {
            ++i;
            return true;
        }
        while (true) {
            skip();
            JsonValue key;
            if (!parse_string(key)) return false;
            skip();
            if (i >= t.size() || t[i] != ':') return fail("expected :");
            ++i;
            JsonValue val;
            if (!parse_value(val)) return false;
            out.o.emplace_back(key.s, std::move(val));
            skip();
            if (i >= t.size()) return fail("unterminated object");
            if (t[i] == ',') {
                ++i;
                continue;
            }
            if (t[i] == '}') {
                ++i;
                return true;
            }
            return fail("expected comma or }");
        }
    }
};

std::string esc(const std::string& s) {
    std::string o;
    o.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
        case '"':
            o += "\\\"";
            break;
        case '\\':
            o += "\\\\";
            break;
        case '\n':
            o += "\\n";
            break;
        default:
            o.push_back(c);
            break;
        }
    }
    return o;
}

std::string f(float v) {
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.4f", v);
    return buf;
}

const char* action_name(ActionType t) {
    switch (t) {
    case ActionType::Move:
        return "move";
    case ActionType::Shoot:
        return "shoot";
    case ActionType::EndTurn:
        return "end_turn";
    case ActionType::Reload:
        return "reload";
    case ActionType::Bandage:
        return "bandage";
    case ActionType::SetPosture:
        return "posture";
    case ActionType::Overwatch:
        return "overwatch";
    case ActionType::ReadyWeapon:
        return "ready";
    case ActionType::ContactReady:
        return "contact_ready";
    case ActionType::ReactShift:
        return "react_shift";
    case ActionType::ReactDrop:
        return "react_drop";
    case ActionType::ReactTrack:
        return "react_track";
    case ActionType::ReactBrace:
        return "react_brace";
    case ActionType::ReactSkip:
        return "react_skip";
    case ActionType::OverwatchFire:
        return "ow_fire";
    case ActionType::OverwatchHold:
        return "ow_hold";
    }
    return "end_turn";
}

const char* event_name(EventKind k) {
    switch (k) {
    case EventKind::TurnStarted:
        return "turn_started";
    case EventKind::Moved:
        return "moved";
    case EventKind::Shot:
        return "shot";
    case EventKind::Wound:
        return "wound";
    case EventKind::Downed:
        return "downed";
    case EventKind::Dead:
        return "dead";
    case EventKind::TurnEnded:
        return "turn_ended";
    case EventKind::CombatEnded:
        return "combat_ended";
    case EventKind::Rejected:
        return "rejected";
    case EventKind::Contact:
        return "contact";
    case EventKind::Reaction:
        return "reaction";
    case EventKind::Bleed:
        return "bleed";
    case EventKind::Treated:
        return "treated";
    case EventKind::OverwatchSet:
        return "overwatch";
    }
    return "rejected";
}

bool read_vec2(const JsonValue& v, Vec2& out) {
    if (v.type == JsonValue::Array && v.a.size() >= 2) {
        out = {static_cast<float>(v.a[0].number()), static_cast<float>(v.a[1].number())};
        return true;
    }
    if (v.type == JsonValue::Object && v.has("x") && v.has("y")) {
        out = {static_cast<float>(v.at("x").number()), static_cast<float>(v.at("y").number())};
        return true;
    }
    return false;
}

Gait parse_gait(const std::string& s) {
    if (s == "run") return Gait::Run;
    if (s == "sprint") return Gait::Sprint;
    return Gait::Walk;
}
ShotMode parse_shot(const std::string& s) {
    if (s == "aimed") return ShotMode::Aimed;
    if (s == "burst") return ShotMode::Burst;
    return ShotMode::Snap;
}
AimRegion parse_aim(const std::string& s) {
    if (s == "head") return AimRegion::Head;
    if (s == "legs") return AimRegion::Legs;
    return AimRegion::Torso;
}
Posture parse_posture(const std::string& s) {
    if (s == "crouch" || s == "crouching") return Posture::Crouching;
    if (s == "prone") return Posture::Prone;
    return Posture::Standing;
}

Unit unit_from_json(const JsonValue& v, UnitId fallback_id) {
    Unit u;
    u.id = static_cast<UnitId>(v.has("id") ? v.at("id").number() : fallback_id);
    u.name = v.has("name") ? v.at("name").str() : ("Unit-" + std::to_string(u.id));
    u.team = static_cast<int>(v.has("team") ? v.at("team").number() : 0);
    if (v.has("pos")) read_vec2(v.at("pos"), u.pos);
    u.facing = static_cast<float>(v.has("facing") ? v.at("facing").number() : 0);
    float init = v.has("initiative") ? v.at("initiative").number() : 3;
    if (init > 6) init = 3; // old 8–12 scale
    u.initiative_base = (float)init;
    if (v.has("firearms")) u.firearms = (float)v.at("firearms").number();
    if (v.has("awareness")) u.awareness = (float)v.at("awareness").number();
    if (v.has("endurance")) u.endurance = (float)v.at("endurance").number();
    if (v.has("medicine")) u.medicine = (float)v.at("medicine").number();
    if (v.has("experience")) u.experience = (float)v.at("experience").number();
    if (v.has("max_range")) u.max_range = (float)v.at("max_range").number();
    if (v.has("ammo")) u.ammo = (int)v.at("ammo").number();
    if (v.has("mag")) u.mag = (int)v.at("mag").number();
    if (v.has("accuracy_deg")) u.weapon_spread = (float)v.at("accuracy_deg").number() * 0.01745329252f;
    return u;
}

void read_dest(const JsonValue& v, Action& a) {
    if (v.has("dest")) read_vec2(v.at("dest"), a.dest);
    else if (v.has("x") && v.has("y")) {
        a.dest = {(float)v.at("x").number(), (float)v.at("y").number()};
    }
}

bool action_from_value(const JsonValue& v, Action& a, std::string& err) {
    if (v.type != JsonValue::Object) {
        err = "action must be an object";
        return false;
    }
    std::string type = v.has("type") ? v.at("type").str() : "";
    a.actor = static_cast<UnitId>(v.has("actor") ? v.at("actor").number() : 0);
    a.target = static_cast<UnitId>(v.has("target") ? v.at("target").number() : 0);
    if (v.has("gait")) a.gait = parse_gait(v.at("gait").str());
    if (v.has("shot")) a.shot = parse_shot(v.at("shot").str());
    if (v.has("aim")) a.aim = parse_aim(v.at("aim").str());
    if (v.has("posture")) a.posture = parse_posture(v.at("posture").str());
    read_dest(v, a);

    if (type == "move") a.type = ActionType::Move;
    else if (type == "shoot") a.type = ActionType::Shoot;
    else if (type == "end_turn" || type == "end") a.type = ActionType::EndTurn;
    else if (type == "reload") a.type = ActionType::Reload;
    else if (type == "bandage") a.type = ActionType::Bandage;
    else if (type == "posture") a.type = ActionType::SetPosture;
    else if (type == "overwatch") a.type = ActionType::Overwatch;
    else if (type == "ready") a.type = ActionType::ReadyWeapon;
    else if (type == "contact_ready") a.type = ActionType::ContactReady;
    else if (type == "react_shift") a.type = ActionType::ReactShift;
    else if (type == "react_drop") a.type = ActionType::ReactDrop;
    else if (type == "react_track") a.type = ActionType::ReactTrack;
    else if (type == "react_brace") a.type = ActionType::ReactBrace;
    else if (type == "react_skip") a.type = ActionType::ReactSkip;
    else if (type == "ow_fire") a.type = ActionType::OverwatchFire;
    else if (type == "ow_hold") a.type = ActionType::OverwatchHold;
    else {
        err = "unknown action type: " + type;
        return false;
    }
    return true;
}

} // namespace

const JsonValue* JsonValue::get(const char* key) const {
    for (const auto& kv : o) {
        if (kv.first == key) return &kv.second;
    }
    return nullptr;
}

const JsonValue& JsonValue::at(const char* key) const {
    static JsonValue empty;
    const JsonValue* v = get(key);
    return v ? *v : empty;
}

Vec2 JsonValue::as_vec2() const {
    Vec2 v;
    read_vec2(*this, v);
    return v;
}

double JsonValue::number(double fallback) const {
    if (type == Number) return n;
    if (type == String) return std::strtod(s.c_str(), nullptr);
    return fallback;
}

std::string JsonValue::str(const char* fallback) const {
    if (type == String) return s;
    return fallback;
}

bool JsonValue::boolean(bool fallback) const {
    if (type == Bool) return b;
    return fallback;
}

bool load_file(const std::string& path, std::string& out, std::string& err) {
    std::ifstream in(path);
    if (!in) {
        err = "cannot open " + path;
        return false;
    }
    std::ostringstream ss;
    ss << in.rdbuf();
    out = ss.str();
    return true;
}

bool write_file(const std::string& path, const std::string& text, std::string& err) {
    std::ofstream out(path);
    if (!out) {
        err = "cannot write " + path;
        return false;
    }
    out << text;
    return true;
}

bool parse_json(const std::string& text, JsonValue& out, std::string& err) {
    Parser p(text);
    if (!p.parse_value(out)) {
        err = p.err;
        return false;
    }
    return true;
}

bool world_from_json(const std::string& text, World& world, std::string& err) {
    JsonValue root;
    if (!parse_json(text, root, err)) return false;
    const JsonValue* scenario = root.get("scenario");
    const JsonValue& src = scenario ? *scenario : root;
    world = {};
    world.scenario_name = src.has("name") ? src.at("name").str() : "unnamed";
    world.seed = static_cast<uint64_t>(src.has("seed") ? src.at("seed").number() : 1);
    if (src.has("map")) {
        const JsonValue& m = src.at("map");
        if (m.has("min")) read_vec2(m.at("min"), world.map.min);
        if (m.has("max")) read_vec2(m.at("max"), world.map.max);
        if (m.has("grid")) world.map.grid = static_cast<float>(m.at("grid").number());
        if (m.has("surprise0")) world.map.surprise0 = (float)m.at("surprise0").number();
        if (m.has("surprise1")) world.map.surprise1 = (float)m.at("surprise1").number();
        if (m.has("cover") && m.at("cover").type == JsonValue::Array) {
            for (const JsonValue& c : m.at("cover").a) {
                Cover cov;
                if (c.has("min")) read_vec2(c.at("min"), cov.min);
                if (c.has("max")) read_vec2(c.at("max"), cov.max);
                if (c.has("height")) cov.height = (float)c.at("height").number();
                if (c.has("protection")) cov.protection = (float)c.at("protection").number();
                if (c.has("durability")) cov.durability = (float)c.at("durability").number();
                cov.durability_max = cov.durability;
                world.map.cover.push_back(cov);
            }
        }
    }
    if (src.has("units") && src.at("units").type == JsonValue::Array) {
        UnitId next = 1;
        for (const JsonValue& u : src.at("units").a) {
            world.units.push_back(unit_from_json(u, next++));
        }
    }
    if (world.units.empty()) {
        err = "scenario has no units";
        return false;
    }
    return true;
}

bool action_from_json(const std::string& text, Action& action, std::string& err) {
    JsonValue v;
    if (!parse_json(text, v, err)) return false;
    return action_from_value(v, action, err);
}

bool actions_from_json(const std::string& text, std::vector<Action>& actions, std::string& err) {
    JsonValue v;
    if (!parse_json(text, v, err)) return false;
    const JsonValue* list = &v;
    if (v.type == JsonValue::Object && v.has("actions")) list = &v.at("actions");
    if (list->type != JsonValue::Array) {
        err = "expected actions array";
        return false;
    }
    for (const JsonValue& item : list->a) {
        Action a;
        if (!action_from_value(item, a, err)) return false;
        actions.push_back(a);
    }
    return true;
}

bool replay_from_json(const std::string& text, World& world, std::vector<Action>& actions, std::string& err) {
    JsonValue v;
    if (!parse_json(text, v, err)) return false;
    if (v.has("scenario")) {
        if (!world_from_json(text, world, err)) return false;
    } else {
        err = "replay missing scenario";
        return false;
    }
    if (v.has("seed")) world.seed = static_cast<uint64_t>(v.at("seed").number());
    return actions_from_json(text, actions, err);
}

const char* phase_name(Phase p) {
    if (p == Phase::Contact) return "contact";
    if (p == Phase::Over) return "over";
    return "play";
}

std::string action_to_json(const Action& a) {
    std::ostringstream os;
    os << "{\"type\":\"" << action_name(a.type) << "\",\"actor\":" << a.actor
       << ",\"target\":" << a.target << ",\"dest\":[" << f(a.dest.x) << "," << f(a.dest.y)
       << "],\"gait\":\"" << gait_name(a.gait) << "\",\"shot\":\"" << shot_name(a.shot)
       << "\",\"aim\":\"" << aim_name(a.aim) << "\",\"posture\":\"" << posture_name(a.posture)
       << "\"}";
    return os.str();
}

std::string events_to_json(const std::vector<Event>& events) {
    std::ostringstream os;
    os << "[";
    for (size_t i = 0; i < events.size(); ++i) {
        const Event& e = events[i];
        if (i) os << ",";
        os << "{\"kind\":\"" << event_name(e.kind) << "\",\"actor\":" << e.actor
           << ",\"other\":" << e.other << ",\"a\":[" << f(e.a.x) << "," << f(e.a.y) << "],\"b\":["
           << f(e.b.x) << "," << f(e.b.y) << "],\"n\":" << f(e.n) << ",\"text\":\"" << esc(e.text)
           << "\"}";
    }
    os << "]";
    return os.str();
}

std::string world_to_json(const World& world) {
    std::ostringstream os;
    os << "{\n";
    os << "  \"name\":\"" << esc(world.scenario_name) << "\",\n";
    os << "  \"seed\":" << world.seed << ",\n";
    os << "  \"rng_state\":" << world.rng_state << ",\n";
    os << "  \"phase\":\"" << phase_name(world.phase) << "\",\n";
    os << "  \"round\":" << world.round << ",\n";
    os << "  \"active\":" << world.active << ",\n";
    os << "  \"combat_over\":" << (world.combat_over ? "true" : "false") << ",\n";
    os << "  \"winner_team\":" << world.winner_team << ",\n";
    os << "  \"turn_index\":" << world.turn_index << ",\n";
    os << "  \"turn_order\":[";
    for (size_t i = 0; i < world.turn_order.size(); ++i) {
        if (i) os << ",";
        os << world.turn_order[i];
    }
    os << "],\n";
    os << "  \"map\":{\"min\":[" << f(world.map.min.x) << "," << f(world.map.min.y) << "],\"max\":["
       << f(world.map.max.x) << "," << f(world.map.max.y) << "],\"grid\":" << f(world.map.grid)
       << ",\"surprise0\":" << f(world.map.surprise0) << ",\"surprise1\":" << f(world.map.surprise1)
       << ",\"cover\":[";
    for (size_t i = 0; i < world.map.cover.size(); ++i) {
        const Cover& c = world.map.cover[i];
        if (i) os << ",";
        os << "{\"min\":[" << f(c.min.x) << "," << f(c.min.y) << "],\"max\":[" << f(c.max.x) << ","
           << f(c.max.y) << "],\"height\":" << f(c.height) << ",\"durability\":" << f(c.durability)
           << "}";
    }
    os << "]},\n";
    os << "  \"units\":[\n";
    for (size_t i = 0; i < world.units.size(); ++i) {
        const Unit& u = world.units[i];
        if (i) os << ",\n";
        os << "    {\"id\":" << u.id << ",\"name\":\"" << esc(u.name) << "\",\"team\":" << u.team
           << ",\"pos\":[" << f(u.pos.x) << "," << f(u.pos.y) << "],\"facing\":" << f(u.facing)
           << ",\"initiative\":" << u.initiative_base << ",\"firearms\":" << f(u.firearms)
           << ",\"awareness\":" << f(u.awareness) << ",\"endurance\":" << f(u.endurance)
           << ",\"medicine\":" << f(u.medicine) << ",\"experience\":" << f(u.experience)
           << ",\"mag\":" << u.mag << ",\"ammo\":" << u.ammo << ",\"blood\":" << f(u.blood)
           << ",\"pain\":" << f(u.pain) << ",\"downed\":" << (u.downed ? "true" : "false")
           << ",\"dead\":" << (u.dead ? "true" : "false") << "}";
    }
    os << "\n  ],\n";
    os << "  \"last_shot\":{";
    const LastShot& s = world.last_shot;
    os << "\"valid\":" << (s.valid ? "true" : "false") << ",\"attacker\":" << s.attacker
       << ",\"intended\":" << s.intended << ",\"struck\":" << s.struck << ",\"origin\":["
       << f(s.origin.x) << "," << f(s.origin.y) << "],\"aim_dir\":[" << f(s.aim_dir.x) << ","
       << f(s.aim_dir.y) << "],\"shot_dir\":[" << f(s.shot_dir.x) << "," << f(s.shot_dir.y)
       << "],\"cone_half_rad\":" << f(s.cone_half_rad) << ",\"t\":" << f(s.t)
       << ",\"hit\":" << (s.hit ? "true" : "false") << ",\"blocked_cover\":"
       << (s.blocked_cover ? "true" : "false") << ",\"result\":\"" << esc(s.result) << "\"},\n";
    os << "  \"history\":[";
    for (size_t i = 0; i < world.history.size(); ++i) {
        if (i) os << ",";
        os << action_to_json(world.history[i]);
    }
    os << "]\n}\n";
    return os.str();
}

namespace {

float channel_stretch(const Unit& u) {
    float stretch = 1.0f;
    if (u.pain >= u.pain_tolerance) stretch += 0.25f;
    if (u.blood > 50) stretch += 0.15f;
    return stretch;
}

bool can_spend(const Unit& u, float hands, float legs, float focus, float voice) {
    Unit tmp = u;
    std::string err;
    return spend_channels(tmp, hands, legs, focus, voice, err);
}

std::string fmt_cost(bool contact, float hands, float legs, float focus, float voice, float reaction) {
    if (contact) {
        char buf[48];
        std::snprintf(buf, sizeof(buf), "%.2gs reaction", reaction);
        return buf;
    }
    std::string s;
    auto add = [&](const char* name, float v) {
        if (v < 0.005f) return;
        if (!s.empty()) s += " · ";
        char buf[40];
        std::snprintf(buf, sizeof(buf), "%.2gs %s", v, name);
        s += buf;
    };
    add("Hands", hands);
    add("Legs", legs);
    add("Focus", focus);
    add("Voice", voice);
    if (s.empty()) s = "free";
    return s;
}

void emit_quote(std::ostringstream& os, bool& first, const char* id, const char* label, bool contact,
                float hands, float legs, float focus, float voice, float reaction, bool ok,
                const char* reason) {
    if (!first) os << ",";
    first = false;
    os << "{\"id\":\"" << id << "\",\"label\":\"" << label << "\",\"hands\":" << f(hands)
       << ",\"legs\":" << f(legs) << ",\"focus\":" << f(focus) << ",\"voice\":" << f(voice)
       << ",\"reaction\":" << f(reaction) << ",\"ok\":" << (ok ? "true" : "false") << ",\"cost\":\""
       << esc(fmt_cost(contact, hands, legs, focus, voice, reaction)) << "\",\"reason\":\""
       << esc(reason ? reason : "") << "\"}";
}

bool unit_visible_to(const World& world, const Unit* viewer, const Unit& u, bool fog) {
    if (!fog || !viewer) return true;
    if (u.id == viewer->id || u.team == viewer->team) return true;
    if (u.dead) return true;
    return los_2d(world.map, viewer->pos, u.pos);
}

void write_quotes(std::ostringstream& os, const World& world, const Unit* u, const Unit* reactor) {
    os << "{\"actions\":[";
    if (!u) {
        os << "],\"shots\":[],\"gaits\":[],\"reactions\":[]}";
        return;
    }
    const bool contact = world.phase == Phase::Contact;
    const float stretch = channel_stretch(*u);
    bool first = true;

    auto posture_q = [&](const char* id, const char* label, Posture p, float t) {
        bool already = u->posture == p;
        bool ok = !already && (contact ? u->reaction_left + 1e-4f >= t : can_spend(*u, 0, t, 0, 0));
        const char* reason = already ? "already in this posture" : (ok ? "" : "not enough time");
        emit_quote(os, first, id, label, contact, 0, contact ? 0 : t, 0, 0, contact ? t : 0, ok, reason);
    };
    posture_q("crouch", "Crouch", Posture::Crouching, 0.45f);
    posture_q("prone", "Prone", Posture::Prone, 0.8f);
    posture_q("stand", "Stand", Posture::Standing, 0.45f);

    {
        float hands = 2.0f, focus = u->firearms >= 3 ? 0.0f : 0.6f;
        bool ok = !contact && u->mag < u->mag_size && u->ammo > 0 && can_spend(*u, hands, 0, focus, 0);
        const char* reason = contact ? "not in contact" : (u->mag >= u->mag_size ? "mag full" : (u->ammo <= 0 ? "no reserve" : (ok ? "" : "not enough time")));
        emit_quote(os, first, "reload", "Reload", false, hands * stretch, 0, focus * stretch, 0, 0, ok, reason);
    }
    {
        float hands = u->medicine >= 3 ? 2.0f : 3.6f;
        float focus = u->medicine >= 3 ? 0.0f : 2.8f;
        bool bleed = false;
        for (const Wound& w : u->wounds)
            if (!w.treated && w.bleed_rate > 0) bleed = true;
        bool ok = !contact && bleed && can_spend(*u, hands, 0.4f, focus, 0.4f);
        const char* reason = contact ? "not in contact" : (!bleed ? "no untreated bleed" : (ok ? "" : "not enough time"));
        emit_quote(os, first, "bandage", "Bandage", false, hands * stretch, 0.4f, focus * stretch, 0.4f, 0, ok,
                   reason);
    }
    {
        float t = 0.6f;
        bool ok = !u->weapon_ready && (contact ? u->reaction_left + 1e-4f >= t : can_spend(*u, t, 0, 0.2f, 0));
        const char* reason = u->weapon_ready ? "already ready" : (ok ? "" : "not enough time");
        emit_quote(os, first, "ready", "Ready weapon", contact, contact ? 0 : t * stretch, 0,
                   contact ? 0 : 0.2f * stretch, 0, contact ? t : 0, ok, reason);
    }
    {
        bool ok = !contact && u->ch.focus + 1e-4f >= 1.5f;
        emit_quote(os, first, "overwatch", "Overwatch", false, u->ch.hands, 0, std::max(1.5f, u->ch.focus), 0, 0, ok,
                   contact ? "not in contact" : (ok ? "spends remaining Hands + Focus" : "needs 1.5s Focus"));
    }
    emit_quote(os, first, "contact_ready", "Ready up", true, 0, 0, 0, 0, 0, contact && !u->contact_ready,
               contact ? "" : "contact only");

    os << "],\"shots\":[";
    first = true;
    auto shot_q = [&](const char* id, const char* label, float hands, float focus, float voice) {
        bool ok = !contact && u->mag > 0 && u->last_gait != Gait::Sprint && can_spend(*u, hands, 0, focus, voice);
        const char* reason = contact ? "no shooting in contact"
                                     : (u->last_gait == Gait::Sprint ? "sprinted this turn"
                                                                     : (u->mag <= 0 ? "empty mag" : (ok ? "" : "not enough time")));
        emit_quote(os, first, id, label, false, hands * stretch, 0, focus * stretch, voice, 0, ok, reason);
    };
    shot_q("snap", "Snap", 1.0f, 0.5f, 0.3f);
    shot_q("aimed", "Aimed", u->firearms >= 4 ? 2.5f : 3.2f, u->firearms >= 4 ? 2.5f : 3.2f, 0.3f);
    shot_q("burst", "Burst ×3", 1.8f, 1.0f, 0.3f);

    os << "],\"gaits\":[";
    first = true;
    float budget = contact ? u->reaction_left : u->ch.legs;
    auto gait_q = [&](Gait g, const char* id, const char* label) {
        if (!first) os << ",";
        first = false;
        float spd = gait_speed(g, *u);
        bool ok = budget > 0.05f && (!contact || g == Gait::Walk);
        if (g == Gait::Sprint && u->ch.focus < 2.0f) ok = false;
        const char* reason = contact && g != Gait::Walk ? "walk only in contact"
                                                        : (g == Gait::Sprint && u->ch.focus < 2.0f ? "sprint needs 2s Focus" : "");
        os << "{\"id\":\"" << id << "\",\"label\":\"" << label << "\",\"speed\":" << f(spd)
           << ",\"radius\":" << f(spd * std::max(0.0f, budget)) << ",\"ok\":" << (ok ? "true" : "false")
           << ",\"reason\":\"" << esc(reason) << "\"}";
    };
    gait_q(Gait::Walk, "walk", "Walk");
    gait_q(Gait::Run, "run", "Run");
    gait_q(Gait::Sprint, "sprint", "Sprint");

    os << "],\"reactions\":[";
    first = true;
    const Unit* ru = reactor ? reactor : u;
    if (!ru) ru = u;
    emit_quote(os, first, "react_shift", "Shift", true, 0, 0, 0, 0, 1.15f, ru->reaction_left >= 1.15f, "~1.8m");
    emit_quote(os, first, "react_drop", "Drop", true, 0, 0, 0, 0, 0.55f, ru->reaction_left >= 0.55f, "go prone");
    emit_quote(os, first, "react_track", "Track", true, 0, 0, 0, 0, 0.4f, ru->reaction_left >= 0.4f, "face threat");
    emit_quote(os, first, "react_brace", "Brace", true, 0, 0, 0, 0, 0.45f, ru->reaction_left >= 0.45f, "settle stress");
    emit_quote(os, first, "react_skip", "Skip", true, 0, 0, 0, 0, 0, true, "free");
    os << "]}";
}

void write_move_info(std::ostringstream& os, const World& world, const Unit* u) {
    os << "{\"kind\":\"" << (world.phase == Phase::Contact ? "reaction" : "legs") << "\"";
    if (!u) {
        os << ",\"budget\":0,\"max\":0,\"walk\":0,\"run\":0,\"sprint\":0}";
        return;
    }
    float budget = world.phase == Phase::Contact ? u->reaction_left : u->ch.legs;
    float mx = world.phase == Phase::Contact ? u->reaction_max : 5.0f;
    os << ",\"budget\":" << f(budget) << ",\"max\":" << f(mx)
       << ",\"walk\":" << f(gait_speed(Gait::Walk, *u) * budget)
       << ",\"run\":" << f(gait_speed(Gait::Run, *u) * budget)
       << ",\"sprint\":" << f(gait_speed(Gait::Sprint, *u) * budget) << "}";
}

} // namespace

std::string view_to_json(const World& world, bool fog, UnitId viewer) {
    const Unit* viewer_u = find_unit(world, viewer);
    if (!viewer_u) {
        if (world.phase == Phase::Play) viewer_u = find_unit(world, world.active);
    }
    const UnitId vid = viewer_u ? viewer_u->id : 0;
    const Unit* quote_u = viewer_u;
    if (!quote_u) quote_u = find_unit(world, world.active);
    if (!quote_u) {
        for (const Unit& u : world.units) {
            if (unit_alive(u) && (world.phase != Phase::Contact || !u.contact_ready)) {
                quote_u = &u;
                break;
            }
        }
    }
    if (!quote_u && !world.units.empty()) quote_u = &world.units[0];

    std::ostringstream os;
    os << "{";
    os << "\"phase\":\"" << phase_name(world.phase) << "\",\"round\":" << world.round
       << ",\"active\":" << world.active << ",\"combat_over\":" << (world.combat_over ? "true" : "false")
       << ",\"winner_team\":" << world.winner_team << ",\"fog\":" << (fog ? "true" : "false")
       << ",\"viewer\":" << vid << ",";
    os << "\"turn_order\":[";
    for (size_t i = 0; i < world.turn_order.size(); ++i) {
        if (i) os << ",";
        os << world.turn_order[i];
    }
    os << "],";
    os << "\"pending_react\":{\"active\":" << (world.pending_react.active ? "true" : "false")
       << ",\"reactor\":" << world.pending_react.reactor << ",\"trigger\":" << world.pending_react.trigger
       << "},";
    os << "\"pending_ow\":{\"active\":" << (world.pending_ow.active ? "true" : "false")
       << ",\"watcher\":" << world.pending_ow.watcher << ",\"mover\":" << world.pending_ow.mover << "},";
    os << "\"map\":{\"min\":[" << f(world.map.min.x) << "," << f(world.map.min.y) << "],\"max\":["
       << f(world.map.max.x) << "," << f(world.map.max.y) << "],\"grid\":" << f(world.map.grid)
       << ",\"surprise0\":" << f(world.map.surprise0) << ",\"surprise1\":" << f(world.map.surprise1)
       << ",\"cover\":[";
    for (size_t i = 0; i < world.map.cover.size(); ++i) {
        const Cover& c = world.map.cover[i];
        if (i) os << ",";
        os << "{\"min\":[" << f(c.min.x) << "," << f(c.min.y) << "],\"max\":[" << f(c.max.x) << ","
           << f(c.max.y) << "],\"height\":" << f(c.height) << ",\"durability\":" << f(c.durability)
           << ",\"durability_max\":" << f(c.durability_max) << "}";
    }
    os << "]},";
    os << "\"units\":[";
    for (size_t i = 0; i < world.units.size(); ++i) {
        const Unit& u = world.units[i];
        if (i) os << ",";
        const bool vis = unit_visible_to(world, viewer_u, u, fog);
        os << "{\"id\":" << u.id << ",\"name\":\"" << esc(u.name) << "\",\"team\":" << u.team
           << ",\"pos\":[" << f(u.pos.x) << "," << f(u.pos.y) << "],\"facing\":" << f(u.facing)
           << ",\"posture\":\"" << posture_name(u.posture) << "\",\"initiative\":" << u.initiative
           << ",\"pain\":" << f(u.pain) << ",\"pain_tolerance\":" << f(u.pain_tolerance)
           << ",\"pain_frac\":" << f(u.pain_tolerance > 0 ? u.pain / u.pain_tolerance : 0)
           << ",\"blood\":" << f(u.blood) << ",\"stress\":" << f(u.stress)
           << ",\"stress_tolerance\":" << f(u.stress_tolerance)
           << ",\"downed\":" << (u.downed ? "true" : "false") << ",\"dead\":" << (u.dead ? "true" : "false")
           << ",\"active\":" << (u.id == world.active ? "true" : "false")
           << ",\"contact_ready\":" << (u.contact_ready ? "true" : "false")
           << ",\"weapon_ready\":" << (u.weapon_ready ? "true" : "false")
           << ",\"overwatch\":" << (u.overwatch ? "true" : "false")
           << ",\"visible\":" << (vis ? "true" : "false")
           << ",\"last_gait\":\"" << gait_name(u.last_gait) << "\""
           << ",\"mag\":" << u.mag << ",\"mag_size\":" << u.mag_size << ",\"ammo\":" << u.ammo
           << ",\"hands\":" << f(u.ch.hands) << ",\"legs\":" << f(u.ch.legs)
           << ",\"focus\":" << f(u.ch.focus) << ",\"voice\":" << f(u.ch.voice)
           << ",\"reaction_left\":" << f(u.reaction_left) << ",\"reaction_max\":" << f(u.reaction_max)
           << ",\"wounds\":[";
        for (size_t wi = 0; wi < u.wounds.size(); ++wi) {
            const Wound& w = u.wounds[wi];
            if (wi) os << ",";
            os << "{\"region\":\"" << esc(w.region) << "\",\"text\":\"" << esc(w.description)
               << "\",\"bleed\":" << f(w.bleed_rate) << ",\"treated\":" << (w.treated ? "true" : "false")
               << ",\"impairment\":\"" << esc(w.impairment) << "\"}";
        }
        os << "],\"armor\":[";
        for (size_t ai = 0; ai < u.armor.size(); ++ai) {
            const ArmorPlate& p = u.armor[ai];
            if (ai) os << ",";
            os << "{\"name\":\"" << esc(p.name) << "\",\"region\":\"" << esc(p.region)
               << "\",\"dur\":" << f(p.durability) << ",\"max\":" << f(p.durability_max) << "}";
        }
        os << "]}";
    }
    os << "],";
    os << "\"quotes\":";
    write_quotes(os, world, quote_u, find_unit(world, world.pending_react.reactor));
    os << ",\"move\":";
    write_move_info(os, world, quote_u);
    os << ",";
    const LastShot& s = world.last_shot;
    bool show_shot = s.valid;
    if (fog && viewer_u && s.valid) {
        const Unit* atk = find_unit(world, s.attacker);
        bool sees_atk = atk && unit_visible_to(world, viewer_u, *atk, true);
        bool involved = s.intended == viewer_u->id || s.struck == viewer_u->id || s.attacker == viewer_u->id;
        show_shot = involved || sees_atk;
    }
    os << "\"last_shot\":{\"valid\":" << (show_shot ? "true" : "false") << ",\"origin\":["
       << f(s.origin.x) << "," << f(s.origin.y) << "],\"aim_dir\":[" << f(s.aim_dir.x) << ","
       << f(s.aim_dir.y) << "],\"shot_dir\":[" << f(s.shot_dir.x) << "," << f(s.shot_dir.y)
       << "],\"end\":[" << f(s.origin.x + s.shot_dir.x * s.t) << ","
       << f(s.origin.y + s.shot_dir.y * s.t) << "],\"cone_half_rad\":" << f(s.cone_half_rad)
       << ",\"hit\":" << (s.hit ? "true" : "false") << ",\"result\":\"" << esc(s.result)
       << "\",\"region\":\"" << esc(s.region) << "\"}";
    os << "}";
    return os.str();
}

std::string replay_to_json(const World& initial, uint64_t seed, const std::vector<Action>& actions) {
    std::ostringstream os;
    os << "{\n  \"seed\":" << seed << ",\n";
    os << "  \"scenario\":" << world_to_json(initial) << ",\n";
    os << "  \"actions\":[";
    for (size_t i = 0; i < actions.size(); ++i) {
        if (i) os << ",";
        os << action_to_json(actions[i]);
    }
    os << "]\n}\n";
    return os.str();
}

std::string preview_to_json(const HitPreview& p) {
    std::ostringstream os;
    os << "{\"ok\":" << (p.ok ? "true" : "false") << ",\"actor\":" << p.actor
       << ",\"target\":" << p.target << ",\"distance\":" << f(p.distance)
       << ",\"cone_half_rad\":" << f(p.cone_half_rad) << ",\"p_hit\":" << f(p.p_hit)
       << ",\"p_cover\":" << f(p.p_cover) << ",\"origin\":[" << f(p.origin.x) << "," << f(p.origin.y)
       << "],\"aim_dir\":[" << f(p.aim_dir.x) << "," << f(p.aim_dir.y) << "]}";
    return os.str();
}

std::string move_preview_to_json(const MovePreview& p) {
    std::ostringstream os;
    os << "{\"ok\":" << (p.ok ? "true" : "false") << ",\"actor\":" << p.actor << ",\"from\":["
       << f(p.from.x) << "," << f(p.from.y) << "],\"dest\":[" << f(p.dest.x) << "," << f(p.dest.y)
       << "],\"requested\":[" << f(p.requested.x) << "," << f(p.requested.y) << "],\"dist\":" << f(p.dist)
       << ",\"time\":" << f(p.time) << ",\"budget\":" << f(p.budget) << ",\"speed\":" << f(p.speed)
       << ",\"truncated\":" << (p.truncated ? "true" : "false") << ",\"gait\":\"" << esc(p.gait)
       << "\",\"note\":\"" << esc(p.note) << "\"}";
    return os.str();
}
