# System Architecture

The following diagram illustrates the monorepo architecture, showcasing data flow, security middleware boundaries, background daemon polling loops, and real-time WebSocket communication pathways.

```mermaid
graph TD
  %% Client Layer
  subgraph Client ["Client Layer (Browser UI)"]
    UI["React SPA Dashboard"]
    WS_C["WebSocket Client"]
    API_C["HTTP API Client (Fetch)"]
    Charts["Recharts Telemetry"]
    LS["Local Storage (JWT)"]
  end

  %% API Server Layer
  subgraph Backend ["API Gateway & WebSocket Server"]
    Express["Express HTTP Server"]
    Auth["JWT Auth Middleware"]
    WSS["WebSocket Server"]
    IBC["Internal Broadcast Router"]
  end

  %% Processing Daemons
  subgraph Daemons ["Background Daemons"]
    Scheduler["Scheduler Service (node-cron)"]
    Worker["Worker Service Nodes (Concurrency pool)"]
    Retry["Retry Service (Backoff strategies)"]
  end

  %% DB Storage Layer
  subgraph Storage ["Database Layer (PostgreSQL)"]
    DB_Auth["Users / Organizations"]
    DB_Queue["Projects / Queues"]
    DB_Jobs["Jobs / ScheduledTemplates"]
    DB_Logs["Executions / JobLogs"]
    DB_DLQ["Dead Letter Queue (DLQ)"]
    DB_Worker["Workers / Heartbeats"]
  end

  %% Connections & Data Flow
  UI -->|Reads JWT| LS
  API_C -->|JWT Auth Header| Auth
  Auth -->|Permit / Reject| Express

  WS_C -->|Handshake Upgrade & Token Check| WSS
  WSS -->|Subscribe Projects| WSS
  WSS -.->|Real-time Metrics & Badges| WS_C
  WS_C -->|Trigger Redraws| Charts

  %% HTTP actions
  Express -->|Read / Write| DB_Auth
  Express -->|Read / Write| DB_Queue
  Express -->|List / Enqueue / Retry / Cancel| DB_Jobs

  %% Scheduler Loop
  Scheduler -->|1. Sweep & Promote Delayed/Cron| DB_Jobs

  %% Worker Loop
  Worker -->|1. SELECT ... SKIP LOCKED FOR UPDATE| DB_Jobs
  Worker -->|2. Create Attempt Audit| DB_Logs
  Worker -->|3. Evaluate Backoff Delay| Retry
  Worker -->|4. Route Permanent Failures| DB_DLQ
  Worker -->|5. Telemetry heartbeats| DB_Worker

  %% Cross-process events broadcast
  Worker -->|6. POST /api/internal/broadcast| IBC
  IBC -->|Forward Events| WSS
```

---

## Component Details

### 1. Client Layer (Browser)

- **React SPA**: Renders the complete web interface (Login, Register, Dashboard, Job Explorer, Telemetry, and DLQ).
- **Recharts**: Dynamically plots metrics dashboards including Queue Throughput, Job Execution trends, Worker heartbeat telemetry, and Failure Rates.
- **WebSocket Client**: Subscribes to individual `projectId` streams and triggers components redraws upon receiving state change events.

### 2. API Gateway & WebSocket Server

- **Express Router**: Serves REST interfaces under `/api` with RBAC scopes.
- **JWT Middleware**: Intercepts requests, validates authorization headers, and injects user profile contexts.
- **WebSocket Upgrade Handler**: Performs security checks on HTTP connection handshakes (`?token=<token>`) and establishes real-time client pipes.
- **Internal Broadcast Route**: decodes status posts sent by background worker nodes and broadcasts them safely to authorized subscribers.

### 3. Background Processing Daemons

- **Scheduler Service**: Runs node-cron sweep timers to promote scheduled delayed queues and generate new recurring job instances while managing catch-up recoveries upon startup.
- **Worker Service**: Employs raw transaction queries (`FOR UPDATE SKIP LOCKED`) to claim queued jobs atomically. Implements task timeout AbortControllers and graceful signal terminations.
- **Retry Service**: Evaluates retry configurations (Fixed, Linear, Exponential) to calculate retry delays.

### 4. Database Layer (PostgreSQL)

- Provides structured tables mapped through **Prisma**. Indexes are established on execution filters (`status`, `queueId`, `projectId`, `batchId`) to guarantee fast retrieval at scale.
