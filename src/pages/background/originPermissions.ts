import browser from 'webextension-polyfill';

export async function filterGrantedOrigins(
  patterns: string[],
  abortOnError = false,
): Promise<string[] | null> {
  const granted: string[] = [];

  for (const origin of patterns) {
    try {
      if (await browser.permissions.contains({ origins: [origin] })) granted.push(origin);
    } catch (error) {
      console.warn('[Background] Failed to check permission for', origin, error);
      if (abortOnError) return null;
    }
  }

  return granted;
}
