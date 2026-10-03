// Copies the HiGHS WebAssembly binary from node_modules/highs into public/solver/ so the browser
// worker can load it from "/solver/<file>". Runs in postinstall and prebuild (so also on Vercel).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
// "highs/package.json" is not exported, so resolve the entry point and walk up to the package root.
let pkgDir = dirname(require.resolve("highs"));
while (!existsSync(join(pkgDir, "package.json"))) pkgDir = dirname(pkgDir);
const target = join(root, "public", "solver");

// Find the .wasm file(s) inside the package instead of hard-coding the path.
function findWasm(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules") return [];
    if (statSync(p).isDirectory()) return findWasm(p);
    return name.endsWith(".wasm") ? [p] : [];
  });
}

const files = findWasm(pkgDir);
if (files.length === 0) {
  console.error(`copy-highs-wasm: no .wasm file found in ${pkgDir}`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
for (const f of files) {
  const dest = join(target, f.split(/[\\/]/).pop());
  copyFileSync(f, dest);
  console.log(`copy-highs-wasm: ${relative(root, f)} -> ${relative(root, dest)}`);
}
