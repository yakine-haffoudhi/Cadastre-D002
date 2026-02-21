import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// --------------------
// Helpers
// --------------------
function safeLike(s) {
  return `%${String(s ?? "").trim()}%`;
}

function isValidSiren(s) {
  return /^\d{9}$/.test(String(s || ""));
}


function extractSirenAndOwner(obj) {
  if (!obj || typeof obj !== "object") return { siren: null, owner: null };

  const keys = Object.keys(obj).map((k) => k.toLowerCase());

  // siren
  let siren = null;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase().includes("siren")) {
      siren = obj[k];
      break;
    }
  }

  // owner / denomination 
  const ownerCandidates = [
    "denomination",
    "denom",
    "raison",
    "rs",
    "nom",
    "propriet",
    "owner",
    "titulaire",
  ];

  let owner = null;
  for (const k of Object.keys(obj)) {
    const lk = k.toLowerCase();
    if (ownerCandidates.some((c) => lk.includes(c))) {
      owner = obj[k];
      break;
    }
  }

  return { siren, owner };
}

// Essaye de trouver un dataset MAJIC public pertinent sur Opendatasof

async function discoverMajicDataset() {
  const searchUrl =
    "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets" +
    "?where=" +
    encodeURIComponent("dataset_id like 'majic%parcell%'") +
    "&limit=20";

  const r = await fetch(searchUrl);
  if (!r.ok) return null;

  const j = await r.json();
  const ds = j.results?.[0]?.dataset_id ?? null;
  return ds;
}

// --------------------
// Healthcheck
// --------------------
app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: r.rows[0].ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});


