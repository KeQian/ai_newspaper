import {
  cursorDate,
  normalizeText,
  sha256,
  truncateGraphemes,
  type ConnectorParseResult,
} from './parser';

const arxivIdPattern =
  /^(?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i;

export async function parseArxivAtom(
  body: Uint8Array,
  cursor: Record<string, unknown>,
): Promise<ConnectorParseResult> {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(body);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('Unsafe XML declaration');
  }
  const entries = Array.from(
    xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  );
  if (entries.length > 100) throw new Error('Too many Atom entries');

  const previous = cursorDate(cursor);
  const seen = new Set<string>();
  const documents = [];
  let latest = previous;

  for (const match of entries) {
    const entry = match[1];
    const versionedId = parseArxivId(requiredText(entry, 'id'));
    const externalId = versionedId.replace(/v\d+$/i, '');
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const title = normalizeText(requiredText(entry, 'title'), 500);
    const summary = normalizeText(requiredText(entry, 'summary'), 20_000);
    const publishedAt = requiredDate(entry, 'published');
    const updatedAt = requiredDate(entry, 'updated');
    if (!latest || updatedAt > latest) latest = updatedAt;
    if (previous && updatedAt <= previous) continue;

    const authors = allElements(entry, 'name')
      .map((name) => normalizeText(name, 160))
      .filter(Boolean)
      .slice(0, 30);
    const categories = Array.from(
      entry.matchAll(/<category\b[^>]*\bterm=(['"])(.*?)\1[^>]*\/?\s*>/gi),
      (category) => decodeXml(category[2]),
    )
      .slice(0, 30)
      .sort();
    const canonicalUrl = `https://arxiv.org/abs/${externalId}`;
    const contentHash = await sha256(
      JSON.stringify({
        externalId,
        title,
        summary,
        authors,
        categories,
        updatedAt: updatedAt.toISOString(),
      }),
    );

    documents.push({
      externalId,
      canonicalUrl,
      title,
      author: authors.length ? authors.join(', ') : null,
      publishedAt,
      language: 'en',
      contentHash,
      allowedExcerpt: summary ? truncateGraphemes(summary, 2000) : null,
      parserVersion: 'arxiv_atom_v1',
    });
  }

  return {
    documents,
    observedCount: entries.length,
    cursor: latest ? { latestUpdatedAt: latest.toISOString() } : {},
  };
}

function requiredText(xml: string, tag: string): string {
  const values = allElements(xml, tag);
  if (!values[0]) throw new Error(`Missing Atom ${tag}`);
  return values[0];
}

function requiredDate(xml: string, tag: string): Date {
  const date = new Date(requiredText(xml, tag));
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Atom ${tag}`);
  return date;
}

function allElements(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    'gi',
  );
  return Array.from(xml.matchAll(pattern), (match) =>
    decodeXml(stripCdata(match[1])),
  );
}

function stripCdata(value: string): string {
  const match = value.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
  return match ? match[1] : value;
}

function decodeXml(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal || hexadecimal) {
        const codePoint = Number.parseInt(
          decimal ?? hexadecimal!,
          decimal ? 10 : 16,
        );
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : '';
      }
      return (
        {
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
        }[entity.toLowerCase()] ?? entity
      );
    },
  );
}

function parseArxivId(value: string): string {
  const url = new URL(normalizeText(value, 500));
  const id = decodeURIComponent(url.pathname.replace(/^\/abs\//, ''));
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['arxiv.org', 'www.arxiv.org'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !arxivIdPattern.test(id)
  ) {
    throw new Error('Invalid arXiv entry id');
  }
  return id;
}
