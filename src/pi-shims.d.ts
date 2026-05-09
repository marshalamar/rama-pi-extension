declare module "@mariozechner/pi-coding-agent" {
  export type ExtensionContext = {
    ui: {
      notify(message: string, level?: string): void;
      setStatus(name: string, message: string): void;
    };
  };

  export type ExtensionAPI = {
    registerTool(tool: {
      name: string;
      label?: string;
      description?: string;
      promptSnippet?: string;
      promptGuidelines?: string[];
      parameters: unknown;
      execute: (...args: any[]) => Promise<unknown> | unknown;
    }): void;
    registerCommand(
      name: string,
      options: {
        description?: string;
        handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
      },
    ): void;
    on(event: string, handler: (...args: any[]) => Promise<unknown> | unknown): void;
    sendUserMessage(content: string, options?: unknown): void;
  };
}

declare module "typebox" {
  export const Type: {
    Object(schema: Record<string, unknown>, options?: Record<string, unknown>): unknown;
    String(options?: Record<string, unknown>): unknown;
    Number(options?: Record<string, unknown>): unknown;
    Optional(schema: unknown): unknown;
  };
}
