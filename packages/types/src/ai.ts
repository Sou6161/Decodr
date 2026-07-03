/** Providers the AI abstraction is designed to support. Only one is wired at a time. */
export const AIProviderName = {
  OpenAI: 'openai',
  Claude: 'claude',
  Gemini: 'gemini',
  Ollama: 'ollama',
} as const;
export type AIProviderName =
  (typeof AIProviderName)[keyof typeof AIProviderName];

/** A file slice included in a focused explanation context. */
export interface ContextFile {
  path: string;
  /** Full or truncated file content. */
  content: string;
  /** True when the content was truncated to respect the token budget. */
  truncated: boolean;
}

/**
 * The focused context assembled for an explanation. Never the whole repo —
 * only the requested component and its directly related files.
 */
export interface ExplanationContext {
  /** The component/feature the question is about, if resolved. */
  focusName: string | null;
  files: ContextFile[];
  /** Names of components related to the focus (neighbors in the graph). */
  relatedComponents: string[];
}

/** Request to explain part of a repository. */
export interface ExplainRequest {
  question: string;
}

/** Result of an explanation, including provenance for transparency. */
export interface ExplainResponse {
  answer: string;
  /** The provider that generated the answer. */
  provider: AIProviderName;
  model: string;
  /** Repo-relative paths that were sent as context (for "sources" UI). */
  contextPaths: string[];
}
