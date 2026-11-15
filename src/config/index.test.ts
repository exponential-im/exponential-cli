import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExponentialConfig } from 'exponential-sdk';

// In-memory stand-in for the SDK's Conf-backed store.
const stored: { current: ExponentialConfig } = {
  current: { apiUrl: '', token: '', tokenExpiry: '' },
};
vi.mock('exponential-sdk', () => ({
  createConfigStore: () => ({
    loadConfig: () => ({ ...stored.current }),
    saveConfig: (values: Partial<ExponentialConfig>) => {
      stored.current = { ...stored.current, ...values };
    },
    clearConfig: () => {
      stored.current = { apiUrl: '', token: '', tokenExpiry: '' };
    },
    isAuthenticated: () => Boolean(stored.current.token && stored.current.apiUrl),
    getConfigPath: () => '/tmp/exponential-cli/config.json',
  }),
}));

const {
  getConfig,
  getCredentialSource,
  getStoredConfig,
  isAuthenticated,
  normalizeApiUrl,
  setConfig,
} = await import('./index.js');

/**
 * thick.marsh: `EXPONENTIAL_TOKEN` lets agent software run the CLI without a
 * config file. The token is opaque (JWT or exp_agent_ key) and no expiry is
 * derived from it.
 */
describe('credentials from the environment', () => {
  beforeEach(() => {
    stored.current = { apiUrl: '', token: '', tokenExpiry: '' };
    vi.stubEnv('EXPONENTIAL_TOKEN', '');
    vi.stubEnv('EXPONENTIAL_API_URL', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses the stored config when EXPONENTIAL_TOKEN is unset', () => {
    setConfig({ token: 'stored-jwt', apiUrl: 'https://www.exponential.im' });
    expect(getConfig()).toMatchObject({ token: 'stored-jwt', apiUrl: 'https://www.exponential.im' });
    expect(getCredentialSource()).toBe('config');
  });

  it('ignores EXPONENTIAL_API_URL on its own (the MCP server reads that name too)', () => {
    setConfig({ token: 'stored-jwt', apiUrl: 'https://www.exponential.im' });
    vi.stubEnv('EXPONENTIAL_API_URL', 'http://localhost:3000');
    expect(getConfig().apiUrl).toBe('https://www.exponential.im');
  });

  it('lets an agent key in EXPONENTIAL_TOKEN override the stored token, keeping the stored URL', () => {
    setConfig({ token: 'stored-jwt', apiUrl: 'https://www.exponential.im' });
    vi.stubEnv('EXPONENTIAL_TOKEN', '  exp_agent_abc123  ');

    expect(getConfig()).toMatchObject({ token: 'exp_agent_abc123', apiUrl: 'https://www.exponential.im' });
    expect(getConfig().tokenExpiry).toBe('');
    expect(getCredentialSource()).toBe('env');
    // The stored token is untouched.
    expect(getStoredConfig().token).toBe('stored-jwt');
  });

  it('authenticates from the environment alone with EXPONENTIAL_API_URL', () => {
    vi.stubEnv('EXPONENTIAL_TOKEN', 'exp_agent_abc123');
    expect(isAuthenticated()).toBe(false); // no URL anywhere yet

    vi.stubEnv('EXPONENTIAL_API_URL', 'www.exponential.im/');
    expect(isAuthenticated()).toBe(true);
    expect(getConfig().apiUrl).toBe('https://www.exponential.im');
  });

  it('reports no source when nothing is configured', () => {
    expect(getCredentialSource()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});

describe('normalizeApiUrl', () => {
  it('matches auth login: trims slashes, forces https except on localhost', () => {
    expect(normalizeApiUrl('https://www.exponential.im///')).toBe('https://www.exponential.im');
    expect(normalizeApiUrl('www.exponential.im')).toBe('https://www.exponential.im');
    expect(normalizeApiUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });
});
