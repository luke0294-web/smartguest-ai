/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API base for LAN/mobile dev (e.g. http://192.168.1.5:8080). */
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
