# Flowlytics — User stories & verified flows

Status: Active  
Date: 2026-07-21

## Commercial model (vNext)

| Concern | Behaviour |
| --- | --- |
| Product access | **PayFast** checkout (primary) → ITN auto-activates for `ACCESS_PERIOD_DAYS`; **or** manual EFT → declare → admin Activate |
| Auto-expiry | Worker tick clears `isPaid` when `accessExpiresAt` has passed; product routes/API reject until re-activated |
| AI | **Bring-your-own API key** (encrypted in Settings). Wallet is **kept** but **not used for AI** |
| Wallet | Ledger + balance remain for a future PAYG option; admin can still credit |

---

## A. End-user flows

### A1. Onboarding (signup → billing gate)

1. User signs up (email/password or Google) or logs in; receives a branded welcome email when SMTP is configured.
1b. User can request a password reset from `/forgot-password` (1-hour link); receives a confirmation email after resetting.
2. New non-admin users have **no** `accessExpiresAt` → status `pending_payment`.
3. Visiting `/home`, `/flows/*`, `/ask`, or `/schedules` redirects to **`/billing`**.
4. Billing shows **Pay with PayFast** when `PAYFAST_MERCHANT_*` is set, plus EFT fallback (`BANK_*` + `FL-` ref).
5. PayFast: complete checkout → ITN activates access automatically. EFT: declare paid → wait for admin.
6. After access: Home, Ask, Builder, Schedules.

**Verify:** Register non-admin → Billing gate → PayFast (sandbox) or EFT path → Home unlocked after activation.

### A2. Active use (after activation)

1. Admin activates → `isPaid=true`, `accessExpiresAt = now + N days`.
2. User can open Home, create/edit/run flows, schedules.
3. Optional: Settings → paste OpenAI-compatible API key → Save (encrypted).
4. Opt-in AI blocks Run using that key (no wallet debit). Without a key → clear error to add key in Settings.

**Verify:** Activate user → Home works → AI without key fails → save key → AI stub/live works.

### A3. Access expiry & renewal

1. After `accessExpiresAt`, worker sets `isPaid=false` (login still allowed).
2. Product pages redirect to Billing again; runs/enqueue return `ACCESS_REQUIRED`.
3. User pays EFT again → declare → admin activates another 30 days.

**Verify:** Set `accessExpiresAt` in the past (or wait) → worker log “expired N account(s)” → Home redirects to Billing → re-activate restores access.

### A4. Settings (BYOK)

1. `/settings` available while logged in (even before access, so key can be prepared).
2. Save / replace / remove key.

### A5. Wallet (deferred for AI)

1. Wallet badge may be absent from header; ledger/balance remain in DB.
2. Admin “+100 wallet” is optional/legacy only.

### A6. Ask mode

1. `/ask` → new chat → ask a question (optionally after uploading via Auto analysis).
2. System plans a pipeline, runs it, returns chat cards grounded in run outputs.
3. **Open in Builder** opens the same flow.

### A7. Forecast playground + exports

1. Forecast config: period order, compare techniques, goal prompt, long/wide output.
2. After Run: Results → CSV / **PDF** / **PowerPoint**.

### A8. Connectors

1. Add **URL file** ingest with HTTPS CSV/Excel; schedules re-fetch on each run.
2. Add **Email results** activity with recipient + subject (SMTP).

---

## B. Admin (management) flows

### B1. User management

1. Admin (email in `ADMIN_EMAILS`) opens `/admin`.
2. Table shows status: Active / Awaiting EFT / Expired / Disabled; **payment ref**; EFT declared time/note; expiry; whether LLM key exists.  
2b. Admin can **Look up** by payment reference from the bank statement to find the matching account quickly.
3. **Activate Nd** — grants access from now for `ACCESS_PERIOD_DAYS` (default 30).
4. **Disable** — admin ban (`disabled=true`); user cannot log in.
5. Ops cards: queue, worker heartbeat, per-user usage.

**Verify:** User declares EFT → admin sees Awaiting EFT → Activate → user status Active with expiry date.

### B2. Ops monitoring

Unchanged: queue depth, active runs, succeeded/failed, per-user run/storage/AI call counts.

---

## C. System jobs

| Job | Where | What |
| --- | --- | --- |
| Schedule tick | `src/worker/index.ts` `tickSchedules` | Enqueues due schedules; skips users without access |
| Account expiry | same loop, `expireDueAccounts()` | Clears paid flag when window ended |
| Run execution | worker claim loop | Executes queued jobs |

---

## D. Happy-path checklist (manual)

- [ ] Signup non-admin → Billing gate + welcome email (when SMTP/DNS live)
- [ ] Forgot password → reset link email → sign in with new password
- [ ] EFT details visible from env
- [ ] Declare paid → admin sees declaration
- [ ] Activate 30d → Home/flows work
- [ ] Settings API key → AI block runs
- [ ] After expiry (or forced past date) → access removed, can still login → Billing
- [ ] Admin Disable → login blocked
- [ ] Admin always bypasses billing gate
