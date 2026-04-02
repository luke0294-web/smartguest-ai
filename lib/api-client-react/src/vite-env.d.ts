interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_INTERNAL_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
