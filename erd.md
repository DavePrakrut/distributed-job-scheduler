# Database Entity-Relationship Diagram

The following entity-relationship diagram shows the schema structure, column data types, index mappings, primary keys (PK), foreign keys (FK), and join constraints.

```mermaid
erDiagram
  Organizations {
    string id PK
    string name
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  Users {
    string id PK
    string email
    string passwordHash
    string role
    string organizationId FK
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  Projects {
    string id PK
    string name
    string organizationId FK
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  RetryPolicies {
    string id PK
    string name
    string strategy
    int maxRetries
    int baseDelaySeconds
    float factor
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  Queues {
    string id PK
    string name
    string projectId FK
    int priority
    int maxConcurrency
    boolean isPaused
    string retryPolicyId FK
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  Jobs {
    string id PK
    string name
    json payload
    string status
    datetime runAt
    string lockedByWorkerId FK
    datetime lockedAt
    string queueId FK
    string projectId FK
    string batchId
    string_array parentJobIds
    int maxRetries
    int currentRetryCount
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  JobExecutions {
    string id PK
    string jobId FK
    string workerId FK
    string workerName
    string status
    datetime startedAt
    datetime finishedAt
    int durationMs
    string errorMessage
    string stackTrace
    int attempt
    datetime createdAt
    datetime updatedAt
  }

  JobLogs {
    string id PK
    string executionId FK
    string jobId FK
    string level
    string message
    datetime timestamp
    datetime createdAt
    datetime updatedAt
  }

  Workers {
    string id PK
    string name
    string hostName
    string status
    int concurrencyLimit
    int activeJobsCount
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  WorkerHeartbeats {
    string id PK
    string workerId FK
    datetime timestamp
    int activeJobsCount
    float cpuUsage
    float memoryUsage
    datetime createdAt
    datetime updatedAt
  }

  DeadLetterQueue {
    string id PK
    string jobId FK
    string queueId FK
    datetime failedAt
    string reason
    string stackTrace
    json originalPayload
    datetime createdAt
    datetime updatedAt
  }

  ScheduledJobs {
    string id PK
    string name
    string cronExpression
    string projectId FK
    string queueId FK
    json payload
    datetime nextRunAt
    datetime lastRunAt
    boolean isActive
    boolean isDeleted
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }

  %% Relationships and Cardinalities
  Organizations ||--o{ Users : "has members"
  Organizations ||--o{ Projects : "owns"

  Projects ||--o{ Queues : "contains"
  Projects ||--o{ Jobs : "owns execution jobs"
  Projects ||--o{ ScheduledJobs : "holds templates"

  RetryPolicies ||--o{ Queues : "applies backoff settings to"

  Queues ||--o{ Jobs : "coordinates"
  Queues ||--o{ ScheduledJobs : "coordinates template enqueues"
  Queues ||--o{ DeadLetterQueue : "routes failed runs to"

  Workers |o--o{ Jobs : "claims execution locks on"
  Workers ||--o{ JobExecutions : "conducts"
  Workers ||--o{ WorkerHeartbeats : "transmits metrics from"

  Jobs ||--o{ JobExecutions : "generates run logs for"
  Jobs ||--o{ JobLogs : "collects output statements"
  Jobs ||--o| DeadLetterQueue : "moves permanently failed runs to"

  JobExecutions ||--o{ JobLogs : "generates execution output statements"
```
