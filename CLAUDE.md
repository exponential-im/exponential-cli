# Exponential CLI

TypeScript CLI for the Exponential platform. Provides commands for managing actions (issues), projects, workspaces, and authentication.

## Commands

```bash
npm run build      # Compile TypeScript (tsup)
npm run dev        # Watch mode
npm run typecheck  # Type check only
```

## Project Structure

```
src/
├── index.ts              # CLI entry point (Commander.js)
├── client/index.ts       # ExponentialClient singleton
├── commands/             # auth, actions, projects, workspaces
├── config/index.ts       # Config management (via exponential-sdk)
└── utils/                # output formatting, error handling
```

- ESM-only, Node >= 18, strict TypeScript
- Uses `exponential-sdk` for API client and config
- Uses `commander` for CLI, `chalk` for terminal output
- Output auto-detects JSON (piped) vs pretty-printed (terminal)

## Integration Contexts

This CLI is used across several AI-assisted workflows:

- **Claude Code** — developers use the CLI directly within Claude Code sessions to manage issues and tasks
- **Claude Desktop** — used as a tool/integration for conversational task management
- **ACFS (server deployment)** — automated agent orchestration on a VPS, where a worker loop polls for open issues and dispatches them to AI agents running in tmux sessions

The CLI's JSON output mode and pipeable design make it a natural fit for all of these contexts.

### ACFS Integration (detailed)

**Architecture:** `Exponential CLI -> Worker -> NTM -> tmux -> AI agents -> Results -> Exponential`

- **Worker** = polling loop (~60s) that fetches open issues and spawns agent sessions
- **NTM** = tmux session manager / scheduler
- **Agents** = Claude, Codex, etc. executing tasks in tmux sessions

See [docs/acfs-integration.md](docs/acfs-integration.md) for full architecture details.

### Key considerations for CLI development
- Stable JSON output format is critical — agents and tools parse CLI output
- Issue lifecycle hooks and webhook support are future goals
- Node.js runtime is required (even when Bun is available on the VPS)

## Who merges: the PR-Agent auto-merge gate, or James

`.github/workflows/pr-agent-automerge.yml` squash-merges a PR into `main` once CI
(`Build, typecheck & test`) is green and PR-Agent left nothing blocking on the latest
commit. **Agent sessions do not merge PRs.**

PR-Agent runs review-only: GLM 5.3 through OpenRouter, one call per push. It doesn't
rewrite descriptions or post code suggestions. What blocks is a review finding tagged
`[blocker]` or left untagged, or a security concern. Fix those; `[minor]` findings don't
hold the merge. Every push is reviewed again and paid for, so batch fixes into one push
rather than pushing each one separately. The model and house rules are in `.pr_agent.toml`;
PR-Agent reads that file from `main`, so editing it on a branch changes nothing until merged.

- Never run `gh pr merge`, and never pass `--merge` to `/ship-this` or `/ship-ticket`. Open
  the PR, apply PR-Agent's findings, push, and stop at "in review". The gate (or James) merges.
- Never add the `pr-agent-ack` label. It means "James saw the blocker and is merging anyway".
  Only James applies it: a Claude Code hook blocks sessions from adding it, and the gate
  ignores it from anyone else.
- A PR you can't get past the gate is left for James with a comment saying what blocks it
  and why you could not fix it.
- `no-automerge` on a PR keeps it human-only. Don't remove it.
- PRs from forks and PRs opened by bots are never auto-merged; James merges those.

### `exponential-sdk` must be published before a PR that needs it

CI runs `.github/scripts/check-sdk-pin.mjs` before `npm ci`. It fails when the
`exponential-sdk` range in `package.json` has no published version on npm, when
`package-lock.json` pins a version that isn't on npm (or a local link or tarball), or when
the two files disagree. Publish the SDK first, then run `npm install` here and commit
`package-lock.json`. A version published in the last few minutes can lag the registry;
re-run the job.

`.github/workflows/sdk-bump.yml` checks npm hourly and opens a `chore: bump exponential-sdk
to <version>` PR when there is a newer SDK. A bot opens it, so the gate leaves it for James.
