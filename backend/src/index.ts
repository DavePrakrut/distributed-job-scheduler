import http from 'http';
import app from './app';
import dotenv from 'dotenv';
import os from 'os';
import { WebSocketManager } from './services/websocket.service';
import { SchedulerService } from './scheduler/scheduler';
import { WorkerService } from './worker/worker';

dotenv.config();

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

// Initialize WebSocket support
WebSocketManager.getInstance().init(server);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is running on port ${PORT}`);

  // Auto-start worker and scheduler loops if not disabled
  const runBackground = process.env.RUN_BACKGROUND_SERVICES !== 'false';
  if (runBackground) {
    // eslint-disable-next-line no-console
    console.log('🤖 Starting co-located Scheduler and Worker daemons...');

    const scheduler = new SchedulerService();
    scheduler.start().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('❌ Failed to start scheduler:', err);
    });

    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
    const workerName = process.env.WORKER_NAME || `worker-colocated-${os.hostname()}`;
    const worker = new WorkerService(workerName, concurrency);
    worker.start().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('❌ Failed to start worker:', err);
    });
  }
});
