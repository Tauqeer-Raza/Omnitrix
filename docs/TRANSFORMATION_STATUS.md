# OMNITRIX transformation status

This file tracks the three implementation checkpoints derived from the SIH technical roadmap.

## Step 1 — Architecture, models, and orchestration

**Status: implementation complete; live Mac health verification pending**

Completed:

- The deployment registry now uses the model IDs configured in BACKEND/.env. Empty slots are labelled and disabled instead of displaying fictional model names.
- gemma:2b is configured as the small orchestrator. qwen3.5:9b is the FAST primary with gemma:2b as fallback. qwen2.5-coder:3b is the MASTER primary with qwen3.5:9b as fallback.
- The system snapshot publishes the orchestrator identity and sanitized provider host metadata.
- GET /api/v1/system/providers/health checks each unique OpenAI-compatible /v1/models endpoint without generating tokens. It distinguishes online, offline, unconfigured, and configured-model-missing states.
- Admin → Local models includes a **Check services** action and displays real configuration and health state.
- The orchestrator classification accepts a short routing reason. FastAPI expands that classification into a persisted, deterministic, user-safe task plan.
- High-confidence programming and calculation requests are validated by the control plane. If the small orchestrator proposes `general`, the final workflow is corrected to `code`, and both the proposed and final types remain visible in technical details.
- The orchestration boundary extracts JSON from fenced or explanatory model output and normalizes common aliases such as `programming`. If the output is still malformed, only explicit code/calculation requests or attached-document requests receive a deterministic recovery plan; ambiguous prompts continue to fail closed.
- Each task records its requested capabilities, route group, selected served model, node, routing strategy, fallback state, and routing reason.
- Live task events are associated with plan steps. The activity panel shows the real plan and derives progress from its actual length.
- Unconfigured model slots cannot be enabled through the Admin API.

Current development topology:

| Role | Model | Endpoint state |
| --- | --- | --- |
| Orchestrator | gemma:2b | Configured on the Mac endpoint |
| Text / FAST | qwen3.5:9b; gemma:2b fallback | Configured on the Mac endpoint |
| Code / MASTER | qwen2.5-coder:3b; qwen3.5:9b fallback | Configured on the Mac endpoint |
| Vision / VISION | Not configured | Disabled |
| Embeddings / LIBRARIAN | Not configured | Disabled; lexical RAG remains selected |

The text and code roles now use separate primary models. Reasoning effort is omitted for qwen2.5-coder:3b because the local endpoint uses that field to enable thinking, which this model does not support.

Validation:

- FastAPI: 27 integration tests pass.
- Frontend: 62 tests pass across service, rendered-route, and live HTTP suites.
- Ruff lint and format checks pass.
- TypeScript and the production Vite build pass.
- A direct health request to 172.20.10.2:11434/v1/models timed out during this checkpoint. Start Ollama on the Mac, confirm the current IP address, and use **Check services** before the manual acceptance test.

Manual acceptance:

1. On the Mac, run ollama list and ensure gemma:2b, qwen3.5:9b and qwen2.5-coder:3b are present.
2. Start Ollama on the LAN and verify http://172.20.10.2:11434/v1/models from Windows.
3. Restart FastAPI so registry reconciliation reads the current environment.
4. Sign in as an administrator, open **Local models**, and select **Check services**.
5. Send a normal chat request and confirm FAST selects qwen3.5:9b.
6. Send a code request and confirm MASTER selects qwen2.5-coder:3b.
7. Open **Technical details** and confirm the orchestrator, plan, routing reason, selected model, node, and capabilities are visible.
8. Submit an image or scanned PDF before configuring VISION and confirm OMNITRIX returns a clear unavailable-model error.

## Step 2 — Flagship document agent workflow

**Status: pending**

This step will add operational vision/OCR, semantic retrieval, the tool execution loop, source-grounded analysis, approval-note generation, and output verification.

## Step 3 — Code agent, sovereignty proof, and production readiness

**Status: pending**

This step will add spreadsheet ingestion, isolated code execution, correction and rerun behavior, real network/hardware telemetry, offline proof, deployment hardening, and final demonstration validation.
