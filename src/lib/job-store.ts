import type { Conversation, GenerateJob } from "./types";

/**
 * In-memory job store for generation progress.
 * Suitable for single-node dev / demo deployments.
 */

const jobs = new Map<string, GenerateJob>();
const listeners = new Map<string, Set<(data: unknown) => void>>();

export function createJob(
  id: string,
  conversations: Conversation[],
  fileName: string,
  regenerateOnly?: string[]
): GenerateJob {
  const job: GenerateJob = {
    id,
    status: "running",
    conversations: conversations.map((c) => ({ ...c })),
    fileName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cancelRequested: false,
    cancelledConversationIds: new Set(),
    regenerateOnly,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): GenerateJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<GenerateJob>) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
  emit(id, { type: "job_snapshot", job: serializeJob(job) });
}

export function updateConversation(
  jobId: string,
  conversationId: string,
  patch: Partial<Conversation>
) {
  const job = jobs.get(jobId);
  if (!job) return;
  const idx = job.conversations.findIndex((c) => c.id === conversationId);
  if (idx === -1) return;
  job.conversations[idx] = { ...job.conversations[idx], ...patch };
  job.updatedAt = Date.now();
  emit(jobId, {
    type: "conversation_update",
    jobId,
    conversationId,
    conversation: job.conversations[idx],
  });
}

export function requestCancel(jobId: string, conversationId?: string) {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (conversationId) {
    job.cancelledConversationIds.add(conversationId);
    updateConversation(jobId, conversationId, {
      status: "cancelled",
      progressLabel: "Cancelled",
    });
  } else {
    job.cancelRequested = true;
    job.status = "cancelled";
  }
  job.updatedAt = Date.now();
  return true;
}

export function isConversationCancelled(jobId: string, conversationId: string) {
  const job = jobs.get(jobId);
  if (!job) return true;
  return job.cancelRequested || job.cancelledConversationIds.has(conversationId);
}

export function subscribe(jobId: string, fn: (data: unknown) => void) {
  if (!listeners.has(jobId)) listeners.set(jobId, new Set());
  listeners.get(jobId)!.add(fn);
  return () => listeners.get(jobId)?.delete(fn);
}

export function emit(jobId: string, data: unknown) {
  const set = listeners.get(jobId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(data);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function serializeJob(job: GenerateJob) {
  return {
    id: job.id,
    status: job.status,
    conversations: job.conversations,
    fileName: job.fileName,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    cancelRequested: job.cancelRequested,
  };
}

// Cleanup old jobs after 2 hours
const TWO_HOURS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TWO_HOURS) {
      jobs.delete(id);
      listeners.delete(id);
    }
  }
}, 15 * 60 * 1000).unref?.();
