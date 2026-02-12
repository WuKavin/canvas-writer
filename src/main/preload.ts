import { contextBridge, ipcRenderer } from "electron";

type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiType?: "openai" | "gemini" | "minimax";
  authType?: "bearer" | "x-api-key" | "api-key" | "x-goog-api-key";
  apiKey?: string;
};

type ProviderPublic = Omit<ProviderConfig, "apiKey">;

contextBridge.exposeInMainWorld("api", {
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (payload: { filePath?: string; content: string }) => ipcRenderer.invoke("file:save", payload),
  exportDocx: (payload: { markdown: string; html: string }) => ipcRenderer.invoke("file:exportDocx", payload),
  backupFile: (payload: { content: string; reason: string; title?: string }) => ipcRenderer.invoke("file:backup", payload),
  requestQuit: () => ipcRenderer.invoke("app:quit"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  saveProject: (payload: { id: string; title: string; content: string }) => ipcRenderer.invoke("projects:save", payload),
  openProject: (id: string) => ipcRenderer.invoke("projects:get", id),
  deleteProject: (id: string) => ipcRenderer.invoke("projects:delete", id),
  onSaveRequest: (handler: () => void) => ipcRenderer.on("app:save-request", handler),
  sendState: (payload: { id: string; title: string; content: string }) => ipcRenderer.send("app:state-response", payload),

  listProviders: (): Promise<ProviderPublic[]> => ipcRenderer.invoke("providers:list"),
  getActiveProvider: (): Promise<string | undefined> => ipcRenderer.invoke("providers:getActive"),
  setActiveProvider: (id: string) => ipcRenderer.invoke("providers:setActive", id),
  saveProvider: (provider: ProviderConfig): Promise<ProviderPublic> => ipcRenderer.invoke("providers:save", provider),
  deleteProvider: (id: string) => ipcRenderer.invoke("providers:delete", id),
  exportProviders: (payload: { passphrase: string }) => ipcRenderer.invoke("providers:export", payload),
  importProviders: (payload: { passphrase: string }) => ipcRenderer.invoke("providers:import", payload),

  fetchModels: (payload: { baseUrl: string; apiKey: string; authType?: "bearer" | "x-api-key" | "api-key" | "x-goog-api-key"; apiType?: "openai" | "gemini" | "minimax" }) =>
    ipcRenderer.invoke("providers:fetchModels", payload),

  generateArticle: (payload: { providerId: string; messages: { role: "user" | "assistant"; content: string }[]; language: "zh" | "en" }) =>
    ipcRenderer.invoke("model:generate", payload),
  assistArticle: (payload: { providerId: string; purpose: "title" | "outline"; content: string; language: "zh" | "en" }) =>
    ipcRenderer.invoke("model:assist", payload),

  rewriteSelection: (payload: {
    providerId: string;
    fullText: string;
    selectionText: string;
    instruction: string;
    language: "zh" | "en";
  }) => ipcRenderer.invoke("model:rewrite", payload)
});
