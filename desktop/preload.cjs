const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("commonplaceDesktop", {
  snapshot: () => ipcRenderer.invoke("companion:snapshot"),
  dragStart: () => ipcRenderer.invoke("companion:drag-start"),
  dragEnd: () => ipcRenderer.invoke("companion:drag-end"),
  dragCancel: () => ipcRenderer.invoke("companion:drag-cancel"),
  toggle: () => ipcRenderer.invoke("companion:toggle"),
  pair: (token, origin) =>
    ipcRenderer.invoke("companion:pair", { token, origin }),
  pause: (id) => ipcRenderer.invoke("companion:pause", id),
  openSpace: () => ipcRenderer.invoke("companion:open-space"),
  hide: () => ipcRenderer.invoke("companion:hide"),
});
