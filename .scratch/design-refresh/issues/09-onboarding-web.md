# 09: Onboarding wizard on web

**What to build:** A new User is guided once through language, Base Currency, Workspace Calendar, Rial/Toman display and whether this device keeps data offline; every step is skippable with sensible defaults.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Wizard shown once after the first sign-in to a new personal Workspace; progress and back step shown
- [ ] Defaults from the device (language, timezone) or today's defaults; skip step and skip all
- [ ] Choices saved through the existing User and Workspace settings
- [ ] Finished-or-skipped stored per User on the server, so it never shows again on any device
- [ ] Invited Users joining another Workspace see only the User-level steps
- [ ] Web tests cover steps, skipping, defaults, saving, not showing again and the invited-User variant
- [ ] Replaces the web half of folded ticket 34

Spec: `.scratch/design-refresh/spec.md`.
