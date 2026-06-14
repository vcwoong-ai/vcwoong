/**
 * Korean character counting rule:
 * Korean characters (가-힣) = 1.0
 * English/numeric characters = 0.5
 * Other = 0.5
 */
export function countChars(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      count += 1;
    } else if (char.match(/[a-zA-Z0-9]/)) {
      count += 0.5;
    } else if (char.match(/\s/)) {
      // spaces don't count
    } else {
      count += 0.5;
    }
  }
  return Math.round(count);
}
