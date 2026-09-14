const sensitiveKey =
  /(?:authorization|cookie|email|password|secret|token|raw|body|excerpt)/iu;
const emailValue = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (typeof value === 'string' && emailValue.test(value)) {
    return '[REDACTED_EMAIL]';
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKey.test(key) ? '[REDACTED]' : redactAuditValue(entry),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
