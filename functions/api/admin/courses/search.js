// GET /api/admin/courses/search?lat=...&lng=...&radius_km=15
//
// Looks up nearby golf courses from OpenStreetMap via the Overpass API.
// Returns a normalized list the wizard can show as suggestions; the user
// picks one and POSTs to /api/admin/orgs/:orgId/courses to persist.
//
// Why OSM/Overpass:
//   - Free, no API key, no auth header required.
//   - Coverage is broad (every continent has thousands of `leisure=
//     golf_course` features); names + coordinates are very reliable.
//   - Per-hole pars are rarely tagged in OSM, so we default all 18 holes
//     to par 4 and surface a "✏ adjust pars" callout in the create flow.
//
// We fetch from the worker (not the browser) so:
//   - CORS isn't a concern.
//   - We can swap the Overpass mirror or add a fallback later without
//     changing the client.
//   - We can lightly cache responses in CF cache.
//
// Rate limiting: Overpass shared instances throttle clients via 429.
// Treat 429 / network failures as a soft empty result rather than a
// 500 — the user can fall back to the manual create-course form.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function err(message, status = 400) { return json({ error: message }, status); }

function clampRadiusMeters(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return 15_000;
  return Math.min(Math.max(n * 1000, 1_000), 80_000);
}

function buildOverpassQuery(lat, lng, radiusM) {
  // Search nodes/ways/relations tagged as a golf course. `out center tags`
  // returns a single representative point (centroid for ways/relations) so
  // we can show distance / pin without dragging full geometries.
  return `
[out:json][timeout:15];
(
  node["leisure"="golf_course"](around:${radiusM},${lat},${lng});
  way["leisure"="golf_course"](around:${radiusM},${lat},${lng});
  relation["leisure"="golf_course"](around:${radiusM},${lat},${lng});
);
out center tags;
`.trim();
}

function normalize(el) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  if (!tags.name) return null;

  // Pull a few common address tags; OSM is inconsistent (addr:city vs
  // is_in:city, etc.) so we try a small priority chain for each field.
  const city =
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || null;
  const state = tags['addr:state'] || tags['addr:region'] || null;
  const country = tags['addr:country'] || null;

  // Hole / par hints, when tagged. golf:par sometimes covers total par.
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
    holes_hint: holes,                // may be null
    total_par_hint: totalPar,         // may be null
    website: tags.website || tags['contact:website'] || null,
    phone:   tags.phone   || tags['contact:phone']   || null,
  };
}

// Haversine in km. Used to sort and to expose a "X mi" label client-side.
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

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return err('lat and lng query params required');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return err('lat/lng out of range');
  }
  const radiusM = clampRadiusMeters(url.searchParams.get('radius_km'));

  const body = buildOverpassQuery(lat, lng, radiusM);

  let osmJson;
  try {
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(body),
      // Cloudflare Workers respect cf for sub-fetch caching — give Overpass
      // results a 5-minute edge cache; the underlying data changes slowly.
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!resp.ok) {
      // Treat any non-2xx (incl. 429) as soft-empty — we surface a
      // friendly empty list rather than a 500 so the wizard can fall
      // back to manual entry without losing the user's flow.
      return json({
        center: { lat, lng },
        radius_km: radiusM / 1000,
        results: [],
        upstream_status: resp.status,
        source: 'osm',
      });
    }
    osmJson = await resp.json();
  } catch (e) {
    return json({
      center: { lat, lng },
      radius_km: radiusM / 1000,
      results: [],
      upstream_error: String(e?.message || e),
      source: 'osm',
    });
  }

  const here = { lat, lng };
  const results = (osmJson.elements || [])
    .map(normalize)
    .filter(Boolean)
    // Some courses appear as both a node and a relation — dedupe by name+
    // approximate location. OSM IDs differ across types so name+coords is
    // a more reliable key than osm_id alone.
    .reduce((acc, c) => {
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
    source: 'osm',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Browser-side cache for a minute so a quick re-search is instant.
      'Cache-Control': 'private, max-age=60',
    },
  });
}
