import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdk = vi.hoisted(() => ({
  constructedWith: [] as Array<{ token: string; apiUrl: string }>,
  workspacesList: vi.fn(),
}));

vi.mock('exponential-sdk', () => ({
  ExponentialClient: class {
    workspaces = { list: sdk.workspacesList };
    constructor(opts: { token: string; apiUrl: string }) {
      sdk.constructedWith.push(opts);
    }
  },
}));

vi.mock('../config/index.js', () => ({
  TOKEN_ENV: 'EXPONENTIAL_TOKEN',
  getConfig: vi.fn(() => ({ token: 'exp_agent_env', apiUrl: 'https://www.exponential.im' })),
  setConfig: vi.fn(),
  clearConfig: vi.fn(),
  isAuthenticated: vi.fn(() => true),
  getConfigPath: vi.fn(() => '/tmp/exponential-cli/config.json'),
  getCredentialSource: vi.fn(() => 'env'),
  normalizeApiUrl: (url: string) => url.replace(/\/+$/, ''),
}));

vi.mock('../client/index.js', () => ({
  getClient: vi.fn(),
  resetClient: vi.fn(),
  isTRPCError: () => false,
}));

import { createAuthCommand } from './auth.js';
import * as configModule from '../config/index.js';
import * as clientModule from '../client/index.js';

async function run(...args: string[]) {
  const cmd = createAuthCommand();
  cmd.exitOverride();
  await cmd.parseAsync(['node', 'auth', ...args]);
}

/**
 * thick.marsh: agent keys log in like any token, and with EXPONENTIAL_TOKEN
 * set the CLI says where its credentials come from.
 */
describe('auth with agent keys and EXPONENTIAL_TOKEN', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sdk.constructedWith.length = 0;
    sdk.workspacesList.mockReset().mockResolvedValue([]);
    vi.mocked(configModule.setConfig).mockClear();
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it('login stores an agent key as-is and validates THAT key, not the env token', async () => {
    await run('login', '--token', 'exp_agent_new', '--api-url', 'https://www.exponential.im/');

    expect(configModule.setConfig).toHaveBeenCalledWith({
      token: 'exp_agent_new',
      apiUrl: 'https://www.exponential.im',
    });
    // No tokenExpiry is derived from the key.
    expect(vi.mocked(configModule.setConfig).mock.calls[0]![0]).not.toHaveProperty('tokenExpiry');
    expect(sdk.constructedWith).toEqual([{ token: 'exp_agent_new', apiUrl: 'https://www.exponential.im' }]);
    expect(clientModule.getClient).not.toHaveBeenCalled();
    // And warns that the env var still wins in this shell.
    expect(log.mock.calls.flat().join('\n')).toContain('EXPONENTIAL_TOKEN is set');
  });

  it('whoami --json reports the credential source', async () => {
    vi.mocked(clientModule.getClient).mockReturnValue({
      users: {
        me: vi.fn().mockResolvedValue({
          id: 'agent-user',
          name: 'Claude',
          email: null,
          isAgent: true,
          agent: { owner: { id: 'owner', name: 'James' } },
        }),
      },
      workspaces: { list: vi.fn().mockResolvedValue([{}, {}]) },
    } as never);

    await run('whoami', '--json');

    const out = JSON.parse(String(log.mock.calls[0]![0])) as Record<string, unknown>;
    expect(out).toMatchObject({ id: 'agent-user', isAgent: true, credentialSource: 'env', workspaces: 2 });
  });
});
