# FastAPI integration contract

Base path: `/api/v1`. Configure a same-origin reverse proxy and secure HttpOnly session cookies. The HTTP transport sends `credentials: include`; the mock `token` field is illustrative and is never treated as production authorization. Configure cookie SameSite, CSRF protection, allowed origins and session expiry on the backend. Do not trust browser-provided role or ownership fields.

TypeScript records in `src/types.ts` describe the wire payloads. Dates are ISO 8601; IDs are opaque strings. JSON errors use `{ "code": "RESOURCE_LIMIT", "detail": "Readable explanation" }`. Use 401 for missing sessions, 403 for denied actions, 404 for inaccessible records, 409 for state conflicts, 413 for oversized uploads and 422 for validation failures.

| Method | Endpoint                     | Contract                                                                                                |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`                | `{email,password}` → `{user,token}`; establish server session                                           |
| GET    | `/auth/me`                   | Authenticated `User`                                                                                    |
| POST   | `/auth/logout`               | End session; 204                                                                                        |
| GET    | `/system/snapshot`           | Authorized `Database`-shaped view. Filter users, documents, tasks and audit before sending              |
| PATCH  | `/system/settings`           | Partial `Settings` → stored settings; admin only                                                        |
| POST   | `/system/reconnect`          | Recheck local service availability                                                                      |
| POST   | `/tasks`                     | `{prompt,title?,type,documentIds,scenario}` → `Task`; derive owner server-side. `scenario` is demo-only |
| GET    | `/tasks/:id`                 | Authorized `Task`                                                                                       |
| GET    | `/tasks/:id/events`          | `AgentEvent[]`                                                                                          |
| GET    | `/tasks/:id/stream`          | Authenticated SSE; cancel on disconnect, resume by event ID                                             |
| POST   | `/tasks/:id/retry`           | Retry failed run with quota/permission validation                                                       |
| POST   | `/tasks/:id/cancel`          | Cancel active task                                                                                      |
| GET    | `/tasks/:id/outputs/:format` | Binary `docx`, `pdf`, `xlsx`, `pptx`; authorized completed runs only                                    |
| POST   | `/documents`                 | Multipart `file` plus `knowledge` boolean → `LocalDocument`                                             |
| GET    | `/documents`                 | Authorized `LocalDocument[]`                                                                            |
| GET    | `/documents/:id/file`        | Binary original file, safely served inline or as an attachment                                          |
| DELETE | `/documents/:id`             | Check ownership, retention policy, and active task references                                           |
| POST   | `/documents/sample`          | Demo-only sample creation                                                                               |
| GET    | `/knowledge/search?q=…`      | `{document,page,relevance,content}[]`, with source authorization                                        |
| GET    | `/models`                    | `Model[]`                                                                                               |
| PATCH  | `/models/:id`                | Enabled, priority, nodeId, role or context; admin only                                                  |
| GET    | `/routing`                   | `RoutingRule[]`                                                                                         |
| PATCH  | `/routing/:id`               | Distinct primary/fallback IDs within the same model group; admin only                                   |
| POST   | `/nodes`                     | Generic node registration → `ComputeNode`; admin only                                                   |
| PATCH  | `/nodes/:id`                 | Node configuration/status; admin only                                                                   |
| GET    | `/users`                     | `User[]`; admin only                                                                                    |
| POST   | `/users`                     | `{name,email,department}` → provisioned `User`; admin only                                              |
| PATCH  | `/users/:id`                 | Access, allocation and account metadata; reject arbitrary immutable fields                              |
| GET    | `/users/me/allocation`       | Current `User` allocation view                                                                          |
| GET    | `/audit`                     | Authorized `AuditEvent[]`                                                                               |

Event envelope:

```json
{
  "id": "evt-opaque-id",
  "taskId": "tsk-opaque-id",
  "type": "rag_search",
  "step": "rag_search",
  "status": "running",
  "message": "Searching local knowledge base",
  "timestamp": "2026-09-08T06:30:00Z",
  "model": "Nominic Embed text"
}
```

Supported events: task_started, task_classified, model_routed, ocr_started, ocr_completed, rag_search, agent_reasoning, model_inference, document_generated, sandbox_started, test_passed, test_failed, task_completed, task_failed. Send operational summaries and public tool events, never hidden model chain-of-thought. `taskEvents.subscribe()` can replace polling when the backend is available. The initial HTTP application snapshot currently refreshes every four seconds; SSE is an independent prepared adapter.

Production completion must be an authoritative, idempotent state transition: account for resource reservations, cancellation, fallback selection and charging in backend transactions. The UI displays server telemetry; it must not calculate proof of network isolation. Return capability metadata for compatible model/node scheduling rather than inferring compatibility from node type or vendor.
