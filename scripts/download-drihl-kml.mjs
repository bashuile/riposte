import fs from "fs";
import path from "path";
import { execFile } from "child_process";

const OUT_DIR = path.join(process.cwd(), "assets", "data", "drihl-kml");

// HTTP (comme tes URLs qui marchent)
const TERRITORIES = [
  {
    slug: "plaine-commune",
    base: "http://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/plaine-commune",
    // si tu veux VRAIMENT appartements-only: mets ["appartement"]
    dwellingTypes: ["appartement"],
    folders: ["2021-06-01", "2022-06-01", "2023-06-01", "2024-06-01", "2025-06-01"],
    filename: ({ pieces, era, furnished, dwelling }) =>
      `drihl_medianes_${dwelling}_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "est-ensemble",
    base: "http://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/est-ensemble",
    dwellingTypes: ["appartement"],
    folders: ["2021-06-01", "2022-06-01", "2023-06-01", "2024-06-01", "2025-06-01"],
    filename: ({ pieces, era, furnished, dwelling }) =>
      `drihl_medianes_${dwelling}_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "paris",
    base: "http://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/paris",
    dwellingTypes: [null], // pas dans le nom
    folders: ["2021-07-01", "2022-07-01", "2023-07-01", "2024-07-01", "2025-07-01"],
    filename: ({ pieces, era, furnished }) =>
      `drihl_medianes_${pieces}_${era}_${furnished}.kml`,
  },
];

const V_PARAM = "202406_01";
const PIECES = [1, 2, 3, 4];

// ✅ normalisé DRIHL
const ERAS = ["inf1946", "1946-1970", "1971-1990", "sup1990"];
const FURNISHED = ["meuble", "non-meuble"]; // ✅ tiret

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
        "--connect-timeout", "15",
        "--max-time", "60",
        "--http1.1",
        "-A", "Mozilla/5.0",
        "-o", outPath,
        url,
      ],
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: (stderr || err.message).trim() });
        resolve({ ok: true });
      }
    );
  });
}

async function main() {
  ensureDir(OUT_DIR);

  for (const t of TERRITORIES) {
    let okCount = 0;
    let missCount = 0;

    for (const folder of t.folders) {
      const folderDir = path.join(OUT_DIR, t.slug, folder);
      ensureDir(folderDir);

      for (const pieces of PIECES) {
        for (const era of ERAS) {
          for (const furnished of FURNISHED) {
            for (const dwelling of t.dwellingTypes) {
              const file = t.filename({ pieces, era, furnished, dwelling });
              const url = `${t.base}/kml/${folder}/${file}?v=${V_PARAM}`;
              const out = path.join(folderDir, file);

              const r = await curlDownload(url, out);
              if (r.ok) {
                okCount++;
                console.log(`✅ ${t.slug} OK: ${folder}/${file}`);
              } else {
                missCount++;
                if (missCount <= 8) console.log(`❌ ${t.slug} miss: ${folder}/${file}`);
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
