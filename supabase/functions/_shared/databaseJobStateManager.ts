import { createClient } from '@supabase/supabase-js';
import {
  JobState,
  Song,
  AnalysisResult,
  MashabilityScore,
  Masterplan,
} from './jobStateManager.ts';

// Initialize the Supabase client for server-side access
const supabaseUrl = typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_URL') : process.env['SUPABASE_URL'];
const supabaseServiceKey = typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') : process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in the environment');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TABLE_NAME = 'mashup_jobs';

/**
 * Database-backed job state management system
 */
export const DatabaseJobStateManager = {
  /**
   * Create a new mashup job in the database
   */
  createJob: async (jobId: string, songs: Song[]): Promise<JobState> => {
    const now = new Date();
    const jobState: JobState = {
      jobId,
      status: 'processing',
      progress: 0,
      currentStep: 'Initializing mashup generation...',
      songs,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(jobState)
      .select()
      .single();

    if (error) {
      console.error(`Error creating job ${jobId}:`, error);
      throw new Error(`Failed to create job: ${error.message}`);
    }

    console.log(`Created job ${jobId} in database`);
    return data as JobState;
  },

  /**
   * Get job state by ID from the database
   */
  getJob: async (jobId: string): Promise<JobState | null> => {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('jobId', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // PostgREST error for "Not a single row"
        return null;
      }
      console.error(`Error getting job ${jobId}:`, error);
      return null;
    }

    return data as JobState;
  },

  /**
   * Update job state in the database
   */
  updateJob: async (jobId: string, updates: Partial<Omit<JobState, 'jobId' | 'created_at'>>): Promise<JobState | null> => {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ ...updates, updated_at: new Date() })
      .eq('jobId', jobId)
      .select()
      .single();

    if (error) {
      console.error(`Error updating job ${jobId}:`, error);
      return null;
    }

    console.log(`Updated job ${jobId}: ${updates.currentStep || 'status update'}`);
    return data as JobState;
  },

  /**
   * Delete a job from the database
   */
  deleteJob: async (jobId: string): Promise<boolean> => {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('jobId', jobId);

    if (error) {
      console.error(`Error deleting job ${jobId}:`, error);
      return false;
    }

    console.log(`Deleted job ${jobId} from database`);
    return true;
  },

  /**
   * Update job progress with step information
   */
  updateProgress: (jobId: string, progress: number, currentStep: string): Promise<JobState | null> => {
    return DatabaseJobStateManager.updateJob(jobId, { progress, currentStep });
  },

  /**
   * Mark job as complete with results
   */
  completeJob: (jobId: string, result_url?: string, masterplan?: Masterplan): Promise<JobState | null> => {
    return DatabaseJobStateManager.updateJob(jobId, {
      status: 'complete',
      progress: 100,
      currentStep: 'Mashup generation complete!',
      result_url,
      masterplan,
    });
  },

  /**
   * Mark job as failed with error message
   */
  failJob: (jobId: string, error_message: string): Promise<JobState | null> => {
    const sanitizedError = error_message
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]')
      .replace(/password[=:]\s*[^\s&]+/gi, 'password=[REDACTED]')
      .replace(/key[=:]\s*[^\s&]+/gi, 'key=[REDACTED]');

    console.error(`Job ${jobId} failed: ${sanitizedError}`);

    return DatabaseJobStateManager.updateJob(jobId, {
      status: 'failed',
      currentStep: 'Mashup generation failed',
      error_message: sanitizedError,
    });
  },

  /**
   * Add analysis results to job
   */
  addAnalysis: async (jobId: string, analysis: AnalysisResult): Promise<JobState | null> => {
    const job = await DatabaseJobStateManager.getJob(jobId);
    if (!job) return null;

    const analyses = job.analyses || [];
    analyses.push(analysis);

    return DatabaseJobStateManager.updateJob(jobId, {
      analyses,
      progress: Math.min(50, (analyses.length / job.songs.length) * 50),
      currentStep: `Analyzed ${analyses.length}/${job.songs.length} songs`,
    });
  },

  /**
   * Set mashability scores for job
   */
  setMashabilityScores: (jobId: string, scores: MashabilityScore[]): Promise<JobState | null> => {
    return DatabaseJobStateManager.updateJob(jobId, {
      mashabilityScores: scores,
      progress: 60,
      currentStep: `Calculated ${scores.length} mashability scores`,
    });
  },

  /**
   * Set masterplan for job
   */
  setMasterplan: (jobId: string, masterplan: Masterplan): Promise<JobState | null> => {
    return DatabaseJobStateManager.updateJob(jobId, {
      masterplan,
      progress: 80,
      currentStep: 'Generated creative masterplan',
    });
  },
};
