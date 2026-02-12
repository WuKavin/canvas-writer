import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs/promises";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import htmlToDocx from "html-to-docx";
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

type StoreShape = {
  providers: ProviderConfig[];
  activeProviderId?: string;
};

let storePath = "";
let storeCache: StoreShape = {
  providers: [],
  activeProviderId: undefined
};
type Project = { id: string; title: string; content: string; updatedAt: string };
let projectsPath = "";
let projectsCache: Project[] = [];

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
const MODEL_TIMEOUT_MS = 90000;

async function loadStore() {
  if (!storePath) {
    storePath = path.join(app.getPath("userData"), "store.json");
  }
  try {
    const data = await fs.readFile(storePath, "utf8");
    storeCache = JSON.parse(data) as StoreShape;
  } catch {
    storeCache = { providers: [], activeProviderId: undefined };
  }
}

async function saveStore() {
  if (!storePath) {
    storePath = path.join(app.getPath("userData"), "store.json");
  }
  await fs.writeFile(storePath, JSON.stringify(storeCache, null, 2), "utf8");
}

async function loadProjects() {
  if (!projectsPath) {
    projectsPath = path.join(app.getPath("userData"), "projects.json");
  }
  try {
    const data = await fs.readFile(projectsPath, "utf8");
    projectsCache = JSON.parse(data) as Project[];
  } catch {
    projectsCache = [];
  }
}

async function saveProjects() {
  if (!projectsPath) {
    projectsPath = path.join(app.getPath("userData"), "projects.json");
  }
  await fs.writeFile(projectsPath, JSON.stringify(projectsCache, null, 2), "utf8");
}


function getProviders(): ProviderConfig[] {
  return storeCache.providers ?? [];
}

function setProviders(providers: ProviderConfig[]) {
  storeCache.providers = providers;
}

function toPublicProvider(p: ProviderConfig): ProviderPublic {
  const { apiKey, ...rest } = p;
  return rest;
}

function normalizeBaseUrl(input: string, version: "v1" | "v1beta" = "v1"): string {
  let base = (input || "").trim().replace(/\/$/, "");
  base = base.replace(/\/(chat\/completions|models)$/i, "");
  if (base.match(/\/v\d+(beta)?$/i)) return base;
  if (base.endsWith("/compatible-mode/v1")) return base;
  return `${base}/${version}`;
}

function buildAuthHeaders(authType: ProviderConfig["authType"], apiKey: string): Record<string, string> {
  const key = apiKey.trim();
  switch (authType) {
    case "x-goog-api-key":
      return { "x-goog-api-key": key };
    case "x-api-key":
      return { "X-API-Key": key };
    case "api-key":
      return { "api-key": key };
    case "bearer":
    default:
      return { Authorization: `Bearer ${key}` };
  }
}

async function ensureBackupDir() {
  const dir = path.join(app.getPath("userData"), "backups");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function safeFilePart(input: string) {
  return input.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 80);
}

