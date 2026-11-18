import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActionsCommand } from './actions.js';
import * as clientModule from '../client/index.js';

vi.mock('../client/index.js', () => ({
  getClient: vi.fn(),
  isTRPCError: () => false,
}));

const ACTION = { id: 'a1', name: 'Follow up', status: 'ACTIVE', assignees: [] };

function makeClient() {
  const actions = {
    create: vi.fn().mockResolvedValue(ACTION),
    update: vi.fn().mockResolvedValue(ACTION),
    assign: vi.fn().mockResolvedValue(ACTION),
    unassign: vi.fn().mockResolvedValue(ACTION),
  };
  vi.mocked(clientModule.getClient).mockReturnValue(
    { actions } as unknown as ReturnType<typeof clientModule.getClient>,
  );
  return actions;
}

async function run(args: string[]) {
  const cmd = createActionsCommand();
  cmd.exitOverride();
  await cmd.parseAsync(args, { from: 'user' });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
});

describe('actions create --assignee', () => {
  it('splits repeated and comma-separated refs into ids and emails', async () => {
    const actions = makeClient();
    await run(['create', '-n', 'Follow up', '--assignee', 'u1,ada@example.com', '--assignee', 'u2']);
    expect(actions.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Follow up', assigneeIds: ['u1', 'u2'], assigneeEmails: ['ada@example.com'] }),
    );
  });

  it('sends no assignee fields without the flag', async () => {
    const actions = makeClient();
    await run(['create', '-n', 'Follow up']);
    const input = actions.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).not.toHaveProperty('assigneeIds');
    expect(input).not.toHaveProperty('assigneeEmails');
  });
});

describe('actions update assignees', () => {
  it('--assignee adds through actions.assign and skips the empty field update', async () => {
    const actions = makeClient();
    await run(['update', '--id', 'a1', '--assignee', 'cmdfuz6eu0000a08xmknsk4gc']);
    expect(actions.assign).toHaveBeenCalledWith('a1', { userIds: ['cmdfuz6eu0000a08xmknsk4gc'], emails: [] });
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('--unassign removes by id or email', async () => {
    const actions = makeClient();
    await run(['update', '--id', 'a1', '--unassign', 'ada@example.com,u3']);
    expect(actions.unassign).toHaveBeenCalledWith('a1', { userIds: ['u3'], emails: ['ada@example.com'] });
  });

  it('--clear-assignees with --assignee clears first, then adds (replace)', async () => {
    const actions = makeClient();
    await run(['update', '--id', 'a1', '--clear-assignees', '--assignee', 'u1']);
    expect(actions.unassign).toHaveBeenCalledWith('a1', { all: true });
    expect(actions.assign).toHaveBeenCalledWith('a1', { userIds: ['u1'], emails: [] });
    expect(actions.unassign.mock.invocationCallOrder[0]!).toBeLessThan(actions.assign.mock.invocationCallOrder[0]!);
  });

  it('field changes and assignees together run both', async () => {
    const actions = makeClient();
    await run(['update', '--id', 'a1', '--name', 'Renamed', '--assignee', 'u1']);
    expect(actions.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', name: 'Renamed' }));
    expect(actions.assign).toHaveBeenCalled();
  });
});
