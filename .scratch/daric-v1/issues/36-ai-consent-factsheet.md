# 36: AI: flag, Consent, Fact Sheet and preview

**What to build:** With AI enabled, a user reads an explanation, grants ai_analysis Consent, taps Analyze my spending, and sees exactly the de-identified Fact Sheet that would be sent before confirming.

**Blocked by:** 25, 27, 40

**Status:** ready-for-agent

- [ ] Feature flag (global and per Workspace); AI off by default
- [ ] core Fact Sheet builder: Category/Label totals, change vs previous Period, controllable share, savings at 10/20/30%; every fact has an id; no notes, account names or people's names unless `ai_include_names` opted in
- [ ] Preview endpoint returns payload and its hash; confirm sends the hash; server sends only the matching payload
- [ ] Optional "remember my choice" stored as a revocable Consent per Workspace
- [ ] AiProvider interface with a deterministic fake; analyses stored with payload_sent and audited
- [ ] Analyze requires the AI Entitlement: Plus, or Free with its 1 analysis this month left; otherwise the paywall
