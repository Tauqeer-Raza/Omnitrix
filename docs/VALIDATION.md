# Validation

Validation covers TypeScript compilation, a Vite production build, service regression tests, rendered React route tests, and dependency audit. Results are updated after the final run.

Core behaviors under test:

- Credential-derived roles, disabled accounts, protected admin routes, ownership and service permissions.
- Complete event-driven document workflow, token charging once, reservation accounting, retrieval and sandbox failures, retry and cancellation.
- Model fallback, node failover, model group permissions, global/individual quota checks and offline recovery.
- Upload type, size and empty-file validation; local blob retention and progress.
- Actual Word, PDF, Excel and PowerPoint package generation, synthetic provenance and completion guards.
- Every implemented user and admin page renders, and key sign-in, task creation, output and model-toggle controls work.

Manual browser visual QA, real OCR/model inference, actual Python sandbox execution, backend security, physical air-gap validation and a live FastAPI server are outside these frontend tests. The optional WebMCP registry has not been verified in a compatible browser.
