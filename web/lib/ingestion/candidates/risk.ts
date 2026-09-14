import type { CandidateDocument } from './types';

const promptInjectionSignals = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'reveal the system prompt',
  'execute this command',
  'call this tool',
  '忽略之前的指令',
  '忽略以上指令',
  '泄露系统提示',
  '执行这个命令',
];

export function detectedRiskFlags(
  documents: readonly CandidateDocument[],
): string[] {
  const content = documents
    .map(({ title, allowedExcerpt }) => `${title}\n${allowedExcerpt ?? ''}`)
    .join('\n')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US');
  return promptInjectionSignals.some((signal) => content.includes(signal))
    ? ['prompt_injection_suspected']
    : [];
}

export function mergeRiskFlags(
  modelFlags: readonly string[],
  detectedFlags: readonly string[],
): string[] {
  return Array.from(new Set([...modelFlags, ...detectedFlags])).sort();
}