function encryptProviderBundle(data: unknown, passphrase: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    format: "canvas-writer-providers-v1",
    alg: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

function decryptProviderBundle(
  payload: {
    salt: string;
    iv: string;
    tag: string;
    data: string;
  },
  passphrase: string
) {
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = MODEL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.floor(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function buildRewriteContext(fullText: string, selectionText: string) {
  const idx = fullText.indexOf(selectionText);
  if (idx < 0) {
    const head = fullText.slice(0, 1500);
    const tail = fullText.slice(-1500);
    return `${head}\n...\n${tail}`;
  }
  const WINDOW = 1500;
  const before = fullText.slice(Math.max(0, idx - WINDOW), idx);
  const after = fullText.slice(idx + selectionText.length, idx + selectionText.length + WINDOW);
  return `${before}\n[SELECTED_TEXT]\n${selectionText}\n[/SELECTED_TEXT]\n${after}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

app.whenReady().then(() => {
  Promise.all([loadStore(), loadProjects()]).then(createWindow);

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function requestQuit(): Promise<boolean> {
  if (isQuitting) return true;
  if (!mainWindow) {
    isQuitting = true;
    app.quit();
    return true;
  }
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Save and Quit", "Quit Without Saving", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Do you want to save your current article before quitting?"
  });
  if (choice.response === 2) return false;
  if (choice.response === 0) {
    mainWindow.webContents.send("app:save-request");
    await new Promise((r) => setTimeout(r, 300));
  }
  isQuitting = true;
  app.quit();
  return true;
}

app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  requestQuit();
});

ipcMain.handle("app:quit", async () => {
  return requestQuit();
});

ipcMain.on("app:state-response", async (_evt, payload: { id: string; title: string; content: string }) => {
  const now = new Date().toISOString();
  const title = payload.title || "Untitled";
  const existingIdx = projectsCache.findIndex((p) => p.id === payload.id);
  const next: Project = { id: payload.id, title, content: payload.content, updatedAt: now };
  if (existingIdx >= 0) projectsCache[existingIdx] = next;
  else projectsCache.unshift(next);
  await saveProjects();
});

ipcMain.handle("projects:list", async () => {
  return projectsCache;
});

ipcMain.handle("projects:get", async (_evt, id: string) => {
  return projectsCache.find((p) => p.id === id) ?? null;
});

ipcMain.handle("projects:save", async (_evt, payload: { id: string; title: string; content: string }) => {
  const now = new Date().toISOString();
  const title = payload.title || "Untitled";
  const existingIdx = projectsCache.findIndex((p) => p.id === payload.id);
  const next: Project = { id: payload.id, title, content: payload.content, updatedAt: now };
  if (existingIdx >= 0) projectsCache[existingIdx] = next;
  else projectsCache.unshift(next);
  await saveProjects();
  return { id: payload.id };
});

ipcMain.handle("projects:delete", async (_evt, id: string) => {
  const before = projectsCache.length;
  projectsCache = projectsCache.filter((p) => p.id !== id);
  if (projectsCache.length !== before) {
    await saveProjects();
    return true;
  }
  return false;
});


ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, "utf8");
  return { filePath, content };
});

ipcMain.handle("file:save", async (_evt, payload: { filePath?: string; content: string }) => {
  let filePath = payload.filePath;
  if (!filePath) {
    const result = await dialog.showSaveDialog({
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, payload.content, "utf8");
  return { filePath };
});

ipcMain.handle("file:exportDocx", async (_evt, payload: { markdown: string; html: string }) => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: "Word Document", extensions: ["docx"] }]
  });
  if (result.canceled || !result.filePath) return null;
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"/></head><body>${payload.html}</body></html>`;
  const docxBuffer = await htmlToDocx(html, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false
  });
  await fs.writeFile(result.filePath, docxBuffer);

  return { filePath: result.filePath };
});

ipcMain.handle(
  "file:backup",
  async (_evt, payload: { content: string; reason: string; title?: string }) => {
    const dir = await ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const title = payload.title ? safeFilePart(payload.title) : "untitled";
    const reason = safeFilePart(payload.reason);
    const filePath = path.join(dir, `${stamp}_${reason}_${title}.md`);
    await fs.writeFile(filePath, payload.content, "utf8");
    return { filePath, dir };
  }
);

ipcMain.handle("providers:list", async () => {
  return getProviders().map(toPublicProvider);
});

ipcMain.handle("providers:getActive", async () => {
  return storeCache.activeProviderId;
});

ipcMain.handle("providers:setActive", async (_evt, id: string) => {
  storeCache.activeProviderId = id;
  await saveStore();
  return true;
});

ipcMain.handle(
  "providers:save",
  async (_evt, provider: ProviderConfig) => {
    const providers = getProviders();
    const idx = providers.findIndex((p) => p.id === provider.id);
    if (idx >= 0) {
      const existing = providers[idx];
      providers[idx] = {
        ...existing,
        ...provider,
        apiKey: provider.apiKey ? provider.apiKey : existing.apiKey
      };
    } else {
      providers.push(provider);
    }
    setProviders(providers);
    if (!storeCache.activeProviderId) storeCache.activeProviderId = provider.id;
    await saveStore();
    return toPublicProvider(provider);
  }
);

ipcMain.handle("providers:delete", async (_evt, id: string) => {
  const providers = getProviders().filter((p) => p.id !== id);
  setProviders(providers);
  if (storeCache.activeProviderId === id) {
    storeCache.activeProviderId = providers[0]?.id;
  }
  await saveStore();
  return true;
});

ipcMain.handle("providers:export", async (_evt, payload: { passphrase: string }) => {
  const passphrase = payload.passphrase?.trim();
  if (!passphrase) throw new Error("Passphrase is required");
  const saveOptions = {
    title: "Export Providers",
    defaultPath: "canvas-writer-providers.cwprov",
    filters: [{ name: "Canvas Writer Provider Bundle", extensions: ["cwprov"] }]
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, saveOptions)
    : await dialog.showSaveDialog(saveOptions);
  if (result.canceled || !result.filePath) return null;
  const encrypted = encryptProviderBundle(
    {
      exportedAt: new Date().toISOString(),
      activeProviderId: storeCache.activeProviderId,
      providers: getProviders()
    },
    passphrase
  );
  await fs.writeFile(result.filePath, JSON.stringify(encrypted, null, 2), "utf8");
  return { filePath: result.filePath };
});

ipcMain.handle("providers:import", async (_evt, payload: { passphrase: string }) => {
  const passphrase = payload.passphrase?.trim();
  if (!passphrase) throw new Error("Passphrase is required");
  const openOptions = {
    title: "Import Providers",
    properties: ["openFile"] as ("openFile")[],
    filters: [{ name: "Canvas Writer Provider Bundle", extensions: ["cwprov", "json"] }]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, openOptions)
    : await dialog.showOpenDialog(openOptions);
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const raw = await fs.readFile(filePath, "utf8");
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid provider bundle file");
  }
  if (
    !parsed ||
    parsed.format !== "canvas-writer-providers-v1" ||
    typeof parsed.salt !== "string" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.data !== "string"
  ) {
    throw new Error("Unsupported provider bundle format");
  }
  let decrypted: any;
  try {
    decrypted = decryptProviderBundle(parsed, passphrase);
  } catch {
    throw new Error("Failed to decrypt provider bundle. Check passphrase.");
  }
  const incomingProviders = Array.isArray(decrypted?.providers) ? decrypted.providers : [];
  const incomingMap = new Map<string, ProviderConfig>();
  for (const provider of incomingProviders) {
    if (!provider?.id || !provider?.name || !provider?.baseUrl || !provider?.model) continue;
    incomingMap.set(provider.id, provider as ProviderConfig);
  }
  const currentMap = new Map(getProviders().map((p) => [p.id, p] as const));
  for (const [id, provider] of incomingMap.entries()) {
    currentMap.set(id, provider);
  }
  const merged = Array.from(currentMap.values());
  setProviders(merged);
  if (typeof decrypted?.activeProviderId === "string" && currentMap.has(decrypted.activeProviderId)) {
    storeCache.activeProviderId = decrypted.activeProviderId;
  } else if (!storeCache.activeProviderId && merged[0]) {
    storeCache.activeProviderId = merged[0].id;
  }
  await saveStore();
  return { filePath, importedCount: incomingMap.size };
});

