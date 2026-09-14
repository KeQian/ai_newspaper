import { z } from 'zod';

export type RichTextDocument = {
  schemaVersion: 1;
  type: 'doc';
  content: Array<Record<string, unknown>>;
};

export const richTextDocumentSchema: z.ZodType<RichTextDocument> = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal('doc'),
    content: z.array(z.record(z.unknown())).max(2_000),
  })
  .strict()
  .superRefine((document, context) => {
    document.content.forEach((block, index) =>
      validateBlock(block, context, ['content', index]),
    );
  });

const seoSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(300),
  })
  .strict();

const aiDisclosureSchema = z
  .object({
    assisted: z.boolean(),
    note: z.string().trim().max(1000),
  })
  .strict();

export const contentDraftInputSchema = z
  .object({
    type: z.enum(['news', 'briefing', 'analysis']),
    title: z.string().trim().min(1).max(160),
    dek: z.string().trim().max(280).default(''),
    summary: z.string().trim().min(1).max(1000),
    body: richTextDocumentSchema,
    verification: z.enum(['confirmed', 'developing', 'unverified']),
    importance: z.number().int().min(1).max(5),
    actionability: z.number().int().min(1).max(5),
    sourceIds: z.array(z.string().uuid()).min(1).max(100),
    topicIds: z.array(z.string().uuid()).max(30).default([]),
    seo: seoSchema,
    aiDisclosure: aiDisclosureSchema,
    changeSummary: z.string().trim().min(1).max(300),
  })
  .strict();

export const contentUpdateInputSchema = contentDraftInputSchema.extend({
  version: z.number().int().positive(),
});

export const versionInputSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export const publishInputSchema = versionInputSchema.extend({
  scheduledAt: z.coerce.date().optional(),
});
export const withdrawInputSchema = versionInputSchema.extend({
  reason: z.string().trim().min(1).max(1000),
});
export const correctionInputSchema = contentUpdateInputSchema.extend({
  correctionDescription: z.string().trim().min(1).max(1000),
});

export const contentListQuerySchema = z.object({
  status: z
    .enum([
      'draft',
      'in_review',
      'scheduled',
      'published',
      'updated',
      'withdrawn',
    ])
    .optional(),
  type: z.enum(['news', 'briefing', 'analysis']).optional(),
  q: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
});

export type ContentDraftInput = z.infer<typeof contentDraftInputSchema>;
export type ContentUpdateInput = z.infer<typeof contentUpdateInputSchema>;
export type CorrectionInput = z.infer<typeof correctionInputSchema>;
export type ContentListQuery = z.infer<typeof contentListQuerySchema>;

export class ContentNotFoundError extends Error {
  constructor() {
    super('Content not found');
    this.name = 'ContentNotFoundError';
  }
}

export class ContentConflictError extends Error {
  constructor(message = 'Content changed; reload before saving') {
    super(message);
    this.name = 'ContentConflictError';
  }
}

export class ContentValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

export function contentSlug(title: string, id: string) {
  const stem = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  return `${stem || 'content'}-${id.slice(0, 8)}`;
}

