'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { rankLaya, rankJev } = require('./rank');
let window, worker, sequence = 0, searchTurn = 0, jevKey = process.env.TYPESAFE_API_KEY || '';
const pending = new Map();
let settings = { ranker: 'laya', roots: [] };
function send(event, value) { if (window && !window.isDestroyed()) window.webContents.send(event, value); }
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function keyPath() { return path.join(app.getPath('userData'), 'jev-key.bin'); }
function canSaveKey() { return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; }
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }; } catch {}
  if (!jevKey && canSaveKey()) try { jevKey = safeStorage.decryptString(fs.readFileSync(keyPath())); } catch {}
}
function saveSettings() { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings), { mode: 0o600 }); }
function workerCommand() {
  if (app.isPackaged) {
    const executable = path.join(process.resourcesPath, 'backend', process.platform === 'win32' ? 'indexer.exe' : 'indexer');
    return [executable, []];
  }
  const root = path.join(__dirname, '..');
  const venv = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (fs.existsSync(venv)) return [venv, [path.join(root, 'backend/indexer.py')]];
  if (process.env.FILE_SEEK_PYTHON) return [process.env.FILE_SEEK_PYTHON, [path.join(root, 'backend/indexer.py')]];
  return [process.platform === 'win32' ? 'python' : 'python3', [path.join(root, 'backend/indexer.py')]];
}
function startWorker() {
  const [cmd, args] = workerCommand();
  worker = spawn(cmd, [...args, '--db', path.join(app.getPath('userData'), 'index.sqlite')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  worker.on('error', err => { send('worker-error', `Indexer could not start: ${err.message}`); for (const p of pending.values()) p.reject(err); pending.clear(); });
  worker.on('exit', code => { send('worker-error', `Indexer stopped (code ${code}).`); for (const p of pending.values()) p.reject(Error('Indexer stopped')); pending.clear(); });
  readline.createInterface({ input: worker.stdout }).on('line', line => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (msg.event) return send('index-event', msg);
    const p = pending.get(msg.id); if (!p) return;
    pending.delete(msg.id); msg.error ? p.reject(Error(msg.error)) : p.resolve(msg.result);
  });
  worker.stderr.on('data', chunk => send('worker-error', String(chunk).slice(0, 300)));
}
function callWorker(method, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!worker || !worker.stdin.writable) return reject(Error('Indexer unavailable'));
    const id = ++sequence; pending.set(id, { resolve, reject });
    worker.stdin.write(JSON.stringify({ id, method, ...payload }) + '\n');
  });
}
async function performSearch(query) {
  const turn = ++searchTurn;
  const rows = await callWorker('search', { query, limit: 30 });
  send('search-results', { turn, rows, phase: 'fast' });
  if (!rows.length || settings.ranker === 'keyword') return rows;
  if (settings.ranker === 'jev' && !jevKey) { send('search-note', 'Add a Jev API key in Settings, or use local Laya.'); return rows; }
  (async () => {
    try {
      send('search-note', settings.ranker === 'laya' ? 'Ranking top matches locally with Laya… the first run downloads model weights.' : 'Ranking top matches with Jev…');
      const ranked = settings.ranker === 'laya' ? await rankLaya(query, rows) : await rankJev(query, rows, jevKey);
      if (turn === searchTurn) { send('search-results', { turn, rows: ranked, phase: settings.ranker }); send('search-note', `${ranked.length} results · ${settings.ranker === 'laya' ? 'Laya local ranking' : 'Jev ranking'}`); }
    } catch (err) { if (turn === searchTurn) send('search-note', `Fast search results shown. ${settings.ranker === 'laya' ? 'Laya' : 'Jev'} unavailable: ${String(err.message).slice(0, 160)}`); }
  })();
  return rows;
}
function createWindow() {
  window = new BrowserWindow({ width: 1120, height: 760, minWidth: 650, minHeight: 500, title: 'File Seek', backgroundColor: '#0c1218', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
app.whenReady().then(() => { loadSettings(); startWorker(); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (worker && !worker.killed) worker.kill(); });
ipcMain.handle('file-seek', async (_event, method, args = {}) => {
  switch (method) {
    case 'init': return { ...await callWorker('status'), roots: settings.roots, ranker: settings.ranker, jevKeySet: !!jevKey, keyPersistable: canSaveKey() };
    case 'diskRoots': return callWorker('roots');
    case 'pickRoot': { const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; }
    case 'addRoot': { const root = path.resolve(String(args.root || '')); if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Error('Choose an existing folder or disk.'); if (!settings.roots.includes(root)) settings.roots.push(root); saveSettings(); return settings.roots; }
    case 'removeRoot': settings.roots = settings.roots.filter(p => p !== args.root); saveSettings(); return settings.roots;
    case 'scan': return callWorker('scan', { roots: settings.roots });
    case 'cancel': return callWorker('cancel');
    case 'search': return performSearch(String(args.query || '').slice(0, 500));
    case 'ranker': if (!['laya', 'jev', 'keyword'].includes(args.value)) throw Error('Invalid ranking mode'); settings.ranker = args.value; saveSettings(); return settings.ranker;
    case 'jevKey': { jevKey = String(args.value || '').trim(); if (jevKey && canSaveKey()) fs.writeFileSync(keyPath(), safeStorage.encryptString(jevKey), { mode: 0o600 }); else try { fs.unlinkSync(keyPath()); } catch {} return { set: !!jevKey, saved: !!jevKey && canSaveKey() }; }
    case 'getKeyPage': await shell.openExternal('https://console.typesafe.ai'); return true;
    case 'open': { const target = String(args.path || ''); if (!fs.existsSync(target)) throw Error('This file no longer exists.'); const error = await shell.openPath(target); if (error) throw Error(error); return true; }
    case 'showInFolder': { const target = String(args.path || ''); if (!fs.existsSync(target)) throw Error('This file no longer exists.'); shell.showItemInFolder(target); return true; }
    default: throw Error('Unknown action');
  }
});