ipcMain.handle(
  "providers:fetchModels",
  async (
    _evt,
    payload: {
      baseUrl: string;
      apiKey: string;
      authType?: ProviderConfig["authType"];
      apiType?: ProviderConfig["apiType"];
    }
  ) => {
    if (payload.apiType === "minimax") return ["MiniMax-M1", "MiniMax-Text-01", "MiniMax-M2.1"];

    if (payload.apiType === "gemini") {
      const baseUrl = normalizeBaseUrl(payload.baseUrl, "v1beta");
      const url = `${baseUrl}/models`;
      const res = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(payload.authType ?? "x-goog-api-key", payload.apiKey)
        }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Model list request failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      const models: string[] = Array.isArray(data?.models)
        ? data.models
            .map((m: any) => m?.name)
            .filter((id: any) => typeof id === "string")
        : [];
      return models;
    }

    const baseUrl = normalizeBaseUrl(payload.baseUrl);
    const url = `${baseUrl}/models`;
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(payload.authType ?? "bearer", payload.apiKey)
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Model list request failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    const models: string[] = Array.isArray(data?.data)
      ? data.data
          .map((m: any) => m?.id)
          .filter((id: any) => typeof id === "string")
      : [];
    return models;
  }
);

ipcMain.handle(
  "model:rewrite",
  async (_evt, payload: { providerId: string; fullText: string; selectionText: string; instruction: string; language: "zh" | "en" }) => {
  const provider = getProviders().find((p) => p.id === payload.providerId);
  if (!provider) throw new Error("Provider not found");
  if (!provider.apiKey) throw new Error("Missing API key for provider");

  const languageHint = payload.language === "en" ? "Write in English." : "Write in Chinese.";
  const system =
    `You are a writing assistant. Only rewrite the selected text. Return ONLY the revised selected text, with no quotes, no extra commentary, and no changes outside the selection. ${languageHint}`;

  if (provider.apiType === "gemini") {
    const baseUrl = normalizeBaseUrl(provider.baseUrl, "v1beta");
    const modelName = provider.model.startsWith("models/") ? provider.model : `models/${provider.model}`;
    const url = `${baseUrl}/${modelName}:generateContent`;
    const user = `Instruction:\n${payload.instruction}\n\nSelected text:\n${payload.selectionText}\n\nContext around selected text:\n${buildRewriteContext(payload.fullText, payload.selectionText)}\n\nRemember: output ONLY the revised selected text.`;

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4 }
    };

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(provider.authType ?? "x-goog-api-key", provider.apiKey)
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Model request failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const content = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
    if (!content) throw new Error("Empty model response");
    return content.trim();
  }

  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const url = `${baseUrl}/chat/completions`;
  const authHeaders = buildAuthHeaders(provider.authType ?? "bearer", provider.apiKey);

  const user = `Instruction:\n${payload.instruction}\n\nSelected text:\n${payload.selectionText}\n\nContext around selected text:\n${buildRewriteContext(payload.fullText, payload.selectionText)}\n\nRemember: output ONLY the revised selected text.`;

  const body = {
    model: provider.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Model request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
  if (!content || typeof content !== "string") throw new Error("Empty model response");

  return content.trim();
});

