'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FilePlus2,
  GitMerge,
  Pause,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

import type { CandidateSummary } from './candidate-list';

type CandidateDetailData = CandidateSummary & {
  novelty: number;
  actionability: number;
  modelInfo: Record<string, unknown> | null;
  documents: Array<{
    id: string;
    title: string;
    url: string;
    excerpt: string | null;
    publisher: string;
    reliability: string;
    relation: string;
    publishedAt: string | null;
  }>;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    confirmed: boolean;
  }>;
  entitySuggestions: Array<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    status: string;
  }>;
  mergeSuggestions: Array<{
    targetId: string;
    title: string;
    score: number;
    reasons: string[];
    status: string;
  }>;
};

type Action = 'create_draft' | 'merge' | 'reject' | 'defer';

export function CandidateDetail({ id }: { id: string }) {
  const [item, setItem] = useState<CandidateDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/v1/admin/candidates/${id}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? '需要管理员登录后查看候选详情。'
              : response.status === 403
                ? '当前角色没有查看权限。'
                : '候选详情加载失败。',
          );
        return response.json() as Promise<CandidateDetailData>;
      })
      .then(setItem)
      .catch((reason: Error) => setError(reason.message));
  }, [id]);

  useEffect(load, [load]);

  async function submitDecision() {
    if (!item || !action) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { action, version: item.version };
    if (reason.trim()) body.reason = reason.trim();
    if (action === 'merge') body.targetId = targetId;
    try {
      const response = await fetch(`/api/v1/admin/candidates/${id}/decision`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        message?: string;
        draftId?: string;
      };
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? '候选已被其他编辑修改，请刷新后重新决定。'
            : (result.message ?? '操作失败。'),
        );
      setNotice(
        action === 'create_draft'
          ? `草稿已创建${result.draftId ? `（${result.draftId.slice(0, 8)}）` : ''}`
          : action === 'merge'
            ? '候选已合并，来源已保留。'
            : action === 'reject'
              ? '候选已拒绝。'
              : '候选已延后 24 小时。',
      );
      setAction(null);
      setReason('');
      setTargetId('');
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败。');
    } finally {
      setSaving(false);
    }
  }

  if (error && !item) return <StateMessage message={error} onRetry={load} />;
  if (!item)
    return (
      <div aria-label="正在加载候选详情" className="space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );

  const actionable = ['new', 'review'].includes(item.status);
  return (
    <div className="pb-28">
      <header className="border-b bg-card px-4 py-5 sm:px-6 lg:px-8">
        <a
          href="/admin/candidates"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回候选池
        </a>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{item.status}</Badge>
          <Badge variant="outline">{item.verification}</Badge>
          {item.riskFlags.map((risk) => (
            <Badge key={risk} variant="destructive">
              {risk}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 max-w-4xl text-2xl font-bold tracking-tight sm:text-3xl">
          {item.title}
        </h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          版本 {item.version} · 候选 {item.id}
        </p>
      </header>

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {notice ? (
          <Alert>
            <AlertTitle>操作完成</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>无法完成操作</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.8fr)_minmax(360px,1.35fr)_minmax(260px,0.85fr)]">
          <section
            aria-labelledby="sources-title"
            className="rounded-lg border bg-card p-4"
          >
            <h2 id="sources-title" className="text-sm font-semibold">
              原始来源 · {item.documents.length}
            </h2>
            <div className="mt-4 space-y-3">
              {item.documents.map((source) => (
                <article
                  key={source.id}
                  className="border-t pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{source.relation}</Badge>
                    <Badge variant="outline">
                      {source.reliability.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-5">
                    {source.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.publisher}
                  </p>
                  <a
                    href={`/admin/candidates/${id}/sources/${source.id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    隔离预览{' '}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="facts-title"
            className="rounded-lg border bg-card p-5"
          >
            <p className="eyebrow">CANDIDATE FACTS</p>
            <h2 id="facts-title" className="mt-2 text-lg font-semibold">
              候选事实
            </h2>
            <p className="mt-5 whitespace-pre-wrap text-base leading-8">
              {item.factSummary}
            </p>
            <div className="mt-8 border-t pt-5">
              <h3 className="text-sm font-semibold">AI 处理信息</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                模型输出仅作为编辑建议，不会触发发布。
                {item.modelInfo
                  ? ` ${typeof item.modelInfo.model === 'string' ? item.modelInfo.model : '模型信息已记录'}`
                  : ' 未记录模型标识。'}
              </p>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold">编辑评分</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Score label="重要度" value={item.importance} />
                <Score label="可行动性" value={item.actionability} />
                <Score label="新颖度" value={item.novelty} />
                <Score
                  label="置信度"
                  value={Math.round(item.confidence * 100)}
                  suffix="%"
                />
              </dl>
            </section>
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold">实体建议</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  ...item.entities.map((entity) => ({
                    ...entity,
                    status: entity.confirmed ? '已确认' : '待确认',
                  })),
                  ...item.entitySuggestions.filter(
                    (suggestion) => suggestion.status === 'pending',
                  ),
                ].map((entity) => (
                  <li
                    key={entity.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{entity.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {entity.type} · {entity.status}
                    </span>
                  </li>
                ))}
              </ul>
              {item.entities.length + item.entitySuggestions.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">无实体建议</p>
              ) : null}
            </section>
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold">合并建议</h2>
              {item.mergeSuggestions.length ? (
                <ul className="mt-3 space-y-3">
                  {item.mergeSuggestions.map((suggestion) => (
                    <li key={suggestion.targetId}>
                      <p className="text-sm font-medium leading-5">
                        {suggestion.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        匹配 {Math.round(suggestion.score * 100)}% ·{' '}
                        {suggestion.reasons.join('、')}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  无相似事件建议
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:left-[224px]">
        <div className="mx-auto hidden max-w-5xl items-center justify-between gap-4 md:flex">
          <p className="text-xs text-muted-foreground">
            每次操作都会校验版本并写入不可变审计日志。
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!actionable}
              onClick={() => setAction('defer')}
            >
              <Pause aria-hidden="true" />
              延后
            </Button>
            <Button
              variant="destructive"
              disabled={!actionable}
              onClick={() => setAction('reject')}
            >
              <XCircle aria-hidden="true" />
              拒绝
            </Button>
            <Button
              variant="outline"
              disabled={!actionable || !item.mergeSuggestions.length}
              onClick={() => {
                setTargetId(item.mergeSuggestions[0]?.targetId ?? '');
                setAction('merge');
              }}
            >
              <GitMerge aria-hidden="true" />
              合并
            </Button>
            <Button
              disabled={!actionable}
              onClick={() => setAction('create_draft')}
            >
              <FilePlus2 aria-hidden="true" />
              创建草稿
            </Button>
          </div>
        </div>
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground md:hidden">
          <ShieldAlert className="size-4" aria-hidden="true" />
          移动端仅供查看，请在平板或桌面完成审核操作。
        </p>
      </div>

      <DecisionDialog
        action={action}
        item={item}
        reason={reason}
        targetId={targetId}
        saving={saving}
        onReason={setReason}
        onTarget={setTargetId}
        onClose={() => setAction(null)}
        onSubmit={submitDecision}
      />
    </div>
  );
}

function DecisionDialog({
  action,
  item,
  reason,
  targetId,
  saving,
  onReason,
  onTarget,
  onClose,
  onSubmit,
}: {
  action: Action | null;
  item: CandidateDetailData;
  reason: string;
  targetId: string;
  saving: boolean;
  onReason: (value: string) => void;
  onTarget: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!action) return null;
  const labels = {
    create_draft: '创建内容草稿',
    merge: '合并候选事件',
    reject: '拒绝候选',
    defer: '延后 24 小时',
  };
  const reasonRequired = action !== 'create_draft';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels[action]}</DialogTitle>
          <DialogDescription>
            操作基于候选版本 {item.version}，成功后会写入审计日志。
            {action === 'merge' ? '来源与实体关系将并入目标事件。' : ''}
          </DialogDescription>
        </DialogHeader>
        {action === 'merge' ? (
          <label className="grid gap-2 text-sm font-medium">
            目标事件
            <select
              value={targetId}
              onChange={(event) => onTarget(event.target.value)}
              className="h-9 rounded-md border bg-background px-3"
            >
              <option value="">选择目标事件</option>
              {item.mergeSuggestions.map((suggestion) => (
                <option key={suggestion.targetId} value={suggestion.targetId}>
                  {suggestion.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-2 text-sm font-medium">
          {reasonRequired
            ? '理由（必填）'
            : '例外理由（仅缺少一手/官方来源时必填）'}
          <Textarea
            value={reason}
            maxLength={1000}
            onChange={(event) => onReason(event.target.value)}
            placeholder="说明判断依据，最多 1000 字"
          />
        </label>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button
            variant={action === 'reject' ? 'destructive' : 'default'}
            disabled={
              saving ||
              (reasonRequired && !reason.trim()) ||
              (action === 'merge' && !targetId)
            }
            onClick={onSubmit}
          >
            {saving ? '处理中…' : '确认操作'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Score({
  label,
  value,
  suffix = '/5',
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-md bg-muted p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono font-semibold">
        {value}
        {suffix}
      </dd>
    </div>
  );
}
function StateMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="p-8">
      <Alert variant="destructive">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>无法打开候选</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
        <Button className="mt-3" variant="outline" onClick={onRetry}>
          重试
        </Button>
      </Alert>
    </div>
  );
}
