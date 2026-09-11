# OMNITRIX FastAPI wire contract

Implemented in `BACKEND/app`, under `/api/v1`. TypeScript payloads live in `src/types.ts`. See [backend setup](../BACKEND/README.md) for architecture, provider protocols and deployment.

## Authentication

The frontend uses a same-origin proxy and `credentials: include`. Login sets an opaque HttpOnly `omnitrix_session` cookie and readable `omnitrix_csrf` cookie. The server stores hashes. Authenticated mutations include `X-CSRF-Token` from the readable cookie. Mutations must have an allowed Origin, or `X-Requested-With: Omnitrix` when Origin is absent. The frontend sends both headers. Production requires HTTPS, secure cookies and explicit origins/hosts.

Login returns `{user, token: "", csrfToken}` for compatibility; the empty token field is not a bearer credential. Logout revokes the session and expires cookies. Never send role or ownership claims as authentication. `GET /knowledge/search` also requires the CSRF header because embedding queries consume tokens.

Errors use `{ "code": "RESOURCE_LIMIT", "detail": "Readable explanation" }`. Statuses include 401 unauthenticated, 403 forbidden, 404 unavailable resource, 409 conflict, 413 oversized body, 422 validation, 429 quota/throttling and 502/503 provider/configuration failure. Unknown mutation fields are rejected. Validation does not echo input secrets.

