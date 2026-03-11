// Global type declaration for NodeJS.Timeout used by setTimeout/setInterval
// This avoids pulling in @types/node for a browser-only project
declare namespace NodeJS {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Timeout extends ReturnType<typeof globalThis.setTimeout> {}
}
