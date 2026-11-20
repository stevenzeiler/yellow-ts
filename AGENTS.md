# AGENTS.md

Guidance for AI agents working in this repo. Humans: see README.md.

## What this is

`yellow-ts`, a public TypeScript SDK for the Yellow Clearnet websocket API. It wraps `@erc7824/nitrolite` and is modelled on `xrpl.js`. Dormant since 2025-12.

## Stack

- Node.js 20+ (checked on Node 22), npm (package-lock.json; a stale `yarn.lock` is also committed)
- TypeScript 5, ESM package with CJS output, built with `tsup`
- `@erc7824/nitrolite` ^0.5.1, `websocket-ts` ^2, `ws`
- Tests: `vitest` 2

## Layout

- `src/Client.ts` the whole client; `src/index.ts` exports
- `test/unit/` offline tests; `test/acceptance/` live-network tests
- `types/shims-nitrolite.d.ts` type shim
- `dist/` build output (gitignored)

## Commands

```bash
npm ci
npm test            # vitest run; acceptance tests skip unless YELLOW_E2E=1
npm run build       # tsup, ESM + CJS + d.ts
```

Both worked on 2026-11-20 (4 unit tests pass). Acceptance tests need the live `wss://clearnet.yellow.com/ws`.

## Rules

- Tests with every change: unit tests for new behaviour, acceptance test when it touches the wire.
- Never commit secrets (wallet keys, seed phrases). Acceptance tests generate throwaway keys.
- Use Conventional Commits.
- Keep docs/STATUS.md current.
- Keep `package.json` version, git tags and README install notes in step. Tag `v0.7.0` exists while package.json says 0.0.10.

## What agents may and may not do

- May: edit code, tests and docs on a branch, open PRs, run `npm test` and `npm run build`.
- May not, without Steven: publish to npm, create or move tags or releases, archive the repo, rewrite git history, or change the license.
