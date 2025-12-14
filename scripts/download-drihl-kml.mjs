import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const OUT_DIR = path.join(process.cwd(), "assets", "data", "drihl-kml");

// Territoires : formats de noms légèrement différents (Paris vs banlieue)
const TERRITORIES = [
  {
    slug: "plaine-commune",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/plaine-commune",
    dateFolderTemplate: (year) => `${year}-06-01`,
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_appartement_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "est-ensemble",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/est-ensemble",
    dateFolderTemplate: (year) => `${year}-06-01`,
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_appartement_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "paris",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/paris",
    dateFolderTemplate: (year) => `${year}-07-01`,
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_${pieces}_${era}_${furnished}.kml`,
  },
];

// Périodes à couvrir (tu veux 2021-2022 → 2025-2026)
const CAMPAIGNS = [
  { label: "2021-2022", year: 2021, v: "202106_01" },
  { label: "2022-2023", year: 2022, v: "202206_01" },
  { label: "2023-2024", year: 2023, v: "202306_01" },
  { label: "2024-2025", year: 2024, v: "202406_01" },
  { label: "2025-2026", year: 2025, v: "202506_01" },
];

// On récupère la couche "medianes" (= loyer de référence).
// Le majoré (= +20%) sera calculé ensuite dans build-drihl-geojson.
const LAYERS = ["medianes"];

// Champs à tester
const PIECES = [1, 2, 3, 4];
const ERAS = ["Avant 1946", "1946-1970", "1971-1990", "Apres 1990"];
const FURNISHED = ["meuble", "non_meuble"];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function encodePathSegment(s) {
  // encodeURIComponent suffit pour les espaces/accents ; on garde les '-' et '_' OK
  return encodeURIComponent(s);
}

function buildUrl({ base, dateFolder, filename, v }) {
  // On encode le filename (contient espaces/accents)
  const fileEnc = encodePathSegment(filename);
  return `${base}/kml/${dateFolder}/${fileEnc}?v=${encodeURIComponent(v)}`;
}

function curlDownload(url, outPath) {
  // Télécharge dans outPath, échoue si HTTP != 200
  // -L follow redirects, --fail -> code erreur si 4xx/5xx
  execFileSync(
    "curl",
    ["-L", "--fail", "-A", "Mozilla/5.0", "-o", outPath, "-sS", url],
    { stdio: "ignore" }
  );
}

async function main() {
  ensureDir(OUT_DIR);

  for (const t of TERRITORIES) {
    for (const c of CAMPAIGNS) {
      const dateFolder = t.dateFolderTemplate(c.year);
      const outDir = path.join(OUT_DIR, t.slug, c.label);
      ensureDir(outDir);

      let ok = 0;
      let miss = 0;
      let debugShown = 0;

      for (const layer of LAYERS) {
        for (const pieces of PIECES) {
          for (const era of ERAS) {
            for (const furnished of FURNISHED) {
              const file = t.filename({ layer, pieces, era, furnished });
              const url = buildUrl({
                base: t.base,
                dateFolder,
                filename: file,
                v: c.v,
              });
              const outPath = path.join(outDir, file);

              try {
                curlDownload(url, outPath);
                ok++;
              } catch (e) {
                miss++;
                // Affiche quelques fails pour debug (sinon tu as "0" sans info)
                if (debugShown < 8) {
                  console.log(`❌ ${t.slug} ${c.label} fail -> ${url}`);
                  debugShown++;
                }
                // supprime un éventuel fichier vide
                try { fs.unlinkSync(outPath); } catch {}
              }
            }
          }
        }
      }

      console.log(`📦 ${t.slug} ${c.label}: ${ok} OK, ${miss} miss (folder=${dateFolder}, v=${c.v})`);
    }
  }

  console.log("🎉 Téléchargement terminé.");
}

main();
