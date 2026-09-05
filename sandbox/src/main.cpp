#include "engine.hpp"
#include "http.hpp"
#include "json_io.hpp"
#include "log.hpp"

#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

static void usage() {
    std::cerr
        << "sandbox — headless-first tactical slice\n"
        << "  sandbox serve [scenario.json] [--port 8080] [--seed N] [--web dir]\n"
        << "  sandbox run   [scenario.json] [--seed N] [--auto] [--script actions.json]\n"
        << "                [--dump path] [--replay-out path]\n"
        << "  sandbox replay replay.json [--dump path]\n"
        << "  sandbox dump  [scenario.json]\n";
}

static std::string find_web_dir(const std::string& override) {
    if (!override.empty()) return override;
#ifdef SANDBOX_WEB_DIR
    if (fs::exists(std::string(SANDBOX_WEB_DIR) + "/index.html")) return SANDBOX_WEB_DIR;
#endif
    const char* candidates[] = {"web", "sandbox/web", "../web", "../sandbox/web"};
    for (const char* c : candidates) {
        if (fs::exists(std::string(c) + "/index.html")) return c;
    }
    return "web";
}

static bool load_scenario_file(const std::string& path, World& world, std::string& err) {
    if (path.empty()) {
        world = Engine::default_world();
        return true;
    }
    std::string text;
    if (!load_file(path, text, err)) return false;
    return world_from_json(text, world, err);
}

struct Opts {
    std::string cmd;
    std::string file;
    std::string script;
    std::string dump;
    std::string replay_out;
    std::string web;
    std::string log_path = "sandbox.log";
    uint64_t seed = 0;
    bool seed_set = false;
    int port = 8080;
    bool auto_play = false;
    int max_auto = 200;
};

static Opts parse_args(int argc, char** argv) {
    Opts o;
    if (argc < 2) return o;
    o.cmd = argv[1];
    for (int i = 2; i < argc; ++i) {
        std::string a = argv[i];
        auto next = [&](std::string& dest) {
            if (i + 1 < argc) dest = argv[++i];
        };
        if (a == "--port") {
            if (i + 1 < argc) o.port = std::atoi(argv[++i]);
        } else if (a == "--seed") {
            if (i + 1 < argc) {
                o.seed = static_cast<uint64_t>(std::strtoull(argv[++i], nullptr, 10));
                o.seed_set = true;
            }
        } else if (a == "--web") {
            next(o.web);
        } else if (a == "--script") {
            next(o.script);
        } else if (a == "--dump") {
            next(o.dump);
        } else if (a == "--replay-out") {
            next(o.replay_out);
        } else if (a == "--log") {
            next(o.log_path);
        } else if (a == "--auto") {
            o.auto_play = true;
        } else if (a == "--max-auto") {
            if (i + 1 < argc) o.max_auto = std::atoi(argv[++i]);
        } else if (a == "-h" || a == "--help") {
            o.cmd = "help";
        } else if (a[0] != '-') {
            o.file = a;
        }
    }
    return o;
}

static bool setup_engine(Engine& eng, const Opts& opt, std::string& err) {
    World w;
    if (!load_scenario_file(opt.file, w, err)) return false;
    if (opt.seed_set) w.seed = opt.seed;
    return eng.load_world(std::move(w));
}

static int cmd_dump(const Opts& opt) {
    Engine eng;
    std::string err;
    if (!setup_engine(eng, opt, err)) {
        LOG_ERROR("%s", err.c_str());
        return 1;
    }
    std::cout << eng.dump_state();
    return 0;
}

static int cmd_run(const Opts& opt) {
    Engine eng;
    std::string err;
    if (!setup_engine(eng, opt, err)) {
        LOG_ERROR("%s", err.c_str());
        return 1;
    }
    if (!opt.script.empty()) {
        std::string text;
        if (!load_file(opt.script, text, err)) {
            LOG_ERROR("%s", err.c_str());
            return 1;
        }
        std::vector<Action> actions;
        if (!actions_from_json(text, actions, err)) {
            LOG_ERROR("%s", err.c_str());
            return 1;
        }
        for (const Action& a : actions) {
            ApplyResult r = eng.apply(a);
            for (const Event& e : r.events) LOG_INFO("event: %s", e.text.c_str());
            if (!r.ok) break;
        }
    }
    if (opt.auto_play) {
        int n = eng.auto_play(opt.max_auto);
        LOG_INFO("auto: ran %d actions, over=%d winner=%d", n, (int)eng.world().combat_over,
                 eng.world().winner_team);
    }
    if (!opt.dump.empty()) {
        if (!write_file(opt.dump, eng.dump_state(), err)) {
            LOG_ERROR("%s", err.c_str());
            return 1;
        }
        LOG_INFO("wrote state %s", opt.dump.c_str());
    } else {
        std::cout << eng.dump_state();
    }
    if (!opt.replay_out.empty()) {
        if (!write_file(opt.replay_out, eng.dump_replay(), err)) {
            LOG_ERROR("%s", err.c_str());
            return 1;
        }
        LOG_INFO("wrote replay %s", opt.replay_out.c_str());
    }
    return 0;
}

