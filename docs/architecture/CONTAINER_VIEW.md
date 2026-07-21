# Container View

| Container | Responsibility |
| --- | --- |
| `web` | Next.js UI + API routes / server actions |
| `worker` | Polls jobs table; executes flow DAG blocks |
| `db` | PostgreSQL |
| `caddy` (optional on VPS) | TLS termination |

Docker Compose runs `web`, `worker`, and `db` locally and on the VPS. Shared code lives in `src/modules/*`.
