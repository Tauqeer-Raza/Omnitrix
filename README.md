# OMNITRIX — Sovereign AI Workbench

A working React 19 + TypeScript frontend for a local agentic AI workbench. Vite serves a client-routed SPA; there is no required cloud service, remote font, or external inference dependency. The generated Sites UI primitives are retained, while the runtime is a frontend-only Vite application for self-hosting and future FastAPI integration.

## Run locally

Requires Node 22.13+ and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Dependencies and fonts are bundled during setup. The application works without a backend in its default mock mode.

| Account       | Email                   | Password      |
| ------------- | ----------------------- | ------------- |
| Operator      | operator@omnitrix.local | Omnitrix@2026 |
| Administrator | admin@omnitrix.local    | Omnitrix@2026 |

Roles are derived from the account, with no role picker. Sign out through the avatar menu to change accounts. Additional accounts created by an admin use the same demo password.

```sh
npm test
npm run build
npm start
```

The production bundle is `dist/`. Serve it from any internal static web server with a fallback to `index.html` for client routes. `npm start` previews the production bundle on localhost. A sample internal nginx configuration is provided in `deploy/nginx.conf`. This task does not publish the application externally.

## Demo journeys

1. Sign in as Operator. Select **New task**, choose **Document task**, upload one or more PDF/PNG/JPG/DOCX files (20 MB each, up to 10), or choose **Use sample report**. Enter a task and start it.
2. Follow the live classification, routing, OCR, retrieval, reasoning, and generation events. Inspect source documents, zoom, pages, and the sovereignty console. Open **Output & deliverables** on completion and download a real Word or PDF file. Excel and PowerPoint exports provide a sample findings register and review deck.
3. Create a **Coding task**. Inspect/edit the sample Python source, switch to its unit tests, copy/download files, and run sample structure checks. The browser does not execute arbitrary code. Download both Python files to run the real unit tests locally.
4. Use **Demo simulation options** during task creation to exercise a retrieval or sandbox failure. Retry the failed task to run the successful scenario. In admin **Settings**, simulate a backend outage; reconnect from Settings or System Status.
5. Sign in as Administrator. Enable/disable models, expand and edit priority/node/context metadata, swap routing primaries and fallbacks, register arbitrary compute nodes, or change node status. New task steps use updated registry state.
6. Change global, department, and user allocation in **Token & resource limits**. Inspect account capabilities and model-group access in **Users** or **Permissions**. Changes immediately affect new task admission and appear in audit logs.

## Implementation boundary

```text
src/
  api/            Typed auth, task, file, model, routing, user, audit and system services
    transport.ts  Central JSON HTTP/mock selection, error handling and credentials
    events.ts     Mock event engine and future authenticated SSE subscription
    store.ts      Browser-local mock persistence and permission enforcement
    seed.ts       Explicitly synthetic sample records
    exports.ts    Lazy-loaded Word, PDF, Excel, PowerPoint and CSV downloads
  state/          Authenticated user and API snapshots through React Context
  components/     Layout, materials, core diagram, file viewer, agent and code controls
  pages/          Lazy-loaded user and administration routes
  hooks/          Optional browser model-context tools
components/ui/    Accessible scaffold primitives
app/              Shared design tokens and responsive operational styles
tests/            Service and rendered-route regression coverage
```

No components call fetch. Services expose Promise-based methods, so the UI does not depend on transport details. Set `VITE_API_MODE=http` and `VITE_API_BASE_URL=/api/v1` at build time to use FastAPI. The HTTP boundary is implemented; a FastAPI server implementing the documented contracts is still required. File endpoints return binary responses. See `docs/FASTAPI_CONTRACT.md` for endpoints and event semantics.

`hasRole`, `hasPermission`, protected routes, ownership checks, admin role checks and service guards provide realistic demo behavior. They are not a production security boundary: every JavaScript value and browser storage record can be modified by the browser user. Production authorization must be enforced by FastAPI on every endpoint and stream.

## Local data and honest simulation

- Operational mock state persists in `localStorage` under `omnitrix.demo.v1`; sign-in identity is session-local. File blobs live in IndexedDB `omnitrix-local-files`, with an in-memory fallback when unavailable.
- OCR, RAG results, model output, network metrics, chart history, compute utilization and sandbox execution are simulated. Uploaded content is displayed when supported, but is not analyzed by an AI engine. Every generated report is a synthetic draft and cannot certify safety or approve operations.
- Resource usage and audit records update with actions. The scheduler reserves 2,400 tokens per queued/running task and charges successful tasks once. The demo holds daily/monthly seed counters rather than implementing a calendar billing backend.
- Models are only the eight exact requested registry names, grouped into MASTER, VISION, FAST and LIBRARIAN. Node names, hosts, types, accelerators and capacities are user-configurable. No hardware vendor is assumed. Preferred assignment and fallback do not claim real model/hardware compatibility; production capabilities must be supplied by the compute registry.
- There are no runtime external font, image, inference, or analytics requests in mock mode. “0 external calls” is simulated product telemetry, not a claim that this frontend establishes a physical air gap.
- Retention and execution settings are policy configuration. Production isolation, resource accounting, retention enforcement, immutable audit storage, file scanning and task sandboxing belong to the backend.
- To reset demo data, clear this origin’s browser storage. Do not use this demo as a repository for actual confidential operational records.

## Accessibility and performance

Keyboard-operable dialogs, switches, tabs and selects use Base UI primitives. Tables scroll on smaller screens; navigation collapses and becomes a mobile drawer. Focus states, status labels and reduced-motion styles are included. A lightweight CSS 3D core avoids WebGL and GPU dependency. Feature routes and export libraries are lazy-loaded. Font files are served locally.

Optional imperative WebMCP tools are feature-detected and cleaned up on sign-out: `omnitrix_get_task` reads an authorized record; `omnitrix_start_task_creation` stages the visible form and never starts a task itself. No compatible browser tool context was available for validation. Browser screenshots and interactive browser QA were not performed; route and interaction coverage runs in a rendered DOM test environment.

The PowerPoint exporter writes a fixed, text-only OOXML deck using `fflate`. ExcelJS uses an override to the compatible patched UUID 11.1.1 API. The build does not carry the scaffold’s server runtime or image parsers. Dependency audit results are tracked in `docs/VALIDATION.md`.
