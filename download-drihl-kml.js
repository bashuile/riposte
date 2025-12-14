import fs from "fs";
import path from "path";
import https from "https";

const OUT_DIR = path.join(process.cwd(), "assets", "data", "drihl-kml");

// Territoires + format de nom de fichier
const TERRITORIES = [
  {
    slug: "plaine-commune",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/plaine-commune",
    dateFolder: "2025-06-01",
    // ex: drihl_medianes_appartement_3_1971-1990_meuble.kml
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_appartement_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "est-ensemble",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/est-ensemble",
    dateFolder: "2025-06-01",
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_appartement_${pieces}_${era}_${furnished}.kml`,
  },
  {
    slug: "paris",
    base: "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/paris",
    dateFolder: "2025-07-01",
    // ex: drihl_medianes_1_1946-1970_meuble.kml
    filename: ({ layer, pieces, era, furnished }) =>
      `drihl_${layer}_${pieces}_${era}_${furnished}.kml`,
  },
];

const V_PARAM = "202406_01";

// Ce qu’on essaie de récupérer (tu peux réduire si tu veux)
const LAYERS = ["medianes", "majores", "minores"]; // on tente, celles qui n’existent pas seront ignorées
const PIECES = [1, 2, 3, 4];
const ERAS = ["Avant 1946", "1946-1970", "1971-1990", "Apres 1990"];

// ⚠️ on tente plusieurs variantes, car certains sites utilisent "meuble"/"non_meuble",
// d’autres "meuble"/"nonmeuble" etc. On essaie les 2 formes les plus probables.
const FURNISHED_VARIANTS = ["meuble", "non_meuble"];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function download(url, outPath) {
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ ok: false, status: res.statusCode });
        }
        ensureDir(path.dirname(outPath));
        const file = fs.createWriteStream(outPath);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve({ ok: true, status: 200 })));
      })
      .on("error", (err) => resolve({ ok: false, error: err.message }));
  });
}

async function main() {
  ensureDir(OUT_DIR);

  for (const t of TERRITORIES) {
    const tDir = path.join(OUT_DIR, t.slug);
    ensureDir(tDir);

    let okCount = 0;

    for (const layer of LAYERS) {
      for (const pieces of PIECES) {
        for (const era of ERAS) {
          for (const furnished of FURNISHED_VARIANTS) {
            const file = t.filename({ layer, pieces, era, furnished });
            const url = `${t.base}/kml/${t.dateFolder}/${file}?v=${V_PARAM}`;
            const out = path.join(tDir, file);

            const r = await download(url, out);
            if (r.ok) {
              okCount++;
              console.log(`✅ ${t.slug} OK: ${file}`);
            } else {
              // normal: beaucoup de combinaisons inexistantes
              // console.log(`… ${t.slug} ${file} -> ${r.status || r.error}`);
            }
          }
        }
      }
    }

    console.log(`📦 ${t.slug}: ${okCount} fichiers téléchargés`);
  }

  console.log("🎉 Téléchargement terminé.");
}

main();
