# Validation

Validated on 9 September 2026. TypeScript compilation and the Vite production build pass. `npm run lint` passes. The service suite contains 26 passing tests; the route suite covers 31 rendered page and interaction tests, including the simplified operator workspace.

Core behaviors under test:

- Credential-derived roles, disabled accounts, protected admin routes, ownership and service permissions.
- Unified chat entry, automatic document/code/general routing, inherited attachments, follow-up grouping, conversation ownership, overlapping request rejection and retry guards.
- Previous-chat navigation, capability prompts, used/remaining tokens, a quiet landing page and an activity panel that closes on completion and reopens on demand.
- Complete event-driven document workflow, token charging once, reservation accounting, retrieval and sandbox failures, retry and cancellation.
- Model fallback, node failover, model group permissions, global/individual quota checks and offline recovery.
- Upload type, size and empty-file validation; local blob retention and progress.
- Actual Word, PDF, Excel and PowerPoint package generation, synthetic provenance and completion guards.
- Every implemented user and admin page renders, and key sign-in, task creation, output and model-toggle controls work.

Manual browser visual QA, real OCR/model inference, actual Python sandbox execution, backend security, physical air-gap validation and a live FastAPI server are outside these frontend tests. The optional WebMCP registry has not been verified in a compatible browser.

The standalone generated Python example previously passed its two local unit tests. The latest dependency audit reported zero vulnerabilities. ExcelJS remains a large, lazy-loaded export chunk; Vite reports its bundle-size advisory. It is only fetched when creating an Excel download.

Lint excludes the scaffold-owned UI primitives and their mobile hook. The configuration targets Vite/React rather than Next.js, recognizes the accessible `Picker` control, and does not require opt-in React Compiler preparation. Valid ARIA image/status roles are retained for CSS illustrations and live regions. The admin layout and behavior are unchanged; cleanup there is limited to unused imports, React keys and current event types.

The local preview responds successfully at `http://127.0.0.1:5173/workspace`. It serves the updated source; `dist/` contains the compiled production application.
