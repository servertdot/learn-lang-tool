export function normalizeText(raw: string): string {
  return raw.replace(/\n/g, ' ').trim();
}