ipcMain.handle(
  "model:generate",
  async (_evt, payload: { providerId: string; messages: { role: "user" | "assistant"; content: string }[]; language: "zh" | "en" }) => {
    const provider = getProviders().find((p) => p.id === payload.providerId);
    if (!provider) throw new Error("Provider not found");
    if (!provider.apiKey) throw new Error("Missing API key for provider");

    const languageHint = payload.language === "en" ? "Write in English." : "Write in Chinese.";
    const system =
      `You are a writing assistant. Write a full article based on the user's prompt. Return only the article in Markdown, with no extra commentary. ${languageHint}`;

    if (provider.apiType === "gemini") {
      const baseUrl = normalizeBaseUrl(provider.baseUrl, "v1beta");
      const modelName = provider.model.startsWith("models/") ? provider.model : `models/${provider.model}`;
      const url = `${baseUrl}/${modelName}:generateContent`;

      const contents = payload.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.7 }
      };

      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(provider.authType ?? "x-goog-api-key", provider.apiKey)
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Model request failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const content = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
      if (!content) throw new Error("Empty model response");
      return content.trim();
    }

    const baseUrl = normalizeBaseUrl(provider.baseUrl);
    const url = `${baseUrl}/chat/completions`;
    const authHeaders = buildAuthHeaders(provider.authType ?? "bearer", provider.apiKey);

    const body = {
      model: provider.model,
      messages: [{ role: "system", content: system }, ...payload.messages],
      temperature: 0.7
    };

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Model request failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
    if (!content || typeof content !== "string") throw new Error("Empty model response");

    return content.trim();
  }
);

ipcMain.handle(
  "model:assist",
  async (_evt, payload: { providerId: string; purpose: "title" | "outline"; content: string; language: "zh" | "en" }) => {
    const provider = getProviders().find((p) => p.id === payload.providerId);
    if (!provider) throw new Error("Provider not found");
    if (!provider.apiKey) throw new Error("Missing API key for provider");

    const languageHint = payload.language === "en" ? "Write in English." : "Write in Chinese.";
    const system =
      payload.purpose === "title"
        ? `Generate a concise, strong title for the article. Return ONLY the title. ${languageHint}`
        : `Generate a concise outline in Markdown bullet list based on the article. Return ONLY the outline. ${languageHint}`;

    const user = payload.content;

    if (provider.apiType === "gemini") {
      const baseUrl = normalizeBaseUrl(provider.baseUrl, "v1beta");
      const modelName = provider.model.startsWith("models/") ? provider.model : `models/${provider.model}`;
      const url = `${baseUrl}/${modelName}:generateContent`;
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3 }
      };
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(provider.authType ?? "x-goog-api-key", provider.apiKey)
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Model request failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const content = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
      if (!content) throw new Error("Empty model response");
      return content.trim();
    }

    const baseUrl = normalizeBaseUrl(provider.baseUrl);
    const url = `${baseUrl}/chat/completions`;
    const authHeaders = buildAuthHeaders(provider.authType ?? "bearer", provider.apiKey);

    const body = {
      model: provider.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.3
    };

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Model request failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
    if (!content || typeof content !== "string") throw new Error("Empty model response");
    return content.trim();
  }
);
