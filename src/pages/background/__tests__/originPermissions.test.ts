import { beforeEach, describe, expect, it, vi } from 'vitest';

const contains = vi.hoisted(() => vi.fn());
vi.mock('webextension-polyfill', () => ({ default: { permissions: { contains } } }));

import { filterGrantedOrigins } from '../originPermissions';

describe('filterGrantedOrigins', () => {
  beforeEach(() => contains.mockReset());

  it('aborts plugin registration sync when a permission check fails', async () => {
    contains.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('permission API busy'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        filterGrantedOrigins(['https://chatgpt.com/*', 'https://claude.ai/*'], true),
      ).resolves.toBeNull();
    } finally {
      warning.mockRestore();
    }
  });
});
