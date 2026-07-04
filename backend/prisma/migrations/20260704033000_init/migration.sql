-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RetryStrategy" AS ENUM ('FIXED', 'LINEAR', 'EXPONENTIAL');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ACTIVE', 'IDLE', 'OFFLINE');

-- CreateTable
CREATE TABLE "Organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "organizationId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetryPolicies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" "RetryStrategy" NOT NULL DEFAULT 'FIXED',
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "baseDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "factor" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetryPolicies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 5,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "retryPolicyId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedByWorkerId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "queueId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "batchId" TEXT,
    "parentJobIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "currentRetryCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecutions" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workerId" TEXT,
    "workerName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "stackTrace" TEXT,
    "attempt" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExecutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLogs" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ACTIVE',
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 10,
    "activeJobsCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeats" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeJobsCount" INTEGER NOT NULL,
    "cpuUsage" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterQueue" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "stackTrace" TEXT,
    "originalPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE INDEX "Users_organizationId_idx" ON "Users"("organizationId");

-- CreateIndex
CREATE INDEX "Projects_organizationId_idx" ON "Projects"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Projects_organizationId_name_key" ON "Projects"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Queues_projectId_idx" ON "Queues"("projectId");

-- CreateIndex
CREATE INDEX "Queues_retryPolicyId_idx" ON "Queues"("retryPolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "Queues_projectId_name_key" ON "Queues"("projectId", "name");

-- CreateIndex
CREATE INDEX "Jobs_status_runAt_idx" ON "Jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "Jobs_queueId_status_idx" ON "Jobs"("queueId", "status");

-- CreateIndex
CREATE INDEX "Jobs_lockedByWorkerId_idx" ON "Jobs"("lockedByWorkerId");

-- CreateIndex
CREATE INDEX "Jobs_projectId_idx" ON "Jobs"("projectId");

-- CreateIndex
CREATE INDEX "Jobs_batchId_idx" ON "Jobs"("batchId");

-- CreateIndex
CREATE INDEX "JobExecutions_jobId_idx" ON "JobExecutions"("jobId");

-- CreateIndex
CREATE INDEX "JobExecutions_workerId_idx" ON "JobExecutions"("workerId");

-- CreateIndex
CREATE INDEX "JobLogs_executionId_idx" ON "JobLogs"("executionId");

-- CreateIndex
CREATE INDEX "JobLogs_jobId_idx" ON "JobLogs"("jobId");

-- CreateIndex
CREATE INDEX "Workers_status_idx" ON "Workers"("status");

-- CreateIndex
CREATE INDEX "WorkerHeartbeats_workerId_timestamp_idx" ON "WorkerHeartbeats"("workerId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "DeadLetterQueue_jobId_key" ON "DeadLetterQueue"("jobId");

-- CreateIndex
CREATE INDEX "DeadLetterQueue_queueId_idx" ON "DeadLetterQueue"("queueId");

-- CreateIndex
CREATE INDEX "ScheduledJobs_isActive_nextRunAt_idx" ON "ScheduledJobs"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduledJobs_projectId_idx" ON "ScheduledJobs"("projectId");

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projects" ADD CONSTRAINT "Projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queues" ADD CONSTRAINT "Queues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queues" ADD CONSTRAINT "Queues_retryPolicyId_fkey" FOREIGN KEY ("retryPolicyId") REFERENCES "RetryPolicies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jobs" ADD CONSTRAINT "Jobs_lockedByWorkerId_fkey" FOREIGN KEY ("lockedByWorkerId") REFERENCES "Workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jobs" ADD CONSTRAINT "Jobs_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jobs" ADD CONSTRAINT "Jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutions" ADD CONSTRAINT "JobExecutions_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutions" ADD CONSTRAINT "JobExecutions_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLogs" ADD CONSTRAINT "JobLogs_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "JobExecutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLogs" ADD CONSTRAINT "JobLogs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerHeartbeats" ADD CONSTRAINT "WorkerHeartbeats_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterQueue" ADD CONSTRAINT "DeadLetterQueue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterQueue" ADD CONSTRAINT "DeadLetterQueue_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJobs" ADD CONSTRAINT "ScheduledJobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJobs" ADD CONSTRAINT "ScheduledJobs_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
