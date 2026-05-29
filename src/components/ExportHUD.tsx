import React, { useState, useEffect } from 'react';
import { Loader2, Download, CheckCircle2, AlertTriangle, Play, X, RefreshCw } from 'lucide-react';

interface ExportHUDProps {
  projectId: string;
  roster: Array<{
    id: string;
    name: string;
    number: string;
    size: string;
  }>;
  getCanvasElements: () => any[];
  onClose?: () => void;
}

interface JobProgress {
  progress: number;
  statusMessage: string;
  currentPlayer?: string;
  currentNumber?: string;
  currentSize?: string;
  processedCount?: number;
  totalCount?: number;
}

export const ExportHUD: React.FC<ExportHUDProps> = ({
  projectId,
  roster,
  getCanvasElements,
  onClose,
}) => {
  const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<'idle' | 'queued' | 'active' | 'completed' | 'failed'>('idle');
  const [progressDetails, setProgressDetails] = useState<JobProgress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Polls the server for job updates
  useEffect(() => {
    if (!activeJobId) return;

    let pollInterval: any;

    const checkStatus = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/export/status/${activeJobId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const data = await response.json();
        
        // Update state
        setJobState(data.state);

        if (typeof data.progress === 'object' && data.progress !== null) {
          setProgressDetails(data.progress);
        } else if (typeof data.progress === 'number') {
          setProgressDetails({
            progress: data.progress,
            statusMessage: `Processing export... ${data.progress}%`,
          });
        }

        if (data.state === 'completed') {
          setDownloadUrl(data.result?.downloadUrl || '#');
          setProgressDetails({ progress: 100, statusMessage: 'Sublimation zip ready!' });
          clearInterval(pollInterval);
        } else if (data.state === 'failed') {
          setErrorMessage(data.failedReason || 'An unknown error occurred during rendering.');
          clearInterval(pollInterval);
        }
      } catch (err: any) {
        console.error('Error polling job status:', err);
        setJobState('failed');
        setErrorMessage(err.message || 'Network error connecting to export queue.');
        clearInterval(pollInterval);
      }
    };

    // Run first check immediately
    checkStatus();

    // Poll every 800ms
    pollInterval = setInterval(checkStatus, 800);

    return () => clearInterval(pollInterval);
  }, [activeJobId]);

  const triggerQueueExport = async () => {
    setErrorMessage(null);
    setDownloadUrl(null);
    setProgressDetails(null);
    setJobState('queued');

    try {
      const payload = {
        projectId,
        templateId: 'custom-template',
        garmentType: 'CREW_NECK_TSHIRT',
        elements: getCanvasElements(),
        roster: roster.map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
          size: player.size,
        })),
      };

      console.log('Sending export queue payload to server:', payload);

      const response = await fetch(`${SERVER_URL}/api/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Production queue server is not running or rejected the payload.');
      }

      const result = await response.json();
      setActiveJobId(result.jobId);
      setJobState('active');
    } catch (err: any) {
      console.error(err);
      setJobState('failed');
      setErrorMessage(
        err.message || `Failed to connect to ${SERVER_URL}. Please start the Redis/BullMQ worker.`
      );
    }
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl text-slate-100 max-w-md w-full relative overflow-hidden transition-all duration-300">
      {/* Background Decorative Gradient Radial */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-center mb-5 border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-lg text-emerald-400 flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${jobState === 'active' || jobState === 'queued' ? 'animate-spin text-teal-400' : ''}`} />
            Sublimation Render Queue
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">BullMQ + Redis Scaled Processor</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Roster Size Summary */}
      <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-3 mb-5 flex justify-between items-center text-xs">
        <div>
          <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Roster Count</span>
          <span className="text-sm font-bold text-white">{roster.length} Jersey Customizations</span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Target scale</span>
          <span className="text-sm font-bold text-teal-400">20k real-time capable</span>
        </div>
      </div>

      {/* Idle / Call to Action */}
      {jobState === 'idle' && (
        <div className="text-center py-6">
          <p className="text-sm text-slate-300 mb-5 leading-relaxed">
            Ready to generate high-DPI production bundles. Background worker will render layouts for all{' '}
            <strong className="text-emerald-400">{roster.length} roster players</strong> concurrently.
          </p>
          <button
            onClick={triggerQueueExport}
            disabled={roster.length === 0}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            Queue Sublimation Export
          </button>
        </div>
      )}

      {/* Queued / Active Render States */}
      {(jobState === 'queued' || jobState === 'active') && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm font-semibold">
            <span className="text-slate-300 flex items-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              {progressDetails?.statusMessage || 'Connecting with BullMQ...'}
            </span>
            <span className="text-teal-400 text-sm font-bold">
              {progressDetails?.progress || 0}%
            </span>
          </div>

          {/* Glowing Premium Progress Track */}
          <div className="w-full bg-slate-800 rounded-full h-3.5 p-0.5 border border-slate-700/50 overflow-hidden shadow-inner">
            <div
              className="bg-gradient-to-r from-teal-400 via-emerald-400 to-indigo-500 h-full rounded-full transition-all duration-300 relative"
              style={{ width: `${progressDetails?.progress || 0}%` }}
            >
              <div className="absolute top-0 right-0 w-3 h-full bg-white/40 blur-[1px] animate-pulse" />
            </div>
          </div>

          {/* Current Personalization Dynamic Banner */}
          {progressDetails?.currentPlayer && (
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between text-xs animate-pulse">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                  Processing Jersey
                </span>
                <span className="text-sm font-bold text-white tracking-wide">
                  {progressDetails.currentPlayer}
                </span>
              </div>
              <div className="text-right">
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-bold uppercase tracking-wider text-[10px] inline-block mb-1">
                  Num: {progressDetails.currentNumber}
                </span>
                <span className="block text-[10px] font-semibold text-slate-400">
                  Size {progressDetails.currentSize}
                </span>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            Job ID: <code className="text-slate-400 font-mono">{activeJobId || 'generating...'}</code> • Running in safe sandboxed Node-Canvas container.
          </p>
        </div>
      )}

      {/* Completed State */}
      {jobState === 'completed' && downloadUrl && (
        <div className="text-center py-4 space-y-5 animate-fadeIn">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>
          </div>
          <div>
            <h4 className="font-bold text-md text-white">Sublimation Rendering Complete</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              All {progressDetails?.totalCount || roster.length} roster shirts processed and compiled successfully inside Redis queue storage.
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Download className="w-5 h-5" />
              Download ZIP Production
            </a>
            <button
              onClick={() => {
                setJobState('idle');
                setActiveJobId(null);
              }}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl border border-slate-700/60 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Failed State */}
      {jobState === 'failed' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex gap-3 text-red-200">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-red-400">Queue Processing Error</h4>
              <p className="text-xs text-red-200/80 mt-1 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={triggerQueueExport}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Export Job
            </button>
            <button
              onClick={() => {
                setJobState('idle');
                setActiveJobId(null);
              }}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl border border-slate-700/60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
