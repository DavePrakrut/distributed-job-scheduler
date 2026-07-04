import { WorkerService } from './worker';

const workerName =
  process.env.WORKER_NAME || `worker-${Math.random().toString(36).substring(2, 7)}`;
const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5;

const worker = new WorkerService(workerName, concurrency);

worker.start().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
