# Release Evidence

## Checklist

- [x] Unit/integration tests (`pnpm test`)
- [x] Typecheck (`pnpm exec tsc --noEmit`)
- [x] Auth register smoke
- [x] Wallet / ownership / queue helpers covered in Vitest
- [x] Docker Compose DB health
- [ ] Playwright happy path (deferred — no E2E suite wired yet)
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

(Re-run before release; evidence above may be from an earlier local build.)

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
- VPS TLS / Caddy production deploy
