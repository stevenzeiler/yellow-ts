# Status

Last checked 2026-11-20 (github-audit pass 02).

## What works

- `npm ci`, `npm test` (4 unit tests pass) and `npm run build` all succeed on Node 22.
- Per the history, the client connected to Clearnet and authenticated in acceptance runs in Nov and Dec 2025. Not re-run in this pass.

## What is broken or unknown

- Acceptance tests were not run (they need the live network). Current Clearnet behaviour is unknown.
- Version mismatch: `package.json` says 0.0.10 but a `v0.7.0` tag exists. Whether npm has `yellow-ts`, and at what version, is unknown.
- Both `package-lock.json` and `yarn.lock` are committed. Pick one.
- A stray dependency named `-` (`"-": "^0.0.1"`) is in package.json, probably added by accident.
- LICENSE reads "Copyright (c) 2025" with no holder name. Early commits are authored "My CTO". Holder wording is Steven's call.
- README had a reference to an undefined `response` variable in the CommonJS example; fixed in the docs PR.

## What's next

Run the acceptance tests against Clearnet, remove the stray `-` dependency, pick one lockfile, reconcile the version and tag, and decide whether to publish or to mark the package as unmaintained.

## Not yet from the standard

- CONTRIBUTING.md, SECURITY.md
- `.editorconfig`
- `.github` issue and PR templates
- Dependabot config
- `ci.yml` with gitleaks (and test + build)
- CloudEvents catalog
- Product ONE-PAGER

LICENSE exists (MIT, matches package.json).
