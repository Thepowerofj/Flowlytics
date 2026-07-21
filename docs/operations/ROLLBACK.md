# Rollback

1. Note current image digest / compose tag.  
2. `docker compose pull` previous known-good images (or checkout previous git tag and rebuild).  
3. `docker compose up -d`  
4. If migration was forward-only incompatible: restore DB from backup (see BACKUP_RESTORE.md) before rolling app back.  
5. Verify `/api/health` and a smoke login.
