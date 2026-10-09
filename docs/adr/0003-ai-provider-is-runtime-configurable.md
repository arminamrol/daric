# AI provider is chosen by configuration, not code

The AI provider is not decided and may be a local or Iranian service; tests use local models. All LLM calls go through one `AiProvider` interface in the API, selected by environment config (adapter, base URL, model, key). The first adapter is OpenAI-compatible (covers Ollama, vLLM, LM Studio and most hosted/local gateways); Anthropic is a second adapter. A deterministic fake provider is used in automated tests.
