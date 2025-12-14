import fs from "fs";
import path from "path";
import https from "https";

const url = "https://www.referenceloyer.drihl.ile-de-france.developpement-durable.gouv.fr/plaine-commune/kml/2025-06-01/drihl_medianes_appartement_3_1971-1990_meuble.kml?v=202406_01";

const outDir = path.join(process.cwd(), "tmp");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "test.kml");

https.get(url, (res) => {
  console.log("STATUS:", res.statusCode);
  console.log("CONTENT-TYPE:", res.headers["content-type"]);

  if (res.statusCode !== 200) {
    res.resume();
    return;
  }

  const file = fs.createWriteStream(outPath);
  res.pipe(file);
  file.on("finish", () => file.close(() => console.log("✅ Saved:", outPath)));
}).on("error", (e) => console.error("ERR:", e));
