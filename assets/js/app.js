console.log("✅ app.js chargé");

// ============================================================================
// 0) CONFIG
// ============================================================================
const RENT_INDEX_BASE = "/assets/data/rent-index";
const PARIS_QUARTIERS_URL = "/assets/data/quartiers-all.geojson";

// ============================================================================
// 1) ZONES – CODES INSEE (pour afficher le nom zone)
// ============================================================================
const PLAINE_COMMUNE_CODES = [
  "93066","93001","93051","93070","93031","93078","93039","93073"
];

const EST_ENSEMBLE_CODES = [
  "93048","93006","93014","93030","93055","93061","93071","93007","93050"
];

function detectRentControlZone(citycode) {
  citycode = String(citycode || "").trim();
  if (!citycode) return null;

  if (citycode.startsWith("75")) return { type: "paris", name: "Paris" };
  if (PLAINE_COMMUNE_CODES.includes(citycode)) return { type: "plaine", name: "Plaine Commune" };
  if (EST_ENSEMBLE_CODES.includes(citycode)) return { type: "est", name: "Est Ensemble" };

  return null;
}


// ============================================================================
// 2) AUTOCOMPLETE ADRESSE
// ============================================================================
function initAddressAutocomplete() {
  const input = document.getElementById("address-input");
  const list = document.getElementById("address-suggestions");
  if (!input || !list) return;

  let debounceTimer = null;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();

    if (query.length < 3) {
      list.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(() => {
      fetchAddressSuggestions(query, list, input);
    }, 250);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".field")) list.innerHTML = "";
  });
}

