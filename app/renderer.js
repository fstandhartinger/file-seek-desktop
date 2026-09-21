'use strict';
const api = window.fileSeek;
const $ = id => document.getElementById(id);
let roots = [], ranker = 'laya', resultTurn = 0, total = 0;
function text(tag, className, content) { const e = document.createElement(tag); if (className) e.className = className; e.textContent = content; return e; }
function show(name) {
  for (const n of ['search', 'library', 'settings']) {
    $(`${n}-view`).classList.toggle('hidden', n !== name);
    $(`nav-${n}`).classList.toggle('active', n === name);
  }
  $('view-name').textContent = name.toUpperCase();
}
function note(message) { $('search-note').textContent = message; }
function error(e) { note(String(e?.message || e)); }
function updateRoots() {
  $('roots').replaceChildren();
  $('library-count').textContent = `${roots.length} location${roots.length === 1 ? '' : 's'}`;
  if (!roots.length) $('roots').append(text('p', 'muted', 'No locations yet. Add a folder or every drive to start indexing.'));
  for (const root of roots) {
    const row = text('div', 'root', root);
    const remove = text('button', '', 'Remove');
    remove.addEventListener('click', async () => { roots = await api.call('removeRoot', { root }); updateRoots(); });
    row.append(remove); $('roots').append(row);
  }
}
function updateTotal(n) {
  total = n;
  $('side-count').textContent = `${n.toLocaleString()} file${n === 1 ? '' : 's'} indexed`;
  if (n && $('results-title').textContent === 'Start with your files') $('results-title').textContent = 'Ready when you are';
}
function relativeDate(seconds) {
  if (!seconds) return 'Date unknown';
  const days = Math.max(0, (Date.now() / 1000 - seconds) / 86400);
  if (days < 1) return 'Today'; if (days < 2) return 'Yesterday'; if (days < 7) return `${Math.floor(days)} days ago`;
  if (days < 35) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}
