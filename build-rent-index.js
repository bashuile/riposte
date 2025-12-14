import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================
// CONFIG
// ============================
const CSV_PATH = path.join(__dirname, "assets/data/logement-encadrement-des-loyers.csv");
const OUT_DIR = path.join(__dirname, "dist");

// ============================
// NORMALISATION
// ============================
const ERA_MAP = {
  "avant 1946": "old",
  "1946-1970": "mid",
  "1971-1990": "late",
  "apres 1990": "new",
};

function normalizeEra(v) {
  if (!v) return null;
  return ERA_MAP[v.trim().toLowerCase()] || null;
}

function normalizeFurnished(v) {
  return v && v.toLowerCase().includes("meubl");
}

function makeKey({ quartier, pieces, era, furnished }) {
  return [
    quartier,
    pieces,
    era,
    furnished ? "f" : "u",
  ].join("|");
}

// ============================
// MAIN
// ============================
async function build() {
  console.log("📄 Lecture:", CSV_PATH);

  const input = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({ input });

  let headers = [];
  const byYear = {};

  for await (const line of rl) {
    if (!headers.length) {
      headers = line.split(";").map(h => h.replace(/^﻿/, "").trim());
      continue;
    }

    const cols = line.split(";");
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i]]));

    const year = row["Année"];
    const quartier = row["Numéro INSEE du quartier"]; // ✅ clé unique
    const pieces = row["Nombre de pièces principales"];
    const era = normalizeEra(row["Epoque de construction"]);
    const furnished = normalizeFurnished(row["Type de location"]);

    const max = parseFloat(
      (row["Loyers de référence majorés"] || "").replace(",", ".")
    );

    if (!year || !quartier || !pieces || !era || !Number.isFinite(max)) continue;

    if (!byYear[year]) byYear[year] = {};

    const key = makeKey({
      quartier,
      pieces,
      era,
      furnished,
    });

    byYear[year][key] = max;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const year of Object.keys(byYear)) {
    const outPath = path.join(OUT_DIR, `rents-${year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(byYear[year]));
    console.log(`✅ rents-${year}.json généré (${Object.keys(byYear[year]).length} entrées)`);
  }
}

build();
