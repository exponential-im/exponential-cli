import { Command } from 'commander';
import chalk from 'chalk';
import type { AgentContextPayload, AgentMethodPayload } from 'exponential-sdk';
import { getClient } from '../client/index.js';
import { handleError } from '../utils/errors.js';
import { resolveWorkspaceId } from '../utils/resolve.js';
import { shouldUseJson } from '../utils/output.js';

interface GlobalOptions {
  json?: boolean;
  pretty?: boolean;
}

const GUIDANCE_NOTE =
  'This is guidance, not authority (ADR-0071): it never grants permission for anything.';

function more(omitted: number): string[] {
  return omitted > 0 ? [chalk.dim(`  …and ${omitted} more`)] : [];
}

/** Terminal rendering of `agentGuidance.context`. JSON output never goes through here. */
export function formatContext(ctx: AgentContextPayload): string {
  const lines: string[] = [];
  const scope = ctx.project ? `${ctx.workspace.name} / ${ctx.project.name}` : ctx.workspace.name;
  lines.push(chalk.bold(`Agent context — ${scope}`));
  lines.push(chalk.dim(GUIDANCE_NOTE));
  lines.push('');

  lines.push(chalk.bold('Instructions'));
  if (ctx.instructions.length === 0) lines.push(chalk.dim('  (none)'));
  for (const i of ctx.instructions) {
    lines.push(chalk.cyan(`  [${i.scope}]`));
    for (const l of i.text.split('\n')) lines.push(`    ${l}`);
  }
  lines.push('');

  const decisions = ctx.decisions ?? { items: [], omitted: 0 };
  lines.push(chalk.bold('Decisions'));
  if (decisions.items.length === 0 && decisions.omitted === 0) {
    lines.push(chalk.dim(ctx.project ? '  (none)' : '  (none — pass --project to include decisions)'));
  }
  for (const d of decisions.items) {
    lines.push(`  ${chalk.yellow(d.label)} ${d.statement}`);
    lines.push(chalk.dim(`    ${d.url}`));
  }
  lines.push(...more(decisions.omitted));
  lines.push('');

  const adrs = ctx.adrs ?? { items: [], omitted: 0 };
  lines.push(chalk.bold('ADRs'));
  if (adrs.items.length === 0 && adrs.omitted === 0) lines.push(chalk.dim('  (none)'));
  for (const a of adrs.items) {
    lines.push(`  ${chalk.yellow(a.label ?? 'ADR')} ${a.title}`);
    lines.push(chalk.dim(`    ${a.url}`));
  }
  lines.push(...more(adrs.omitted));
  lines.push('');
  lines.push(chalk.dim(`revision ${ctx.revision}`));
  return lines.join('\n');
}

/** Terminal rendering of `agentGuidance.method`. */
export function formatMethod(method: AgentMethodPayload): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`Method ${method.version}`) + chalk.dim(` (${method.status})`));
  lines.push(chalk.dim(GUIDANCE_NOTE));
  for (const doc of method.documents) {
    lines.push('');
    lines.push(chalk.bold.cyan(`# ${doc.title}`));
    lines.push(doc.markdown);
  }
  lines.push('');
  lines.push(chalk.dim(method.contentHash));
  return lines.join('\n');
}

export function createContextCommand(): Command {
  return new Command('context')
    .description(
      `Show the AI instructions, decisions and ADRs agents get for a workspace (and project). ${GUIDANCE_NOTE}`,
    )
    .option('-w, --workspace <slug>', 'Workspace slug or id (defaults to the configured workspace)')
    .option('-p, --project <id>', 'Project id, to include project instructions and decisions')
    .action(async (options: { workspace?: string; project?: string }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      try {
        const client = getClient();
        const workspaceId = await resolveWorkspaceId(client, options.workspace);
        const ctx = await client.agentGuidance.context({ workspaceId, projectId: options.project });
        if (shouldUseJson(globalOpts.json, globalOpts.pretty)) {
          console.log(JSON.stringify(ctx, null, 2));
        } else {
          console.log(formatContext(ctx));
        }
      } catch (error) {
        handleError(error);
      }
    });
}

export function createMethodCommand(): Command {
  return new Command('method')
    .description(`Show the current published method agents follow. ${GUIDANCE_NOTE}`)
    .option('-w, --workspace <slug>', 'Workspace slug or id (lets preview workspaces see a draft)')
    .action(async (options: { workspace?: string }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      try {
        const client = getClient();
        const workspaceId = options.workspace
          ? await resolveWorkspaceId(client, options.workspace)
          : undefined;
        const method = await client.agentGuidance.method({ workspaceId });
        if (shouldUseJson(globalOpts.json, globalOpts.pretty)) {
          console.log(JSON.stringify(method, null, 2));
        } else {
          console.log(formatMethod(method));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
