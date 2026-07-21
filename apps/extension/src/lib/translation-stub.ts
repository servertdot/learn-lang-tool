/** Deterministic stub used for pipeline demos / tests without WASM. */
export function translateWithStub(text: string, from: string, to: string): string {
  return `[${from}→${to}] ${text}`;
}
