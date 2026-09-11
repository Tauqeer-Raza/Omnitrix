# OMNITRIX FastAPI control plane

This directory implements the backend for the React frontend in the parent directory. It owns authentication, conversations, orchestration, a durable task queue, document processing, local retrieval, token accounting, exports and administrative records. Model weights, inference servers, credentials and infrastructure addresses are deliberately not bundled.

## Architecture mapping

| Diagram component | Implementation |
| --- | --- |
| User → React UI | Parent frontend in HTTP mode; same-origin cookie sessions |
| Gateway / load balancer | `deploy/nginx.conf.example`: HTTPS, SPA routing, `/api` reverse proxy and unbuffered SSE |
| Backend API router | `app/main.py`, `routes_*.py`: authentication, authorization, session handling and task admission |
| Jetson TX2 control plane | This API, SQL queue/audit/storage and librarian coordinator; model runtimes remain separate services |
| 2B orchestrator | `ORCHESTRATOR_*`: classifies each prompt, records a routing reason and selects general, document or code workflows |
| Librarian | `app/retrieval.py`: configured local embeddings, SQL vector search or Qdrant, source citations and document ACLs |
| SQL audit log | SQLAlchemy tables for accounts, sessions, tasks, public events, usage and audit records |
| Private Ethernet LAN | Backend-only HTTP(S) dispatch using administrator-owned service URLs |
| Mac mini 1 / T1 | `TEXT_*`, `node-01`, FAST group: chat, summaries and document answers |
| Mac mini 2 / V1 | `VISION_*`, `node-02`, VISION group: image and scanned-PDF OCR |
| Mac mini 3 / C1 | `CODE_*`, `node-03`, MASTER group: code generation and reasoning |
| Final answer stream | Persisted response deltas → authenticated SSE → existing chat UI |

Employees access only the gateway. The browser receives neither provider credentials nor provider URLs for dispatch. Node host fields in the admin UI are descriptive metadata; entering a host there does not turn it into an outbound request target. Actual worker bindings live in the backend environment.

## Run on Windows

Use Python **3.11 or newer**; Python 3.13 is installed on this workstation, while Python 3.12 is the container default. From the project root:

```powershell
cd D:\Omnitrix\BACKEND
# Run this only when .venv does not already exist.
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
# Copy only on a fresh checkout; preserve an existing .env.
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.cli create-admin --email admin@omnitrix.local
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

The account command prompts twice for an individual 12–128 character password. There is **no built-in backend demo password**. An ignored `.env` and a working Python 3.13 virtual environment were created in this workspace; on this machine, do not recreate `.venv`. Start with the account command. All model endpoints remain blank until deployment details are supplied.

Connect the frontend in a second terminal:

```powershell
cd D:\Omnitrix
# On a fresh setup; merge these settings if .env.local already exists.
Copy-Item .env.example .env.local
npm install
npm run dev
```

The root environment selects `VITE_API_MODE=http`, `VITE_API_BASE_URL=/api/v1` and `BACKEND_PROXY_URL=http://127.0.0.1:8000`. Vite proxies `/api` to FastAPI. Open `http://127.0.0.1:5173` and use the account you provisioned. Use one hostname consistently so cookies match. Restart Vite after changing its environment. Without `VITE_API_MODE=http`, the frontend retains its standalone mock behavior.

Linux equivalent, from `BACKEND`:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
cp .env.example .env
.venv/bin/python -m app.cli create-admin --email admin@omnitrix.local
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Run commands from `BACKEND`, because `.env`, `DATA_DIR` and the default SQLite path are relative to the working directory. `requirements.lock` pins the tested runtime and development packages; `pyproject.toml` describes compatible dependency ranges. Optional PostgreSQL support is installed with `python -m pip install '.[postgres]'` and uses a `postgresql+psycopg://…` database URL.

## Configure inference

For automatic specialist loading/unloading and moving Gemma to Windows, follow [On-demand Ollama models](docs/ON_DEMAND_MODELS.md). It includes memory-management settings and a two-machine verification procedure. Managed Ollama endpoints use the native protocol described there; other providers use the compatible protocol below.

Copy the blank deployment fields from `.env.example` into `.env`. Keep secrets out of root `VITE_*` variables: those variables are compiled into browser code.

