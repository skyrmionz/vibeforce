/**
 * Unicode security utilities — strip dangerous codepoints from tool inputs.
 */

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

/** Set of dangerous Unicode codepoints that can cause security issues. */
const DANGEROUS_CODEPOINTS = new Set<number>([
  // BiDi controls
  ...range(0x202a, 0x202e),
  ...range(0x2066, 0x2069),
  // Zero-width characters
  0x200b, // zero-width space
  0x200c, // zero-width non-joiner
  0x200d, // zero-width joiner
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x2060, // word joiner
  0xfeff, // zero-width no-break space / BOM
  // Soft hyphen
  0x00ad,
]);

/**
 * Strip dangerous Unicode codepoints from a string.
 * Returns the cleaned string with all dangerous characters removed.
 */
export function stripDangerousUnicode(text: string): string {
  let result = "";
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (!DANGEROUS_CODEPOINTS.has(cp)) {
      result += char;
    }
  }
  return result;
}

/**
 * Check whether a string contains any dangerous Unicode codepoints.
 */
export function hasDangerousUnicode(text: string): boolean {
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (DANGEROUS_CODEPOINTS.has(cp)) {
      return true;
    }
  }
  return false;
}
