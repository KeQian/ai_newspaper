'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  History,
  Save,
  Send,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Detail = {
  id: string;
  type: 'news' | 'briefing' | 'analysis';
  title: string;
  status: string;
  version: number;
  dek: string;
  summary: string;
  body: Record<string, unknown>;
  verification: 'confirmed' | 'developing' | 'unverified';
  importance: number;
  actionability: number;
  seo: Record<string, unknown>;
  aiDisclosure: Record<string, unknown> | null;
  withdrawalReason: string | null;
  sourceHealth: string;
  topicIds: string[];
  sources: Array<{
    id: string;
    rawDocumentId: string | null;
    title: string;
    publisher: string;
    url: string;
    reliability: string;
    relation: string;
  }>;
  revisions: Array<{
    revision: number;
    changeSummary: string;
    authorName: string;
    createdAt: string;
  }>;
  corrections: Array<{
    description: string;
    authorName: string;
    correctedAt: string;
  }>;
};
type Session = { roles: string[] };
type Form = {
  type: Detail['type'];
  title: string;
  dek: string;
  summary: string;
  bodyText: string;
  verification: Detail['verification'];
  importance: number;
  actionability: number;
  sourceIds: string;
  topicIds: string;
  seoTitle: string;
  seoDescription: string;
  aiAssisted: boolean;
  aiNote: string;
  changeSummary: string;
};
type DialogAction = 'publish' | 'withdraw' | 'correct' | null;

