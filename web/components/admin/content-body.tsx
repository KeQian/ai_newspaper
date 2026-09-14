type InlineNode = { type?: unknown; text?: unknown };
type Block = {
  type?: unknown;
  level?: unknown;
  content?: unknown;
  items?: unknown;
  alt?: unknown;
  caption?: unknown;
  credit?: unknown;
};

export function ContentBody({
  document,
}: {
  document: Record<string, unknown>;
}) {
  const blocks = Array.isArray(document.content)
    ? (document.content as Block[])
    : [];
  return (
    <div className="space-y-5 text-base leading-8">
      {blocks.map((block, index) => (
        <ContentBlock block={block} key={index} />
      ))}
    </div>
  );
}

function ContentBlock({ block }: { block: Block }) {
  const text = inlineText(block.content);
  if (block.type === 'heading') {
    if (block.level === 2)
      return <h2 className="pt-4 text-2xl font-bold">{text}</h2>;
    return <h3 className="pt-3 text-xl font-semibold">{text}</h3>;
  }
  if (block.type === 'blockquote')
    return (
      <blockquote className="border-l-4 border-primary pl-4 text-muted-foreground">
        {text}
      </blockquote>
    );
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    const items = Array.isArray(block.items) ? block.items : [];
    const List = block.type === 'orderedList' ? 'ol' : 'ul';
    return (
      <List
        className={
          block.type === 'orderedList'
            ? 'list-decimal space-y-2 pl-6'
            : 'list-disc space-y-2 pl-6'
        }
      >
        {items.map((item, index) => (
          <li key={index}>{listText(item)}</li>
        ))}
      </List>
    );
  }
  if (block.type === 'image')
    return (
      <figure className="rounded-lg border bg-muted/30 p-6 text-center">
        <p className="font-medium">
          图片：{safeText(block.alt, '未提供替代文字')}
        </p>
        {block.caption ? (
          <figcaption className="mt-2 text-sm text-muted-foreground">
            {safeText(block.caption)}
            {block.credit ? ` · ${safeText(block.credit)}` : ''}
          </figcaption>
        ) : null}
      </figure>
    );
  return <p className="whitespace-pre-wrap">{text}</p>;
}

function inlineText(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value
    .map((node: InlineNode) => (typeof node.text === 'string' ? node.text : ''))
    .join('');
}

function listText(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value.map((block: Block) => inlineText(block.content)).join(' ');
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}
