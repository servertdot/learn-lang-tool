/** Prefixed console logging for extension debug (content / SW / offscreen). */
export function lltLog(scope: string, ...args: unknown[]): void {
  console.log(`[llt:${scope}]`, ...args);
}

export function lltWarn(scope: string, ...args: unknown[]): void {
  console.warn(`[llt:${scope}]`, ...args);
}

export function lltError(scope: string, ...args: unknown[]): void {
  console.error(`[llt:${scope}]`, ...args);
}
