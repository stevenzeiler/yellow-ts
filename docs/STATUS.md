# Status

Last checked 2026-11-20 (github-audit pass 02).

## What works

- `npm ci`, the 4 unit tests and `npm run build` succeed on Node 22.
- Published on npm as `yellow-ts` 0.0.10 (last publish 2025-12-05).
- Per the history, the client connected to Clearnet and authenticated in acceptance runs in Nov and Dec 2025. Not re-run in this pass.

## What is broken or unknown

- Acceptance tests were not run (they need the live network). Current Clearnet behaviour is unknown.
- `npm test` fails without network access: in `test/acceptance/yellow.accept.test.ts` the `beforeAll` is in an unguarded `describe`, so it connects even when the tests are skipped ("Connect timed out" after 30 s). The `suite` variable that holds the skip guard is defined but not used.
- Version mismatch: `package.json` and npm say 0.0.10 but a `v0.7.0` tag exists (on commit 088011a).
- Both `package-lock.json` and `yarn.lock` are committed. Pick one.
- A stray dependency named `-` (`"-": "^0.0.1"`) is in package.json, probably added by accident.
- LICENSE reads "Copyright (c) 2025" with no holder name. Early commits are authored "My CTO". Holder wording is Steven's call.
- README had a reference to an undefined `response` variable in the CommonJS example; fixed in the docs PR.

## What's next

Use the `suite` guard in the acceptance test so `npm test` works offline, run the acceptance tests against Clearnet, remove the stray `-` dependency, pick one lockfile, reconcile the version and tag, and decide whether to publish or to mark the package as unmaintained.

## Not yet from the standard

- CONTRIBUTING.md, SECURITY.md
- `.editorconfig`
- `.github` issue and PR templates
- Dependabot config
- `ci.yml` with gitleaks (and test + build)
- CloudEvents catalog
- Product ONE-PAGER

LICENSE exists (MIT, matches package.json).
