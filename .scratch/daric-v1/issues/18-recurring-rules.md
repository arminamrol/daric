# 18: Recurring Rules and Due Occurrences

**What to build:** A user defines recurring rent, salary or subscriptions; when one comes due it waits for one-tap confirmation (with an editable amount) unless the rule auto-posts, and missed occurrences are listed oldest first.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] core occurrence generator for weekly/monthly/yearly rules in the Workspace Calendar (incl. day 31 and Esfand edge cases)
- [ ] Recurring Rules API; Due Occurrences listed and confirmed/skipped
- [ ] Auto-post rules create Transactions linked to the rule; confirm-by-default otherwise
- [ ] Web screens for rules and Due Occurrences
- [ ] Tests for generation, catch-up and idempotent confirmation
