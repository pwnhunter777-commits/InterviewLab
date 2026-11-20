import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  DifficultyLevel,
  ExperienceLevel,
  InterviewCategory,
  InterviewMode,
  InterviewQuestion,
  InterviewSession,
  SessionResponse,
  UserProfile,
} from '../types/interview';
import {
  completeLocalSession,
  createLocalCategory,
  createLocalSession,
  deleteLocalCategory,
  deleteLocalQuestion,
  deleteLocalSession,
  getLocalUserProfile,
  listLocalCategories,
  listLocalQuestions,
  listLocalSessionResponses,
  listLocalSessions,
  saveLocalQuestion,
  saveLocalSessionResponse,
  saveLocalUserProfile,
} from './localWorkspaceService';

function isLocalId(id?: string): boolean {
  return Boolean(id && id.startsWith('local_'));
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (isLocalId(uid)) {
    return getLocalUserProfile(uid);
  }
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveUserProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  targetRole: string;
  experienceLevel: ExperienceLevel;
  isNew: boolean;
}): Promise<UserProfile> {
  if (isLocalId(params.uid)) {
    return saveLocalUserProfile(params);
  }
  const path = `users/${params.uid}`;
  const docRef = doc(db, 'users', params.uid);
  const cleanName = params.displayName.trim().slice(0, 100) || 'Candidate';
  const cleanRole = params.targetRole.trim().slice(0, 100) || 'Software Engineer';

  try {
    if (params.isNew) {
      await setDoc(docRef, {
        uid: params.uid,
        displayName: cleanName,
        email: params.email.slice(0, 160),
        targetRole: cleanRole,
        experienceLevel: params.experienceLevel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        displayName: cleanName,
        email: params.email.slice(0, 160),
        targetRole: cleanRole,
        experienceLevel: params.experienceLevel,
        updatedAt: serverTimestamp(),
      });
    }
    const updated = await getDoc(docRef);
    return updated.data() as UserProfile;
  } catch (err) {
    handleFirestoreError(err, params.isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function listCustomCategories(uid: string): Promise<InterviewCategory[]> {
  if (isLocalId(uid)) {
    return listLocalCategories(uid);
  }
  const path = 'categories';
  try {
    const q = query(collection(db, path), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<InterviewCategory, 'id'>),
      isBuiltIn: false,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createCustomCategory(params: {
  ownerId: string;
  name: string;
  description: string;
  difficultyFocus: string;
  defaultTimePerQuestionSec: number;
}): Promise<InterviewCategory> {
  if (isLocalId(params.ownerId)) {
    return createLocalCategory(params);
  }
  const id = makeSafeId('cat');
  const path = `categories/${id}`;
  try {
    const payload = {
      ownerId: params.ownerId,
      name: params.name.trim().slice(0, 80),
      description: params.description.trim().slice(0, 400),
      difficultyFocus: params.difficultyFocus.trim().slice(0, 60) || 'Mixed',
      defaultTimePerQuestionSec: Math.max(30, Math.min(600, Math.round(params.defaultTimePerQuestionSec))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'categories', id), payload);
    return {
      id,
      ...payload,
      isBuiltIn: false,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteCustomCategory(categoryId: string): Promise<void> {
  if (isLocalId(categoryId)) {
    deleteLocalCategory(categoryId);
    return;
  }
  const path = `categories/${categoryId}`;
  try {
    await deleteDoc(doc(db, 'categories', categoryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function listCustomQuestions(uid: string): Promise<InterviewQuestion[]> {
  if (isLocalId(uid)) {
    return listLocalQuestions(uid);
  }
  const path = 'questions';
  try {
    const q = query(collection(db, path), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<InterviewQuestion, 'id'>),
      isBuiltIn: false,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveCustomQuestion(params: {
  id?: string;
  ownerId: string;
  categoryId: string;
  prompt: string;
  difficulty: DifficultyLevel;
  expectedKeywords: string[];
  idealAnswerGuide: string;
}): Promise<InterviewQuestion> {
  if (isLocalId(params.ownerId) || isLocalId(params.id)) {
    return saveLocalQuestion(params);
  }
  const isEdit = Boolean(params.id);
  const id = params.id || makeSafeId('q');
  const path = `questions/${id}`;
  const cleanKeywords = params.expectedKeywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 12);

  try {
    if (isEdit) {
      await updateDoc(doc(db, 'questions', id), {
        categoryId: params.categoryId,
        prompt: params.prompt.trim().slice(0, 600),
        difficulty: params.difficulty,
        expectedKeywords: cleanKeywords,
        idealAnswerGuide: params.idealAnswerGuide.trim().slice(0, 1500),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'questions', id), {
        ownerId: params.ownerId,
        categoryId: params.categoryId,
        prompt: params.prompt.trim().slice(0, 600),
        difficulty: params.difficulty,
        expectedKeywords: cleanKeywords,
        idealAnswerGuide: params.idealAnswerGuide.trim().slice(0, 1500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return {
      id,
      ownerId: params.ownerId,
      categoryId: params.categoryId,
      prompt: params.prompt.trim().slice(0, 600),
      difficulty: params.difficulty,
      expectedKeywords: cleanKeywords,
      idealAnswerGuide: params.idealAnswerGuide.trim().slice(0, 1500),
      isBuiltIn: false,
    };
  } catch (err) {
    handleFirestoreError(err, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCustomQuestion(questionId: string): Promise<void> {
  if (isLocalId(questionId)) {
    deleteLocalQuestion(questionId);
    return;
  }
  const path = `questions/${questionId}`;
  try {
    await deleteDoc(doc(db, 'questions', questionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createInterviewSession(params: {
  userId: string;
  mode: InterviewMode;
  categoryId: string;
  categoryName: string;
  questionCount: number;
}): Promise<InterviewSession> {
  if (isLocalId(params.userId)) {
    return createLocalSession(params);
  }
  const id = makeSafeId('sess');
  const path = `sessions/${id}`;
  try {
    const payload = {
      userId: params.userId,
      mode: params.mode,
      categoryId: params.categoryId,
      categoryName: params.categoryName.slice(0, 80),
      status: 'in_progress' as const,
      questionCount: params.questionCount,
      overallScore: 0,
      relevanceScore: 0,
      clarityScore: 0,
      keywordCoverageScore: 0,
      avgWpm: 0,
      totalDurationSec: 0,
      summaryFeedback: '',
      topStrengths: [] as string[],
      topImprovements: [] as string[],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'sessions', id), payload);
    return {
      id,
      ...payload,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function saveSessionResponse(
  response: Omit<SessionResponse, 'id' | 'createdAt'>
): Promise<SessionResponse> {
  if (isLocalId(response.userId) || isLocalId(response.sessionId)) {
    return saveLocalSessionResponse(response);
  }
  const responseId = makeSafeId('resp');
  const path = `sessions/${response.sessionId}/responses/${responseId}`;
  try {
    const payload = {
      userId: response.userId,
      sessionId: response.sessionId,
      questionId: response.questionId,
      questionPrompt: response.questionPrompt.slice(0, 600),
      transcript: response.transcript.slice(0, 8000),
      transcriptSource: response.transcriptSource,
      speakingDurationSec: Math.max(0, Math.min(1800, Number(response.speakingDurationSec) || 0)),
      wordCount: Math.max(0, Math.min(5000, Math.round(response.wordCount) || 0)),
      wpm: Math.max(0, Math.min(400, Number(response.wpm) || 0)),
      pauseCount: Math.max(0, Math.min(500, Math.round(response.pauseCount) || 0)),
      avgSilenceRatio: Math.max(0, Math.min(100, Number(response.avgSilenceRatio) || 0)),
      voiceClarityLabel: response.voiceClarityLabel,
      voiceClarityDb: Math.max(-120, Math.min(20, Number(response.voiceClarityDb) || -100)),
      eyeContactRatio: Math.max(-1, Math.min(100, Number(response.eyeContactRatio) ?? -1)),
      eyeContactStatus: response.eyeContactStatus.slice(0, 80),
      facePresenceRatio: Math.max(-1, Math.min(100, Number(response.facePresenceRatio) ?? -1)),
      relevanceScore: Math.max(0, Math.min(100, Number(response.relevanceScore) || 0)),
      keywordScore: Math.max(0, Math.min(100, Number(response.keywordScore) || 0)),
      communicationScore: Math.max(0, Math.min(100, Number(response.communicationScore) || 0)),
      overallQuestionScore: Math.max(0, Math.min(100, Number(response.overallQuestionScore) || 0)),
      matchedKeywords: response.matchedKeywords.slice(0, 15),
      missingKeywords: response.missingKeywords.slice(0, 15),
      aiFeedback: response.aiFeedback.slice(0, 2500),
      strengths: response.strengths.slice(0, 6),
      improvements: response.improvements.slice(0, 6),
      measurementNotes: response.measurementNotes.slice(0, 600),
      recordingRef: response.recordingRef.slice(0, 300),
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'sessions', response.sessionId, 'responses', responseId), payload);
    return {
      id: responseId,
      ...payload,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function completeInterviewSession(params: {
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
}): Promise<void> {
  if (isLocalId(params.sessionId)) {
    completeLocalSession(params);
    return;
  }
  const path = `sessions/${params.sessionId}`;
  try {
    await updateDoc(doc(db, 'sessions', params.sessionId), {
      status: 'completed',
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
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function listUserSessions(uid: string): Promise<InterviewSession[]> {
  if (isLocalId(uid)) {
    return listLocalSessions(uid);
  }
  const path = 'sessions';
  try {
    const qSimple = query(collection(db, path), where('userId', '==', uid));
    const snap = await getDocs(qSimple);
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<InterviewSession, 'id'>),
    }));
    return list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function listSessionResponses(
  sessionId: string,
  uid: string
): Promise<SessionResponse[]> {
  if (isLocalId(uid) || isLocalId(sessionId)) {
    return listLocalSessionResponses(sessionId, uid);
  }
  const path = `sessions/${sessionId}/responses`;
  try {
    const q = query(collection(db, 'sessions', sessionId, 'responses'), where('userId', '==', uid));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<SessionResponse, 'id'>),
    }));
    return rows.sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function deleteInterviewSession(sessionId: string, uid: string): Promise<void> {
  if (isLocalId(uid) || isLocalId(sessionId)) {
    deleteLocalSession(sessionId, uid);
    return;
  }
  const path = `sessions/${sessionId}`;
  try {
    const responses = await listSessionResponses(sessionId, uid);
    for (const r of responses) {
      if (r.id) {
        await deleteDoc(doc(db, 'sessions', sessionId, 'responses', r.id));
      }
    }
    await deleteDoc(doc(db, 'sessions', sessionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function getMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export function formatFirestoreDate(ts: unknown): string {
  const ms = getMillis(ts);
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
