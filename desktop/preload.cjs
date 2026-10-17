const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("commonplaceDesktop", {
  snapshot: () => ipcRenderer.invoke("companion:snapshot"),
  discover: () => ipcRenderer.invoke("companion:discover"),
  pair: (token, origin) =>
    ipcRenderer.invoke("companion:pair", { token, origin }),
  subscribe: (id, mode) =>
    ipcRenderer.invoke("companion:subscribe", { id, mode }),
  pause: (id) => ipcRenderer.invoke("companion:pause", id),
  openSpace: () => ipcRenderer.invoke("companion:open-space"),
  hide: () => ipcRenderer.invoke("companion:hide"),
});
