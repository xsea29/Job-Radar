/**
 * Content fingerprinting for duplicate detection.
 *
 * Text is normalised (case, whitespace, punctuation, boilerplate-insensitive)
 * before hashing so the same posting re-published with cosmetic differences
 * collapses to one fingerprint. cyrb53 is a fast, synchronous, non-crypto
 * hash; the backend stores SHA-256 of the same normalised text.
 */
export function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

export function contentHash(description: string): string {
  return cyrb53(normalizeForHash(description));
}

/** Secondary identity: the same role at the same company in the same place. */
export function canonicalJobKey(parts: { company: string; title: string; city?: string }): string {
  return [parts.company, parts.title, parts.city ?? '']
    .map((p) => normalizeForHash(p))
    .join('|');
}

/** Overlapping word triples of the normalised text; the basis for near-duplicate detection. */
export function shingles(text: string, size = 3): Set<string> {
  const w = normalizeForHash(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(' '));
  if (out.size === 0 && w.length) out.add(w.join(' '));
  return out;
}

/** Jaccard similarity of two shingle sets (1 = identical text, 0 = nothing shared). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function textSimilarity(a: string, b: string): number {
  return jaccard(shingles(a), shingles(b));
}
