#!/usr/bin/env node
/** Rebuild texture atlases and look-at yards from the catalogs.
 *  Usage: node scripts/rebuild-tex.mjs [surf|ground|all]
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = dirname(fileURLToPath(import.meta.url));
const which = process.argv[2] || "all";

function run(name) {
  const r = spawnSync(process.execPath, [join(root, name)], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
}

if (which !== "all" && which !== "surf" && which !== "ground") {
  console.error("usage: node scripts/rebuild-tex.mjs [surf|ground|all]");
  process.exit(2);
}
if (which === "all" || which === "surf") run("gen-surf-tex.mjs");
if (which === "all" || which === "ground") run("gen-ground-tex.mjs");
