# sandbox

Headless-first tactical sim. The engine is JS. The presenter is a canvas at `/web/`.

```bash
python3 serve.py 8080
```

Open http://127.0.0.1:8080/web/

Content lives under `content/`: weapons, characters, maps, and scenarios that place characters on a map. The toolbar scenario list remembers the last pick.

```bash
node web/engine/smoke.js
```
