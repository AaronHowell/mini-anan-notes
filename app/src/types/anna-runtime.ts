export interface AnnaToolInvokePayload {
  tool_id: string;
  method: string;
  args: Record<string, unknown>;
}

export interface AnnaToolInvokeResult {
  success?: boolean;
  tool?: string;
  data?: unknown;
  result?: {
    data?: unknown;
  };
  summary?: string;
  count?: number;
  categories?: string[];
}

export interface AnnaRuntime {
  tools: {
    invoke: (payload: AnnaToolInvokePayload) => Promise<AnnaToolInvokeResult>;
  };
  window?: {
    set_title?: (payload: { title: string }) => Promise<unknown>;
    ready?: (payload?: Record<string, unknown>) => Promise<unknown>;
  };
  storage?: {
    get?: (payload: { key: string }) => Promise<unknown>;
    set?: (payload: { key: string; value: unknown }) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    AnnaAppRuntime?: {
      connect: () => Promise<AnnaRuntime>;
    };
  }
}

export {};