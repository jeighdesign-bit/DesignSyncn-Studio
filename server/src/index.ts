import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exportQueue } from './queue.js';
import { startWorker } from './worker.js';
import { aiRouter } from './ai-gateway.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable JSON parser and CORS
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Mount the AI Gateway Router
app.use('/api/ai', aiRouter);


// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', environment: process.env.NODE_ENV || 'development' });
});

// 1. Submit Design & Roster for Background Processing
app.post('/api/export', async (req, res) => {
  try {
    const { projectId, templateId, garmentType, elements, roster } = req.body;

    if (!projectId || !roster || !Array.isArray(roster)) {
      return res.status(400).json({ error: 'Missing required parameters: projectId and roster array' });
    }

    console.log(`📥 API Request: Export project ${projectId} for ${roster.length} players...`);

    // Add Job to BullMQ
    const job = await exportQueue.add('sublimation-export', {
      projectId,
      templateId,
      garmentType: garmentType || 'CREW_NECK_TSHIRT',
      elements: elements || [],
      roster,
    });

    return res.status(202).json({
      message: 'Sublimation export job accepted in queue',
      jobId: job.id,
      queueStatus: 'queued',
    });
  } catch (error: any) {
    console.error('❌ Error creating export job:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. Fetch Job Progress & Result Status
app.get('/api/export/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await exportQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: `Job with ID ${jobId} not found` });
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return res.json({
      jobId: job.id,
      state, // 'active' | 'completed' | 'failed' | 'delayed' | 'waiting'
      progress, // returns custom object or number
      result,
      failedReason,
    });
  } catch (error: any) {
    console.error(`❌ Error fetching job status for ${req.params.jobId}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

// Start BullMQ Background Worker Node
startWorker();

// Start Express Listener
app.listen(PORT, () => {
  console.log(`🚀 DesignSync Production Server listening at http://localhost:${PORT}`);
});
