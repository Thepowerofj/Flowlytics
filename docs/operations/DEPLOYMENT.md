# Deployment (VPS + Docker Compose)

## Prerequisites

- Docker + Docker Compose on VPS  
- Domain + DNS pointing to VPS  
- Env file with secrets (never commit)

## Steps

1. Copy `.env.example` → `.env` and fill values.  
2. `docker compose build && docker compose up -d`  
3. Run migrations: `docker compose exec web pnpm prisma migrate deploy`  
4. Optional: put Caddy in front for HTTPS.  
5. Configure Google OAuth redirect URIs to `https://<domain>/api/auth/callback/google`.

Production deploy requires explicit operator approval.
