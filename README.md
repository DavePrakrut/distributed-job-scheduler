#

## 1. System Architecture

Codity utilizes a decoupled architecture where background workers run in separate Node processes, communicating status transitions to the client and WebSocket server via internal broadcast routes.

- **Client Layer**: React SPA Dashboard utilizing TailwindCSS for styling and Recharts for live KPI metrics.
- **API Server**: Express server acting as the REST endpoint orchestrator, WebSocket manager, and event router.
- **Workers Daemon**: Atomic claimant process querying jobs with `SKIP LOCKED` locks, maintaining heartbeat ticks, and handling thread control abort signals.
- **Scheduler Daemon**: Sweep process promoting scheduled/delayed jobs and running cron templates.

For a visual graph, see [architecture.md](file:///C:/Users/prakr/.gemini/antigravity-ide/brain/7d256694-9fe5-42d7-8f8e-f45d8476ce75/architecture.md).

---

## 2. Database Design & Cardinality

The system employs PostgreSQL as the primary persistence layer, modeled via Prisma. All tables implement soft deletion and cascades.

### Entities Mapped

- `Organizations`: Main tenant boundary.
- `Users`: RBAC credentials (ADMIN, OWNER, MEMBER).
- `Projects` / `Queues`: Scoped task namespaces with max concurrency and priority settings.
- `Jobs` / `ScheduledJobs`: Job items and cron templates.
- `JobExecutions` / `JobLogs` / `DeadLetterQueue`: Auditing and failure routing.
- `Workers` / `WorkerHeartbeats`: Online telemetry metrics.

For a detailed ER diagram with column keys and cardinality mappings, see [erd.md](file:///C:/Users/prakr/.gemini/antigravity-ide/brain/7d256694-9fe5-42d7-8f8e-f45d8476ce75/erd.md).

---

## 3. Installation & Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- PostgreSQL Database instance

### Development Setup

1.  **Clone and navigate to the project root**:

    ```bash
    cd codity
    ```

2.  **Install Monorepo dependencies**:

    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Create a `.env` file in `backend/`:

    ```env
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/codity?schema=public"
    JWT_SECRET="super-secret-jwt-signing-key-for-local-development"
    PORT=5000
    ```

    Create a `.env` file in `frontend/`:

    ```env
    VITE_API_URL="http://localhost:5000"
    VITE_WS_URL="ws://localhost:5000"
    ```

4.  **Execute Database Migrations and Seeding**:

    ```bash
    npm run prisma:migrate -w backend
    npm run prisma:generate -w backend
    npm run dev -w backend -- --seed # Runs seed script automatically
    ```

5.  **Run Development Servers**:
    - To run the API Server, Scheduler, and Worker daemon concurrently:
      ```bash
      npm run dev -w backend
      ```
    - To run the React dashboard:
      ```bash
      npm run dev -w frontend
      ```

---

## 4. API Documentation

### Authentication Routes

- `POST /api/auth/register`: Create organization, admin account, and returns tokens.
- `POST /api/auth/login`: Verify user and return tokens.
- `POST /api/auth/refresh`: Rotate expired access tokens.

### Project & Queue CRUD

- `POST /api/projects`: Register a new project namespace.
- `GET /api/projects`: List projects.
- `POST /api/projects/:projectId/queues`: Add a queue with custom retry policies.
- `POST /api/queues/:id/pause`: Suspend execution of jobs in the queue.
- `POST /api/queues/:id/resume`: Resume execution of jobs.

### Job Operations

- `POST /api/projects/:projectId/jobs`: Enqueue an immediate or delayed job.
- `POST /api/projects/:projectId/schedules`: Setup a recurring node-cron task.
- `GET /api/projects/:projectId/jobs`: Advanced search, pagination, and status filters.
- `POST /api/jobs/:id/cancel`: Cancel scheduled or queued items.
- `POST /api/jobs/:id/retry`: Manually re-enqueue failures from the DLQ.

---

## 5. Design Decisions & Tradeoffs

### Atomic Job Claiming (`SKIP LOCKED`)

- **Decision**: Background workers query the DB using PostgreSQL raw row-level locks:
  ```sql
  SELECT * FROM "Jobs"
  WHERE "status" = 'QUEUED' AND "runAt" <= NOW()
  LIMIT 1 FOR UPDATE SKIP LOCKED
  ```
- **Tradeoff**: Employs database transaction locks rather than an in-memory Redis cluster. This reduces external system dependencies (making PostgreSQL the single source of truth) but shifts synchronization locks to database CPU connections.

### Decoupled Broadcasting Route

- **Decision**: Background workers run in independent threads. When a job transitions status, the worker makes a POST request to `/api/internal/broadcast` on the API server.
- **Tradeoff**: Avoids memory-sharing complexity or message-queue event loops. Introduces a light HTTP request latency between worker executions and WebSocket relays.

---

## 6. Deployment Guide (Production)

To deploy Codity in a production environment:

1.  **Build Frontend assets**:

    ```bash
    npm run build -w frontend
    ```

    This generates static output in `frontend/dist`. Serve this using Nginx or Caddy.

2.  **Compile TypeScript backend**:

    ```bash
    npm run build -w backend
    ```

3.  **Process Management (PM2)**:
    Deploy backend services using PM2 ecosystem configurations:
    ```json
    {
      "apps": [
        {
          "name": "codity-api",
          "script": "backend/dist/index.js",
          "instances": "max",
          "exec_mode": "cluster"
        },
        {
          "name": "codity-scheduler",
          "script": "backend/dist/scheduler/run-scheduler.js",
          "instances": 1
        },
        {
          "name": "codity-worker",
          "script": "backend/dist/worker/run-worker.js",
          "instances": 2
        }
      ]
    }
    ```

---

## 7. Troubleshooting

- **401 Unauthorized errors in API client**:
  Ensure the request contains `Authorization: Bearer <token>`. If the token is expired, trigger the refresh endpoint `/api/auth/refresh` using the secure HTTPOnly cookie context.
- **Concurrency limits are not respected**:
  Ensure the worker process limit parameters (`concurrencyLimit` in database record) match the active runner instances.
- **Cron schedules are trigger-delayed**:
  The database sweep checks timelines every 5 seconds. Schedules have a maximum resolution window of 5 seconds.

---

## 8. Future Improvements

- **Redis Cache Integration**: Offload read-heavy stats counts to a Redis cluster.
- **Subtask Parallelization**: Dynamic DAG dependency resolution supporting sub-graphs.
- **Grafana Dashboard**: Expose Prometheus endpoints mapping CPU and execution delays.