app.get("/parcelles", async (req, res) => {
  const { bbox, limit, commune } = req.query;
  const lim = Math.min(parseInt(limit || "200", 10) || 200, 2000);

  if (!bbox) {
    return res.status(400).json({
      error: "bbox requis: minx,miny,maxx,maxy (EPSG:2154)",
    });
  }

  const parts = String(bbox).split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return res.status(400).json({
      error: "bbox invalide. Exemple: 700000,6900000,705000,6905000",
    });
  }
  const [minx, miny, maxx, maxy] = parts;
  const communeStr = commune ? safeLike(commune) : null;

  try {
    const sql = `
      SELECT
        gid,
        ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb AS geometry,
        jsonb_build_object(
          'idu', idu,
          'numero', numero,
          'feuille', feuille,
          'section', section,
          'code_dep', code_dep,
          'nom_com', nom_com,
          'code_com', code_com,
          'code_arr', code_arr,
          'contenance', contenance
        ) AS properties
      FROM parcelles
      WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,2154)
        AND ST_Intersects(geom, ST_MakeEnvelope($1,$2,$3,$4,2154))
        AND ($6::text IS NULL OR nom_com ILIKE $6)
      LIMIT $5;
    `;

    const r = await pool.query(sql, [minx, miny, maxx, maxy, lim, communeStr]);

    res.json({
      type: "FeatureCollection",
      features: r.rows.map((row) => ({
        type: "Feature",
        id: row.gid,
        geometry: row.geometry,
        properties: row.properties,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});


app.get("/parcelles-view", async (req, res) => {
  const { bbox, limit, commune } = req.query;
  const lim = Math.min(parseInt(limit || "200", 10) || 200, 2000);

  if (!bbox) {
    return res.status(400).json({
      error: "bbox requis: minLon,minLat,maxLon,maxLat (EPSG:4326)",
    });
  }

  const parts = String(bbox).split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return res.status(400).json({
      error: "bbox invalide. Exemple: 2.9,49.3,3.1,49.5",
    });
  }
  const [minLon, minLat, maxLon, maxLat] = parts;
  const communeStr = commune ? safeLike(commune) : null;

  try {
    const sql = `
      WITH env AS (
        SELECT ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326), 2154) AS e
      )
      SELECT
        p.gid,
        ST_AsGeoJSON(ST_Transform(p.geom, 4326))::jsonb AS geometry,
        jsonb_build_object(
          'idu', p.idu,
          'numero', p.numero,
          'feuille', p.feuille,
          'section', p.section,
          'code_dep', p.code_dep,
          'nom_com', p.nom_com,
          'code_com', p.code_com,
          'code_arr', p.code_arr,
          'contenance', p.contenance
        ) AS properties
      FROM parcelles p, env
      WHERE p.geom && env.e
        AND ST_Intersects(p.geom, env.e)
        AND ($6::text IS NULL OR p.nom_com ILIKE $6)
      LIMIT $5;
    `;

    const r = await pool.query(sql, [minLon, minLat, maxLon, maxLat, lim, communeStr]);

    res.json({
      type: "FeatureCollection",
      features: r.rows.map((row) => ({
        type: "Feature",
        id: row.gid,
        geometry: row.geometry,
        properties: row.properties,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * GET /parcelles/:gid
 */
app.get("/parcelles/:gid", async (req, res) => {
  const gid = Number(req.params.gid);
  if (Number.isNaN(gid)) return res.status(400).json({ error: "gid invalide" });

  try {
    const sql = `
      SELECT
        gid,
        ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb AS geometry,
        jsonb_build_object(
          'idu', idu,
          'numero', numero,
          'feuille', feuille,
          'section', section,
          'code_dep', code_dep,
          'nom_com', nom_com,
          'code_com', code_com,
          'code_arr', code_arr,
          'contenance', contenance
        ) AS properties
      FROM parcelles
      WHERE gid = $1
      LIMIT 1;
    `;
    const r = await pool.query(sql, [gid]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });

    const row = r.rows[0];
    res.json({ type: "Feature", id: row.gid, geometry: row.geometry, properties: row.properties });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * GET /parcelles-by-idu/:idu
 */
app.get("/parcelles-by-idu/:idu", async (req, res) => {
  const idu = String(req.params.idu || "").trim();
  if (!idu) return res.status(400).json({ error: "idu requis" });

  try {
    const sql = `
      SELECT
        gid,
        ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb AS geometry,
        jsonb_build_object(
          'idu', idu,
          'numero', numero,
          'feuille', feuille,
          'section', section,
          'code_dep', code_dep,
          'nom_com', nom_com,
          'code_com', code_com,
          'code_arr', code_arr,
          'contenance', contenance
        ) AS properties
      FROM parcelles
      WHERE idu = $1
      LIMIT 1;
    `;

    const r = await pool.query(sql, [idu]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });

    const row = r.rows[0];
    res.json({ type: "Feature", id: row.gid, geometry: row.geometry, properties: row.properties });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --------------------------------------------------------------------
// 5) Owner / SIREN via MAJIC (API)
// --------------------------------------------------------------------

const DEFAULT_MAJIC_DATASET_ID = "fichiers-des-parcelles-des-personnes-morales-majic"; // fallback (peut varier)
function majicRecordsUrl(datasetId) {
  return `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${datasetId}/records`;
}

async function queryMajicByIdu(datasetId, idu) {
  const base = majicRecordsUrl(datasetId);

  const whereCandidates = [
    `idu='${idu}'`,
    `parcelle_idu='${idu}'`,
    `idu_parcelle='${idu}'`,
  ];

  for (const where of whereCandidates) {
    const url = `${base}?where=${encodeURIComponent(where)}&limit=1`;
    const r = await fetch(url);
    if (!r.ok) continue;

    const j = await r.json();
    const first = j.results?.[0] ?? null;
    if (first) return { ok: true, first, whereUsed: where };
  }

  return { ok: true, first: null, whereUsed: null };
}

app.get("/parcelles/:gid/owner", async (req, res) => {
  const gid = Number(req.params.gid);
  if (Number.isNaN(gid)) return res.status(400).json({ error: "gid invalide" });

  try {
    // 1) récupérer IDU depuis PostGIS
    const r = await pool.query(`SELECT gid, idu FROM parcelles WHERE gid = $1 LIMIT 1`, [gid]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Parcelle introuvable" });

    const { idu } = r.rows[0];

    // 2) appeler MAJIC
    let datasetId = DEFAULT_MAJIC_DATASET_ID;
    let majic = await queryMajicByIdu(datasetId, idu);

    // Si aucun résultat, on tente une "découverte" (dataset_id MAJIC différent)
    if (majic.ok && !majic.first) {
      const discovered = await discoverMajicDataset();
      if (discovered && discovered !== datasetId) {
        datasetId = discovered;
        majic = await queryMajicByIdu(datasetId, idu);
      }
    }

    if (majic.ok && !majic.first) {
      return res.json({
        gid,
        idu,
        siren: null,
        owner: null,
        note:
          "Aucun propriétaire personne morale trouvé via MAJIC (les personnes physiques ne sont généralement pas couvertes).",
        source: `MAJIC (dataset: ${datasetId})`,
      });
    }

    if (!majic.ok) {
      return res.status(502).json({ error: "Erreur MAJIC" });
    }

    const { siren, owner } = extractSirenAndOwner(majic.first);

    res.json({
      gid,
      idu,
      siren: siren ?? null,
      owner: owner ?? null,
      where: majic.whereUsed,
      source: `MAJIC (dataset: ${datasetId})`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --------------------------------------------------------------------
//  infos entreprise via API "recherche-entreprises"
// --------------------------------------------------------------------

app.get("/siren/:siren", async (req, res) => {
  const siren = String(req.params.siren || "").trim();

  if (!isValidSiren(siren)) {
    return res.status(400).json({ error: "SIREN invalide (9 chiffres)" });
  }

  try {
    const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(
      siren
    )}&page=1&per_page=1`;

    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: `API siren HTTP ${r.status}` });

    const data = await r.json();
    const first = data.results?.[0] ?? null;
    if (!first) return res.status(404).json({ error: "Entreprise non trouvée" });

    res.json(first);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`API running: http://localhost:${port}`));