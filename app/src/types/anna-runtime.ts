export interface AnnaToolInvokePayload {
  tool_id: string;
  method: string;
  args: Record<string, unknown>;
}

export interface AnnaRuntime {
  tools?: {
    invoke: <T = unknown>(args: AnnaToolInvokePayload) => Promise<T>;
  };

  window?: {
    set_title?: (args: { title: string }) => Promise<unknown>;
    ready?: (args?: Record<string, unknown>) => Promise<unknown>;
  };

  storage?: {
    get?: (args: { key: string }) => Promise<unknown>;
    set?: (args: { key: string; value: unknown }) => Promise<unknown>;
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