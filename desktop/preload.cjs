const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("commonplaceDesktop", {
  nativeDrag: true,
  onGaze: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("companion:gaze", listener);
    return () => ipcRenderer.removeListener("companion:gaze", listener);
  },
  copyReference: (id) => ipcRenderer.invoke("companion:copy-reference", id),
  onSnapshot: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("companion:state", listener);
    return () => ipcRenderer.removeListener("companion:state", listener);
  },
  hitTest: (interactive) =>
    ipcRenderer.invoke("companion:hit-test", interactive),
  contextMenu: () => ipcRenderer.invoke("companion:context-menu"),
  snapshot: () => ipcRenderer.invoke("companion:snapshot"),
  dragStart: (point) => ipcRenderer.invoke("companion:drag-start", point),
  connect: () => ipcRenderer.invoke("companion:connect"),
  dragEnd: () => ipcRenderer.invoke("companion:drag-end"),
  dragCancel: () => ipcRenderer.invoke("companion:drag-cancel"),
  toggle: () => ipcRenderer.invoke("companion:toggle"),
  pair: (token, origin) =>
    ipcRenderer.invoke("companion:pair", { token, origin }),
  pause: (id) => ipcRenderer.invoke("companion:pause", id),
  openSpace: () => ipcRenderer.invoke("companion:open-space"),
  hide: () => ipcRenderer.invoke("companion:hide"),
});
