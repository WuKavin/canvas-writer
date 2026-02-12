type RoleMessage = { role: "user" | "assistant"; content: string };
type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiType?: "openai" | "gemini" | "minimax";
  authType?: "bearer" | "x-api-key" | "api-key" | "x-goog-api-key";
  apiKey?: string;
};

type Project = { id: string; title: string; content: string; updatedAt: string };

const LS_PROVIDERS = "cw_providers";
const LS_ACTIVE_PROVIDER = "cw_active_provider";
const LS_PROJECTS = "cw_projects";
const LS_BACKUPS = "cw_backups";
const MODEL_TIMEOUT_MS = 90000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function toPublicProvider(provider: ProviderConfig) {
  const { apiKey, ...rest } = provider;
  return rest;
}

function normalizeBaseUrl(input: string, version: "v1" | "v1beta" = "v1"): string {
  let base = (input || "").trim().replace(/\/$/, "");
  base = base.replace(/\/(chat\/completions|models)$/i, "");
  if (base.match(/\/v\d+(beta)?$/i)) return base;
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

function getProviders(): ProviderConfig[] {
  return readJson<ProviderConfig[]>(LS_PROVIDERS, []);
}

function setProviders(next: ProviderConfig[]) {
  writeJson(LS_PROVIDERS, next);
}

function getProvider(providerId: string): ProviderConfig {
  const provider = getProviders().find((p) => p.id === providerId);
  if (!provider) throw new Error("Provider not found");
  if (!provider.apiKey) throw new Error("Missing API key for provider");
  return provider;
}

function buildRewriteContext(fullText: string, selectionText: string) {
  const idx = fullText.indexOf(selectionText);
  if (idx < 0) {
    const head = fullText.slice(0, 1500);
    const tail = fullText.slice(-1500);
    return `${head}\n...\n${tail}`;
  }
  const windowLen = 1500;
  const before = fullText.slice(Math.max(0, idx - windowLen), idx);
  const after = fullText.slice(idx + selectionText.length, idx + selectionText.length + windowLen);
  return `${before}\n[SELECTED_TEXT]\n${selectionText}\n[/SELECTED_TEXT]\n${after}`;
}

async function openaiCompatibleChat(provider: ProviderConfig, body: any) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const url = `${baseUrl}/chat/completions`;
  const authHeaders = buildAuthHeaders(provider.authType ?? "bearer", provider.apiKey || "");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
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

async function geminiGenerate(provider: ProviderConfig, body: any) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl, "v1beta");
  const modelName = provider.model.startsWith("models/") ? provider.model : `models/${provider.model}`;
  const url = `${baseUrl}/${modelName}:generateContent`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(provider.authType ?? "x-goog-api-key", provider.apiKey || "")
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

function triggerDownload(fileName: string, mimeType: string, content: string | Blob) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function pickTextFile(): Promise<{ filePath: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const content = await file.text();
      resolve({ filePath: file.name, content });
    };
    input.click();
  });
}

