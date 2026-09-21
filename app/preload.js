const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fileSeek', {
  call: (method, args) => ipcRenderer.invoke('file-seek', method, args),
  on: (name, callback) => { const handler = (_event, value) => callback(value); ipcRenderer.on(name, handler); return () => ipcRenderer.removeListener(name, handler); }
});
