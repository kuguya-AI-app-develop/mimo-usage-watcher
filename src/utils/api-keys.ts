export function normalizeApiKey(apiKey: string): string {
  return apiKey.trim();
}

export function maskApiKey(apiKey: string): string {
  const normalized = normalizeApiKey(apiKey);
  if (!normalized) {
    return '';
  }

  if (normalized.length <= 4) {
    return `${normalized.slice(0, 1)}...`;
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}...${normalized.slice(-1)}`;
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}
