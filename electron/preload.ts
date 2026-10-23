import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  testAndSave: (c: { uri: string; port: number }): Promise<string | null> => ipcRenderer.invoke("testAndSave", c),
});
