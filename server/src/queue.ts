import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Establish Redis Connection
export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
});

redisConnection.on('connect', () => {
  console.log('🔌 Redis connected successfully!');
});

redisConnection.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

export const EXPORT_QUEUE_NAME = 'sublimation-export-queue';

// Define Export Queue
export const exportQueue = new Queue(EXPORT_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3, // Retry failed exports up to 3 times
    backoff: {
      type: 'exponential',
      delay: 5000, // Wait 5s before first retry
    },
    removeOnComplete: {
      age: 3600, // Auto-remove completed jobs after 1 hour to save Redis memory
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours for debugging
    },
  },
});
