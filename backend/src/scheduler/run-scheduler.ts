import { SchedulerService } from './scheduler';

const scheduler = new SchedulerService();

scheduler.start().catch((err) => {
  console.error('Failed to start scheduler:', err);
  process.exit(1);
});
