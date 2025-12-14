import fs from "fs";
import path from "path";
import { DOMParser } from "xmldom";
import { kml } from "@tmcw/togeojson";

const IN_DIR  = path.join(process.cwd(), "website", "assets", "data", "drihl-kml");
const OUT_DIR = path.join(process.cwd(), "website", "assets", "data", "drihl-geojson");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".kml")) out.push(p);
  }
  return out;
}

function parseAnyNumberFromProperties(props) {
  // Essayons d'extraire un nombre de n'importe quelle propriété (y compris description HTML).
  for (const v of Object.values(props || {})) {
    if (typeof v !== "string") continue;
    const m = v
      .replace(/\s/g, " ")
      .match(/(\d{1,3}(?:[.,]\d+)?)/); // 27.4 ou 27,4
    if (m) {
      const num = parseFloat(m[1].replace(",", "."));
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

function roundToNearestTenth(x) {
  return Math.round(x * 10) / 10;
}

function convertOne(inPath, outPath) {
  const xml = fs.readFileSync(inPath, "utf8");
  const dom = new DOMParser().parseFromString(xml);
  const gj = kml(dom);

  // on enrichit les features : reference + majoré
  for (const f of (gj.features || [])) {
    const ref = parseAnyNumberFromProperties(f.properties);
    if (Number.isFinite(ref)) {
      f.properties = f.properties || {};
      f.properties.ref = ref;
      f.properties.majore = roundToNearestTenth(ref * 1.2); // ✅ règle que tu veux
    }
  }

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(gj));
}

function main() {
  ensureDir(OUT_DIR);

  const files = walk(IN_DIR);
  console.log(`📦 KML trouvés: ${files.length}`);
  if (!files.length) process.exit(0);

  let converted = 0;

  for (const f of files) {
    const rel = path.relative(IN_DIR, f);
    const out = path.join(OUT_DIR, rel.replace(/\.kml$/i, ".geojson"));
    convertOne(f, out);
    converted++;
  }

  console.log(`✅ GeoJSON générés: ${converted}`);
}

main();
