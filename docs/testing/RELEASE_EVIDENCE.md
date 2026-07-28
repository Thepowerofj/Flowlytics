# Release Evidence

## Checklist

- [x] Full unit/integration tests (`npm test`)
- [x] Typecheck (`npx tsc --noEmit`)
- [x] Auth register smoke
- [x] Wallet / ownership / queue helpers covered in Vitest
- [x] Docker Compose DB health
- [x] Smoke E2E gate wired in CI (`npm run smoke:e2e` against built app)
- [ ] Playwright golden paths (deferred — full browser suite still to wire in later plan slices)
- [x] Backup script documented in `docs/operations/BACKUP_RESTORE.md`
- [x] Production deploy gate: **not run** (requires explicit approval)

## Results

### Unit tests (2026-07-20)

```text
pnpm test
Test Files  19 passed (19)
Tests  59 passed (59)
```

Re-run before any release; update counts here if they change.

### Targeted reliability tests (2026-07-28)

```text
npx vitest run "src/modules/jobs/domain/retryHydration.test.ts" "src/modules/blocks/definitions/ingestUrl.test.ts" "src/modules/flows/domain/autoPipeline.test.ts"
Test Files  3 passed (3)
Tests  12 passed (12)
```

Covered: retry-from-block hydration/replay decision, URL ingest HTTPS/private-network guardrails, and file-id-only ingest seeds for server-side reload.

### Full Vitest suite (2026-07-28)

```text
npm test
Test Files  45 passed (45)
Tests  185 passed (185)
```

### Typecheck (2026-07-28)

```text
npx tsc --noEmit
(exit 0)
```

### Typecheck

```text
pnpm exec tsc --noEmit
(exit 0)
```

### Production build

```text
pnpm build
✓ Compiled successfully
Route table generated for app + API routes
```

Latest local run:

```text
npm run build
✓ Compiled successfully
✓ Generating static pages (35/35)
```

### Runtime smoke

```text
GET /api/health -> { "ok": true, "service": "flowlytics" }
POST /api/register ... -> 200
Worker log: [worker] starting worker-1
Postgres: docker compose db on localhost:5433
```

### Not verified in this environment

- Google OAuth end-to-end (credentials empty)
- Live LLM provider calls (`LLM_API_KEY` empty → stub)
- Full Playwright canvas run path
- Local smoke E2E with `next start` was attempted on 2026-07-28, but `/api/health` did not pass because the local production server did not have a reachable prepared database. CI prepares Postgres with `prisma db push` before running the same smoke script.
- VPS TLS / Caddy production deploy
- Full post-plan Playwright golden paths after all Trusted Analytics Core slices
