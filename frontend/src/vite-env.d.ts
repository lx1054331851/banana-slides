/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION_TAG?: string
  readonly VITE_APP_COMMIT_SHA?: string
  readonly VITE_APP_COMMIT_SHORT_SHA?: string
  readonly [key: string]: string | boolean | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
