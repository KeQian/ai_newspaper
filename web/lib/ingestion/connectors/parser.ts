import type { ParsedRawDocument } from './types';

export type ConnectorParseResult = {
  documents: ParsedRawDocument[];
  observedCount: number;
  cursor: Record<string, unknown>;
};

export function normalizeText(value: string, maximumGraphemes: number): string {
  const normalized = stripControlCharacters(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncateGraphemes(normalized, maximumGraphemes);
}

export function truncateGraphemes(value: string, maximum: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(value), ({ segment }) => segment)
    .slice(0, maximum)
    .join('');
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function cursorDate(
  cursor: Record<string, unknown>,
  key = 'latestUpdatedAt',
): Date | null {
  const value = cursor[key];
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return !(
        codePoint <= 8 ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        codePoint === 127
      );
    })
    .join('');
}
