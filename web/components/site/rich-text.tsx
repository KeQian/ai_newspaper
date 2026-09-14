type Mark = { type?: unknown; href?: unknown; sourceId?: unknown };
type Block = {
  type?: unknown;
  level?: unknown;
  content?: unknown;
  items?: unknown;
  alt?: unknown;
  caption?: unknown;
  credit?: unknown;
  title?: unknown;
  summary?: unknown;
  tone?: unknown;
  unit?: unknown;
  data?: unknown;
  headers?: unknown;
  rows?: unknown;
};

export function RichText({ document }: { document: Record<string, unknown> }) {
  const blocks = Array.isArray(document.content) ? document.content : [];
  return (
    <div className="article-body">
      {blocks.map((block, index) =>
        isRecord(block) ? (
          <BlockView key={index} block={block as Block} index={index} />
        ) : null,
      )}
    </div>
  );
}

function BlockView({ block, index }: { block: Block; index: number }) {
  const content = inlineContent(block.content);
  if (block.type === 'heading') {
    const id = `section-${index + 1}`;
    return block.level === 2 ? (
      <h2 id={id}>{content}</h2>
    ) : (
      <h3 id={id}>{content}</h3>
    );
  }
  if (block.type === 'blockquote') return <blockquote>{content}</blockquote>;
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    const items = Array.isArray(block.items) ? block.items : [];
    const List = block.type === 'orderedList' ? 'ol' : 'ul';
    return (
      <List>
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{listContent(item)}</li>
        ))}
      </List>
    );
  }
  if (block.type === 'image')
    return (
      <figure className="border bg-muted/40 p-5">
        <p className="font-medium">图片：{text(block.alt, '未提供替代文字')}</p>
        {block.caption ? (
          <figcaption>
            {text(block.caption)}
            {block.credit ? ` · ${text(block.credit)}` : ''}
          </figcaption>
        ) : null}
      </figure>
    );
  if (block.type === 'table') return <TableBlock block={block} />;
  if (block.type === 'callout')
    return (
      <aside
        className={`border-l-4 p-5 ${block.tone === 'warning' ? 'border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]' : 'border-[var(--info)] bg-[color-mix(in_srgb,var(--info)_8%,transparent)]'}`}
        aria-label={block.tone === 'warning' ? '风险提示' : '补充说明'}
      >
        {block.title ? <h3 className="!mt-0">{text(block.title)}</h3> : null}
        <p className={block.title ? 'mt-2' : ''}>
          {inlineContent(block.content)}
        </p>
      </aside>
    );
  if (block.type === 'chart') return <ChartBlock block={block} />;
  if (block.type === 'footnotes') {
    const items = Array.isArray(block.items) ? block.items : [];
    return (
      <section className="border-t border-border pt-5" aria-label="脚注">
        <h2 className="!mt-0 text-lg">脚注</h2>
        <ol className="mt-3 text-sm text-muted-foreground">
          {items.map((item, index) =>
            isRecord(item) ? (
              <li
                key={text(item.id, String(index + 1))}
                id={`footnote-${text(item.id, String(index + 1))}`}
              >
                {text(item.text)}
              </li>
            ) : null,
          )}
        </ol>
      </section>
    );
  }
  return <p>{content}</p>;
}

function TableBlock({ block }: { block: Block }) {
  const headers = stringArray(block.headers);
  const rows = Array.isArray(block.rows) ? block.rows : [];
  return (
    <figure>
      <p className="mb-2 text-xs text-muted-foreground sm:hidden">
        表格可横向滚动
      </p>
      <section
        className="overflow-x-auto border border-border"
        aria-label="数据表格，可横向滚动"
      >
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          {block.caption ? (
            <caption className="p-3 text-left font-semibold">
              {text(block.caption)}
            </caption>
          ) : null}
          <thead className="bg-muted">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  scope="col"
                  className="border-b p-3 font-semibold"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {stringArray(row).map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-b p-3 align-top last:border-r-0"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </figure>
  );
}

function ChartBlock({ block }: { block: Block }) {
  const points = Array.isArray(block.data)
    ? block.data
        .filter(isRecord)
        .flatMap((point) =>
          typeof point.label === 'string' && typeof point.value === 'number'
            ? [{ label: point.label, value: point.value }]
            : [],
        )
    : [];
  const maximum = Math.max(...points.map(({ value }) => Math.abs(value)), 1);
  const unit = text(block.unit);
  return (
    <figure
      className="border border-border bg-card p-5"
      aria-labelledby={`chart-${slugId(text(block.title))}`}
    >
      <figcaption
        id={`chart-${slugId(text(block.title))}`}
        className="!mt-0 text-base font-bold text-foreground"
      >
        {text(block.title)}
      </figcaption>
      <p className="mt-2 text-sm text-muted-foreground">
        {text(block.summary)}
      </p>
      <dl className="mt-5 space-y-3">
        {points.map((point, index) => (
          <div
            key={`${point.label}-${index}`}
            className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
          >
            <dt className="truncate">{point.label}</dt>
            <dd className="h-2 bg-muted">
              <span
                className="block h-full bg-primary"
                style={{
                  width: `${Math.max(2, (Math.abs(point.value) / maximum) * 100)}%`,
                }}
              />
            </dd>
            <dd className="font-mono text-xs">
              {point.value}
              {unit}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

function inlineContent(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map((node, index) => {
    if (
      !isRecord(node) ||
      node.type !== 'text' ||
      typeof node.text !== 'string'
    )
      return null;
    let content: React.ReactNode = node.text;
    const marks = Array.isArray(node.marks) ? node.marks : [];
    for (const mark of marks)
      if (isRecord(mark)) content = applyMark(content, mark as Mark, index);
    return <span key={index}>{content}</span>;
  });
}

function applyMark(content: React.ReactNode, mark: Mark, key: number) {
  if (mark.type === 'strong') return <strong key={key}>{content}</strong>;
  if (mark.type === 'emphasis') return <em key={key}>{content}</em>;
  if (mark.type === 'code') return <code key={key}>{content}</code>;
  if (
    mark.type === 'link' &&
    typeof mark.href === 'string' &&
    /^https?:\/\//.test(mark.href)
  )
    return (
      <a key={key} href={mark.href} target="_blank" rel="noopener noreferrer">
        {content}
        <span className="sr-only">（在新窗口打开）</span>
      </a>
    );
  if (mark.type === 'citation' && typeof mark.sourceId === 'string')
    return (
      <span
        key={key}
        className="underline decoration-dotted"
        title={`来源 ${mark.sourceId.slice(0, 8)}`}
      >
        {content}
      </span>
    );
  return content;
}

function listContent(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map((block, index) =>
    isRecord(block) ? (
      <span key={index}>{inlineContent(block.content)}</span>
    ) : null,
  );
}
function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}
function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
function slugId(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '') || 'data'
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
