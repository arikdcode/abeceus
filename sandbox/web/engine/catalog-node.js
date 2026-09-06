import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadCatalogSync, worldFromCatalog } from "./content.js";

export { worldFromCatalog };

export function contentDir() {
  return join(dirname(fileURLToPath(import.meta.url)), "../../content");
}

export function loadRepoCatalog() {
  const dir = contentDir();
  return loadCatalogSync((p) => readFileSync(join(dir, p), "utf8"));
}

export function defaultCatalogWorld(id = "posted_courtyard") {
  return worldFromCatalog(loadRepoCatalog(), id);
}
