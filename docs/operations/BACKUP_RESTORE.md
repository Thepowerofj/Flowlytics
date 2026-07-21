# Backup and Restore

## Daily backup

```bash
docker compose exec -T db pg_dump -U flowlytics flowlytics | gzip > backup-$(date +%F).sql.gz
```

Retain at least 7 days on the VPS or offsite copy.

## Restore

```bash
gunzip -c backup-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U flowlytics flowlytics
```

Short downtime is acceptable for v1. Test restore before first public users.
