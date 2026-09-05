#pragma once

#include "world.hpp"

#include <cstdint>
#include <string>
#include <vector>

struct JsonValue;

bool load_file(const std::string& path, std::string& out, std::string& err);
bool write_file(const std::string& path, const std::string& text, std::string& err);

bool parse_json(const std::string& text, JsonValue& out, std::string& err);
bool world_from_json(const std::string& text, World& world, std::string& err);
bool action_from_json(const std::string& text, Action& action, std::string& err);
bool actions_from_json(const std::string& text, std::vector<Action>& actions, std::string& err);
bool replay_from_json(const std::string& text, World& world, std::vector<Action>& actions, std::string& err);

std::string world_to_json(const World& world);
std::string view_to_json(const World& world, bool fog = false, UnitId viewer = 0);
std::string events_to_json(const std::vector<Event>& events);
std::string replay_to_json(const World& initial, uint64_t seed, const std::vector<Action>& actions);
std::string action_to_json(const Action& a);
std::string preview_to_json(const struct HitPreview& p);
std::string move_preview_to_json(const struct MovePreview& p);

// Minimal JSON DOM used only at the IO boundary.
struct JsonValue {
    enum Type { Null, Bool, Number, String, Array, Object };
    Type type = Null;
    bool b = false;
    double n = 0;
    std::string s;
    std::vector<JsonValue> a;
    std::vector<std::pair<std::string, JsonValue>> o;

    const JsonValue* get(const char* key) const;
    const JsonValue& at(const char* key) const;
    bool has(const char* key) const { return get(key) != nullptr; }
    Vec2 as_vec2() const;
    double number(double fallback = 0) const;
    std::string str(const char* fallback = "") const;
    bool boolean(bool fallback = false) const;
};
