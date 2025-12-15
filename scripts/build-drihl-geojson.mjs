import fs from "fs";
import path from "path";
import { DOMParser } from "xmldom";
import { kml } from "@tmcw/togeojson";

const IN_DIR = path.join(process.cwd(), "assets", "data", "drihl-kml");
const OUT_DIR = path.join(process.cwd(), "assets", "data", "drihl-geojson");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(p));
    else out.push(p);
  }
  return out;
}

function roundTo10Cents(x) {
  return Math.round(x * 10) / 10;
}

function pickMedian(props) {
  // selon les KML, ça peut varier. On tente plusieurs clés.
  const candidates = [
    props.ref,
    props.refmed,
    props.median,
    props.mediane,
    props.valeur,
    props.value,
  ];

  for (const v of candidates) {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }

  // fallback: cherche la 1ère valeur numérique dans les props
  for (const [k, v] of Object.entries(props || {})) {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function mapOutPath(inFile) {
  // in:  assets/data/drihl-kml/<territory>/<folder>/file.kml
  // out: assets/data/drihl-geojson/<territory>/<folder>/file.geojson
  const rel = path.relative(IN_DIR, inFile);
  const out = rel.replace(/\.kml$/i, ".geojson");
  return path.join(OUT_DIR, out);
}

async function main() {
  ensureDir(OUT_DIR);

  const files = listFilesRecursive(IN_DIR).filter(f => f.toLowerCase().endsWith(".kml"));
  console.log(`📦 KML trouvés: ${files.length}`);

  let ok = 0;

  for (const file of files) {
    try {
      const xml = fs.readFileSync(file, "utf-8");
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const gj = kml(doc);

      // enrichit chaque feature
      for (const ft of (gj.features || [])) {
        const props = ft.properties || {};
        const ref = pickMedian(props);
        if (Number.isFinite(ref)) {
          props.ref = ref;
          props.refmaj = roundTo10Cents(ref * 1.2);
        }
        ft.properties = props;
      }

      const outPath = mapOutPath(file);
      ensureDir(path.dirname(outPath));
      fs.writeFileSync(outPath, JSON.stringify(gj));
      ok++;
    } catch (e) {
      console.warn("❌ build geojson failed:", file, e?.message || e);
    }
  }

  console.log(`✅ GeoJSON générés: ${ok}`);
}

main();
