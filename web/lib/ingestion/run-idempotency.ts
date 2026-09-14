export async function createIngestionIdempotencyKey(input: {
  jobKey: string;
  scheduledAt: string;
  sources: readonly string[];
}): Promise<string> {
  const sourceSet = [...input.sources].sort().join('\n');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(sourceSet),
  );
  const sourceSetHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `${input.jobKey}:${new Date(input.scheduledAt).toISOString()}:${sourceSetHash}`;
}