function renderResults(rows, phase) {
  $('results').replaceChildren();
  $('results-title').textContent = rows.length ? 'Likely matches' : 'No matching files';
  $('results-count').textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    const empty = text('div', 'empty', 'Try a project name, a phrase in the document, or scan more locations.');
    $('results').append(empty); return;
  }
  for (const row of rows) {
    const card = text('article', 'result', '');
    const icon = text('div', `file-icon ${row.kind.toLowerCase()}`, row.kind.slice(0, 4));
    const body = text('div', 'result-body', '');
    const top = text('div', 'result-head', '');
    top.append(text('h3', '', row.path.split(/[\\/]/).pop()), text('span', 'result-date', relativeDate(row.modified)));
    body.append(top, text('div', 'result-meta', row.path), text('p', 'result-excerpt', row.preview || ''));
    const actions = text('div', 'result-actions', '');
    for (const [label, method] of [['Open file', 'open'], ['Show in folder', 'showInFolder']]) {
      const button = text('button', '', label + ' ↗');
      button.addEventListener('click', () => api.call(method, { path: row.path }).catch(error));
      actions.append(button);
    }
    body.append(actions); card.append(icon, body); $('results').append(card);
  }
  if (phase !== 'fast') note(`${rows.length} results · ${phase === 'laya' ? 'local Laya' : 'Jev'} ranking`);
}
async function init() {
  try {
    const state = await api.call('init'); roots = state.roots; ranker = state.ranker;
    updateRoots(); updateTotal(state.total); $('index-state').textContent = state.scanning ? 'Scanning' : 'Idle';
    document.querySelector(`input[name=ranker][value=${ranker}]`).checked = true;
    $('rank-badge').textContent = ranker === 'laya' ? 'Laya · local' : ranker === 'jev' ? 'Jev · API' : 'Keywords';
    $('key-state').textContent = state.jevKeySet ? 'Key ready' : 'Not set';
    $('key-help').textContent = state.keyPersistable ? 'This system supports encrypted key storage.' : 'This system has no secure key storage; a pasted key lasts for this app session. An environment key is also supported.';
    note(state.total ? `Searching ${state.total.toLocaleString()} indexed files.` : 'Add a drive to begin.');
    if (!roots.length) show('library');
  } catch (e) { error(e); show('library'); $('progress-copy').textContent = String(e.message || e); }
}
for (const n of ['search', 'library', 'settings']) $(`nav-${n}`).addEventListener('click', () => show(n));
$('empty-library').addEventListener('click', () => show('library'));
$('search-form').addEventListener('submit', async e => {
  e.preventDefault(); const query = $('query').value.trim(); if (!query) return;
  show('search'); note('Searching local index…');
  try { await api.call('search', { query }); } catch (err) { error(err); }
});
$('add-folder').addEventListener('click', async () => { try { const root = await api.call('pickRoot'); if (root) { roots = await api.call('addRoot', { root }); updateRoots(); } } catch (e) { error(e); } });
$('add-disks').addEventListener('click', async () => { try { for (const root of await api.call('diskRoots')) roots = await api.call('addRoot', { root }); updateRoots(); $('progress-copy').textContent = 'Drives added. Press Scan now to index them.'; } catch (e) { error(e); } });
$('scan').addEventListener('click', async () => { try { if (!roots.length) throw Error('Add a folder or drive first.'); const started = await api.call('scan'); $('index-state').textContent = started ? 'Scanning' : 'Already scanning'; $('progress-copy').textContent = 'Scanning files in the background…'; } catch (e) { error(e); } });
$('cancel').addEventListener('click', () => api.call('cancel').catch(error));
for (const radio of document.querySelectorAll('input[name=ranker]')) radio.addEventListener('change', async e => {
  try { const value = e.target.value; if (value === 'jev' && ranker !== 'jev' && !confirm('Jev sends your search query, file paths, and short excerpts from up to 12 candidate files to TypeSafe. Continue?')) { document.querySelector(`input[name=ranker][value=${ranker}]`).checked = true; return; } ranker = await api.call('ranker', { value }); $('rank-badge').textContent = value === 'laya' ? 'Laya · local' : value === 'jev' ? 'Jev · API' : 'Keywords'; } catch (e) { error(e); }
});
$('get-key').addEventListener('click', () => api.call('getKeyPage').catch(error));
$('save-key').addEventListener('click', async () => { try { const key = $('jev-key').value.trim(); if (!key) throw Error('Paste a key first.'); const result = await api.call('jevKey', { value: key }); $('jev-key').value = ''; $('key-state').textContent = result.set ? 'Key ready' : 'Not set'; $('key-help').textContent = result.saved ? 'Key saved using the operating system’s encryption.' : 'Key available for this app session only.'; } catch (e) { error(e); } });
$('clear-key').addEventListener('click', async () => { const result = await api.call('jevKey', { value: '' }); $('jev-key').value = ''; $('key-state').textContent = result.set ? 'Key ready' : 'Not set'; });
api.on('index-event', event => {
  if (event.event === 'progress') { $('index-state').textContent = 'Scanning'; $('progress-copy').textContent = `${event.scanned.toLocaleString()} candidate files checked · ${event.indexed.toLocaleString()} updated · ${event.unchanged.toLocaleString()} unchanged · ${event.errors.toLocaleString()} unreadable`; $('progress-bar').style.width = `${Math.min(93, Math.max(5, event.scanned / (event.scanned + 5000) * 100))}%`; }
  if (event.event === 'complete') { $('index-state').textContent = event.cancelled ? 'Stopped' : 'Complete'; $('progress-bar').style.width = '100%'; $('progress-copy').textContent = `${event.total.toLocaleString()} files ready · ${event.indexed.toLocaleString()} updated · ${event.errors.toLocaleString()} unreadable · ${event.seconds}s`; updateTotal(event.total); note(`${event.total.toLocaleString()} files indexed. Describe what you are looking for.`); }
});
api.on('search-results', result => { if (result.turn < resultTurn) return; resultTurn = result.turn; renderResults(result.rows, result.phase); });
api.on('search-note', note);
api.on('worker-error', message => { $('progress-copy').textContent = message; note(message); });
init();
