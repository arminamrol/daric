# 37: AI: providers and Suggestions

**What to build:** An analysis returns Suggestions written by the configured provider, each citing Facts, with savings computed by our code (ADR-0003).

**Blocked by:** 36

**Status:** ready-for-agent

- [ ] OpenAI-compatible adapter (works with Ollama/local) and Anthropic adapter, selected by config
- [ ] Prompt: spending only, no investment or product advice, non-judgmental, user's language
- [ ] Output validated with zod, schema has no number fields; digits in text stripped or rejected; unknown factIds dropped
- [ ] Savings shown with each Suggestion computed in core from cited Facts
- [ ] Tests with fake provider for malformed output, numbers in text and unknown facts
