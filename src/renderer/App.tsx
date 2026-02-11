import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor, { EditorHandle } from "./Editor";
import { diffLines } from "diff";
import { marked } from "marked";
import logoUrl from "./assets/logo.png";

const emptyProvider = {
  id: "",
  name: "",
  baseUrl: "",
  model: "",
  apiKey: ""
};

const providerPresets = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", apiType: "openai", authType: "bearer" },
  { id: "moonshot", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.ai/v1", apiType: "openai", authType: "bearer" },
  { id: "siliconflow-com", label: "硅基流动 (SiliconFlow 国际)", baseUrl: "https://api.siliconflow.com/v1", apiType: "openai", authType: "bearer" },
  { id: "siliconflow-cn", label: "硅基流动 (SiliconFlow 中国)", baseUrl: "https://api.siliconflow.cn/v1", apiType: "openai", authType: "bearer" },
  { id: "minimax-cn", label: "MiniMax (中国)", baseUrl: "https://api.minimaxi.com/v1", apiType: "minimax", authType: "bearer" },
  { id: "dashscope", label: "阿里云 DashScope 兼容模式", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", apiType: "openai", authType: "bearer" },
  { id: "gemini", label: "Gemini (AI Studio)", baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiType: "gemini", authType: "x-goog-api-key" }
];

type HistoryItem = {
  id: string;
  label: string;
  createdAt: string;
  content: string;
};

type Language = "zh" | "en";

const i18n = {
  zh: {
    appSubtitle: "本地画布，多引擎协作",
    providers: "模型供应商",
    expand: "展开",
    collapse: "收起",
    selectProvider: "选择供应商",
    add: "新增",
    edit: "编辑",
    remove: "删除",
    providerConfig: "供应商配置",
    providerType: "选择供应商类型",
    providerName: "名称（例如 Kimi、硅基流动）",
    baseUrl: "Base URL（OpenAI 兼容）",
    authBearer: "鉴权方式：Bearer",
    authX: "鉴权方式：X-API-Key",
    authApiKey: "鉴权方式：api-key",
    fetchModels: "获取模型列表",
    fetching: "获取中...",
    modelSelect: "选择模型（或手动输入）",
    modelInput: "模型名称（手动输入）",
    apiKey: "API Key",
    apiKeyKeep: "API Key（留空则保留原有）",
    saveProvider: "保存供应商",
    updateProvider: "更新供应商",
    dialog: "对话框",
    promptPlaceholder: "输入生成文章的提示词",
    generate: "生成文章",
    regenerate: "重新生成",
    selectedChars: "已选字数",
    history: "历史版本",
    snapshot: "保存快照",
    restore: "恢复所选版本",
    open: "打开",
    save: "保存",
    exportDocx: "导出 DOCX",
    editMode: "编辑",
    previewMode: "预览",
    diffTitle: "与所选历史版本的差异",
    diffHint: "选择一个历史版本以查看差异。",
    selectionTitle: "修改选中内容",
    selectionPlaceholder: "输入修改意见",
    apply: "应用修改",
    clear: "清空",
    currentProvider: "当前供应商",
    language: "语言",
    zh: "中文",
    en: "英文",
    apiType: "API 类型",
    apiOpenAI: "OpenAI 兼容",
    apiMiniMax: "MiniMax (中国)",
    apiGemini: "Gemini (AI Studio)",
    authGoog: "鉴权方式：x-goog-api-key",
    noPrompt: "请输入生成文章的提示词。",
    noProvider: "请先配置模型供应商。",
    generating: "正在生成文章...",
    generated: "文章已生成。",
    regenerateFail: "重新生成失败",
    generateFail: "生成失败",
    rewriteFail: "改写失败",
    rewriteDone: "选中文本已更新。",
    rewriteReq: "请输入对选中文本的修改要求。",
    selectText: "请先选中要改写的文本。",
    providerSaved: "供应商已保存。",
    providerRemoved: "供应商已删除。",
    needModelInfo: "需要填写 Base URL 和 API Key 才能获取模型列表。",
    modelsFetched: "模型列表已获取。",
    modelsEmpty: "未返回模型列表，可能该供应商不支持 /models。",
    modelFetchFail: "获取模型列表失败",
    titlePrefix: "正在修改：",
    quit: "退出",
    chatHistory: "对话历史",
    clearChat: "清空对话",
    tools: "智能工具",
    genTitle: "生成标题",
    genOutline: "生成大纲",
    applyTitle: "应用标题",
    applyOutline: "插入大纲",
    cardView: "卡片视图",
    editView: "写作视图",
    suggestTitle: "标题建议",
    suggestOutline: "大纲建议"
    ,
    projects: "项目",
    newProject: "新建项目",
    openProject: "打开项目"
  },
  en: {
    appSubtitle: "Local canvas, multi-engine",
    providers: "Providers",
    expand: "Expand",
    collapse: "Collapse",
    selectProvider: "Select provider",
    add: "Add",
    edit: "Edit",
    remove: "Delete",
    providerConfig: "Provider Setup",
    providerType: "Select provider type",
    providerName: "Name (e.g. Kimi, SiliconFlow)",
    baseUrl: "Base URL (OpenAI-compatible)",
    authBearer: "Auth: Bearer",
    authX: "Auth: X-API-Key",
    authApiKey: "Auth: api-key",
    fetchModels: "Fetch models",
    fetching: "Fetching...",
    modelSelect: "Select model (or type)",
    modelInput: "Model name (manual)",
    apiKey: "API Key",
    apiKeyKeep: "API Key (leave blank to keep)",
    saveProvider: "Save Provider",
    updateProvider: "Update Provider",
    dialog: "Prompt",
    promptPlaceholder: "Enter a prompt to generate an article",
    generate: "Generate",
    regenerate: "Regenerate",
    selectedChars: "Selected chars",
    history: "History",
    snapshot: "Snapshot",
    restore: "Restore selected",
    open: "Open",
    save: "Save",
    exportDocx: "Export DOCX",
    editMode: "Edit",
    previewMode: "Preview",
    diffTitle: "Diff vs selected history",
    diffHint: "Select a history item to view differences.",
    selectionTitle: "Edit selection",
    selectionPlaceholder: "Enter revision instructions",
    apply: "Apply",
    clear: "Clear",
    currentProvider: "Current provider",
    language: "Language",
    zh: "Chinese",
    en: "English",
    apiType: "API Type",
    apiOpenAI: "OpenAI Compatible",
    apiMiniMax: "MiniMax (China)",
    apiGemini: "Gemini (AI Studio)",
    authGoog: "Auth: x-goog-api-key",
    noPrompt: "Enter a prompt to generate an article.",
    noProvider: "Set up a provider first.",
    generating: "Generating article...",
    generated: "Article generated.",
    regenerateFail: "Regenerate failed",
    generateFail: "Generate failed",
    rewriteFail: "Rewrite failed",
    rewriteDone: "Selection updated.",
    rewriteReq: "Enter instructions for the selected text.",
    selectText: "Select a portion of text to rewrite.",
    providerSaved: "Provider saved.",
    providerRemoved: "Provider removed.",
    needModelInfo: "Base URL and API Key are required to fetch models.",
    modelsFetched: "Models fetched.",
    modelsEmpty: "No models returned. Provider might not support /models.",
    modelFetchFail: "Failed to fetch models",
    titlePrefix: "Editing:",
    quit: "Quit",
    chatHistory: "Chat History",
    clearChat: "Clear chat",
    tools: "Tools",
    genTitle: "Generate Title",
    genOutline: "Generate Outline",
    applyTitle: "Apply Title",
    applyOutline: "Insert Outline",
    cardView: "Cards",
    editView: "Write",
    suggestTitle: "Title Suggestion",
    suggestOutline: "Outline Suggestion"
    ,
    projects: "Projects",
    newProject: "New Project",
    openProject: "Open Project"
  }
} as const;

const noopApi: Window["api"] = {
  openFile: async () => null,
  saveFile: async () => null,
  exportDocx: async () => null,
  backupFile: async () => ({ filePath: "", dir: "" }),
  requestQuit: async () => false,
  listProjects: async () => [],
  saveProject: async (payload: { id: string }) => ({ id: payload.id }),
  openProject: async () => null,
  onSaveRequest: () => undefined,
  sendState: () => undefined,
  listProviders: async () => [],
  getActiveProvider: async () => undefined,
  setActiveProvider: async () => false,
  saveProvider: async (provider: ProviderConfig) => provider,
  deleteProvider: async () => false,
  fetchModels: async () => [],
  generateArticle: async () => "",
  assistArticle: async () => "",
  rewriteSelection: async () => ""
};

function nowLabel() {
  const d = new Date();
  return d.toLocaleString();
}

function compactMessages(messages: { role: "user" | "assistant"; content: string }[]) {
  const MAX_HISTORY_MESSAGES = 8;
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

export default function App() {
  const editorRef = useRef<EditorHandle>(null);
  const hasApi = typeof window !== "undefined" && !!(window as any).api;
  const api = hasApi ? window.api : noopApi;

  const [filePath, setFilePath] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [selectionText, setSelectionText] = useState<string>("");
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [selectionInstruction, setSelectionInstruction] = useState<string>("");
  const [chatInput, setChatInput] = useState<string>("");
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [language, setLanguage] = useState<Language>("zh");
  const [lastBackupDir, setLastBackupDir] = useState<string>("");
  const [conversation, setConversation] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [titleSuggestion, setTitleSuggestion] = useState<string>("");
  const [outlineSuggestion, setOutlineSuggestion] = useState<string>("");
  const [cardMode, setCardMode] = useState(false);
  const [cards, setCards] = useState<{ id: string; text: string }[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; title: string; content: string; updatedAt: string }[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    const cryptoObj = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    return cryptoObj?.randomUUID?.() ?? String(Date.now());
  });
  const [dirty, setDirty] = useState(false);

  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | undefined>(undefined);
  const [providerForm, setProviderForm] = useState<ProviderConfig>({
    ...emptyProvider,
    apiType: "openai",
    authType: "bearer"
  });
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<string>("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [lastModelFetchKey, setLastModelFetchKey] = useState<string>("");
  const [providerCollapsed, setProviderCollapsed] = useState<boolean>(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  function extractTitle(md: string) {
    const lines = md.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const heading = lines.find((l) => l.startsWith("#"));
    if (heading) return heading.replace(/^#+\s*/, "").trim();
    return lines[0] ?? "";
  }

  const t = i18n[language];
  const articleTitle = extractTitle(currentContent);

  useEffect(() => {
    const stored = localStorage.getItem("cw_language");
    if (stored === "zh" || stored === "en") {
      setLanguage(stored);
    } else {
      const sys = navigator.language?.toLowerCase() ?? "";
      setLanguage(sys.startsWith("zh") ? "zh" : "en");
    }
    (async () => {
      try {
        const list = await api.listProviders();
        setProviders(list);
        const active = await api.getActiveProvider();
        setActiveProviderId(active ?? list[0]?.id);
        const projects = await api.listProjects();
        setProjects(projects);
      } catch {
        // Fail safe: keep UI usable even if IPC init fails
      }
    })();
  }, [api]);

  useEffect(() => {
    localStorage.setItem("cw_language", language);
  }, [language]);

  useEffect(() => {
    if (!hasApi) return;
    api.onSaveRequest(() => {
      api.sendState({
        id: currentProjectId,
        title: articleTitle || "Untitled",
        content: currentContent
      });
      setDirty(false);
    });
  }, [api, hasApi, currentProjectId, articleTitle, currentContent]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(async () => {
      if (!hasApi) return;
      await api.saveProject({
        id: currentProjectId,
        title: articleTitle || "Untitled",
        content: currentContent
      });
      const list = await api.listProjects();
      setProjects(list);
      setDirty(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [api, hasApi, dirty, currentProjectId, articleTitle, currentContent]);


  useEffect(() => {
    if (!selectedHistoryId && history.length > 0) {
      setSelectedHistoryId(history[0].id);
    }
  }, [history, selectedHistoryId]);

  useEffect(() => {
    if (cardMode) {
      setCards(parseCards(currentContent));
    }
  }, [cardMode]);

  useEffect(() => {
    if (viewMode !== "edit" || cardMode) return;
    editorRef.current?.setValue(currentContent);
  }, [viewMode, cardMode, currentContent]);

  useEffect(() => {
    const baseUrl = providerForm.baseUrl.trim();
    const apiKey = providerForm.apiKey?.trim() ?? "";
    if (!baseUrl || apiKey.length < 8) return;
    const key = `${baseUrl}|${apiKey}|${providerForm.authType ?? "bearer"}`;
    if (key === lastModelFetchKey) return;
    const timer = setTimeout(() => {
      fetchModels();
      setLastModelFetchKey(key);
    }, 700);
    return () => clearTimeout(timer);
  }, [providerForm.baseUrl, providerForm.apiKey, providerForm.authType, lastModelFetchKey]);

  useEffect(() => {
    if (!selectionRange) {
      setSelectionInstruction("");
      editorRef.current?.setPinnedSelection(null);
      return;
    }
    editorRef.current?.setPinnedSelection(selectionRange);
  }, [selectionRange]);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeProviderId),
    [providers, activeProviderId]
  );

  async function handleOpen() {
    const result = await api.openFile();
    if (!result) return;
    setFilePath(result.filePath);
    editorRef.current?.setValue(result.content);
    setContent(result.content);
    setDirty(false);
    pushHistory(language === "zh" ? "打开文件" : "Opened file", result.content);
    setStatus(language === "zh" ? `已打开 ${result.filePath}` : `Opened ${result.filePath}`);
  }

  async function handleSave() {
    const content = editorRef.current?.getValue() ?? currentContent;
    const result = await api.saveFile({ filePath: filePath ?? undefined, content });
    if (!result) return;
    setFilePath(result.filePath);
    setDirty(false);
    setStatus(language === "zh" ? `已保存 ${result.filePath}` : `Saved ${result.filePath}`);
  }

  async function handleExportDocx() {
    try {
      const content = editorRef.current?.getValue() ?? currentContent;
      const html = marked.parse(content || "");
      const result = await api.exportDocx({ markdown: content, html });
      if (!result) return;
      setStatus(language === "zh" ? `已导出 DOCX 到 ${result.filePath}` : `Exported DOCX to ${result.filePath}`);
    } catch (err: any) {
      setStatus(language === "zh" ? `导出失败: ${err?.message ?? err}` : `Export failed: ${err?.message ?? err}`);
    }
  }

  async function handleGenerate() {
    if (!activeProvider) {
      setStatus(t.noProvider);
      return;
    }
    if (!chatInput.trim()) {
      setStatus(t.noPrompt);
      return;
    }
    try {
      const backup = await api.backupFile({
        content: editorRef.current?.getValue() ?? currentContent,
        reason: "before_generate",
        title: articleTitle || "untitled"
      });
      setLastBackupDir(backup.dir);
      setIsBusy(true);
      setStatus(t.generating);
      const nextMessages = [...conversation, { role: "user", content: chatInput.trim() }];
      const content = await api.generateArticle({
        providerId: activeProvider.id,
        messages: compactMessages(nextMessages),
        language
      });
      editorRef.current?.setValue(content);
      setContent(content);
      pushHistory(language === "zh" ? "生成文章" : "Generated", content);
      setLastPrompt(chatInput.trim());
      setConversation([...nextMessages, { role: "assistant", content }]);
      setStatus(t.generated);
    } catch (err: any) {
      setStatus(`${t.generateFail}: ${err?.message ?? err}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!activeProvider) {
      setStatus(t.noProvider);
      return;
    }
    if (!lastPrompt) {
      setStatus(language === "zh" ? "没有可用的上次提示词。" : "No previous prompt.");
      return;
    }
    try {
      const backup = await api.backupFile({
        content: editorRef.current?.getValue() ?? currentContent,
        reason: "before_regenerate",
        title: articleTitle || "untitled"
      });
      setLastBackupDir(backup.dir);
      setIsBusy(true);
      setStatus(language === "zh" ? "正在重新生成..." : "Regenerating...");
      const base = [...conversation];
      if (base.length > 0 && base[base.length - 1].role === "assistant") {
        base.pop();
      }
      if (base.length === 0 || base[base.length - 1].role !== "user") {
        base.push({ role: "user", content: lastPrompt });
      }
      const content = await api.generateArticle({
        providerId: activeProvider.id,
        messages: compactMessages(base),
        language
      });
      editorRef.current?.setValue(content);
      setContent(content);
      pushHistory(language === "zh" ? "重新生成" : "Regenerated", content);
      setStatus(language === "zh" ? "已重新生成。" : "Regenerated.");
      setConversation([...base, { role: "assistant", content }]);
    } catch (err: any) {
      setStatus(`${t.regenerateFail}: ${err?.message ?? err}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRewriteSelection(overrideInstruction?: string) {
    if (!selectionRange) {
      setStatus(t.selectText);
      return;
    }
    if (!activeProvider) {
      setStatus(t.noProvider);
      return;
    }
    const instructionText = (overrideInstruction ?? selectionInstruction).trim();
    if (!instructionText) {
      setStatus(t.rewriteReq);
      return;
    }

    try {
      const backup = await api.backupFile({
        content: editorRef.current?.getValue() ?? currentContent,
        reason: "before_rewrite",
        title: articleTitle || "untitled"
      });
      setLastBackupDir(backup.dir);
      setIsBusy(true);
      setStatus(language === "zh" ? "正在改写选中文本..." : "Rewriting selection...");
      const fullText = editorRef.current?.getValue() ?? currentContent;
      const effectiveSelectionText =
        selectionText.trim().length > 0
          ? selectionText
          : fullText.slice(selectionRange.from, selectionRange.to);
      if (!effectiveSelectionText.trim()) {
        setStatus(t.selectText);
        return;
      }
      const revised = await api.rewriteSelection({
        providerId: activeProvider.id,
        fullText,
        selectionText: effectiveSelectionText,
        instruction: instructionText,
        language
      });
      editorRef.current?.replaceRange(selectionRange.from, selectionRange.to, revised);
      const updated = editorRef.current?.getValue() ?? "";
      setContent(updated);
      pushHistory(language === "zh" ? "模型改写" : "Rewrite", updated);
      setStatus(t.rewriteDone);
      setSelectionText("");
      setSelectionRect(null);
      setSelectionRange(null);
      setSelectionInstruction("");
    } catch (err: any) {
      setStatus(`${t.rewriteFail}: ${err?.message ?? err}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGenerateTitle() {
    if (!activeProvider) {
      setStatus(t.noProvider);
      return;
    }
    try {
      setIsBusy(true);
      const suggestion = await api.assistArticle({
        providerId: activeProvider.id,
        purpose: "title",
        content: currentContent,
        language
      });
      setTitleSuggestion(suggestion.trim());
    } catch (err: any) {
      setStatus(`${t.generateFail}: ${err?.message ?? err}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGenerateOutline() {
    if (!activeProvider) {
      setStatus(t.noProvider);
      return;
    }
    try {
      setIsBusy(true);
      const suggestion = await api.assistArticle({
        providerId: activeProvider.id,
        purpose: "outline",
        content: currentContent,
        language
      });
      setOutlineSuggestion(suggestion.trim());
    } catch (err: any) {
      setStatus(`${t.generateFail}: ${err?.message ?? err}`);
    } finally {
      setIsBusy(false);
    }
  }

  function applyTitleToContent(title: string) {
    if (!title.trim()) return;
    const lines = currentContent.split(/\r?\n/);
    if (lines[0]?.startsWith("#")) {
      lines[0] = `# ${title.trim()}`;
      updateContent(lines.join("\n"));
      return;
    }
    updateContent(`# ${title.trim()}\n\n${currentContent}`);
  }

  function insertOutline(outline: string) {
    if (!outline.trim()) return;
    const lines = currentContent.split(/\r?\n/);
    let insertAt = 0;
    if (lines[0]?.startsWith("#")) {
      insertAt = 1;
      while (lines[insertAt] === "") insertAt++;
    }
    const outlineBlock = `${language === "zh" ? "## 大纲" : "## Outline"}\n${outline.trim()}\n`;
    const newLines = [
      ...lines.slice(0, insertAt),
      "",
      outlineBlock,
      ...lines.slice(insertAt)
    ];
    updateContent(newLines.join("\n"));
  }

  function updateContent(next: string) {
    editorRef.current?.setValue(next);
    setContent(next);
    if (cardMode) {
      setCards(parseCards(next));
    }
  }

  function handleClearChat() {
    setConversation([]);
  }

  async function handleNewProject() {
    const cryptoObj = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    const newId = cryptoObj?.randomUUID?.() ?? String(Date.now());
    setCurrentProjectId(newId);
    setConversation([]);
    setTitleSuggestion("");
    setOutlineSuggestion("");
    setCardMode(false);
    updateContent("");
    await api.saveProject({
      id: newId,
      title: "Untitled",
      content: ""
    });
    const list = await api.listProjects();
    setProjects(list);
  }

  async function handleOpenProject(id: string) {
    const project = await api.openProject(id);
    if (!project) return;
    setCurrentProjectId(project.id);
    updateContent(project.content);
    setConversation([]);
    setCardMode(false);
    setDirty(false);
  }

  function parseCards(text: string) {
    const parts = text.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
    const cryptoObj = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    return parts.map((p) => ({
      id: cryptoObj?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: p
    }));
  }

  function rebuildFromCards(nextCards: { id: string; text: string }[]) {
    const next = nextCards.map((c) => c.text.trim()).filter(Boolean).join("\n\n");
    updateContent(next);
  }

  function pushHistory(label: string, content: string) {
    const cryptoObj = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    const item: HistoryItem = {
      id: cryptoObj?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label,
      createdAt: nowLabel(),
      content
    };
    setHistory((prev) => [item, ...prev]);
  }

  function handleSnapshot() {
    const content = editorRef.current?.getValue() ?? currentContent;
    pushHistory(language === "zh" ? "快照" : "Snapshot", content);
    setStatus(language === "zh" ? "快照已保存。" : "Snapshot saved.");
  }

  function handleRestoreHistory(id: string) {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    editorRef.current?.setValue(item.content);
    setContent(item.content);
    setStatus(language === "zh" ? `已恢复: ${item.label}` : `Restored: ${item.label}`);
  }

  function startAddProvider() {
    setEditingProviderId(null);
    const cryptoObj = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    const id = cryptoObj?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setProviderForm({ ...emptyProvider, id, apiType: "openai", authType: "bearer" });
    setProviderType("");
    setModelOptions([]);
    setLastModelFetchKey("");
  }

  function startEditProvider(provider: ProviderPublic) {
    setEditingProviderId(provider.id);
    setProviderForm({ ...provider, apiKey: "", apiType: provider.apiType ?? "openai", authType: provider.authType ?? "bearer" });
    setProviderType("");
    setModelOptions([]);
    setLastModelFetchKey("");
  }

  async function fetchModels() {
    if (!providerForm.baseUrl || !providerForm.apiKey) {
      setStatus(t.needModelInfo);
      return;
    }
    try {
      setModelLoading(true);
      setStatus(language === "zh" ? "正在获取模型列表..." : "Fetching models...");
    const models = await api.fetchModels({
      baseUrl: providerForm.baseUrl,
      apiKey: providerForm.apiKey,
      authType: providerForm.authType ?? "bearer",
      apiType: providerForm.apiType ?? "openai"
    });
      setModelOptions(models);
      if (models.length > 0) {
        setProviderForm((p) => ({ ...p, model: models[0] }));
      }
      setStatus(models.length > 0 ? t.modelsFetched : t.modelsEmpty);
    } catch (err: any) {
      setStatus(`${t.modelFetchFail}: ${err?.message ?? err}`);
    } finally {
      setModelLoading(false);
    }
  }

  async function saveProvider() {
    if (!providerForm.name || !providerForm.baseUrl || !providerForm.model) {
      setStatus(language === "zh" ? "供应商名称、Base URL、模型名称为必填项。" : "Provider name, base URL, and model are required.");
      return;
    }
    const saved = await api.saveProvider(providerForm);
    const list = await api.listProviders();
    setProviders(list);
    setActiveProviderId(saved.id);
    setProviderForm(emptyProvider);
    setEditingProviderId(null);
    setStatus(t.providerSaved);
  }

  async function deleteProvider(id: string) {
    await api.deleteProvider(id);
    const list = await api.listProviders();
    setProviders(list);
    setActiveProviderId(list[0]?.id);
    setStatus(t.providerRemoved);
  }

  async function setActive(id: string) {
    await api.setActiveProvider(id);
    setActiveProviderId(id);
  }

  const selectedHistory = history.find((h) => h.id === selectedHistoryId);
  const diff = selectedHistory
    ? diffLines(selectedHistory.content, currentContent)
    : [];
  const previewHtml = useMemo(() => marked.parse(currentContent || ""), [currentContent]);

  useEffect(() => {
    if (articleTitle) {
      document.title = `${t.titlePrefix}${articleTitle}`;
    } else {
      document.title = "Canvas Writer";
    }
  }, [articleTitle, t.titlePrefix]);

  function setContent(next: string) {
    setCurrentContent(next);
    setDirty(true);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-row">
            <img className="brand-logo" src={logoUrl} alt="Canvas Writer Logo" />
            <div>
              <div className="brand-title">Canvas Writer</div>
              <div className="brand-sub">{t.appSubtitle}</div>
            </div>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title">{t.providers}</div>
            <button className="btn ghost" onClick={() => setProviderCollapsed((v) => !v)}>
              {providerCollapsed ? t.expand : t.collapse}
            </button>
          </div>
          {!providerCollapsed && (
            <>
              <select
                className="select"
                value={activeProviderId ?? ""}
                onChange={(e) => setActive(e.target.value)}
              >
                <option value="" disabled>
                  {t.selectProvider}
                </option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <div className="button-row">
                <button className="btn" onClick={startAddProvider}>{t.add}</button>
                {activeProvider && (
                  <button className="btn" onClick={() => startEditProvider(activeProvider)}>{t.edit}</button>
                )}
                {activeProvider && (
                  <button className="btn danger" onClick={() => deleteProvider(activeProvider.id)}>{t.remove}</button>
                )}
              </div>

              <div className="panel-title">{t.providerConfig}</div>
              <select
                className="select"
                value={providerType}
                onChange={(e) => {
                  const next = e.target.value;
                  setProviderType(next);
                  const preset = providerPresets.find((p) => p.id === next);
              if (preset) {
                setProviderForm((p) => ({
                  ...p,
                  name: p.name || preset.label,
                  baseUrl: preset.baseUrl,
                  apiType: (preset as any).apiType ?? p.apiType ?? "openai",
                  authType: (preset as any).authType ?? p.authType ?? "bearer"
                }));
              }
                }}
              >
                <option value="">{t.providerType}</option>
                {providerPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder={t.providerName}
                value={providerForm.name}
                onChange={(e) => setProviderForm((p) => ({ ...p, name: e.target.value }))}
              />
              <select
                className="select"
                value={providerForm.apiType ?? "openai"}
                onChange={(e) => {
                  const next = e.target.value as ProviderConfig["apiType"];
                  setProviderForm((p) => ({
                    ...p,
                    apiType: next,
                    authType: next === "gemini" ? "x-goog-api-key" : "bearer"
                  }));
                }}
              >
                <option value="openai">{t.apiOpenAI}</option>
                <option value="minimax">{t.apiMiniMax}</option>
                <option value="gemini">{t.apiGemini}</option>
              </select>
              <input
                className="input"
                placeholder={t.baseUrl}
                value={providerForm.baseUrl}
                onChange={(e) => setProviderForm((p) => ({ ...p, baseUrl: e.target.value }))}
              />
              <select
                className="select"
                value={providerForm.authType ?? "bearer"}
                onChange={(e) => setProviderForm((p) => ({ ...p, authType: e.target.value as ProviderConfig["authType"] }))}
              >
                <option value="bearer">{t.authBearer}</option>
                <option value="x-api-key">{t.authX}</option>
                <option value="api-key">{t.authApiKey}</option>
                <option value="x-goog-api-key">{t.authGoog}</option>
              </select>
              <div className="button-row">
                <button className="btn" onClick={fetchModels} disabled={modelLoading}>
                  {modelLoading ? t.fetching : t.fetchModels}
                </button>
              </div>
              <select
                className="select"
                value={providerForm.model}
                onChange={(e) => setProviderForm((p) => ({ ...p, model: e.target.value }))}
              >
                <option value="">{t.modelSelect}</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder={t.modelInput}
                value={providerForm.model}
                onChange={(e) => setProviderForm((p) => ({ ...p, model: e.target.value }))}
              />
              <input
                className="input"
                placeholder={editingProviderId ? t.apiKeyKeep : t.apiKey}
                value={providerForm.apiKey ?? ""}
                onChange={(e) => setProviderForm((p) => ({ ...p, apiKey: e.target.value }))}
                type="password"
              />
              <button className="btn primary" onClick={saveProvider}>
                {editingProviderId ? t.updateProvider : t.saveProvider}
              </button>
            </>
          )}
          <div className="hint provider-current">
            {t.currentProvider}: {activeProvider?.name ?? "—"}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">{t.dialog}</div>
          <div className="chat-history">
            {conversation.length === 0 && (
              <div className="hint">{language === "zh" ? "暂无对话记录。" : "No messages yet."}</div>
            )}
            {conversation.map((m, idx) => (
              <div key={`${m.role}-${idx}`} className={`chat-item ${m.role}`}>
                <div className="chat-role">{m.role === "user" ? (language === "zh" ? "我" : "You") : "AI"}</div>
                <div className="chat-content">{m.content}</div>
              </div>
            ))}
          </div>
          <textarea
            className="textarea"
            placeholder={t.promptPlaceholder}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <div className="button-row">
            <label className="hint">{t.language}</label>
            <select
              className="select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="zh">{t.zh}</option>
              <option value="en">{t.en}</option>
            </select>
            <button className="btn" onClick={handleClearChat}>{t.clearChat}</button>
          </div>
          <div className="button-row">
            <button className="btn primary" onClick={handleGenerate} disabled={isBusy}>
              {isBusy ? (language === "zh" ? "处理中..." : "Working...") : t.generate}
            </button>
            <button className="btn" onClick={handleRegenerate} disabled={isBusy || !lastPrompt}>
              {t.regenerate}
            </button>
          </div>
          <div className="hint">
            {t.selectedChars}: {selectionText.length}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">{t.tools}</div>
          <div className="button-row">
            <button className="btn" onClick={handleGenerateTitle} disabled={isBusy}>
              {t.genTitle}
            </button>
            <button className="btn" onClick={handleGenerateOutline} disabled={isBusy}>
              {t.genOutline}
            </button>
          </div>
          {titleSuggestion && (
            <div className="suggestion">
              <div className="hint">{t.suggestTitle}</div>
              <div className="suggestion-text">{titleSuggestion}</div>
              <button className="btn" onClick={() => applyTitleToContent(titleSuggestion)}>{t.applyTitle}</button>
            </div>
          )}
          {outlineSuggestion && (
            <div className="suggestion">
              <div className="hint">{t.suggestOutline}</div>
              <div className="suggestion-text">{outlineSuggestion}</div>
              <button className="btn" onClick={() => insertOutline(outlineSuggestion)}>{t.applyOutline}</button>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-title">{t.projects}</div>
          <button className="btn" onClick={handleNewProject}>{t.newProject}</button>
          <div className="history">
            {projects.map((p) => (
              <button
                key={p.id}
                className={`history-item ${currentProjectId === p.id ? "active" : ""}`}
                onClick={() => handleOpenProject(p.id)}
              >
                <div className="history-label">{p.title || "Untitled"}</div>
                <div className="history-time">{new Date(p.updatedAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">{t.history}</div>
          <button className="btn" onClick={handleSnapshot}>{t.snapshot}</button>
          <div className="history">
            {history.map((h) => (
              <button
                key={h.id}
                className={`history-item ${selectedHistoryId === h.id ? "active" : ""}`}
                onClick={() => setSelectedHistoryId(h.id)}
              >
                <div className="history-label">{h.label}</div>
                <div className="history-time">{h.createdAt}</div>
              </button>
            ))}
          </div>
          {selectedHistory && (
            <button className="btn" onClick={() => handleRestoreHistory(selectedHistory.id)}>
              {t.restore}
            </button>
          )}
        </section>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div className="toolbar-left">
            <button className="btn" onClick={handleOpen}>{t.open}</button>
            <button className="btn" onClick={handleSave}>{t.save}</button>
            <button className="btn" onClick={handleExportDocx}>{t.exportDocx}</button>
            <button className="btn danger" onClick={() => api.requestQuit()}>{t.quit}</button>
          </div>
          <div className="toolbar-right">
            <div className="button-row">
              <button className={`btn ${viewMode === "edit" ? "primary" : ""}`} onClick={() => setViewMode("edit")}>
                {t.editMode}
              </button>
              <button className={`btn ${viewMode === "preview" ? "primary" : ""}`} onClick={() => setViewMode("preview")}>
                {t.previewMode}
              </button>
              <button className={`btn ${cardMode ? "primary" : ""}`} onClick={() => setCardMode((v) => !v)}>
                {cardMode ? t.editView : t.cardView}
              </button>
            </div>
            <div className="status">
              {articleTitle ? `${t.titlePrefix}${articleTitle}` : ""}
            </div>
            <div className="status">{status}</div>
          </div>
        </header>

        <section className="editor-shell">
          <div className={`editor-wrap ${viewMode === "edit" && !cardMode ? "" : "hidden"}`}>
            <Editor
              ref={editorRef}
              initialValue=""
              onChange={setContent}
              onSelectionChange={(text, rect) => {
                if (text.trim().length > 0 && rect) {
                  setSelectionText(text);
                  setSelectionRect(rect);
                  const sel = editorRef.current?.getSelection();
                  if (sel && sel.from !== sel.to) {
                    setSelectionRange({ from: sel.from, to: sel.to });
                  }
                }
              }}
            />
          </div>

          <div className={viewMode === "preview" && !cardMode ? "preview" : "preview hidden"} dangerouslySetInnerHTML={{ __html: previewHtml }} />

          {cardMode && (
            <div className="cards-view">
              {cards.length === 0 && <div className="hint">{language === "zh" ? "暂无内容。" : "No content."}</div>}
              {cards.map((card, idx) => (
                <div
                  key={card.id}
                  className="card-item"
                  draggable
                  onDragStart={() => setDragId(card.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragId || dragId === card.id) return;
                    const next = [...cards];
                    const fromIdx = next.findIndex((c) => c.id === dragId);
                    const toIdx = next.findIndex((c) => c.id === card.id);
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(toIdx, 0, moved);
                    setCards(next);
                    rebuildFromCards(next);
                    setDragId(null);
                  }}
                >
                  <div className="card-index">{idx + 1}</div>
                  <div className="card-text">{card.text}</div>
                </div>
              ))}
            </div>
          )}

          {!cardMode && viewMode === "edit" && selectionRange && selectionRect && (
            <div
              className="selection-popover"
              style={{
                left: selectionRect.left + 8,
                top: selectionRect.bottom + 8
              }}
            >
              <div className="popover-title">{t.selectionTitle}</div>
              <textarea
                className="textarea"
                placeholder={t.selectionPlaceholder}
                value={selectionInstruction}
                onChange={(e) => setSelectionInstruction(e.target.value)}
              />
              <div className="button-row">
                <button className="btn primary" onClick={handleRewriteSelection} disabled={isBusy}>
                  {t.apply}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="diff-panel">
          <div className="panel-title">{t.diffTitle}</div>
          <div className="diff">
            {diff.length === 0 && <div className="hint">{t.diffHint}</div>}
            {diff.map((part, idx) => (
              <span
                key={idx}
                className={part.added ? "diff-add" : part.removed ? "diff-remove" : "diff-same"}
              >
                {part.value}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
