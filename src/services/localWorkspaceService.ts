import {
  ExperienceLevel,
  InterviewCategory,
  InterviewMode,
  InterviewQuestion,
  InterviewSession,
  SessionResponse,
  UserProfile,
} from '../types/interview';

const ACTIVE_SESSION_KEY = 'interviewlab_active_local_user_v1';
const PROFILES_KEY = 'interviewlab_local_profiles_v1';
const CATEGORIES_KEY = 'interviewlab_local_categories_v1';
const QUESTIONS_KEY = 'interviewlab_local_questions_v1';
const SESSIONS_KEY = 'interviewlab_local_sessions_v1';
const RESPONSES_KEY = 'interviewlab_local_responses_v1';

export interface LocalUserSession {
  uid: string;
  displayName: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error(
      'Local browser storage is full or unavailable. Clear browser storage or sign in with Google to continue.'
    );
  }
}

function nowTimestamp(): { seconds: number } {
  return { seconds: Math.floor(Date.now() / 1000) };
}

function makeLocalId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `local_${prefix}_${Date.now()}_${rand}`;
}

export function buildLocalUidFromName(name: string): string {
  const clean = name.trim().toLowerCase();
  const slug = clean
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  const rand = Math.random().toString(36).slice(2, 8);

  if (slug) {
    return `local_${slug}_${rand}`;
  }

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return `local_user_${hash.toString(36)}_${rand}`;
}

export function getActiveLocalSession(): LocalUserSession | null {
  if (typeof window === 'undefined') return null;
  const saved = readJson<LocalUserSession | null>(ACTIVE_SESSION_KEY, null);
  if (saved && typeof saved.uid === 'string' && saved.uid.startsWith('local_') && saved.displayName) {
    return saved;
  }
  return null;
}

export function setActiveLocalSession(displayName: string): LocalUserSession {
  const cleanName = displayName.trim().slice(0, 100);
  const session: LocalUserSession = {
    uid: buildLocalUidFromName(cleanName),
    displayName: cleanName,
  };
  writeJson(ACTIVE_SESSION_KEY, session);
  return session;
}

export function clearActiveLocalSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_SESSION_KEY);
}

export function getLocalUserProfile(uid: string): UserProfile | null {
  const profiles = readJson<Record<string, UserProfile>>(PROFILES_KEY, {});
  return profiles[uid] || null;
}

export function saveLocalUserProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  isNew: boolean;
}): UserProfile {
  const profiles = readJson<Record<string, UserProfile>>(PROFILES_KEY, {});
  const existing = profiles[params.uid];
  const cleanName = params.displayName.trim().slice(0, 100) || 'Candidate';
  const cleanRole = params.targetRole.trim().slice(0, 100) || 'Software Engineer';

  const saved: UserProfile = {
    uid: params.uid,
    displayName: cleanName,
    email: params.email.slice(0, 160),
    targetRole: cleanRole,
    experienceLevel: params.experienceLevel,
    createdAt: existing?.createdAt || nowTimestamp(),
    updatedAt: nowTimestamp(),
  };

  profiles[params.uid] = saved;
  writeJson(PROFILES_KEY, profiles);
  return saved;
}

export function listLocalCategories(uid: string): InterviewCategory[] {
  const all = readJson<InterviewCategory[]>(CATEGORIES_KEY, []);
  return all
    .filter((c) => c.ownerId === uid)
    .map((c) => ({ ...c, isBuiltIn: false }));
}

export function createLocalCategory(params: {
  ownerId: string;
  name: string;
  description: string;
  difficultyFocus: string;
  defaultTimePerQuestionSec: number;
}): InterviewCategory {
  const all = readJson<InterviewCategory[]>(CATEGORIES_KEY, []);
  const created: InterviewCategory = {
    id: makeLocalId('cat'),
    ownerId: params.ownerId,
    name: params.name.trim().slice(0, 80),
    description: params.description.trim().slice(0, 400),
    difficultyFocus: params.difficultyFocus.trim().slice(0, 60) || 'Mixed',
    defaultTimePerQuestionSec: Math.max(30, Math.min(600, Math.round(params.defaultTimePerQuestionSec))),
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    isBuiltIn: false,
  };
  writeJson(CATEGORIES_KEY, [...all, created]);
  return created;
}

export function deleteLocalCategory(categoryId: string): void {
  const all = readJson<InterviewCategory[]>(CATEGORIES_KEY, []);
  writeJson(
    CATEGORIES_KEY,
    all.filter((c) => c.id !== categoryId)
  );
  const qs = readJson<InterviewQuestion[]>(QUESTIONS_KEY, []);
  writeJson(
    QUESTIONS_KEY,
    qs.filter((q) => q.categoryId !== categoryId)
  );
}

export function listLocalQuestions(uid: string): InterviewQuestion[] {
  const all = readJson<InterviewQuestion[]>(QUESTIONS_KEY, []);
  return all
    .filter((q) => q.ownerId === uid)
    .map((q) => ({ ...q, isBuiltIn: false }));
}

