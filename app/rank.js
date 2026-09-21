'use strict';
let modelPromise;
function getModel() {
  if (!modelPromise) modelPromise = import('@receptron/laya').then(({ Laya }) => Laya.load({ executionProviders: ['cpu'], sessionOptions: { intraOpNumThreads: 4 } })).catch(e => { modelPromise = null; throw e; });
  return modelPromise;
}
async function rankLaya(query, items, onProgress = () => {}) {
  const model = await getModel();
  const result = items.map(x => ({ ...x }));
  for (let i = 0; i < Math.min(result.length, 12); i++) {
    const item = result[i];
    const response = await model.systemOne(
      { search: query.slice(0, 500), candidate: `${item.path}\n${item.preview}`.slice(0, 700) },
      { match: { type: 'score', instructions: 'How likely is this file the document the user describes?', criteria: ['Unrelated document', 'Only a passing mention', 'Same topic or project', 'Strong evidence this is the intended document'] } }
    );
    const score = response?.answers?.match?.score;
    if (Number.isFinite(score)) item.semantic = score;
    onProgress(i + 1, Math.min(result.length, 12));
  }
  result.sort((a, b) => (b.semantic ?? -1) - (a.semantic ?? -1) || b.score - a.score);
  return result;
}
async function rankJev(query, items, key, fetcher = fetch) {
  const result = items.map(x => ({ ...x }));
  for (let start = 0; start < Math.min(result.length, 12); start += 6) {
    const slice = result.slice(start, start + 6);
    const questions = {};
    slice.forEach((_, i) => { questions[`match_${i}`] = { type: 'score', instructions: 'How likely is this file the document described in search?', criteria: ['Unrelated document', 'Only a passing mention', 'Same topic or project', 'Strong evidence this is the intended document'] }; });
    const state = { search: query.slice(0, 500), files: slice.map((x, i) => ({ id: `match_${i}`, path: x.path, excerpt: x.preview.slice(0, 700) })) };
    // Each question includes its own candidate so every judgment is independent.
    slice.forEach((x, i) => { questions[`match_${i}`].instructions = `For the file with id match_${i}, how likely is it the document described in search?`; });
    const response = await fetcher('https://api.typesafe.ai/v1/systemone', { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'jev-latest', state, questions }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Jev request failed (HTTP ${response.status})`);
    const body = await response.json();
    slice.forEach((x, i) => { const score = body.answers?.[`match_${i}`]?.score; if (Number.isFinite(score)) x.semantic = score; });
  }
  result.sort((a, b) => (b.semantic ?? -1) - (a.semantic ?? -1) || b.score - a.score);
  return result;
}
module.exports = { rankLaya, rankJev };
