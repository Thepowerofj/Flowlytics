# Assumptions Register

| ID | Assumption | Risk if wrong | Reversible? |
| --- | --- | --- | --- |
| A-01 | Product name Flowlytics is acceptable | Brand rename only | Yes |
| A-02 | DB-backed job queue is enough for v1 scale | May need Redis later | Yes |
| A-03 | Local Docker volume for files is enough | May move to S3-compatible storage | Yes |
| A-04 | Wallet top-up is admin credit after EFT | Users cannot self-top-up until gateway live | Yes |
| A-05 | PII detection is heuristic only | False negatives/positives | Yes |
| A-06 | Admin via `ADMIN_EMAILS` env allowlist | Need DB flag UI later | Yes |
| A-07 | OpenAI-compatible LLM adapter | Swap provider behind port | Yes |
| A-08 | Accent colour teal on light surfaces | Token change | Yes |
| A-09 | Soft file limit 20MB | Config change | Yes |
| A-10 | Single worker concurrency default = 1 | Config change | Yes |
| A-11 | Transactional mail via SMTP (`info@flowlytics.co.za`, port 587); secrets only in `.env` | Delivery fails until DNS/SMTP ready; app logs instead | Yes |
| A-12 | Run-failure emails on by default; run-success emails off (`MAIL_NOTIFY_RUN_SUCCESS`) | Noise vs silence | Yes |