async function fetchAddressSuggestions(query, list, input) {
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`;

  try {
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();
    list.innerHTML = "";

    (data.features || []).forEach((f) => {
      const li = document.createElement("li");
      li.textContent = f.properties.label;

      li.addEventListener("click", () => {
        input.value = f.properties.label;
        list.innerHTML = "";
      });

      list.appendChild(li);
    });
  } catch (e) {
    console.error("❌ Autocomplete error:", e);
  }
}

// ============================================================================
// 3) GÉOCODAGE
// ============================================================================
async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;

  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.features?.length) return null;

  const f = data.features[0];
  const p = f.properties;

  return {
    label: p.label,
    city: p.city,
    citycode: p.citycode,
    postcode: p.postcode,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  };
}

// ============================================================================
// 4) QUARTIERS (GeoJSON local) + POINT IN POLYGON
// ============================================================================
let PARIS_QUARTIERS = null;

async function loadParisQuartiers() {
  if (PARIS_QUARTIERS) return PARIS_QUARTIERS;

  const res = await fetch(PARIS_QUARTIERS_URL);
  if (!res.ok) throw new Error(`Impossible de charger ${PARIS_QUARTIERS_URL} (${res.status})`);

  const data = await res.json();
  PARIS_QUARTIERS = data.features || [];
  console.log("🏙️ villes uniques:", [...new Set(PARIS_QUARTIERS.map(f => f.properties?.ville).filter(Boolean))].slice(0, 30));
  console.log("🔢 nb features:", PARIS_QUARTIERS.length);
  console.log("📍 Quartiers chargés :", PARIS_QUARTIERS.length);

  return PARIS_QUARTIERS;
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(point, geometry) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInRing(point, geometry.coordinates[0]);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(poly => pointInRing(point, poly[0]));
  }

  return false;
}

async function getQuarterId(lat, lon) {
  const quarters = await loadParisQuartiers();
  const point = [lon, lat];

  for (const f of quarters) {
    if (geometryContainsPoint(point, f.geometry)) {
      return {
        id: f.properties.insee_quartier,
        name: f.properties.nom_quartier || f.properties.ville || null, // Nom du quartier

      };
    }

  }

  return null;
}
//console.log("🏷️ quartier:", quartier);
// ============================================================================
// 5) INDEX DES LOYERS (JSON par année)
// ============================================================================
const RENT_INDEX_CACHE = {};

async function loadRentIndex(year) {
  const y = String(year || "").trim();
  if (!y) return null;

  if (RENT_INDEX_CACHE[y]) return RENT_INDEX_CACHE[y];

  const url = `${RENT_INDEX_BASE}/rents-${y}.json`;
  const res = await fetch(url);

  if (!res.ok) {
    console.warn("❌ Index introuvable:", url, res.status);
    return null;
  }

  const data = await res.json();
  RENT_INDEX_CACHE[y] = data;
  return data;
}

function makeRentKey({ quartier, rooms, constructionEra, furnished }) {
  // constructionEra: old | mid | late | new (valeurs du form)
  return [
    String(quartier),
    String(rooms),
    String(constructionEra),
    furnished ? "f" : "u",
  ].join("|");
}

async function getMajoratedPerM2({ year, quartier, rooms, constructionEra, furnished }) {
  const index = await loadRentIndex(year);
  if (!index) return null;

  const key = makeRentKey({ quartier, rooms, constructionEra, furnished });
  return index[key] ?? null;
}

// ============================================================================
// 6) CALCUL PRINCIPAL
// ============================================================================
async function computeRentControl({
  address,
  surface,
  rent,
  furnished,       // "furnished" | "unfurnished"
  rooms,           // 1..4
  leasePeriod,     // année ex "2023"
  constructionEra, // old|mid|late|new
}) {
  const geo = await geocodeAddress(address);
  if (!geo) return { error: "notInZone" };

  console.log("🧭 GEO:", geo);
  console.log("🧭 citycode:", geo.citycode);

  const zone = detectRentControlZone(geo.citycode);
  console.log("🧭 zone detectée:", zone);

  if (!zone) return { error: "notInZone" };


  const quartier = await getQuarterId(geo.lat, geo.lon);
  if (!quartier) return { error: "notFound" };

  const majoratedPerM2 = await getMajoratedPerM2({
    year: leasePeriod,
    quartier: quartier.id,
    rooms,
    constructionEra,
    furnished: furnished === "furnished",
  });

  if (!majoratedPerM2) return { error: "notFound" };

  return {
    zone,
    quartier,
    majoratedPerM2,
    legalMax: majoratedPerM2 * surface,
  };
}

// ============================================================================
// 7) FORMULAIRE
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initAddressAutocomplete();

  const form = document.querySelector(".hero-form");
  const resultBox = document.getElementById("hero-result");
  if (!form || !resultBox) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fd = new FormData(form);

    const address = fd.get("address");
    const surface = parseFloat(fd.get("surface"));
    const rent = parseFloat(fd.get("rent"));
    const furnished = fd.get("furnished");
    let rooms = Number(fd.get("rooms") || 1);
    if (rooms > 4) rooms = 4;

    const leasePeriod = String(fd.get("leasePeriod") || "").trim(); // ex "2023"
    const constructionEra = String(fd.get("constructionEra") || "").trim(); // old/mid/late/new

    resultBox.textContent = "Calcul en cours…";

    let out;
    try {
      out = await computeRentControl({
        address,
        surface,
        rent,
        furnished,
        rooms,
        leasePeriod,
        constructionEra,
      });
    } catch (err) {
      console.error("❌ computeRentControl error:", err);
      resultBox.textContent = "Erreur pendant le calcul (voir console)";
      return;
    }

    if (out.error) {
      resultBox.textContent = t(`results.${out.error}`);
      return;
    }

    if (rent <= out.legalMax) {
      resultBox.textContent = t("results.ok", {
        rent,
        legalMax: out.legalMax.toFixed(0),
      });
      resultBox.className = "hero-result hero-result--ok";
    } else {
      resultBox.textContent = t("results.high", {
        rent,
        legalMax: out.legalMax.toFixed(0),
        diff: (rent - out.legalMax).toFixed(0),
      });
      resultBox.className = "hero-result hero-result--high";
    }
  });
});
