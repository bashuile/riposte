import fs from "fs";
import path from "path";
import { execFile } from "child_process";

const OUT_DIR = path.join(process.cwd(), "assets", "data", "drihl-kml");

// On utilise HTTP (comme tes exemples) + curl -L pour suivre redirections si besoin.
const TERRITORIES = [
  {
    slug: "est-ensemble",
    base: "http://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/est-ensemble",
    // est-ensemble: uniquement "appartement"
    dwellingTypes: ["appartement"],
    // dossiers observés: 2023-06-01 fonctionne (d’après toi)
    dateFolders: ["2021-06-01", "2022-06-01", "2023-06-01", "2024-06-01", "2025-06-01"],
    filename: ({ layer, dwelling, pieces, era, furnished }) =>
      `drihl_${layer}_${dwelling}_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "plaine-commune",
    base: "http://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/plaine-commune",
    // plaine-commune: "maison" ET "appartement" (tu as un exemple maison)
    dwellingTypes: ["appartement", "maison"],
    dateFolders: ["2021-06-01", "2022-06-01", "2023-06-01", "2024-06-01", "2025-06-01"],
    filename: ({ layer, dwelling, pieces, era, furnished }) =>
      `drihl_${layer}_${dwelling}_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "paris",
    base: "http://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/paris",
    // paris: pas de dwelling dans le nom
    dwellingTypes: [null],
    // d’après ton exemple: 2025-07-01
    // (on tente aussi 06-01 pour les autres millésimes)
    dateFolders: ["2021-07-01", "2022-07-01", "2023-07-01", "2024-07-01", "2025-07-01", "2021-06-01", "2022-06-01", "2023-06-01", "2024-06-01", "2025-06-01"],
    filename: ({ layer, dwelling, pieces, era, furnished }) =>
      `drihl_${layer}_${pieces}_${era}_${furnished}.kml`,
  },
];

// Version param (on garde ton exemple)
const V_PARAM = "202406_01";

// On télécharge uniquement "medianes" : ensuite tu calcules majore = ref * 1.2
const LAYERS = ["medianes"];
const PIECES = [1, 2, 3, 4];
const ERAS = ["inf1946", "1946-1970", "1971-1990", "sup1990"];
const FURNISHED = ["meuble", "non-meuble"];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function curlDownload(url, outPath) {
  return new Promise((resolve) => {
    ensureDir(path.dirname(outPath));

    execFile(
      "curl",
      [
        "-L",
        "--fail",
        "--silent",
        "--show-error",
        "--retry", "3",
        "--retry-delay", "1",
        "--connect-timeout", "10",
        "--max-time", "40",
        "--http1.1",
        "-A", "Mozilla/5.0",
        "-o", outPath,
        url,
      ],
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: (stderr || err.message).trim() });
        return resolve({ ok: true });
      }
    );
  });
}

async function main() {
  ensureDir(OUT_DIR);

  for (const t of TERRITORIES) {
    const tDir = path.join(OUT_DIR, t.slug);
    ensureDir(tDir);

    let okCount = 0;
    let missCount = 0;

    for (const folder of t.dateFolders) {
      const folderDir = path.join(tDir, folder);
      ensureDir(folderDir);

      for (const layer of LAYERS) {
        for (const pieces of PIECES) {
          for (const era of ERAS) {
            for (const furnished of FURNISHED) {
              for (const dwelling of t.dwellingTypes) {
                const file = t.filename({ layer, dwelling, pieces, era, furnished });
                const url = `${t.base}/kml/${folder}/${file}?v=${V_PARAM}`;
                const out = path.join(folderDir, file);

                const r = await curlDownload(url, out);
                if (r.ok) {
                  okCount++;
                  console.log(`✅ ${t.slug} OK: ${folder}/${file}`);
                } else {
                  missCount++;
                  // bruit contrôlé: on log seulement quelques erreurs
                  if (missCount <= 8) {
                    console.log(`❌ ${t.slug} miss: ${folder}/${file}`);
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`📦 ${t.slug}: ${okCount} OK, ${missCount} miss`);
  }

  console.log("🎉 Téléchargement terminé.");
}

main();