export function saveLocalQuestion(params: {
  id?: string;
  ownerId: string;
  categoryId: string;
  prompt: string;
  difficulty: InterviewQuestion['difficulty'];
  expectedKeywords: string[];
  idealAnswerGuide: string;
}): InterviewQuestion {
  const all = readJson<InterviewQuestion[]>(QUESTIONS_KEY, []);
  const cleanKeywords = params.expectedKeywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (params.id) {
    const updatedList = all.map((q) =>
      q.id === params.id
        ? {
            ...q,
            categoryId: params.categoryId,
            prompt: params.prompt.trim().slice(0, 600),
            difficulty: params.difficulty,
            expectedKeywords: cleanKeywords,
            idealAnswerGuide: params.idealAnswerGuide.trim().slice(0, 1500),
            updatedAt: nowTimestamp(),
          }
        : q
    );
    writeJson(QUESTIONS_KEY, updatedList);
    return (
      updatedList.find((q) => q.id === params.id) || {
        id: params.id,
        ownerId: params.ownerId,
        categoryId: params.categoryId,
        prompt: params.prompt.trim().slice(0, 600),
        difficulty: params.difficulty,
        expectedKeywords: cleanKeywords,
        idealAnswerGuide: params.idealAnswerGuide.trim().slice(0, 1500),
        isBuiltIn: false,
      }
    );
  }

  const created: InterviewQuestion = {
    id: makeLocalId('q'),
    ownerId: params.ownerId,
    categoryId: params.categoryId,
    prompt: params.prompt.trim().slice(0, 600),
    difficulty: params.difficulty,
    expectedKeywords: cleanKeywords,
    idealAnswerGuide: params.idealAnswerGuide.trim().slice(0, 1500),
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    isBuiltIn: false,
  };
  writeJson(QUESTIONS_KEY, [...all, created]);
  return created;
}

export function deleteLocalQuestion(questionId: string): void {
  const all = readJson<InterviewQuestion[]>(QUESTIONS_KEY, []);
  writeJson(
    QUESTIONS_KEY,
    all.filter((q) => q.id !== questionId)
  );
}

export function createLocalSession(params: {
  userId: string;
  mode: InterviewMode;
  categoryId: string;
  categoryName: string;
  questionCount: number;
}): InterviewSession {
  const all = readJson<InterviewSession[]>(SESSIONS_KEY, []);
  const created: InterviewSession = {
    id: makeLocalId('sess'),
    userId: params.userId,
    mode: params.mode,
    categoryId: params.categoryId,
    categoryName: params.categoryName.slice(0, 80),
    status: 'in_progress',
    questionCount: params.questionCount,
    overallScore: 0,
    relevanceScore: 0,
    clarityScore: 0,
    keywordCoverageScore: 0,
    avgWpm: 0,
    totalDurationSec: 0,
    summaryFeedback: '',
    topStrengths: [],
    topImprovements: [],
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
  };
  writeJson(SESSIONS_KEY, [...all, created]);
  return created;
}

export function saveLocalSessionResponse(
  response: Omit<SessionResponse, 'id' | 'createdAt'>
): SessionResponse {
  const all = readJson<SessionResponse[]>(RESPONSES_KEY, []);
  const created: SessionResponse = {
    ...response,
    id: makeLocalId('resp'),
    createdAt: nowTimestamp(),
  };
  writeJson(RESPONSES_KEY, [...all, created]);
  return created;
}

export function completeLocalSession(params: {
  sessionId: string;
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
}): void {
  const all = readJson<InterviewSession[]>(SESSIONS_KEY, []);
  const updated = all.map((s) =>
    s.id === params.sessionId
      ? {
          ...s,
          status: 'completed' as const,
          questionCount: params.questionCount,
          overallScore: Math.max(0, Math.min(100, Math.round(params.overallScore))),
          relevanceScore: Math.max(0, Math.min(100, Math.round(params.relevanceScore))),
          clarityScore: Math.max(0, Math.min(100, Math.round(params.clarityScore))),
          keywordCoverageScore: Math.max(0, Math.min(100, Math.round(params.keywordCoverageScore))),
          avgWpm: Math.max(0, Math.min(400, Math.round(params.avgWpm))),
          totalDurationSec: Math.max(0, Math.min(7200, Math.round(params.totalDurationSec))),
          summaryFeedback: params.summaryFeedback.slice(0, 2000),
          topStrengths: params.topStrengths.slice(0, 6),
          topImprovements: params.topImprovements.slice(0, 6),
          updatedAt: nowTimestamp(),
        }
      : s
  );
  writeJson(SESSIONS_KEY, updated);
}

export function listLocalSessions(uid: string): InterviewSession[] {
  const all = readJson<InterviewSession[]>(SESSIONS_KEY, []);
  return all
    .filter((s) => s.userId === uid)
    .sort((a, b) => {
      const aSec = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      const bSec = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      return bSec - aSec;
    });
}

export function listLocalSessionResponses(sessionId: string, uid: string): SessionResponse[] {
  const all = readJson<SessionResponse[]>(RESPONSES_KEY, []);
  return all
    .filter((r) => r.sessionId === sessionId && r.userId === uid)
    .sort((a, b) => {
      const aSec = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      const bSec = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      return aSec - bSec;
    });
}

export function deleteLocalSession(sessionId: string, uid: string): void {
  const sessions = readJson<InterviewSession[]>(SESSIONS_KEY, []);
  writeJson(
    SESSIONS_KEY,
    sessions.filter((s) => !(s.id === sessionId && s.userId === uid))
  );
  const responses = readJson<SessionResponse[]>(RESPONSES_KEY, []);
  writeJson(
    RESPONSES_KEY,
    responses.filter((r) => !(r.sessionId === sessionId && r.userId === uid))
  );
}
