import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createContextCommand, createMethodCommand, formatContext } from './agentGuidance.js';
import * as clientModule from '../client/index.js';
import * as resolveModule from '../utils/resolve.js';

vi.mock('../client/index.js', () => ({ getClient: vi.fn(), isTRPCError: () => false }));
vi.mock('../utils/resolve.js', () => ({ resolveWorkspaceId: vi.fn() }));

const CTX = {
  workspace: { id: 'ws1', slug: 'acme', name: 'Acme' },
  project: { id: 'p1', name: 'Launch' },
  authority: 'guidance',
  instructions: [{ scope: 'workspace', sourceId: 'ws1', text: 'Be terse.' }],
  assembled: 'Be terse.',
  decisions: {
    items: [{ id: 'd1', label: 'D-0042', statement: 'Ship weekly', scope: 'project', decidedAt: null, url: 'https://app/d/d1' }],
    omitted: 4,
  },
  adrs: {
    items: [{ id: 'a1', label: 'API-0003', title: 'Use tRPC', status: 'ACCEPTED', scope: 'product', decidedAt: null, url: 'https://app/a1' }],
    omitted: 0,
  },
  revision: 'sha256:abc',
  generatedAt: '2026-11-15T00:00:00.000Z',
  futureField: 1,
} as const;

function run(cmd: Command, args: string[]) {
  const program = new Command().option('--json').option('--pretty').exitOverride();
  program.addCommand(cmd);
  return program.parseAsync(['node', 'exponential', ...args]);
}

describe('formatContext', () => {
  it('renders instructions, decisions, ADRs, links and the omitted count', () => {
    const out = formatContext(CTX as never);
    expect(out).toContain('Be terse.');
    expect(out).toContain('D-0042');
    expect(out).toContain('Ship weekly');
    expect(out).toContain('https://app/d/d1');
    expect(out).toContain('API-0003');
    expect(out).toContain('Use tRPC');
    expect(out).toContain('4 more');
    expect(out).toContain('guidance, not authority');
  });
});

describe('context / method commands', () => {
  let log: ReturnType<typeof vi.spyOn>;
  const context = vi.fn().mockResolvedValue(CTX);
  const method = vi.fn().mockResolvedValue({ version: '1.0.0', status: 'published', contentHash: 'sha256:x', documents: [] });

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(clientModule.getClient).mockReturnValue({ agentGuidance: { context, method } } as never);
    vi.mocked(resolveModule.resolveWorkspaceId).mockReset().mockResolvedValue('ws1');
    context.mockClear();
    method.mockClear();
  });
  afterEach(() => log.mockRestore());

  it('resolves the workspace slug and prints the raw payload with --json', async () => {
    await run(createContextCommand(), ['--json', 'context', '--workspace', 'acme', '--project', 'p1']);
    expect(resolveModule.resolveWorkspaceId).toHaveBeenCalledWith(expect.anything(), 'acme');
    expect(context).toHaveBeenCalledWith({ workspaceId: 'ws1', projectId: 'p1' });
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual(CTX);
  });

  it('pretty-prints with --pretty', async () => {
    await run(createContextCommand(), ['--pretty', 'context']);
    expect(log.mock.calls[0]![0]).toContain('D-0042');
  });

  it('method sends no workspace unless given', async () => {
    await run(createMethodCommand(), ['--json', 'method']);
    expect(method).toHaveBeenCalledWith({ workspaceId: undefined });
    expect(resolveModule.resolveWorkspaceId).not.toHaveBeenCalled();
  });
});
