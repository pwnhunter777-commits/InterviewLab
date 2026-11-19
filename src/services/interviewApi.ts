import { EvaluationResult, InterviewMode, MeasuredTelemetry } from '../types/interview';

export async function transcribeAudioBlob(
  audioBase64: string,
  mimeType: string
): Promise<{ transcript: string; noSpeechDetected: boolean }> {
  const res = await fetch('/api/interview/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to transcribe audio.');
  }
  return {
    transcript: String(data.transcript || ''),
    noSpeechDetected: Boolean(data.noSpeechDetected),
  };
}

export async function evaluateInterviewAnswer(params: {
  questionPrompt: string;
  categoryName: string;
  difficulty: string;
  expectedKeywords: string[];
  idealAnswerGuide: string;
  transcript: string;
  mode: InterviewMode;
  measuredTelemetry: MeasuredTelemetry;
}): Promise<EvaluationResult> {
  const res = await fetch('/api/interview/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to evaluate answer.');
  }
  return data as EvaluationResult;
}

export async function synthesizeSessionSummary(params: {
  categoryName: string;
  mode: InterviewMode;
  questionSummaries: {
    questionPrompt: string;
    overallQuestionScore: number;
    relevanceScore: number;
    keywordScore: number;
    communicationScore: number;
    wpm: number;
    aiFeedback: string;
  }[];
}): Promise<{
  summaryFeedback: string;
  topStrengths: string[];
  topImprovements: string[];
}> {
  const res = await fetch('/api/interview/session-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to generate session summary.');
  }
  return {
    summaryFeedback: String(data.summaryFeedback || ''),
    topStrengths: Array.isArray(data.topStrengths) ? data.topStrengths : [],
    topImprovements: Array.isArray(data.topImprovements) ? data.topImprovements : [],
  };
}