function ensureWebApi() {
  if ((window as any).api) return;

  const api = {
    openFile: () => pickTextFile(),
    saveFile: async (payload: { filePath?: string; content: string }) => {
      const filePath = payload.filePath || "canvas-writer.md";
      triggerDownload(filePath, "text/markdown;charset=utf-8", payload.content);
      return { filePath };
    },
    exportDocx: async (payload: { markdown: string; html: string }) => {
      const filePath = "canvas-writer.docx";
      const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body>${payload.html}</body></html>`;
      triggerDownload(filePath, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", html);
      return { filePath };
    },
    backupFile: async (payload: { content: string; reason: string; title?: string }) => {
      const backups = readJson<any[]>(LS_BACKUPS, []);
      const stamp = new Date().toISOString();
      const title = payload.title || "untitled";
      backups.unshift({ stamp, reason: payload.reason, title, content: payload.content });
      writeJson(LS_BACKUPS, backups.slice(0, 50));
      return { filePath: `local://${stamp}_${payload.reason}_${title}.md`, dir: "local://backups" };
    },
    requestQuit: async () => {
      window.close();
      return true;
    },
    listProjects: async () => readJson<Project[]>(LS_PROJECTS, []),
    saveProject: async (payload: { id: string; title: string; content: string }) => {
      const projects = readJson<Project[]>(LS_PROJECTS, []);
      const now = new Date().toISOString();
      const idx = projects.findIndex((p) => p.id === payload.id);
      const next = { id: payload.id, title: payload.title || "Untitled", content: payload.content, updatedAt: now };
      if (idx >= 0) projects[idx] = next;
      else projects.unshift(next);
      writeJson(LS_PROJECTS, projects);
      return { id: payload.id };
    },
    openProject: async (id: string) => readJson<Project[]>(LS_PROJECTS, []).find((p) => p.id === id) ?? null,
    deleteProject: async (id: string) => {
      const projects = readJson<Project[]>(LS_PROJECTS, []);
      const next = projects.filter((p) => p.id !== id);
      writeJson(LS_PROJECTS, next);
      return next.length !== projects.length;
    },
    onSaveRequest: (_handler: () => void) => undefined,
    sendState: (_payload: { id: string; title: string; content: string }) => undefined,
    listProviders: async () => getProviders().map(toPublicProvider),
    getActiveProvider: async () => localStorage.getItem(LS_ACTIVE_PROVIDER) || undefined,
    setActiveProvider: async (id: string) => {
      localStorage.setItem(LS_ACTIVE_PROVIDER, id);
      return true;
    },
    saveProvider: async (provider: ProviderConfig) => {
      const providers = getProviders();
      const idx = providers.findIndex((p) => p.id === provider.id);
      if (idx >= 0) {
        providers[idx] = { ...providers[idx], ...provider, apiKey: provider.apiKey || providers[idx].apiKey };
      } else {
        providers.push(provider);
      }
      setProviders(providers);
      if (!localStorage.getItem(LS_ACTIVE_PROVIDER)) localStorage.setItem(LS_ACTIVE_PROVIDER, provider.id);
      return toPublicProvider(provider);
    },
    deleteProvider: async (id: string) => {
      const providers = getProviders().filter((p) => p.id !== id);
      setProviders(providers);
      if (localStorage.getItem(LS_ACTIVE_PROVIDER) === id) {
        localStorage.setItem(LS_ACTIVE_PROVIDER, providers[0]?.id || "");
      }
      return true;
    },
    fetchModels: async (payload: { baseUrl: string; apiKey: string; authType?: ProviderConfig["authType"]; apiType?: ProviderConfig["apiType"] }) => {
      if (payload.apiType === "minimax") return ["MiniMax-M1", "MiniMax-Text-01", "MiniMax-M2.1"];
      if (payload.apiType === "gemini") {
        const baseUrl = normalizeBaseUrl(payload.baseUrl, "v1beta");
        const url = `${baseUrl}/models`;
        const res = await fetchWithTimeout(url, {
          method: "GET",
          headers: { "Content-Type": "application/json", ...buildAuthHeaders(payload.authType ?? "x-goog-api-key", payload.apiKey) }
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Model list request failed: ${res.status} ${text}`);
        }
        const data = await res.json();
        return Array.isArray(data?.models)
          ? data.models.map((m: any) => m?.name).filter((id: any) => typeof id === "string")
          : [];
      }
      const baseUrl = normalizeBaseUrl(payload.baseUrl);
      const url = `${baseUrl}/models`;
      const res = await fetchWithTimeout(url, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(payload.authType ?? "bearer", payload.apiKey) }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Model list request failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return Array.isArray(data?.data) ? data.data.map((m: any) => m?.id).filter((id: any) => typeof id === "string") : [];
    },
    generateArticle: async (payload: { providerId: string; messages: RoleMessage[]; language: "zh" | "en" }) => {
      const provider = getProvider(payload.providerId);
      const languageHint = payload.language === "en" ? "Write in English." : "Write in Chinese.";
      const system = `You are a writing assistant. Write a full article based on the user's prompt. Return only the article in Markdown, with no extra commentary. ${languageHint}`;
      if (provider.apiType === "gemini") {
        const contents = payload.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        }));
        return geminiGenerate(provider, { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.7 } });
      }
      return openaiCompatibleChat(provider, {
        model: provider.model,
        messages: [{ role: "system", content: system }, ...payload.messages],
        temperature: 0.7
      });
    },
    assistArticle: async (payload: { providerId: string; purpose: "title" | "outline"; content: string; language: "zh" | "en" }) => {
      const provider = getProvider(payload.providerId);
      const languageHint = payload.language === "en" ? "Write in English." : "Write in Chinese.";
      const system =
        payload.purpose === "title"
          ? `Generate a concise, strong title for the article. Return ONLY the title. ${languageHint}`
          : `Generate a concise outline in Markdown bullet list based on the article. Return ONLY the outline. ${languageHint}`;
      if (provider.apiType === "gemini") {
        return geminiGenerate(provider, {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: payload.content }] }],
          generationConfig: { temperature: 0.3 }
        });
      }
      return openaiCompatibleChat(provider, {
        model: provider.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: payload.content }
        ],
        temperature: 0.3
      });
    },
    rewriteSelection: async (payload: {
      providerId: string;
      fullText: string;
      selectionText: string;
      instruction: string;
      language: "zh" | "en";
    }) => {
      const provider = getProvider(payload.providerId);
      const languageHint = payload.language === "en" ? "Write in English." : "Write in Chinese.";
      const system =
        `You are a writing assistant. Only rewrite the selected text. Return ONLY the revised selected text, with no quotes, no extra commentary, and no changes outside the selection. ${languageHint}`;
      const user = `Instruction:\n${payload.instruction}\n\nSelected text:\n${payload.selectionText}\n\nContext around selected text:\n${buildRewriteContext(payload.fullText, payload.selectionText)}\n\nRemember: output ONLY the revised selected text.`;
      if (provider.apiType === "gemini") {
        return geminiGenerate(provider, {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.4 }
        });
      }
      return openaiCompatibleChat(provider, {
        model: provider.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.4
      });
    }
  };

  (window as any).api = api;
}

ensureWebApi();
