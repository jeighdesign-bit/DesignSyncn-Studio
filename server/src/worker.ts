import { Worker, Job } from 'bullmq';
import { redisConnection, EXPORT_QUEUE_NAME } from './queue.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface ExportJobData {
  projectId: string;
  templateId: string;
  garmentType: string;
  elements: any[];
  roster: Array<{
    id: string;
    name: string;
    number: string;
    size: string;
  }>;
}

export const startWorker = () => {
  const worker = new Worker<ExportJobData>(
    EXPORT_QUEUE_NAME,
    async (job: Job<ExportJobData>) => {
      const { projectId, garmentType, roster, elements } = job.data;
      const totalPlayers = roster.length || 1;
      
      console.log(`🚀 [Job #${job.id}] Starting sublimation export for Project: ${projectId}`);
      console.log(`👕 Garment: ${garmentType} | Total Players to process: ${totalPlayers}`);

      // 1. Initial Setup
      await job.updateProgress(5);
      await new Promise((res) => setTimeout(res, 800)); // Simulate loading template assets

      // 2. Loop through each player to render personalized high-res prints
      for (let i = 0; i < roster.length; i++) {
        const player = roster[i];
        const progressPercent = Math.min(
          95,
          Math.round(5 + ((i + 1) / totalPlayers) * 90)
        );

        const statusMessage = `Rendering ${player.name} (#${player.number}) [Size: ${player.size}] (${i + 1}/${totalPlayers})`;
        console.log(`⏳ [Job #${job.id}] ${statusMessage}`);

        // Update active job progress with meta-details
        await job.updateProgress({
          progress: progressPercent,
          statusMessage,
          currentPlayer: player.name,
          currentNumber: player.number,
          currentSize: player.size,
          processedCount: i + 1,
          totalCount: totalPlayers,
        });

        // Simulate rendering computation + canvas export time (e.g. 500ms per player)
        await new Promise((res) => setTimeout(res, 500));
      }

      // 3. Complete packaging & mock upload
      console.log(`📦 [Job #${job.id}] Packaging high-DPI sublimation output files...`);
      await job.updateProgress({
        progress: 98,
        statusMessage: 'Finalizing ZIP production archive...',
      });
      await new Promise((res) => setTimeout(res, 1000));

      const mockDownloadUrl = `https://supabase.co/storage/v1/object/public/sublimation-exports/prod_${projectId}_${Date.now()}.zip`;

      console.log(`✅ [Job #${job.id}] Completed! File downloadable at: ${mockDownloadUrl}`);

      // 4. Synchronize with real Supabase Database (Project and Roster States)
      try {
        if (SUPABASE_URL && SUPABASE_KEY) {
          console.log(`📡 [Job #${job.id}] Syncing production status to Supabase...`);
          
          // Update project status
          await supabase
            .from('projects')
            .update({ 
              status: 'Exported',
              updated_at: new Date().toISOString()
            })
            .eq('id', projectId);

          // Update roster players status and output link
          for (const player of roster) {
            await supabase
              .from('roster_players')
              .update({ 
                status: 'Ready for Export',
                export_url: mockDownloadUrl
              })
              .eq('id', player.id);
          }
          
          console.log(`✅ [Job #${job.id}] Supabase DB synchronization successful!`);
        }
      } catch (dbError: any) {
        console.warn(`⚠️ [Job #${job.id}] Supabase sync skipped or failed:`, dbError.message);
      }

      return {
        success: true,
        downloadUrl: mockDownloadUrl,
        processedPlayers: totalPlayers,
        timestamp: new Date().toISOString(),
      };
    },
    {
      connection: redisConnection as any,
      concurrency: 2, // Maximum 2 concurrent jobs processed on this worker node
    }
  );

  worker.on('ready', () => {
    console.log(`🤖 BullMQ Sublimation Worker is ready and listening on queue: "${EXPORT_QUEUE_NAME}"`);
  });

  worker.on('active', (job) => {
    console.log(`🔥 Worker active: Job #${job.id} has started processing.`);
  });

  worker.on('completed', (job, result) => {
    console.log(`🏆 Worker success: Job #${job.id} finished successfully! Result:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`💥 Worker fail: Job #${job?.id} failed with error:`, err.message);
  });

  return worker;
};