export function ContentEditor({ id }: { id: string }) {
  const [item, setItem] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [baseline, setBaseline] = useState<Form | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Detail | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogAction>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(
    async (preserveForm = false) => {
      setError(null);
      try {
        const [contentResponse, sessionResponse] = await Promise.all([
          fetch(`/api/v1/admin/content/${id}`, { credentials: 'same-origin' }),
          fetch('/api/v1/admin/session', { credentials: 'same-origin' }),
        ]);
        if (!contentResponse.ok)
          throw new Error(
            contentResponse.status === 401
              ? '需要管理员登录后编辑内容。'
              : contentResponse.status === 403
                ? '当前角色没有查看权限。'
                : '内容加载失败。',
          );
        const detail = (await contentResponse.json()) as Detail;
        setItem(detail);
        if (!preserveForm) {
          const serverForm = toForm(detail);
          const saved = readRecovery(id, detail.version);
          setForm(saved ?? serverForm);
          setBaseline(serverForm);
          if (saved)
            setNotice('已恢复本机尚未提交的编辑内容，请核对后显式保存。');
        }
        if (sessionResponse.ok)
          setSession((await sessionResponse.json()) as Session);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '内容加载失败。');
      }
    },
    [id],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const dirty = useMemo(
    () =>
      Boolean(
        form && baseline && JSON.stringify(form) !== JSON.stringify(baseline),
      ),
    [form, baseline],
  );
  useEffect(() => {
    if (!form || !item || !dirty) return;
    localStorage.setItem(
      recoveryKey(id),
      JSON.stringify({ version: item.version, form }),
    );
  }, [dirty, form, id, item]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const canPublish = Boolean(
    session?.roles.some((role) => ['chief_editor', 'admin'].includes(role)),
  );
  const canSaveDraft = Boolean(
    item && ['draft', 'in_review'].includes(item.status),
  );
  const editable =
    canSaveDraft ||
    (canPublish && ['published', 'updated'].includes(item?.status ?? ''));

  async function save(mode: 'save' | 'correct' = 'save') {
    if (!item || !form) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    setConflict(null);
    try {
      const response = await fetch(
        `/api/v1/admin/content/${id}${mode === 'correct' ? '/corrections' : ''}`,
        {
          method: mode === 'correct' ? 'POST' : 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...payload(form, item.version),
            ...(mode === 'correct'
              ? { correctionDescription: reason.trim() }
              : {}),
          }),
        },
      );
      const result = (await response.json()) as {
        message?: string;
        issues?: string[];
      };
      if (response.status === 409) {
        const latestResponse = await fetch(`/api/v1/admin/content/${id}`, {
          credentials: 'same-origin',
        });
        if (latestResponse.ok)
          setConflict((await latestResponse.json()) as Detail);
        throw new Error(
          '服务器内容已发生变化。你的输入已保留，请比较后刷新或重新应用。',
        );
      }
      if (!response.ok)
        throw new Error(
          result.issues?.join('；') ?? result.message ?? '保存失败。',
        );
      localStorage.removeItem(recoveryKey(id));
      setDialog(null);
      setReason('');
      await load();
      setNotice(
        mode === 'correct'
          ? '勘误已发布，并已进入刷新队列。'
          : '内容已保存为新版本。',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  }

  async function transition(
    action: 'submit-review' | 'publish' | 'cancel-schedule' | 'withdraw',
  ) {
    if (!item) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = { version: item.version };
      if (action === 'publish' && scheduledAt)
        body.scheduledAt = new Date(scheduledAt).toISOString();
      if (action === 'withdraw') body.reason = reason.trim();
      const response = await fetch(`/api/v1/admin/content/${id}/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        message?: string;
        issues?: string[];
      };
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? '状态或版本已变化，请刷新后再试。'
            : (result.issues?.join('；') ?? result.message ?? '操作失败。'),
        );
      setDialog(null);
      setScheduledAt('');
      setReason('');
      await load();
      setNotice(
        action === 'submit-review'
          ? '已提交主编审核。'
          : action === 'cancel-schedule'
            ? '已取消排程并退回审核。'
            : action === 'withdraw'
              ? '内容已撤回，刷新任务已进入队列。'
              : scheduledAt
                ? '内容已排程。'
                : '内容已发布，刷新任务已进入队列。',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败。');
    } finally {
      setSaving(false);
    }
  }

  if (error && !item)
    return <EditorState message={error} onRetry={() => void load()} />;
  if (!item || !form)
    return (
      <div aria-label="正在加载内容编辑器" className="space-y-4 p-8">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    );
  return (
    <div className="pb-28">
      <header className="border-b bg-card px-4 py-5 sm:px-6 lg:px-8">
        <a
          href="/admin/content"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回内容库
        </a>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge>{statusLabel(item.status)}</Badge>
          <Badge variant="outline">版本 {item.version}</Badge>
          <Badge variant="outline">来源 {item.sourceHealth}</Badge>
          {dirty ? <Badge variant="secondary">有未保存更改</Badge> : null}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          内容编辑
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {item.id}
        </p>
      </header>
      <main className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-8">
        <div className="space-y-5">
          {notice ? (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>操作完成</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>无法完成操作</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {conflict ? (
            <ConflictAlert
              current={item}
              latest={conflict}
              onReload={() => {
                setConflict(null);
                void load();
              }}
            />
          ) : null}
          {!editable && !['published', 'updated'].includes(item.status) ? (
            <Alert>
              <ShieldAlert />
              <AlertTitle>当前状态只读</AlertTitle>
              <AlertDescription>该内容当前不能修改正文。</AlertDescription>
            </Alert>
          ) : null}
          <section
            className="space-y-5 rounded-lg border bg-card p-5"
            aria-labelledby="basic-title"
          >
            <h2 id="basic-title" className="text-lg font-semibold">
              正文与摘要
            </h2>
            <Field label="标题" id="title">
              <Input
                id="title"
                value={form.title}
                disabled={!editable}
                maxLength={160}
                onChange={(e) => change('title', e.target.value)}
              />
            </Field>
            <Field label="副标题" id="dek">
              <Input
                id="dek"
                value={form.dek}
                disabled={!editable}
                maxLength={280}
                onChange={(e) => change('dek', e.target.value)}
              />
            </Field>
            <Field label="摘要" id="summary">
              <Textarea
                id="summary"
                value={form.summary}
                disabled={!editable}
                rows={4}
                maxLength={1000}
                onChange={(e) => change('summary', e.target.value)}
              />
            </Field>
            <Field label="正文（每个空行分隔为一个段落）" id="body">
              <Textarea
                id="body"
                value={form.bodyText}
                disabled={!editable}
                rows={18}
                onChange={(e) => change('bodyText', e.target.value)}
              />
            </Field>
          </section>
          <section
            className="grid gap-5 rounded-lg border bg-card p-5 sm:grid-cols-2"
            aria-labelledby="metadata-title"
          >
            <h2
              id="metadata-title"
              className="text-lg font-semibold sm:col-span-2"
            >
              编辑元数据
            </h2>
            <SelectField
              label="内容类型"
              value={form.type}
              disabled={!editable}
              onChange={(value) => change('type', value as Form['type'])}
              options={[
                ['news', '快讯'],
                ['briefing', '日报'],
                ['analysis', '分析'],
              ]}
            />
            <SelectField
              label="核验状态"
              value={form.verification}
              disabled={!editable}
              onChange={(value) =>
                change('verification', value as Form['verification'])
              }
              options={[
                ['confirmed', '已确认'],
                ['developing', '持续跟进'],
                ['unverified', '未确认'],
              ]}
            />
            <NumberField
              label="重要度"
              value={form.importance}
              disabled={!editable}
              onChange={(value) => change('importance', value)}
            />
            <NumberField
              label="可行动性"
              value={form.actionability}
              disabled={!editable}
              onChange={(value) => change('actionability', value)}
            />
            <Field label="来源 ID（每行一个 UUID）" id="sources">
              <Textarea
                id="sources"
                value={form.sourceIds}
                disabled={!editable}
                rows={4}
                onChange={(e) => change('sourceIds', e.target.value)}
              />
            </Field>
            <Field label="主题 ID（每行一个 UUID）" id="topics">
              <Textarea
                id="topics"
                value={form.topicIds}
                disabled={!editable}
                rows={4}
                onChange={(e) => change('topicIds', e.target.value)}
              />
            </Field>
            <Field label="SEO 标题" id="seo-title">
              <Input
                id="seo-title"
                value={form.seoTitle}
                disabled={!editable}
                maxLength={160}
                onChange={(e) => change('seoTitle', e.target.value)}
              />
            </Field>
            <Field label="SEO 描述" id="seo-description">
              <Textarea
                id="seo-description"
                value={form.seoDescription}
                disabled={!editable}
                rows={3}
                maxLength={300}
                onChange={(e) => change('seoDescription', e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <Label htmlFor="ai-assisted">AI 辅助创作披露</Label>
              <Switch
                id="ai-assisted"
                checked={form.aiAssisted}
                disabled={!editable}
                onCheckedChange={(value) => change('aiAssisted', value)}
              />
            </div>
            <Field label="AI 辅助说明" id="ai-note">
              <Textarea
                id="ai-note"
                value={form.aiNote}
                disabled={!editable}
                rows={3}
                onChange={(e) => change('aiNote', e.target.value)}
              />
            </Field>
            <Field label="本次变更摘要" id="change-summary">
              <Textarea
                id="change-summary"
                value={form.changeSummary}
                disabled={!editable}
                rows={3}
                maxLength={300}
                onChange={(e) => change('changeSummary', e.target.value)}
              />
            </Field>
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-semibold">来源核验</h2>
            <div className="mt-3 space-y-3">
              {item.sources.length ? (
                item.sources.map((source) => (
                  <article
                    key={source.id}
                    className="border-t pt-3 first:border-0 first:pt-0"
                  >
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        {source.reliability.toUpperCase()}
                      </Badge>
                      <Badge variant="outline">{source.relation}</Badge>
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-sm font-medium hover:text-primary hover:underline"
                    >
                      {source.title}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {source.publisher}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  缺少来源，不能发布。
                </p>
              )}
            </div>
          </section>
          <section className="rounded-lg border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <History className="size-4" />
              版本历史
            </h2>
            <ol className="mt-3 space-y-3">
              {item.revisions.map((revision) => (
                <li
                  key={revision.revision}
                  className="border-t pt-3 text-sm first:border-0 first:pt-0"
                >
                  <p className="font-medium">
                    v{revision.revision} · {revision.changeSummary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {revision.authorName} · {formatDate(revision.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          {item.corrections.length ? (
            <section className="rounded-lg border bg-card p-4">
              <h2 className="font-semibold">公开勘误</h2>
              <ol className="mt-3 space-y-2 text-sm">
                {item.corrections.map((correction, index) => (
                  <li key={`${correction.correctedAt}-${index}`}>
                    {correction.description}
                    <p className="text-xs text-muted-foreground">
                      {correction.authorName} ·{' '}
                      {formatDate(correction.correctedAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:left-[var(--sidebar-width)]">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-end gap-2">
          <a
            href={`/admin/content/${id}/preview`}
            target="_blank"
            className={buttonVariants({ variant: 'outline' })}
          >
            <Eye />
            预览
          </a>
          {canSaveDraft ? (
            <Button onClick={() => void save()} disabled={!dirty || saving}>
              <Save />
              保存新版本
            </Button>
          ) : null}
          {item.status === 'draft' ? (
            <Button
              variant="secondary"
              disabled={dirty || saving}
              onClick={() => void transition('submit-review')}
            >
              <Send />
              提交审核
            </Button>
          ) : null}
          {canPublish && item.status === 'scheduled' ? (
            <Button
              className="hidden md:inline-flex"
              variant="outline"
              disabled={saving}
              onClick={() => void transition('cancel-schedule')}
            >
              <Undo2 />
              取消排程
            </Button>
          ) : null}
          {canPublish && ['in_review', 'scheduled'].includes(item.status) ? (
            <Button
              className="hidden md:inline-flex"
              disabled={dirty || saving}
              onClick={() => setDialog('publish')}
            >
              <Clock3 />
              发布 / 排程
            </Button>
          ) : null}
          {canPublish && ['published', 'updated'].includes(item.status) ? (
            <>
              <Button
                className="hidden md:inline-flex"
                variant="outline"
                onClick={() => setDialog('correct')}
              >
                发布勘误
              </Button>
              <Button
                className="hidden md:inline-flex"
                variant="destructive"
                onClick={() => setDialog('withdraw')}
              >
                撤回
              </Button>
            </>
          ) : null}
        </div>
        {canPublish && ['published', 'updated'].includes(item.status) ? (
          <p className="mt-1 text-right text-xs text-muted-foreground md:hidden">
            发布、撤回与勘误操作请在桌面端完成。
          </p>
        ) : null}
      </div>
      <ActionDialog
        action={dialog}
        saving={saving}
        scheduledAt={scheduledAt}
        reason={reason}
        setScheduledAt={setScheduledAt}
        setReason={setReason}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          dialog === 'correct'
            ? void save('correct')
            : dialog
              ? void transition(dialog)
              : undefined
        }
      />
    </div>
  );

  function change<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function SelectField({
  label,
  value,
  disabled,
  onChange,
  options,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="space-y-2 text-sm font-medium">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 block h-9 w-full rounded-md border bg-transparent px-3 font-normal"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={`${label}（1–5）`} id={label}>
      <Input
        id={label}
        type="number"
        min={1}
        max={5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

function ActionDialog({
  action,
  saving,
  scheduledAt,
  reason,
  setScheduledAt,
  setReason,
  onClose,
  onConfirm,
}: {
  action: DialogAction;
  saving: boolean;
  scheduledAt: string;
  reason: string;
  setScheduledAt: (value: string) => void;
  setReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const descriptions = {
    publish:
      '留空时间将立即发布；填写未来时间则进入排程。发布前会再次检查来源、主题、SEO 与风险条件。',
    withdraw: '撤回会停止公开展示并触发缓存、搜索、RSS 与站点地图刷新。',
    correct: '勘误会保存当前表单为新版本，并生成面向读者的公开说明。',
  };
  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === 'publish'
              ? '发布或排程'
              : action === 'withdraw'
                ? '撤回内容'
                : '发布勘误'}
          </DialogTitle>
          <DialogDescription>
            {action ? descriptions[action] : ''}
          </DialogDescription>
        </DialogHeader>
        {action === 'publish' ? (
          <Field label="计划发布时间（可选）" id="schedule">
            <Input
              id="schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>
        ) : (
          <Field
            label={action === 'correct' ? '公开勘误说明' : '撤回原因'}
            id="action-reason"
          >
            <Textarea
              id="action-reason"
              value={reason}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button
            variant={action === 'withdraw' ? 'destructive' : 'default'}
            disabled={saving || (action !== 'publish' && !reason.trim())}
            onClick={onConfirm}
          >
            {saving ? '处理中…' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConflictAlert({
  current,
  latest,
  onReload,
}: {
  current: Detail;
  latest: Detail;
  onReload: () => void;
}) {
  const fields = ['title', 'summary', 'status', 'version'] as const;
  const differences = fields.filter(
    (field) => current[field] !== latest[field],
  );
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>检测到并发修改</AlertTitle>
      <AlertDescription>
        <p>服务器当前为版本 {latest.version}，你的表单仍保留在本机。</p>
        {differences.length ? (
          <ul className="mt-2 list-disc pl-5">
            {differences.map((field) => (
              <li key={field}>
                {field}：{String(current[field])} → {String(latest[field])}
              </li>
            ))}
          </ul>
        ) : null}
        <Button className="mt-3" size="sm" variant="outline" onClick={onReload}>
          放弃本机输入并载入最新版
        </Button>
      </AlertDescription>
    </Alert>
  );
}
function EditorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="p-8">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>编辑器不可用</AlertTitle>
        <AlertDescription>
          {message}
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={onRetry}
          >
            重试
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
function toForm(item: Detail): Form {
  const seo = item.seo as { title?: unknown; description?: unknown };
  const ai = item.aiDisclosure as { assisted?: unknown; note?: unknown } | null;
  return {
    type: item.type,
    title: item.title,
    dek: item.dek,
    summary: item.summary,
    bodyText: bodyText(item.body),
    verification: item.verification,
    importance: item.importance,
    actionability: item.actionability,
    sourceIds: item.sources
      .map((source) => source.rawDocumentId)
      .filter((value): value is string => Boolean(value))
      .join('\n'),
    topicIds: item.topicIds.join('\n'),
    seoTitle: typeof seo.title === 'string' ? seo.title : item.title,
    seoDescription:
      typeof seo.description === 'string' ? seo.description : item.summary,
    aiAssisted: ai?.assisted === true,
    aiNote: typeof ai?.note === 'string' ? ai.note : '',
    changeSummary: '',
  };
}
function payload(form: Form, version: number) {
  return {
    version,
    type: form.type,
    title: form.title,
    dek: form.dek,
    summary: form.summary,
    body: textDocument(form.bodyText),
    verification: form.verification,
    importance: form.importance,
    actionability: form.actionability,
    sourceIds: lines(form.sourceIds),
    topicIds: lines(form.topicIds),
    seo: { title: form.seoTitle, description: form.seoDescription },
    aiDisclosure: { assisted: form.aiAssisted, note: form.aiNote },
    changeSummary: form.changeSummary,
  };
}
function textDocument(value: string) {
  return {
    schemaVersion: 1,
    type: 'doc',
    content: value
      .split(/\n\s*\n/)
      .filter((text) => text.trim())
      .map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: text.trim() }],
      })),
  };
}
function bodyText(body: Record<string, unknown>) {
  if (!Array.isArray(body.content)) return '';
  return body.content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const value = (block as { content?: unknown }).content;
      return Array.isArray(value)
        ? value
            .map((node) =>
              node &&
              typeof node === 'object' &&
              typeof (node as { text?: unknown }).text === 'string'
                ? (node as { text: string }).text
                : '',
            )
            .join('')
        : '';
    })
    .filter(Boolean)
    .join('\n\n');
}
function lines(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}
function recoveryKey(id: string) {
  return `ai-newspaper:content-recovery:${id}`;
}
function readRecovery(id: string, version: number): Form | null {
  try {
    const raw = localStorage.getItem(recoveryKey(id));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { version?: unknown; form?: unknown };
    return saved.version === version &&
      saved.form &&
      typeof saved.form === 'object'
      ? (saved.form as Form)
      : null;
  } catch {
    return null;
  }
}
function statusLabel(status: string) {
  return (
    (
      {
        draft: '草稿',
        in_review: '审核中',
        scheduled: '已排程',
        published: '已发布',
        updated: '已更新',
        withdrawn: '已撤回',
      } as Record<string, string>
    )[status] ?? status
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}
