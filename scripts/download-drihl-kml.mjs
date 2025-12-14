import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const OUT_DIR = path.join(process.cwd(), "assets", "data", "drihl-kml");

// On essaie en priorité ce v (celui de tes URLs qui marchent)
const V_TRY = ["202406_01", "202306_01", "202206_01", "202106_01", "202506_01"];

// On essaie plusieurs dossiers de date (plaine/est: 06-01, paris: 07-01)
function dateFoldersFor06() {
  return ["2025-06-01", "2024-06-01", "2023-06-01", "2022-06-01", "2021-06-01"];
}
function dateFoldersFor07() {
  return ["2025-07-01", "2024-07-01", "2023-07-01", "2022-07-01", "2021-07-01"];
}

const TERRITORIES = [
  {
    slug: "plaine-commune",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/plaine-commune",
    dateFolders: dateFoldersFor06(),
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_appartement_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "est-ensemble",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/est-ensemble",
    dateFolders: dateFoldersFor06(),
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_appartement_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "paris",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/paris",
    dateFolders: dateFoldersFor07(),
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_${pieces}_${era}_${furnished}.kml`,
  },
];

// On commence petit : on télécharge les MEDIANES (= ref). Le majoré sera calculé après.
const LAYERS = ["medianes"];
const PIECES = [1, 2, 3, 4];

// Important: dans TES URLs, les eras sont "1971-1990" etc, et "Apres 1990" sans accent.
// Pour "Avant 1946", le site peut aussi utiliser "Avant 1946" (avec espace).
// On garde ça mais on encode correctement dans l’URL via encodeURI(file).
const ERAS = ["Avant 1946", "1946-1970", "1971-1990", "Apres 1990"];

// Tes URLs utilisent "meuble" / "non_meuble"
const FURNISHED = ["meuble", "non_meuble"];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function curlDownload(url, outPath) {
  // -L follow redirects, --fail -> erreur si 4xx/5xx
  execFileSync("curl", ["-L", "--fail", "-A", "Mozilla/5.0", "-o", outPath, "-sS", url], {
    stdio: "ignore",
  });
}

function tryDownload(urls, outPath) {
  for (const url of urls) {
    try {
      curlDownload(url, outPath);
      return { ok: true, url };
    } catch {
      // ignore
    }
  }
  try { fs.unlinkSync(outPath); } catch {}
  return { ok: false };
}

async function main() {
  ensureDir(OUT_DIR);

  for (const t of TERRITORIES) {
    const tDir = path.join(OUT_DIR, t.slug);
    ensureDir(tDir);

    let ok = 0;
    let miss = 0;
    let shownFails = 0;

    for (const layer of LAYERS) {
      for (const pieces of PIECES) {
        for (const era of ERAS) {
          for (const furnished of FURNISHED) {
            const file = t.filename({ layer, pieces, era, furnished });

            // IMPORTANT: on encode le filename pour gérer espaces/accents proprement
            const fileEnc = encodeURI(file);

            // On tente plusieurs combinaisons folder + v
            const urls = [];
            for (const folder of t.dateFolders) {
              for (const v of V_TRY) {
                urls.push(`${t.base}/kml/${folder}/${fileEnc}?v=${encodeURIComponent(v)}`);
              }
            }

            // On range par "territoire/filename" (pas par campagne pour l’instant)
            const outPath = path.join(tDir, file.replaceAll("/", "_"));

            const r = tryDownload(urls, outPath);
            if (r.ok) {
              ok++;
            } else {
              miss++;
              if (shownFails < 6) {
                console.log(`❌ ${t.slug} fail for: ${file} (example tried: ${urls[0]})`);
                shownFails++;
              }
            }
          }
        }
      }
    }

    console.log(`📦 ${t.slug}: ${ok} OK, ${miss} miss`);
  }

  console.log("🎉 Téléchargement terminé.");
}

main();