static int cmd_replay(const Opts& opt) {
    if (opt.file.empty()) {
        LOG_ERROR("replay requires a file");
        return 1;
    }
    std::string text, err;
    if (!load_file(opt.file, text, err)) {
        LOG_ERROR("%s", err.c_str());
        return 1;
    }
    World w;
    std::vector<Action> actions;
    if (!replay_from_json(text, w, actions, err)) {
        LOG_ERROR("%s", err.c_str());
        return 1;
    }
    if (opt.seed_set) w.seed = opt.seed;
    Engine eng;
    if (!eng.load_world(std::move(w))) return 1;
    for (const Action& a : actions) {
        ApplyResult r = eng.apply(a);
        for (const Event& e : r.events) LOG_INFO("event: %s", e.text.c_str());
        if (!r.ok) {
            LOG_ERROR("replay halted: %s", r.events.empty() ? "unknown" : r.events.back().text.c_str());
            return 1;
        }
    }
    if (!opt.dump.empty()) write_file(opt.dump, eng.dump_state(), err);
    std::cout << eng.dump_state();
    return 0;
}

static int cmd_serve(const Opts& opt) {
    Engine eng;
    std::string err;
    if (!setup_engine(eng, opt, err)) {
        LOG_ERROR("%s", err.c_str());
        return 1;
    }
    std::string web = find_web_dir(opt.web);
    LOG_INFO("presenter at http://127.0.0.1:%d  (core is still headless)", opt.port);

    auto api = [&](const HttpRequest& req) -> HttpResponse {
        if (req.path == "/api/state") {
            return {200, "application/json", eng.dump_state()};
        }
        if (req.path == "/api/view") {
            std::string fog, viewer;
            if (http_query_get(req.query, "fog", fog))
                eng.set_fog(fog == "1" || fog == "true");
            if (http_query_get(req.query, "viewer", viewer))
                eng.set_viewer(static_cast<UnitId>(std::strtoul(viewer.c_str(), nullptr, 10)));
            return {200, "application/json", eng.dump_view()};
        }
        if (req.path == "/api/ui" && req.method == "POST") {
            JsonValue v;
            std::string parse_err;
            if (!parse_json(req.body, v, parse_err)) {
                return {400, "application/json", "{\"ok\":false,\"error\":\"" + parse_err + "\"}"};
            }
            if (v.has("fog")) eng.set_fog(v.at("fog").boolean());
            if (v.has("viewer")) eng.set_viewer(static_cast<UnitId>(v.at("viewer").number()));
            return {200, "application/json", "{\"ok\":true,\"view\":" + eng.dump_view() + "}"};
        }
        if (req.path == "/api/replay") {
            return {200, "application/json", eng.dump_replay()};
        }
        if (req.path == "/api/preview") {
            std::string as, ts, mode, aim;
            http_query_get(req.query, "actor", as);
            http_query_get(req.query, "target", ts);
            http_query_get(req.query, "shot", mode);
            http_query_get(req.query, "aim", aim);
            UnitId actor = static_cast<UnitId>(std::strtoul(as.c_str(), nullptr, 10));
            UnitId target = static_cast<UnitId>(std::strtoul(ts.c_str(), nullptr, 10));
            ShotMode sm = mode == "aimed" ? ShotMode::Aimed : (mode == "burst" ? ShotMode::Burst : ShotMode::Snap);
            AimRegion ar = aim == "head" ? AimRegion::Head : (aim == "legs" ? AimRegion::Legs : AimRegion::Torso);
            return {200, "application/json", preview_to_json(eng.preview_shot(actor, target, sm, ar))};
        }
        if (req.path == "/api/preview_move") {
            std::string as, xs, ys, gs;
            http_query_get(req.query, "actor", as);
            http_query_get(req.query, "x", xs);
            http_query_get(req.query, "y", ys);
            http_query_get(req.query, "gait", gs);
            UnitId actor = static_cast<UnitId>(std::strtoul(as.c_str(), nullptr, 10));
            Vec2 dest{(float)std::strtod(xs.c_str(), nullptr), (float)std::strtod(ys.c_str(), nullptr)};
            Gait gait = gs == "run" ? Gait::Run : (gs == "sprint" ? Gait::Sprint : Gait::Walk);
            return {200, "application/json", move_preview_to_json(eng.preview_move(actor, dest, gait))};
        }
        if (req.path == "/api/action" && req.method == "POST") {
            Action a;
            std::string parse_err;
            if (!action_from_json(req.body, a, parse_err)) {
                return {400, "application/json", "{\"ok\":false,\"error\":\"" + parse_err + "\"}"};
            }
            if (a.actor == 0) a.actor = eng.world().active;
            ApplyResult r = eng.apply(a);
            std::string body = "{\"ok\":" + std::string(r.ok ? "true" : "false") +
                               ",\"events\":" + events_to_json(r.events) +
                               ",\"view\":" + eng.dump_view() + "}";
            return {r.ok ? 200 : 409, "application/json", body};
        }
        if (req.path == "/api/auto" && req.method == "POST") {
            std::vector<Event> ev = eng.auto_step();
            std::string body = "{\"ok\":true,\"events\":" + events_to_json(ev) +
                               ",\"view\":" + eng.dump_view() + "}";
            return {200, "application/json", body};
        }
        return {404, "application/json", "{\"error\":\"no such api\"}"};
    };

    if (!http_serve(opt.port, web, api)) return 1;
    return 0;
}

int main(int argc, char** argv) {
    Opts opt = parse_args(argc, argv);
    if (opt.cmd.empty() || opt.cmd == "help") {
        usage();
        return opt.cmd.empty() ? 1 : 0;
    }
    log_get().open_file(opt.log_path);
    LOG_INFO("sandbox start cmd=%s", opt.cmd.c_str());

    if (opt.cmd == "serve") return cmd_serve(opt);
    if (opt.cmd == "run") return cmd_run(opt);
    if (opt.cmd == "replay") return cmd_replay(opt);
    if (opt.cmd == "dump") return cmd_dump(opt);
    usage();
    return 1;
}
