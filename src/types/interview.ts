export type ExperienceLevel = 'Student' | 'Fresher' | 'Mid-Level' | 'Senior';
export type InterviewMode = 'demo' | 'pro';
export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';
export type SessionStatus = 'in_progress' | 'completed';
export type TranscriptSource = 'gemini_audio' | 'web_speech' | 'manual_text' | 'unavailable';
export type VoiceClarityLabel = 'Clear' | 'Moderate' | 'Quiet' | 'Unavailable';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InterviewCategory {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  difficultyFocus: string;
  defaultTimePerQuestionSec: number;
  isBuiltIn?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InterviewQuestion {
  id: string;
  ownerId: string;
  categoryId: string;
  prompt: string;
  difficulty: DifficultyLevel;
  expectedKeywords: string[];
  idealAnswerGuide: string;
  isBuiltIn?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MeasuredTelemetry {
  speakingDurationSec: number;
  wordCount: number;
  wpm: number;
  pauseCount: number;
  avgSilenceRatio: number;
  voiceClarityLabel: VoiceClarityLabel;
  voiceClarityDb: number;
  eyeContactRatio: number; // -1 if unavailable
  eyeContactStatus: string;
  facePresenceRatio: number; // -1 if unavailable
}

export interface EvaluationResult {
  relevanceScore: number;
  keywordScore: number;
  communicationScore: number;
  overallQuestionScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  aiFeedback: string;
  strengths: string[];
  improvements: string[];
  measurementNotes: string;
}

export interface SessionResponse {
  id?: string;
  userId: string;
  sessionId: string;
  questionId: string;
  questionPrompt: string;
  transcript: string;
  transcriptSource: TranscriptSource;
  speakingDurationSec: number;
  wordCount: number;
  wpm: number;
  pauseCount: number;
  avgSilenceRatio: number;
  voiceClarityLabel: VoiceClarityLabel;
  voiceClarityDb: number;
  eyeContactRatio: number;
  eyeContactStatus: string;
  facePresenceRatio: number;
  relevanceScore: number;
  keywordScore: number;
  communicationScore: number;
  overallQuestionScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  aiFeedback: string;
  strengths: string[];
  improvements: string[];
  measurementNotes: string;
  recordingRef: string;
  createdAt?: unknown;
}

export interface InterviewSession {
  id: string;
  userId: string;
  mode: InterviewMode;
  categoryId: string;
  categoryName: string;
  status: SessionStatus;
  questionCount: number;
  overallScore: number;
  relevanceScore: number;
  clarityScore: number;
  keywordCoverageScore: number;
  avgWpm: number;
  totalDurationSec: number;
  summaryFeedback: string;
  topStrengths: string[];
  topImprovements: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}