| Fields | Required for |
| --- | --- |
| `ORCHESTRATOR_BASE_URL`, `ORCHESTRATOR_MODEL`, optional `ORCHESTRATOR_API_KEY` | All chat workflows; small intent-classification model on the control plane |
| `ORCHESTRATOR_MAX_TOKENS` | Maximum intent-classification output; defaults to 96 for the compact routing JSON |
| `TEXT_BASE_URL`, `TEXT_MODEL`, optional key/fallback model | General chat and final document answers |
| `VISION_BASE_URL`, `VISION_MODEL`, optional key/fallback model | Images and PDF pages without a readable text layer |
| `CODE_BASE_URL`, `CODE_MODEL`, optional key/fallback model | Code/reasoning workflows |
| `TEXT_MAX_OUTPUT_TOKENS`, `TEXT_REASONING_EFFORT` | General/document response latency and reasoning budget |
| `CODE_MAX_OUTPUT_TOKENS`, `CODE_REASONING_EFFORT` | Code response latency and reasoning budget |
| `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, optional key | Semantic document indexing and retrieval |
| `EMBEDDING_REGISTRY_ID` | The librarian primary represented by that embedding deployment; defaults to `librarian-1` |
| `VECTOR_STORE=qdrant`, `QDRANT_URL`, optional key/collection | Dedicated vector database; otherwise vectors persist in local SQL |
| `EXTRA_WORKERS_JSON` | Additional registered worker bindings, including replicas |
| `PROVIDER_HEALTH_TIMEOUT_SECONDS` | Timeout for the read-only `/v1/models` availability probe |

Base model URLs include their API prefix, typically `http://<private-host>:<port>/v1`. The backend appends `/chat/completions` or `/embeddings`. Qdrant uses its service root. No vendor-specific cloud SDK or hardcoded model key is required. Transport verifies TLS by default, does not follow redirects, does not inherit HTTP proxy environment variables, and bounds timeouts and response size. Restrict the configured URLs to your private services through deployment policy and firewall rules.

For a single development Mac, the defaults cap text answers at 512 tokens and code answers at 1,024 tokens. Specialist reasoning effort is omitted by default because many local models reject that field or do not support thinking. Set `CODE_REASONING_EFFORT=low` only when the selected model advertises reasoning support.

The built-in registry contains eight logical slots. At each backend start, their displayed model identity and configuration state are reconciled with the actual served model IDs from the environment:

| Registry alias | Service model field |
| --- | --- |
| `fast-1` / `fast-2` | `TEXT_MODEL` / `TEXT_FALLBACK_MODEL` |
| `vision-1` / `vision-2` | `VISION_MODEL` / `VISION_FALLBACK_MODEL` |
| `master-1` / `master-2` | `CODE_MODEL` / `CODE_FALLBACK_MODEL` |
| `librarian-1` or `librarian-2` | `EMBEDDING_REGISTRY_ID` + `EMBEDDING_MODEL` |

A fallback on the same node requires that server to serve the alternative model ID. For another physical server, register a node in Admin → Compute infrastructure, then add its returned ID to `EXTRA_WORKERS_JSON` with `base_url`, `api_key`, `groups` and a `models` alias map. Restart the backend. The `.env.example` includes the JSON shape.

Nodes are initialized offline when their URLs are blank. If you configure endpoints **after the first startup**, mark the corresponding nodes online in the admin panel and update their hardware metadata. Existing admin policy is preserved across restarts. Model enablement and node state are administrative controls, not health probes.

### Expected local model protocol

Chat services accept an OpenAI-compatible request, including `model`, `messages`, `max_tokens`, `temperature` and `stream`. This describes the wire format; it does not select a cloud provider.

The orchestrator returns a normal completion whose message contains this JSON shape:

```json
{"type":"document","use_knowledge":true}
```

Valid types are `general`, `document`, `code`. The boundary normalizes common local-model JSON wrappers and type aliases. A malformed plan can recover only when explicit code/calculation language or an attached document determines the workflow; ambiguous invalid plans fail explicitly. Conversation history and attachment metadata inform classification. An attachment makes an otherwise general plan a document workflow. The backend validates permissions after classification; model output cannot grant privileges.

For orchestrators listed in `OLLAMA_MANAGED_BASE_URLS`, the backend enforces a native JSON schema requiring exactly `type` (one of the three routes) and `use_knowledge` (boolean), with temperature zero. The self-contained classification prompt includes examples and JSON-encoded request data. This prevents the observed Gemma response that echoed `prompt` but omitted `type`. The backend supplies public routing reasons; it does not require the small model to generate a prose explanation. Other OpenAI-compatible endpoints retain JSON-object mode and the same compact prompt. See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

FastAPI validates this classification and constructs the ordered public task plan itself. The model does not invent executable tools or grant capabilities. The persisted route records the selected served model, node, strategy and fallback decision.

