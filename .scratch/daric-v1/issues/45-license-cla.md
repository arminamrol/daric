# 45: License, CLA and README

**What to build:** The repo is clearly AGPL-3.0, every outside contribution is covered by a CLA, and the README explains self-hosting vs the paid hosted service (ADR-0007).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] LICENSE with the official AGPL-3.0 text from gnu.org (not retyped)
- [x] CLA text granting the maintainer the right to relicense; enforced on PRs (e.g. CLA Assistant)
- [x] README Licensing section: self-host free with billing disabled, hosted Daric Plus is paid
- [x] SPDX identifier in package manifests

## Comments

Implemented:

- `LICENSE` downloaded verbatim from https://www.gnu.org/licenses/agpl-3.0.txt.
- `CLA.md` (Apache ICLA-style copyright and patent grant) adds the right to publish Contributions under any terms, including proprietary ones. Names Armin Amrollahian as Maintainer, plus assignees.
- `.github/workflows/cla.yml` runs CLA Assistant Lite (`contributor-assistant/github-action@v2.6.1`) on `pull_request_target` and PR comments; it never checks out PR code. Signatures go to `signatures/cla.json` on the `cla-signatures` branch. Allowlist: `arminamrol` and bots.
- README `## Licensing` section (self-host free with `BILLING_ENABLED=false`, hosted Daric Plus paid) and a CLA paragraph under `## Contributing`.
- `"license": "AGPL-3.0-only"` in all ten `package.json` files. Chose `-only` over `-or-later`: with the CLA the maintainer can relicense anyway, so a future FSF version is not delegated.

Left for the maintainer on GitHub (not doable from the repo):

- Create the `cla-signatures` branch once (`git push origin main:cla-signatures`), if the action does not create it on first run.
- Add the `CLAAssistant` status check to `main`'s required checks in branch protection, so unsigned PRs cannot merge.
