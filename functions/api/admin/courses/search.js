// GET /api/admin/courses/search?lat=...&lng=...&radius_km=40
//
// Looks up nearby golf courses from OpenStreetMap via the Overpass API.
// Tries multiple Overpass mirrors in order so a single instance throttling
// (which the public main instance does aggressively) doesn't blank the
// wizard. Surfaces upstream status to the response so the UI can tell the
// user "the OSM service is down" vs "no courses tagged near you".
//
// Why OSM/Overpass:
//   - Free, no API key, no auth header required.
//   - Coverage is broad; names + coordinates are very reliable.
//   - Per-hole pars are rarely tagged — we default all 18 holes to par 4
//     when the organizer picks an OSM course; they can edit later.

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function err(message, status = 400) { return json({ error: message }, status); }

function clampRadiusMeters(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return 40_000; // default 40 km ≈ 25 mi
  return Math.min(Math.max(n * 1000, 1_000), 80_000);
}

function buildOverpassQuery(lat, lng, radiusM) {
  // Match anything that looks like a golf course: leisure=golf_course is
  // canonical, but some POIs use golf=course or just sport=golf without
  // the leisure tag. Also include `out center tags` so ways/relations
  // resolve to a representative point.
  return `
[out:json][timeout:20];
(
  nwr["leisure"="golf_course"](around:${radiusM},${lat},${lng});
  nwr["golf"="course"](around:${radiusM},${lat},${lng});
);
out center tags;
`.trim();
}

function normalize(el) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  // Skip tagged things we don't want to surface as a course (driving
  // ranges, mini-golf). Caller doesn't see these.
  if (tags.golf === 'driving_range' || tags.leisure === 'miniature_golf') return null;
  if (!tags.name) return null;

  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || null;
  const state = tags['addr:state'] || tags['addr:region'] || null;
  const country = tags['addr:country'] || null;

  const holesRaw = tags['golf:holes'] || tags.holes;
  const holes = holesRaw && /^\d+$/.test(holesRaw) ? parseInt(holesRaw, 10) : null;
  const totalPar = tags['golf:par'] && /^\d+$/.test(tags['golf:par'])
    ? parseInt(tags['golf:par'], 10)
    : null;

  return {
    osm_id: `${el.type}/${el.id}`,
    name: tags.name,
    lat, lng: lon,
    city, state, country,
    holes_hint: holes,
    total_par_hint: totalPar,
    website: tags.website || tags['contact:website'] || null,
    phone:   tags.phone   || tags['contact:phone']   || null,
  };
}

function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Try each mirror until one returns a 2xx. Records the per-mirror outcome
// so the response can surface what actually happened (helpful when 0 hits
// is upstream failure vs genuine sparse area).
async function fetchFromMirrors(query) {
  const attempts = [];
  for (const url of OVERPASS_MIRRORS) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Polite UA so Overpass operators can identify the integration
          // if anything odd ever surfaces in their logs.
          'User-Agent': 'fairways-live/1.0 (https://fairwayslive.app; admin@fairwayslive.app)',
        },
        body: 'data=' + encodeURIComponent(query),
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (resp.ok) {
        const j = await resp.json();
        attempts.push({ url, status: resp.status, ok: true });
        return { json: j, mirror: url, attempts };
      }
      attempts.push({ url, status: resp.status, ok: false });
    } catch (e) {
      attempts.push({ url, error: String(e?.message || e), ok: false });
    }
  }
  return { json: null, mirror: null, attempts };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return err('lat and lng query params required');
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return err('lat/lng out of range');

  const radiusM = clampRadiusMeters(url.searchParams.get('radius_km'));
  const query = buildOverpassQuery(lat, lng, radiusM);

  const { json: osmJson, mirror, attempts } = await fetchFromMirrors(query);

  // All mirrors failed. Surface that distinctly so the UI can say "OSM
  // unreachable, try again" rather than the misleading "no courses found".
  if (!osmJson) {
    return new Response(JSON.stringify({
      center: { lat, lng },
      radius_km: radiusM / 1000,
      results: [],
      upstream: 'unreachable',
      attempts,
      source: 'osm',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const here = { lat, lng };
  const results = (osmJson.elements || [])
    .map(normalize)
    .filter(Boolean)
    .reduce((acc, c) => {
      // Dedupe identical features tagged as both node and relation.
      const key = `${c.name}|${c.lat.toFixed(3)}|${c.lng.toFixed(3)}`;
      if (!acc._seen.has(key)) {
        acc._seen.add(key);
        acc.list.push(c);
      }
      return acc;
    }, { list: [], _seen: new Set() })
    .list
    .map((c) => ({ ...c, distance_km: Number(distanceKm(here, c).toFixed(2)) }))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 25);

  return new Response(JSON.stringify({
    center: { lat, lng },
    radius_km: radiusM / 1000,
    results,
    upstream: 'ok',
    mirror,
    attempts,
    source: 'osm',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=60',
    },
  });
}
