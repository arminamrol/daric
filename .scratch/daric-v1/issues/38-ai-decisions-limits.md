# 38: AI: decisions and limits

**What to build:** A user accepts, dismisses, snoozes and rates Suggestions; accepting may offer a follow-up that needs a second confirmation; AI history can be deleted; usage is limited.

**Blocked by:** 37, 17

**Status:** ready-for-agent

- [ ] Accept/Dismiss/Snooze with snooze-until; ratings helpful/not helpful
- [ ] Follow-ups (create Budget, flag Label controllable, reminder) open a prefilled confirmation; nothing applied automatically
- [ ] Delete AI history
- [ ] Per-user rate limits; monthly usage quota comes from the AI Entitlement (Plus quota from config, Free 1), remaining count shown
- [ ] HTTP tests for decisions and limits