## Endpoints

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/auth/login` | `{email,password}` → session envelope; throttled |
| GET | `/auth/me` | Current authorized User |
| POST | `/auth/logout` | Revoke session; 204 |
| GET | `/system/snapshot` | Authorized Database view of tasks, users, documents, registry, policy and telemetry |
| GET | `/system/providers/health` | Probe configured local `/v1/models` registries; returns model availability and latency without inference |
| PATCH | `/system/settings` | Writable policy fields only; admin |
| POST | `/system/reconnect` | Clear processing pause; admin; does not probe providers |
| POST | `/tasks` | `{prompt,title?,conversationId?,documentIds?,scenario?:"normal"}` → queued task; 201 |
| GET | `/tasks/{id}` | Authorized task with events, reply, citations and usage |
| GET | `/tasks/{id}/events` | AgentEvent[] in sequence order |
| GET | `/tasks/{id}/stream` | Authenticated SSE; optional after query or Last-Event-ID header |
| POST | `/tasks/{id}/retry` | Retry latest failed turn with quota/permission checks; 204 |
| POST | `/tasks/{id}/cancel` | Stop active work, retain consumed usage; 204 |
| GET | `/tasks/{id}/outputs/{format}` | Completed answer exported as docx, pdf, xlsx, pptx or txt; binary |
| POST | `/documents` | Multipart file, knowledge boolean → document with indexing queued; 201 |
| GET | `/documents` | Authorized LocalDocument[] |
| GET | `/documents/{id}/file` | Authorized original bytes |
| POST | `/documents/{id}/reindex` | Requeue indexing after access, quota and active-reference checks |
| DELETE | `/documents/{id}` | Owner/admin deletion, blocked during active use; 204 |
| POST | `/documents/sample` | Explicit 404 DEMO_ONLY; no synthetic backend documents |
| GET | `/knowledge/search?q=…` | `{document,page,relevance,content}[]`; real authorized sources; embedding usage charged |
| GET | `/models` | Model registry |
| PATCH | `/models/{id}` | enabled, priority, nodeId, role, context; admin |
| GET | `/routing` | Routing rules |
| PATCH | `/routing/{id}` | primaryId, fallbackId, strategy; distinct models in same group; admin |
| POST | `/nodes` | name, host, type, accelerator, memory, capacity, status; admin; 201 |
| PATCH | `/nodes/{id}` | Writable metadata and status; admin |
| GET | `/users` | Organization users, without secret hashes; admin |
| POST | `/users` | `{name,email,department,password}` → operator account; admin; 201 |
| PATCH | `/users/{id}` | Name, department, role, permissions, modelAccess, limits, enabled or password; admin |
| GET | `/users/me/allocation` | User and UTC daily/monthly usage |
| GET | `/audit?limit=1000` | Recent SQL audit events; admin; limit capped at 5,000 |

Outside the API prefix: `GET /health/live` and `GET /health/ready`. Development schema: `/api/v1/openapi.json`. Hosted Swagger/ReDoc UI is disabled to avoid runtime CDN dependencies.

## Conversations and streaming

The composer omits a type. A legacy optional type is accepted but does not control routing; the orchestrator chooses general, document or code. Only normal scenarios are allowed in live mode. A root task ID is also its conversation ID. Follow-ups include that ID, inherit attachments when none are specified, and retain the conversation title. The server authorizes the conversation and rejects overlapping active turns. Both classification and generation use only earlier completed turns with nonempty replies from the same conversation and owner, retaining at most 12 turns within `MAX_HISTORY_CHARS`. Trimming removes complete question/answer pairs. Failed/cancelled turns and partial failed answers remain visible in saved tasks but are excluded from model context. Only the latest failed/cancelled turn can be retried; retry sends that prompt as the current request.

Task statuses are queued, running, completed, failed. Cancellation is a failed terminal state with a readable error. After classification, each task includes a deterministic `plan` with `classificationSource`, the valid `orchestratorType` when available, a routing reason, route group, requested capabilities and ordered public steps. The boundary normalizes common JSON wrappers and intent aliases. Malformed output receives a deterministic recovery plan only for explicit code/calculation intent or an attached document; ambiguous malformed plans fail. Once dispatched, `route` records the selected served model, node, strategy, fallback state and route decision. Completed results also include reply, citations, optional code, reviewRequired and `executionStatus: "not_executed"`. Document indexing is a separate durable job reflected in LocalDocument.status and .error.

Managed Ollama orchestrators receive an enforced schema with the required routing fields `type` and `use_knowledge`; public plan descriptions are constructed by the backend. The model request uses a compact, self-contained classification instruction and only the current request plus successful prior-turn context. Other OpenAI-compatible orchestrators retain JSON-object response mode.

SSE uses default message events with id and JSON data fields:

```text
id: evt-opaque-id
data: {"id":"evt-opaque-id","taskId":"tsk-opaque-id","type":"response_delta","step":"response_delta","status":"running","message":"Receiving the local response.","timestamp":"2026-09-10T00:00:00Z","planStepId":"generate","delta":"Response text"}
```

Current task events: task_started, task_classified, rag_search, context_prepared, model_routed, response_started, model_retry, response_delta, review_required, task_completed and task_failed. `planStepId` connects an event to the public plan; model, group, node, tool and routing reason are optional operational metadata. Events contain operational summaries, not hidden reasoning or fabricated sandbox outcomes.

The frontend subscribes to active tasks, resumes after the last persisted event, deduplicates IDs and appends deltas. Terminal events trigger an authoritative snapshot refresh. Four-second polling refreshes allocations and document indexing. Streams close after terminal delivery or revoked/expired access. Disconnecting delivery does not cancel a durable task; use /cancel.

## Visibility and administrative contracts

Snapshots filter task ownership, users and private documents. Shared knowledge requires knowledge permission. Audit snapshots and /audit are admin-only. Role and capability checks are both enforced. Updates cannot set IDs, usage counters or other immutable fields. Admin-created accounts require an individual 12–128 character password.

Telemetry mode is live; networkVerified and hardwareMetricsAvailable are false. usageHourly and usageDaily contain `{label,tokens}` UTC ledger buckets. localRequests counts recorded model-usage entries, not network traffic. Node status and hardware metadata reflect admin configuration. Utilization is unavailable; the live UI must not turn it into a zero measurement.

Registry aliases bind to model endpoints through the backend environment. At startup, built-in registry entries are reconciled with the configured served model IDs and sanitized endpoint hosts. Unconfigured slots are disabled and cannot be enabled through the API. The provider-health endpoint checks each unique configured registry URL once and reports online, offline or model-missing state. Node host metadata never controls outbound URLs. Librarian routing is bound by EMBEDDING_REGISTRY_ID. Embedding-model changes require reindexing, so cross-model fallback is not automatic. Policy seeds from environment for a new database, then persists in SQL. Pause/resume keeps administration accessible. Retention is stored policy; there is no automatic deletion job in this release.
