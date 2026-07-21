# Incident Runbook

## Queue backed up

1. Check ops dashboard: queue depth, active runs, worker busy.  
2. Inspect worker logs: `docker compose logs worker --tail=200`.  
3. Temporarily lower schedule frequency or pause schedules.  
4. Increase worker concurrency only if CPU/memory headroom exists.

## LLM failures

1. Confirm provider status and API key.  
2. Wallet debits should refund on hard provider failure.  
3. Disable AI blocks via `LLM_ENABLED=false` if needed.

## Disk full

1. Purge old artifacts beyond retention.  
2. Enforce 10MB upload limit (already default).
