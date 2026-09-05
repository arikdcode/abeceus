# sandbox

Disposable alpha of a headless-first tactical engine. C++ core, HTML canvas presenter.

The core does not know about graphics. The presenter only sees game nouns.

Numeric interpretation of the wiki combat specs: [`MECHANICS.md`](MECHANICS.md).

## Build

```bash
cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build
```

## Headless

```bash
./build/sandbox dump scenarios/duel_2v2.json
./build/sandbox run scenarios/open_1v1.json --auto --seed 7 \
  --dump /tmp/state.json --replay-out /tmp/replay.json
./build/sandbox replay /tmp/replay.json --dump /tmp/replayed.json
```

## Window

```bash
./build/sandbox serve scenarios/duel_2v2.json --port 8080
```

http://127.0.0.1:8080

- **Contact phase first.** Select a unit, walk / crouch / prone / ready, then **Ready** (`E`).
- Then: click ground to move (gait dropdown), enemy to shoot (shot + aim dropdowns).
- Reactions and overwatch pop a prompt. Channels, blood / pain / stress, wounds, and armor are in the side panel.

## HTTP

- `GET /api/view` `GET /api/state` `GET /api/replay`
- `POST /api/action` — `move`, `shoot`, `end_turn`, `reload`, `bandage`, `posture`, `overwatch`, `ready`, `contact_ready`, `react_*`, `ow_fire` / `ow_hold`
- `GET /api/preview?actor=1&target=3&shot=aimed&aim=torso`
