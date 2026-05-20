# .claude/

Project-scoped Claude Code config. Goes alongside the auto-loaded
`CLAUDE.md` at the repo root.

## What's committed

- `settings.json` — shared settings (permissions, allowed commands).
  Keeps the team in sync on what Claude can run without prompting.

## What's gitignored

- `worktrees/` — ephemeral git worktrees created when Claude operates
  in `isolation: worktree` mode. Never commit.
- `projects/` — per-session local state.

Anything else can be committed if it benefits everyone working on the
repo.

## Editing this

If you change `settings.json`, document the why in a commit message so
others on the team understand the new permission. Don't add permissions
just because Claude got prompted once — only for actions that are
clearly safe and frequent.
