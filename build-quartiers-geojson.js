import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, "assets/data/logement-encadrement-des-loyers.csv");
const OUT_PATH = path.join(__dirname, "dist", "quartiers-all.geojson");

// CSV parser ; avec quotes + "" (quote échappée)
function parseCSVLine(line, sep = ";") {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === '"') {
      // "" داخل champ quoted => un seul "
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (c === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += c;
  }
  out.push(cur);
  return out;
}

function cleanHeader(h) {
  return h.replace(/^\uFEFF/, "").trim(); // enlève BOM
}

function parseGeoShape(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // raw est déjà "déquoté" par parseCSVLine (on gère "" -> ")
  // donc ici c'est un JSON normal : {"type":"Polygon"...}
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function build() {
  console.log("📄 Lecture:", CSV_PATH);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  const input = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let headers = null;
  let idx = null;

  const seen = new Set();
  const features = [];

  let n = 0;
  let kept = 0;

  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVLine(line).map(cleanHeader);
      idx = Object.fromEntries(headers.map((h, i) => [h, i]));
      console.log("✅ En-têtes:", headers);

      // Vérif colonnes indispensables
      const required = [
        "Numéro INSEE du quartier",
        "Nom du quartier",
        "Ville",
        "geo_shape",
      ];
      for (const r of required) {
        if (!(r in idx)) {
          console.error("❌ Colonne manquante:", r);
          console.error("👉 Colonnes dispo:", headers);
          process.exit(1);
        }
      }
      continue;
    }

    if (!line.trim()) continue;
    n++;
    if (n % 200000 === 0) {
      console.log(`⏳ ${n.toLocaleString()} lignes lues, ${kept.toLocaleString()} quartiers gardés...`);
    }

    const cols = parseCSVLine(line);
    const insee = (cols[idx["Numéro INSEE du quartier"]] || "").trim();
    if (!insee || seen.has(insee)) continue;

    const name = (cols[idx["Nom du quartier"]] || "").trim();
    const city = (cols[idx["Ville"]] || "").trim();
    const geoRaw = cols[idx["geo_shape"]] || "";

    const geometry = parseGeoShape(geoRaw);
    if (!geometry || !geometry.type || !geometry.coordinates) continue;

    seen.add(insee);
    kept++;

    features.push({
      type: "Feature",
      geometry,
      properties: {
        insee_quartier: Number(insee),
        nom_quartier: name || null,
        ville: city || null,
      },
    });
  }

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify({ type: "FeatureCollection", features })
  );

  console.log(`✅ quartiers-all.geojson généré (${features.length} quartiers)`);
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
