import type { EmailAdapter } from './types';

export class HttpEmailAdapter implements EmailAdapter {
  constructor(
    private readonly endpoint: string,
    private readonly bearerToken: string,
    private readonly from: string,
  ) {}

  async send(message: Parameters<EmailAdapter['send']>[0]) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, ...message }),
    });
    if (!response.ok) throw new Error('Email provider rejected the request');
    const payload = (await response.json()) as { messageId?: unknown };
    if (typeof payload.messageId !== 'string' || !payload.messageId)
      throw new Error('Email provider returned an invalid response');
    return { messageId: payload.messageId };
  }
}

export class DisabledEmailAdapter implements EmailAdapter {
  async send(): Promise<{ messageId: string }> {
    throw new Error('Email adapter is not configured');
  }
}
