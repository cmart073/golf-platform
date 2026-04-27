import { listFormatsForUI, inferScoringMode, canUseDistributed } from '../../_format_registry.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const games = url.searchParams.get('games');
  const selected = games ? games.split(',').filter(Boolean) : null;

  const payload = { formats: listFormatsForUI() };
  if (selected) {
    payload.selected = selected;
    payload.inferred_scoring_mode = inferScoringMode(selected);
    payload.can_use_distributed = canUseDistributed(selected);
  }
  return json(payload);
}
