const fallbackContactEmail = 'editorial@ai-signal.example';

export function publicContactEmail() {
  const configured = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  return configured && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured)
    ? configured
    : fallbackContactEmail;
}

export function isPlaceholderContactEmail(email: string) {
  return email === fallbackContactEmail;
}
