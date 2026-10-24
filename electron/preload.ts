import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  testAndSave: (c: { driver: "nedb" | "mongo"; uri?: string; port: number }): Promise<string | null> => ipcRenderer.invoke("testAndSave", c),
});
