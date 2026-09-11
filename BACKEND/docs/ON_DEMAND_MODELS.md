# On-demand Ollama models: Windows control plane + Mac inference

OMNITRIX selects the workflow and specialist. Ollama loads the requested model; OpenWebUI is not required. `ollama list` lists installed models; `ollama ps` lists models occupying memory. An idle residency timer does not mean a model is generating an answer.

## What the backend controls

- Preload only the configured orchestrator with `keep_alive: -1` at startup.
- Classify the request, validate its plan and permissions, then call the selected specialist.
- Serialize inference per managed server, including OCR and embeddings. Roles using the same Mac URL share a lock.
- Clear idle, configured OMNITRIX specialists before a new model request. Unrelated models are left alone.
- Send `keep_alive: 0` for specialists. Also request unloading on completion, failure, cancellation or timeout before releasing the lock. Cleanup has a bounded timeout; failures are logged and shown in task activity.
- Pin Gemma only at the configured orchestrator endpoint. Gemma used as a fallback on another server is unloaded after use.
- Show loading/release events in task activity. Admin **Check services** reports availability separately from memory residency, without loading models.

The native Ollama protocol is opt-in via `OLLAMA_MANAGED_BASE_URLS`. Other servers retain the existing OpenAI-compatible protocol. A managed server must expose `/api/chat`, `/api/embed`, `/api/ps` and `/api/generate`, plus `/v1/models`. A gateway exposing only `/v1` needs its native routes enabled first.

## 1. Enable memory management

Preserve existing role URLs and exact model names. Add their direct Ollama `/v1` URLs to `BACKEND/.env`:

```dotenv
OLLAMA_MANAGED_BASE_URLS=["http://127.0.0.1:11434/v1","https://apples-macbook-pro.tailfd29c0.ts.net/v1"]
OLLAMA_PIN_ORCHESTRATOR=true
OLLAMA_CONTEXT_LENGTH=4096
OLLAMA_CLEANUP_TIMEOUT_SECONDS=15
WORKER_CONCURRENCY=1
```

Replace the Mac hostname if needed. Use the same spelling of its URL for every role so they share a lock. The context limit bounds model context memory; larger prompts may need a larger value.

## 2. Move orchestration to Windows

Keep Ollama running on Windows. In PowerShell:

```powershell
ollama list
# Only if gemma:2b is missing:
ollama pull gemma:2b
```

Set these fields in `BACKEND/.env`:

```dotenv
ORCHESTRATOR_BASE_URL=http://127.0.0.1:11434/v1
ORCHESTRATOR_MODEL=gemma:2b
ORCHESTRATOR_API_KEY=
ORCHESTRATOR_MAX_TOKENS=96
```

Leave specialist URLs pointing to the Mac. Keep vision/embedding fields blank until those capabilities are configured. Each `*_MODEL` must exactly match the Mac's `ollama list`; installation alone does not enable an OMNITRIX role.

Stop the backend with Ctrl+C in its terminal and restart:

```powershell
cd D:\Omnitrix\BACKEND
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

The backend preloads local Gemma automatically. No interactive `ollama run` session is required for each specialist. The browser calls FastAPI, and routing inference runs on Windows through the backend.

## 3. Verify both machines

After moving orchestration, stop Gemma once on the Mac if it was previously pinned there, then monitor:

```sh
ollama stop gemma:2b
while true; do clear; ollama ps; sleep 1; done
```

Send a text prompt, then a code prompt. The corresponding Mac specialist should appear during generation and disappear afterward. When idle, no OMNITRIX specialist should remain resident. On Windows, `ollama ps` should show Gemma after preloading finishes. **View activity** shows the chosen model and release event. Refresh **Admin → Local models → Check services** for an instantaneous memory snapshot.

For a server-wide limit on a **dedicated Mac**, after orchestration has moved to Windows, quit the Ollama app, run these commands, then reopen Ollama:

```sh
launchctl setenv OLLAMA_MAX_LOADED_MODELS 1
launchctl setenv OLLAMA_NUM_PARALLEL 1
launchctl setenv OLLAMA_KEEP_ALIVE 0
```

If running `ollama serve` manually, stop it and restart with those environment variables instead. Preserve existing network/listen settings. Do not start a second server on the same port.

The backend lock is per process: use one Uvicorn worker. Other Ollama clients/additional backend processes can independently load models, so the Mac server limit helps when sharing it. Abrupt termination or an unreachable Mac can prevent cleanup; verify `ollama ps` and stop leftovers manually in that case.

Immediate unloading saves memory but adds a cold-load delay to the next specialist request. It does not increase token-generation speed. The earlier Mac screenshot showed `100% CPU`; investigate GPU/Metal support for that Mac separately. Shorter outputs, suitable smaller specialists and avoiding concurrent generation can reduce latency.

References: [Ollama memory and concurrency FAQ](https://docs.ollama.com/faq), [chat API](https://docs.ollama.com/api/chat), [unload API](https://docs.ollama.com/api/generate), [embedding API](https://docs.ollama.com/api/embed).