function validateBlock(
  block: Record<string, unknown>,
  context: z.RefinementCtx,
  path: Array<string | number>,
) {
  if (block.type === 'paragraph' || block.type === 'blockquote') {
    validateKeys(block, ['type', 'content'], context, path);
    validateInlineContent(block.content, context, [...path, 'content'], 500);
    return;
  }
  if (block.type === 'heading') {
    validateKeys(block, ['type', 'level', 'content'], context, path);
    if (![2, 3, 4].includes(block.level as number))
      addIssue(context, [...path, 'level'], 'Heading level must be 2, 3 or 4');
    validateInlineContent(block.content, context, [...path, 'content'], 100);
    return;
  }
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    validateKeys(block, ['type', 'items'], context, path);
    if (!Array.isArray(block.items) || block.items.length > 100) {
      addIssue(context, [...path, 'items'], 'List items are invalid');
      return;
    }
    block.items.forEach((item, itemIndex) => {
      if (!Array.isArray(item) || item.length > 50)
        return addIssue(
          context,
          [...path, 'items', itemIndex],
          'List item is invalid',
        );
      item.forEach((child, childIndex) => {
        if (
          !isRecord(child) ||
          !['paragraph', 'blockquote', 'heading'].includes(String(child.type))
        )
          addIssue(
            context,
            [...path, 'items', itemIndex, childIndex],
            'Nested lists and media are not allowed',
          );
        else
          validateBlock(child, context, [
            ...path,
            'items',
            itemIndex,
            childIndex,
          ]);
      });
    });
    return;
  }
  if (block.type === 'image') {
    validateKeys(
      block,
      ['type', 'mediaId', 'alt', 'caption', 'credit'],
      context,
      path,
    );
    if (!z.string().uuid().safeParse(block.mediaId).success)
      addIssue(context, [...path, 'mediaId'], 'Invalid media ID');
    validateText(block.alt, 300, context, [...path, 'alt']);
    if (block.caption !== undefined)
      validateText(block.caption, 500, context, [...path, 'caption']);
    if (block.credit !== undefined)
      validateText(block.credit, 300, context, [...path, 'credit']);
    return;
  }
  if (block.type === 'table') {
    validateKeys(block, ['type', 'caption', 'headers', 'rows'], context, path);
    if (block.caption !== undefined)
      validateText(block.caption, 300, context, [...path, 'caption']);
    if (
      !Array.isArray(block.headers) ||
      block.headers.length < 1 ||
      block.headers.length > 12
    ) {
      addIssue(context, [...path, 'headers'], 'Table headers are invalid');
      return;
    }
    const headerCount = block.headers.length;
    block.headers.forEach((header, index) =>
      validateText(header, 300, context, [...path, 'headers', index]),
    );
    if (!Array.isArray(block.rows) || block.rows.length > 200) {
      addIssue(context, [...path, 'rows'], 'Table rows are invalid');
      return;
    }
    block.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== headerCount)
        return addIssue(
          context,
          [...path, 'rows', rowIndex],
          'Table row width must match the headers',
        );
      row.forEach((cell, cellIndex) =>
        validateText(cell, 2_000, context, [
          ...path,
          'rows',
          rowIndex,
          cellIndex,
        ]),
      );
    });
    return;
  }
  if (block.type === 'callout') {
    validateKeys(block, ['type', 'tone', 'title', 'content'], context, path);
    if (!['note', 'warning'].includes(String(block.tone)))
      addIssue(context, [...path, 'tone'], 'Callout tone is invalid');
    if (block.title !== undefined)
      validateText(block.title, 160, context, [...path, 'title']);
    validateInlineContent(block.content, context, [...path, 'content'], 500);
    return;
  }
  if (block.type === 'chart') {
    validateKeys(
      block,
      ['type', 'title', 'summary', 'unit', 'data'],
      context,
      path,
    );
    validateText(block.title, 160, context, [...path, 'title']);
    validateText(block.summary, 500, context, [...path, 'summary']);
    if (block.unit !== undefined)
      validateText(block.unit, 40, context, [...path, 'unit']);
    if (
      !Array.isArray(block.data) ||
      block.data.length < 1 ||
      block.data.length > 50
    ) {
      addIssue(context, [...path, 'data'], 'Chart data is invalid');
      return;
    }
    block.data.forEach((point, index) => {
      const pointPath = [...path, 'data', index];
      if (!isRecord(point))
        return addIssue(context, pointPath, 'Chart point is invalid');
      validateKeys(point, ['label', 'value'], context, pointPath);
      validateText(point.label, 160, context, [...pointPath, 'label']);
      if (typeof point.value !== 'number' || !Number.isFinite(point.value))
        addIssue(context, [...pointPath, 'value'], 'Chart value is invalid');
    });
    return;
  }
  if (block.type === 'footnotes') {
    validateKeys(block, ['type', 'items'], context, path);
    if (
      !Array.isArray(block.items) ||
      block.items.length < 1 ||
      block.items.length > 100
    ) {
      addIssue(context, [...path, 'items'], 'Footnotes are invalid');
      return;
    }
    const ids = new Set<string>();
    block.items.forEach((item, index) => {
      const itemPath = [...path, 'items', index];
      if (!isRecord(item))
        return addIssue(context, itemPath, 'Footnote is invalid');
      validateKeys(item, ['id', 'text'], context, itemPath);
      validateText(item.id, 40, context, [...itemPath, 'id']);
      validateText(item.text, 2_000, context, [...itemPath, 'text']);
      if (typeof item.id === 'string' && ids.has(item.id))
        addIssue(context, [...itemPath, 'id'], 'Footnote IDs must be unique');
      if (typeof item.id === 'string') ids.add(item.id);
    });
    return;
  }
  addIssue(context, [...path, 'type'], 'Unsupported rich text block');
}

function validateInlineContent(
  value: unknown,
  context: z.RefinementCtx,
  path: Array<string | number>,
  limit: number,
) {
  if (!Array.isArray(value) || value.length > limit)
    return addIssue(context, path, 'Inline content is invalid');
  value.forEach((inline, index) => {
    const inlinePath = [...path, index];
    if (!isRecord(inline))
      return addIssue(context, inlinePath, 'Inline node is invalid');
    validateKeys(inline, ['type', 'text', 'marks'], context, inlinePath);
    if (inline.type !== 'text')
      addIssue(
        context,
        [...inlinePath, 'type'],
        'Only text inline nodes are allowed',
      );
    validateText(inline.text, 20_000, context, [...inlinePath, 'text']);
    if (inline.marks === undefined) return;
    if (!Array.isArray(inline.marks) || inline.marks.length > 10)
      return addIssue(context, [...inlinePath, 'marks'], 'Marks are invalid');
    inline.marks.forEach((mark, markIndex) =>
      validateMark(mark, context, [...inlinePath, 'marks', markIndex]),
    );
  });
}

function validateMark(
  value: unknown,
  context: z.RefinementCtx,
  path: Array<string | number>,
) {
  if (!isRecord(value)) return addIssue(context, path, 'Mark is invalid');
  if (['strong', 'emphasis', 'code'].includes(String(value.type))) {
    validateKeys(value, ['type'], context, path);
    return;
  }
  if (value.type === 'link') {
    validateKeys(value, ['type', 'href'], context, path);
    try {
      const url = new URL(String(value.href));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      addIssue(context, [...path, 'href'], 'Only HTTP(S) links are allowed');
    }
    return;
  }
  if (value.type === 'citation') {
    validateKeys(value, ['type', 'sourceId'], context, path);
    if (!z.string().uuid().safeParse(value.sourceId).success)
      addIssue(context, [...path, 'sourceId'], 'Invalid source citation');
    return;
  }
  addIssue(context, [...path, 'type'], 'Unsupported mark');
}

function validateKeys(
  value: Record<string, unknown>,
  allowed: string[],
  context: z.RefinementCtx,
  path: Array<string | number>,
) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      addIssue(context, [...path, key], 'Unknown field');
}

function validateText(
  value: unknown,
  limit: number,
  context: z.RefinementCtx,
  path: Array<string | number>,
) {
  if (typeof value !== 'string' || value.length > limit)
    addIssue(context, path, 'Text is invalid');
}

function addIssue(
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
) {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