Use Admin → Local models → **Check services** to call `GET /api/v1/system/providers/health`. This performs a read-only model-list request against each unique configured endpoint, does not generate tokens and distinguishes an unreachable endpoint from a missing model ID or an unconfigured slot.

T1/C1 final responses use SSE. The request includes `stream_options: {"include_usage": true}`. Expected packets:

```text
data: {"choices":[{"delta":{"content":"Response text"},"finish_reason":null}]}

data: {"choices":[],"usage":{"total_tokens":125}}

data: [DONE]
```

V1 receives text plus `image_url` content with a JPEG data URL, and returns transcribed text in a non-streamed completion. Embeddings accept `{"model":"…","input":["text", "text"]}` and return indexed `data` entries containing finite vectors of exactly `EMBEDDING_DIMENSIONS` plus optional usage. Adapt incompatible inference servers in `app/providers.py`.

## Documents and local RAG

PDF, DOCX, PNG and JPG uploads are validated and stored under generated names. Limits cover upload bytes, PDF pages, image pixels, DOCX archive expansion, extracted text and scanned-page OCR. Text-bearing PDFs and DOCX files are parsed locally; image/scanned pages are sent to V1. A durable indexing job records `processing`, `indexed` or `failed`; the frontend displays errors and offers **Retry indexing**.

Semantic mode chunks source text, calls your embedding server and persists vectors. `VECTOR_STORE=sql` performs exact cosine search and suits a small control-plane corpus. For a larger corpus, use a separately provisioned Qdrant instance and run `python -m app.cli init-vectors`. Qdrant filters document IDs and embedding model before search; returned chunk IDs are checked again against SQL ownership. Source text is read from authorized SQL records, not trusted vector payloads.

`RAG_MODE=lexical` is an explicit option for keyword retrieval without an embedding service. It still extracts real document text. It does not simulate semantic results. Embeddings from different models cannot be mixed: change `EMBEDDING_MODEL`, dimensions and registry binding together, select the matching librarian primary, use a matching Qdrant collection when needed, and reindex documents. Automatic fallback to a different embedding space is intentionally rejected.

Private attachments remain owner-scoped; knowledge documents are shared with accounts possessing knowledge access. Deletion and reindexing are blocked while active workflows reference a document. Deletion immediately removes SQL visibility; failed external vector cleanup is audit logged. DOCX references use logical page 1 because paragraph extraction does not reconstruct Word pagination. Selected excerpts may not cover an entire long document; prompts tell the model to acknowledge missing evidence.

## Tasks, accounting and administrative behavior

- SQL transactions reserve tokens before admission, including concurrent requests. User, department, organization, daily and monthly limits are checked. Daily/monthly ledgers use UTC boundaries. New department limits can be set through the admin API.
- Reservations bound admission, not a provider's exact billing. Usage reported by the model is recorded; when a response lacks usage, a byte-based estimate is explicitly marked in SQL/audit. Provider tokenization, vision input cost and charges on requests that fail before any output are not fully knowable without provider telemetry. A call may report more tokens than its remaining reservation; actual reported usage is still charged and further processing stops. Choose conservative reservations for your models and OCR workloads.
- Jobs survive restarts. A transaction claims each job, and the worker renews a lease. An expired or interrupted run becomes failed and requires an explicit retry, avoiding automatic duplicate model charges. Only the latest failed turn can be retried; overlapping turns in one conversation are rejected.
- Cancellation closes a waiting async inference request, checked approximately every 500 ms. The remote provider may continue computing if it ignores disconnects. Already consumed tokens are retained. CPU-bound document parsing already running in a thread may finish, but cancelled jobs cannot commit a completed result.
- Text/code inference can choose a configured alternative if a worker fails before emitting output. Partial answers are retained as failed; output from different models is never concatenated into one completed answer. OCR failures require retry after the service is restored.
- Live SSE is persisted and resumable by event ID. Closing a browser stream disconnects delivery; it does not cancel the durable job. Use the cancel endpoint to stop work. Events expose operational summaries, not hidden reasoning.
- Authentication uses Argon2id password hashes, random opaque session cookies with hashed server-side tokens, expiry, login throttling, explicit origin checks and CSRF tokens. Every endpoint enforces permissions; task streams recheck the session throughout delivery. Admin password changes revoke sessions.
- Settings, model/node enablement, routing, user access, limits, pause/resume and audit views are backed by SQL. Initial environment policy values seed the database once; subsequent policy changes come from Admin/API. `RETENTION_DAYS` is a policy value; automatic audit deletion is not enabled.
- Exports generate real DOCX, PDF, XLSX and PPTX content from completed answers. Spreadsheet cells are written as text to avoid executing formulas from model output. The bundled PDF font targets Latin text; use DOCX for text needing broader font support.
- Code is generated for review. This backend does not execute arbitrary code or fabricate sandbox/test results. Hardware utilization, physical air-gap status and network connection counts are unavailable until real monitoring is integrated. Usage charts use the SQL ledger.

