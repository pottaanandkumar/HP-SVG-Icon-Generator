import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, "../node_modules/lucide-react/dist/esm/icons");
const files = fs.readdirSync(iconsDir).filter((f) => f.endsWith(".mjs") && f !== "index.mjs");

function kebabToPascal(kebab) {
  return kebab
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

const entries = [];
for (const file of files) {
  const mod = await import(pathToFileURL(path.join(iconsDir, file)).href);
  if (!mod.__iconNode) continue;
  const name = kebabToPascal(file.replace(/\.mjs$/, ""));
  const iconNode = mod.__iconNode.map(([tag, attrs]) => {
    const { key: _key, ...rest } = attrs;
    return [tag, rest];
  });
  entries.push({ name, iconNode });
}

const outPath = path.join(__dirname, "../lib/generated/lucideIconData.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(entries));
console.log(`Wrote ${entries.length} icons to ${outPath}`);
