const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("knitHamster", {
  openDashboard: () => ipcRenderer.invoke("dashboard:open"),
  getData: () => ipcRenderer.invoke("data:get"),
  resetToday: () => ipcRenderer.invoke("data:resetToday"),
  quit: () => ipcRenderer.invoke("app:quit"),
  onUpdate: (callback) => {
    ipcRenderer.on("tracker:update", (_event, payload) => callback(payload));
  }
});
