import { PrismaClient, JobStatus, RetryStrategy, WorkerStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean up existing data (Safe deletion order)
  console.log('🧹 Cleaning old records...');
  await prisma.deadLetterQueue.deleteMany({});
  await prisma.jobLogs.deleteMany({});
  await prisma.jobExecutions.deleteMany({});
  await prisma.jobs.deleteMany({});
  await prisma.scheduledJobs.deleteMany({});
  await prisma.workerHeartbeats.deleteMany({});
  await prisma.workers.deleteMany({});
  await prisma.queues.deleteMany({});
  await prisma.retryPolicies.deleteMany({});
  await prisma.projects.deleteMany({});
  await prisma.users.deleteMany({});
  await prisma.organizations.deleteMany({});

  // 2. Organizations
  console.log('🏢 Creating Organizations...');
  const orgAcme = await prisma.organizations.create({
    data: { name: 'Acme Corporation' },
  });
  const orgStark = await prisma.organizations.create({
    data: { name: 'Stark Industries' },
  });

  // 3. Users
  console.log('👤 Creating Users...');
  const hashedPassword = await bcrypt.hash('Password123!', 10);

  await prisma.users.createMany({
    data: [
      {
        email: 'admin@acme.com',
        passwordHash: hashedPassword,
        role: 'ADMIN',
        organizationId: orgAcme.id,
      },
      {
        email: 'developer@acme.com',
        passwordHash: hashedPassword,
        role: 'MEMBER',
        organizationId: orgAcme.id,
      },
      {
        email: 'tony@stark.com',
        passwordHash: hashedPassword,
        role: 'OWNER',
        organizationId: orgStark.id,
      },
    ],
  });

  // 4. Projects
  console.log('📁 Creating Projects...');
  const projAcmeWeb = await prisma.projects.create({
    data: {
      name: 'Acme Web Application',
      organizationId: orgAcme.id,
    },
  });
  const projAcmeAnalytics = await prisma.projects.create({
    data: {
      name: 'Acme Analytics Engine',
      organizationId: orgAcme.id,
    },
  });
  const projStarkGrid = await prisma.projects.create({
    data: {
      name: 'Jarvis Grid Control',
      organizationId: orgStark.id,
    },
  });

  // 5. Retry Policies
  console.log('⚙️ Creating Retry Policies...');
  const policyFixed = await prisma.retryPolicies.create({
    data: {
      name: 'Standard Fixed Delay',
      strategy: RetryStrategy.FIXED,
      maxRetries: 3,
      baseDelaySeconds: 10,
    },
  });
  const policyLinear = await prisma.retryPolicies.create({
    data: {
      name: 'Linear Backoff Strategy',
      strategy: RetryStrategy.LINEAR,
      maxRetries: 5,
      baseDelaySeconds: 15,
    },
  });
  const policyExponential = await prisma.retryPolicies.create({
    data: {
      name: 'Critical Exponential Decay',
      strategy: RetryStrategy.EXPONENTIAL,
      maxRetries: 4,
      baseDelaySeconds: 5,
      factor: 2.0,
    },
  });

  // 6. Queues
  console.log('📥 Creating Queues...');
  const queueAcmeDefault = await prisma.queues.create({
    data: {
      name: 'default',
      projectId: projAcmeWeb.id,
      priority: 1,
      maxConcurrency: 10,
      retryPolicyId: policyFixed.id,
    },
  });
  const queueAcmeEmail = await prisma.queues.create({
    data: {
      name: 'email-delivery',
      projectId: projAcmeWeb.id,
      priority: 2,
      maxConcurrency: 5,
      retryPolicyId: policyLinear.id,
    },
  });
  const queueAcmeHeavy = await prisma.queues.create({
    data: {
      name: 'video-rendering',
      projectId: projAcmeAnalytics.id,
      priority: 5,
      maxConcurrency: 2,
      retryPolicyId: policyExponential.id,
    },
  });
  const queueStarkDefense = await prisma.queues.create({
    data: {
      name: 'shield-generators',
      projectId: projStarkGrid.id,
      priority: 10,
      maxConcurrency: 20,
      retryPolicyId: policyExponential.id,
    },
  });

  // 7. Workers
  console.log('🤖 Creating Workers...');
  const workerAlpha = await prisma.workers.create({
    data: {
      name: 'worker-node-alpha',
      hostName: 'k8s-pod-x9812a',
      status: WorkerStatus.ACTIVE,
      concurrencyLimit: 10,
      activeJobsCount: 1,
    },
  });
  const workerBeta = await prisma.workers.create({
    data: {
      name: 'worker-node-beta',
      hostName: 'k8s-pod-y0821b',
      status: WorkerStatus.IDLE,
      concurrencyLimit: 5,
      activeJobsCount: 0,
    },
  });
  const workerGamma = await prisma.workers.create({
    data: {
      name: 'worker-node-gamma',
      hostName: 'local-dev-machine',
      status: WorkerStatus.OFFLINE,
      concurrencyLimit: 2,
      activeJobsCount: 0,
    },
  });

  // 8. Worker Heartbeats (Historical Metrics)
  console.log('💓 Creating Worker Heartbeats...');
  const now = new Date();
  for (let i = 12; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 300000); // every 5 mins
    await prisma.workerHeartbeats.createMany({
      data: [
        {
          workerId: workerAlpha.id,
          timestamp,
          activeJobsCount: Math.floor(Math.random() * 8),
          cpuUsage: 25.5 + Math.random() * 30,
          memoryUsage: 62.1 + Math.random() * 10,
        },
        {
          workerId: workerBeta.id,
          timestamp,
          activeJobsCount: Math.floor(Math.random() * 3),
          cpuUsage: 5.0 + Math.random() * 15,
          memoryUsage: 41.3 + Math.random() * 5,
        },
      ],
    });
  }

  // 9. Scheduled / Recurring Jobs (Cron Templates)
  console.log('⏰ Creating Scheduled Jobs...');
  const schedEmailDigest = await prisma.scheduledJobs.create({
    data: {
      name: 'Daily Email Digest Generator',
      cronExpression: '0 8 * * *', // daily at 8 AM
      projectId: projAcmeWeb.id,
      queueId: queueAcmeEmail.id,
      payload: { sendSummary: true, recipients: ['stakeholders@acme.com'] },
      nextRunAt: new Date(Date.now() + 12 * 3600000), // 12 hours from now
    },
  });
  const schedAnalyticsSync = await prisma.scheduledJobs.create({
    data: {
      name: 'Analytics Hourly DB Sync',
      cronExpression: '0 * * * *', // hourly
      projectId: projAcmeAnalytics.id,
      queueId: queueAcmeDefault.id,
      payload: { targetBucket: 's3://acme-analytics-sync-prod' },
      nextRunAt: new Date(Date.now() + 1800000), // 30 mins from now
    },
  });

  // 10. Jobs & Execution Details
  console.log('💼 Creating Jobs, Executions & Logs...');

  // Job 1: Completed Job
  const jobCompleted = await prisma.jobs.create({
    data: {
      name: 'Email Welcome Packet - User 1083',
      status: JobStatus.COMPLETED,
      queueId: queueAcmeEmail.id,
      projectId: projAcmeWeb.id,
      payload: { userId: '1083', email: 'hello@user1083.io', template: 'welcome' },
      runAt: new Date(Date.now() - 600000),
    },
  });

  const execCompleted = await prisma.jobExecutions.create({
    data: {
      jobId: jobCompleted.id,
      workerId: workerAlpha.id,
      workerName: workerAlpha.name,
      status: 'SUCCESS',
      startedAt: new Date(Date.now() - 598000),
      finishedAt: new Date(Date.now() - 596000),
      durationMs: 2000,
      attempt: 1,
    },
  });

  await prisma.jobLogs.createMany({
    data: [
      {
        executionId: execCompleted.id,
        jobId: jobCompleted.id,
        level: 'INFO',
        message: 'Resolving template context for welcome packet...',
        timestamp: new Date(Date.now() - 597800),
      },
      {
        executionId: execCompleted.id,
        jobId: jobCompleted.id,
        level: 'INFO',
        message: 'Successfully sent email packet to SMTP relay server.',
        timestamp: new Date(Date.now() - 596000),
      },
    ],
  });

  // Job 2: Running Job (Locked)
  const jobRunning = await prisma.jobs.create({
    data: {
      name: 'Video Encoding - Tutorial 1',
      status: JobStatus.RUNNING,
      queueId: queueAcmeHeavy.id,
      projectId: projAcmeAnalytics.id,
      payload: { inputPath: '/raw/t1.mov', format: 'mp4', resolution: '1080p' },
      lockedByWorkerId: workerAlpha.id,
      lockedAt: new Date(Date.now() - 120000),
      runAt: new Date(Date.now() - 120000),
    },
  });

  const execRunning = await prisma.jobExecutions.create({
    data: {
      jobId: jobRunning.id,
      workerId: workerAlpha.id,
      workerName: workerAlpha.name,
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 120000),
      finishedAt: new Date(),
      durationMs: 0,
      attempt: 1,
    },
  });

  await prisma.jobLogs.createMany({
    data: [
      {
        executionId: execRunning.id,
        jobId: jobRunning.id,
        level: 'INFO',
        message: 'Downloaded source media asset /raw/t1.mov',
        timestamp: new Date(Date.now() - 110000),
      },
      {
        executionId: execRunning.id,
        jobId: jobRunning.id,
        level: 'INFO',
        message: 'Encoding phase: 42% complete...',
        timestamp: new Date(Date.now() - 60000),
      },
    ],
  });

  // Job 3: Queued Job (Pending execution)
  const jobQueued = await prisma.jobs.create({
    data: {
      name: 'Regenerate Sitemap',
      status: JobStatus.QUEUED,
      queueId: queueAcmeDefault.id,
      projectId: projAcmeWeb.id,
      payload: { domains: ['acme.com', 'blog.acme.com'] },
      runAt: new Date(),
    },
  });

  // Job 4: Failed Job & Dead Letter Queue (DLQ)
  const jobFailed = await prisma.jobs.create({
    data: {
      name: 'Database Backup Sync',
      status: JobStatus.FAILED,
      queueId: queueAcmeDefault.id,
      projectId: projAcmeWeb.id,
      payload: { driveId: 'google-drive://backups/daily' },
      maxRetries: 3,
      currentRetryCount: 3,
      runAt: new Date(Date.now() - 1800000),
    },
  });

  // Add retry history (executions) for the failed job
  for (let attempt = 1; attempt <= 3; attempt++) {
    const startedAt = new Date(Date.now() - 1800000 + (attempt - 1) * 300000);
    const finishedAt = new Date(startedAt.getTime() + 1500);
    const exec = await prisma.jobExecutions.create({
      data: {
        jobId: jobFailed.id,
        workerId: workerAlpha.id,
        workerName: workerAlpha.name,
        status: 'FAILED',
        startedAt,
        finishedAt,
        durationMs: 1500,
        errorMessage: 'Network timeout: host drive.googleapis.com is unreachable.',
        stackTrace:
          'Error: drive.googleapis.com timed out\n    at Socket.connectionTimeout (net.js:842:19)\n    at HTTPClient.request (http.js:128:5)',
        attempt,
      },
    });

    await prisma.jobLogs.create({
      data: {
        executionId: exec.id,
        jobId: jobFailed.id,
        level: 'ERROR',
        message: `Attempt ${attempt} failed with a network socket exception. Re-enqueuing based on policy.`,
        timestamp: finishedAt,
      },
    });
  }

  // Create DeadLetterQueue record for Job 4
  console.log('💀 Creating DLQ records...');
  await prisma.deadLetterQueue.create({
    data: {
      jobId: jobFailed.id,
      queueId: queueAcmeDefault.id,
      failedAt: new Date(),
      reason: 'Network timeout: host drive.googleapis.com is unreachable after 3 attempts.',
      stackTrace:
        'Error: drive.googleapis.com timed out\n    at Socket.connectionTimeout (net.js:842:19)',
      originalPayload: { driveId: 'google-drive://backups/daily' },
    },
  });

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
