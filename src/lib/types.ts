export type AppStep = "upload" | "analysis" | "generation" | "results";

export type ConversationStatus =
  | "pending"
  | "queued"
  | "preparing"
  | "generating_agent"
  | "generating_user"
  | "merging"
  | "exporting"
  | "completed"
  | "error"
  | "cancelled";

export type Speaker = "agent" | "user";

export interface DialogueTurn {
  index: number;
  speaker: Speaker;
  text: string;
  emotion?: string;
}

export interface ConversationVoices {
  /** Cartesia voice ID for Agent lines */
  agentVoiceId: string;
  /** Cartesia voice ID for User lines */
  userVoiceId: string;
}

export interface Conversation {
  id: string;
  title: string;
  slug: string;
  language: string;
  languageCode: string;
  scenario?: string;
  /** Overall conversation delivery tone (Cartesia emotion) */
  tone: string;
  /** Short human-readable tone reason from DeepSeek */
  toneReason?: string;
  /** Per-conversation voice / model selection */
  voices: ConversationVoices;
  turns: DialogueTurn[];
  turnCount: number;
  estimatedDurationSec: number;
  status: ConversationStatus;
  progress: number;
  progressLabel?: string;
  error?: string;
  parseError?: string;
  sourceStartLine?: number;
  sourceEndLine?: number;
  audio?: {
    mp3Path?: string;
    wavPath?: string;
    mp3Url?: string;
    wavUrl?: string;
    durationSec: number;
    fileSizeBytes: number;
  };
  transcript: string;
}

export interface CartesiaVoiceOption {
  id: string;
  name: string;
  description?: string;
  language?: string;
  gender?: string | null;
  isOwner?: boolean;
  isPro?: boolean;
}

export interface AnalysisResult {
  conversations: Conversation[];
  fileName: string;
  totalConversations: number;
  warnings: string[];
  rawMarkdown: string;
}

export interface JobProgressEvent {
  type:
    | "job_started"
    | "stage"
    | "conversation_update"
    | "conversation_complete"
    | "conversation_error"
    | "job_complete"
    | "job_error"
    | "log";
  jobId: string;
  stage?: string;
  message?: string;
  conversationId?: string;
  conversation?: Partial<Conversation>;
  progress?: number;
  error?: string;
}

export interface GenerateJob {
  id: string;
  status: "running" | "completed" | "error" | "cancelled";
  conversations: Conversation[];
  fileName: string;
  createdAt: number;
  updatedAt: number;
  cancelRequested: boolean;
  cancelledConversationIds: Set<string>;
  regenerateOnly?: string[];
}

export interface VoiceConfig {
  agentVoiceId: string;
  userVoiceId: string;
  modelId: string;
}
