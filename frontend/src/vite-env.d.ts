/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MCP_BASE_URL?: string;
  readonly VITE_MCP_ENDPOINT?: string;
  readonly VITE_REST_API_URL?: string;
  readonly VITE_MCP_API_URL?: string;
  readonly VITE_MCP_API_ENDPOINT?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
