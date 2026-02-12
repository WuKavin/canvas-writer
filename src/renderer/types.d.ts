export {};

declare global {
  interface Window {
    api: {
      openFile: () => Promise<{ filePath: string; content: string } | null>;
      saveFile: (payload: { filePath?: string; content: string }) => Promise<{ filePath: string } | null>;
      exportDocx: (payload: { markdown: string; html: string }) => Promise<{ filePath: string } | null>;
      backupFile: (payload: { content: string; reason: string; title?: string }) => Promise<{ filePath: string; dir: string }>;
      requestQuit: () => Promise<boolean>;
      listProjects: () => Promise<{ id: string; title: string; content: string; updatedAt: string }[]>;
      saveProject: (payload: { id: string; title: string; content: string }) => Promise<{ id: string }>;
      openProject: (id: string) => Promise<{ id: string; title: string; content: string; updatedAt: string } | null>;
      deleteProject: (id: string) => Promise<boolean>;
      onSaveRequest: (handler: () => void) => void;
      sendState: (payload: { id: string; title: string; content: string }) => void;

      listProviders: () => Promise<ProviderPublic[]>;
      getActiveProvider: () => Promise<string | undefined>;
      setActiveProvider: (id: string) => Promise<boolean>;
      saveProvider: (provider: ProviderConfig) => Promise<ProviderPublic>;
      deleteProvider: (id: string) => Promise<boolean>;
      fetchModels: (payload: { baseUrl: string; apiKey: string; authType?: "bearer" | "x-api-key" | "api-key" | "x-goog-api-key"; apiType?: "openai" | "gemini" | "minimax" }) => Promise<string[]>;

      generateArticle: (payload: { providerId: string; messages: { role: "user" | "assistant"; content: string }[]; language: "zh" | "en" }) => Promise<string>;
      assistArticle: (payload: { providerId: string; purpose: "title" | "outline"; content: string; language: "zh" | "en" }) => Promise<string>;

      rewriteSelection: (payload: {
        providerId: string;
        fullText: string;
        selectionText: string;
        instruction: string;
        language: "zh" | "en";
      }) => Promise<string>;
    };
  }
}

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
