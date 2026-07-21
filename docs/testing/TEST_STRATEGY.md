# Test Strategy

| Level | Tool | Use | v1 status |
| --- | --- | --- | --- |
| Unit | Vitest | Domain pure functions (PII, stats, queue, parse, aggregate, run graph) | **Required / active** |
| Integration | Vitest + mocks/Prisma | Wallet ledger helpers, ownership, job claim | Partial (helpers + mocked ownership) |
| Component | Testing Library | Key forms and warnings | **Target** — not wired yet |
| E2E | Playwright | Signup → flow → run → CSV | **Deferred** |

Prefer real DB (Testcontainers or compose) for job/wallet invariants when expanding integration coverage. Mock LLM only at the adapter boundary.

Current release gate: `pnpm test` + `pnpm exec tsc --noEmit`. Record counts in `docs/testing/RELEASE_EVIDENCE.md` and `docs/PROJECT_STATE.md`.
