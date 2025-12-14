import fs from "fs";
import path from "path";
import { DOMParser } from "xmldom";
import { kml } from "@tmcw/togeojson";

const IN_DIR = path.join(process.cwd(), "assets", "data", "drihl-kml");
const OUT_DIR = path.join(process.cwd(), "assets", "data", "drihl-geojson");

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

// Heuristique: beaucoup de KML mettent la valeur dans properties.description (HTML)
// On récupère le 1er nombre raisonnable trouvé.
function extractReferenceValue(props = {}) {
  const candidates = [];

  for (const v of Object.values(props)) {
    if (typeof v !== "string") continue;
    const s = v.replace(/\s+/g, " ");

    // capture nombre 12.3 / 12,3
    const matches = s.match(/(\d{1,3}(?:[.,]\d+)?)/g);
    if (matches) {
      for (const m of matches) {
        const num = parseFloat(m.replace(",", "."));
        if (Number.isFinite(num)) candidates.push(num);
      }
    }
  }

  if (!candidates.length) return null;

  // souvent la valeur est petite (10-60). On filtre un peu.
  const plausible = candidates.filter((n) => n > 1 && n < 200);
  if (plausible.length) return plausible[0];

  return candidates[0];
}

function roundToNearestTenth(x) {
  return Math.round(x * 10) / 10;
}

function convertOne(inPath, outPath) {
  const xml = fs.readFileSync(inPath, "utf8");
  const dom = new DOMParser().parseFromString(xml);
  const gj = kml(dom);

  for (const f of (gj.features || [])) {
    f.properties = f.properties || {};
    const ref = extractReferenceValue(f.properties);
    if (Number.isFinite(ref)) {
      f.properties.ref = ref; // loyer de référence (médiane)
      f.properties.majore = roundToNearestTenth(ref * 1.2); // ✅ majoré
    }
  }

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(gj));
}

function main() {
  ensureDir(OUT_DIR);

  const files = walk(IN_DIR);
  console.log(`📦 KML trouvés: ${files.length}`);
  if (!files.length) return;

  let converted = 0;

  for (const file of files) {
    const rel = path.relative(IN_DIR, file);
    const out = path.join(OUT_DIR, rel.replace(/\.kml$/i, ".geojson"));
    convertOne(file, out);
    converted++;
  }

  console.log(`✅ GeoJSON générés: ${converted}`);
}

main();