## Deployment

The supplied Docker image runs the API as a non-root user and contains no model runtime. Compose publishes only `127.0.0.1:8000`, persists `data`, and uses a read-only root filesystem. Build/install dependencies on an approved connected build machine before transferring artifacts into a disconnected environment.

```sh
cd BACKEND
# Configure .env first.
docker compose up --build -d
docker compose exec backend python -m app.cli create-admin --email admin@omnitrix.local
docker compose logs --tail=100 backend
```

The supplied image uses SQLite. For PostgreSQL, include the optional psycopg dependency in your deployment image as well as setting `DATABASE_URL`. The `DATA_DIR` volume is still needed for original files. Containers use LAN-reachable addresses for local model services; `localhost` inside a container refers to the container itself.

For the HTTPS gateway, configure `deploy/nginx.conf.example` with your internal hostname, certificates and frontend `dist` location. Build the frontend with `VITE_API_MODE=http`. Set `ENVIRONMENT=production`, `COOKIE_SECURE=true`, and explicit `ALLOWED_HOSTS`/`ALLOWED_ORIGINS` matching that gateway. Trust forwarded headers only from the gateway; the supplied systemd example uses loopback. Keep T1, V1, C1, embedding and vector-database ports inaccessible from employee networks. Apply LAN egress restrictions at the OS/network boundary; an application counter cannot establish an air gap.

The attached design specifies Jetson TX2 / Ubuntu 18.04. NVIDIA documents that JetPack generation's Ubuntu 18.04 filesystem and Linux 4.9 kernel in its [JetPack release information](https://developer.nvidia.com/jetpack-sdk-466). This application requires Python 3.11+, not the stock Python runtime of that image. The supplied Python 3.12 container is a proposed runtime boundary for the control-plane API; its ARM64 build, Docker engine/kernel compatibility, native wheels, memory use and OCR throughput must be verified on the actual TX2. It does not replace JetPack's GPU libraries or host the 2B model. See [Docker's multi-platform build guidance](https://docs.docker.com/build/building/multi-platform/) and [FastAPI container deployment](https://fastapi.tiangolo.com/deployment/docker/). No Jetson, Mac mini, Qdrant server or Docker deployment was available for hardware validation here.

Keep one Uvicorn process for the supplied deployment and control parallelism through `WORKER_CONCURRENCY` and node capacities. `AUTO_CREATE_SCHEMA=true` creates the initial schema; it is not an upgrade migration system. For managed deployment, run `python -m app.cli init-db` once, set `AUTO_CREATE_SCHEMA=false`, and review schema migrations before later version upgrades. Back up the SQL database and original-file directory together; use SQLite's backup facilities or stop the service before taking a consistent copy, including WAL state. Audit records are append-only through this API, but are not immutable against a database administrator; database backup, archival and access policies remain deployment responsibilities.

## Operations and validation

`GET /health/live` reports process availability. `GET /health/ready` checks SQL and reports whether minimum inference configuration exists; it does not certify that workers respond. Keep `127.0.0.1` in `ALLOWED_HOSTS` for the supplied container health check. Development exposes the schema at `/api/v1/openapi.json`; hosted Swagger/ReDoc pages are disabled to avoid runtime CDN dependencies. The full frontend wire contract is in `../docs/FASTAPI_CONTRACT.md`. Billable knowledge-search GET requests require the CSRF header too.

```powershell
cd D:\Omnitrix\BACKEND
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m ruff format --check app tests
.\.venv\Scripts\python.exe -m pytest --basetemp='D:\Omnitrix\BACKEND\.test-tmp'
```

Linux can run `.venv/bin/python -m pytest` directly. Tests use temporary SQL databases and deterministic local HTTP fixtures; they do not contact or require model providers. Coverage includes password/session/CSRF handling, permissions and ownership, concurrent token admission, persistent workflow state, resume events, real document parsing and exports, vision/code dispatch, model fallback, cancellation during a stalled response, revoked permissions, malformed plans and vector-result ACL enforcement.

The frontend retains a standalone demo for UI evaluation. Live integration tests separately verify authenticated HTTP headers, writable admin payloads, SSE delivery and cleanup, actual code output and honest telemetry. No existing browser-local mock records are migrated into the SQL database.
