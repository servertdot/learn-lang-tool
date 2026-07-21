/*
 * Adapted from DarinRowe/googletrans 1.0.28 (MIT).
 * See ../../../THIRD_PARTY_NOTICES.md.
 */

function mix(value: number, pattern: string): number {
  for (let index = 0; index < pattern.length - 2; index += 3) {
    const marker = pattern.charAt(index + 2);
    const shift = marker >= 'a' ? marker.charCodeAt(0) - 87 : Number(marker);
    const shifted = pattern.charAt(index + 1) === '+' ? value >>> shift : value << shift;
    value = pattern.charAt(index) === '+' ? (value + shifted) & 0xffffffff : value ^ shifted;
  }
  return value;
}

export function getGoogleTranslateToken(text: string): string {
  const seed = 406644;
  const bytes = new TextEncoder().encode(text);
  let value = seed;

  for (const byte of bytes) {
    value += byte;
    value = mix(value, '+-a^+6');
  }

  value = mix(value, '+-3^+b+-f');
  value ^= 3293161072;
  if (value < 0) value = (value & 0x7fffffff) + 0x80000000;
  value %= 1_000_000;

  return `${value}.${value ^ seed}`;
}
