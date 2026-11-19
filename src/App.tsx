import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  BookOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Play,
  Plus,
  User as UserIcon,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase';
import { BUILT_IN_CATEGORIES, BUILT_IN_QUESTIONS } from './data/defaultCatalog';
import {
  deleteInterviewSession,
  getUserProfile,
  listCustomCategories,
  listCustomQuestions,
  listSessionResponses,
  listUserSessions,
  saveUserProfile,
} from './services/firestoreService';
import {
  ExperienceLevel,
  InterviewCategory,
  InterviewMode,
  InterviewQuestion,
  InterviewSession,
  SessionResponse,
  UserProfile,
} from './types/interview';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { ProfileSetupView } from './components/ProfileSetupView';
import { DashboardView } from './components/DashboardView';
import { InterviewSetupView } from './components/InterviewSetupView';
import { LiveInterviewView } from './components/LiveInterviewView';
import { ResultsReportView } from './components/ResultsReportView';
import { QuestionBankView } from './components/QuestionBankView';
import { HistoryView } from './components/HistoryView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';

type AppRoute = 'dashboard' | 'setup' | 'live' | 'report' | 'questions' | 'history' | 'profile';

interface ActiveSetupConfig {
  mode: InterviewMode;
  category: InterviewCategory;
  selectedQuestions: InterviewQuestion[];
  enableCamera: boolean;
  enableMic: boolean;
}

export default function App() {
  return (
    <ErrorBoundary>
      <InterviewLabApp />
    </ErrorBoundary>
  );
}

function InterviewLabApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [route, setRoute] = useState<AppRoute>('dashboard');
  const [setupInitialMode, setSetupInitialMode] = useState<InterviewMode>('demo');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [customCategories, setCustomCategories] = useState<InterviewCategory[]>([]);
  const [customQuestions, setCustomQuestions] = useState<InterviewQuestion[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [liveConfig, setLiveConfig] = useState<ActiveSetupConfig | null>(null);
  const [reportSession, setReportSession] = useState<InterviewSession | null>(null);
  const [reportResponses, setReportResponses] = useState<SessionResponse[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const allCategories = [...BUILT_IN_CATEGORIES, ...customCategories];
  const allQuestions = [...BUILT_IN_QUESTIONS, ...customQuestions];

  const loadWorkspaceData = useCallback(async (uid: string) => {
    setDataLoading(true);
    setWorkspaceError(null);
    try {
      const [cats, qs, sess] = await Promise.all([
        listCustomCategories(uid),
        listCustomQuestions(uid),
        listUserSessions(uid),
      ]);
      setCustomCategories(cats);
      setCustomQuestions(qs);
      setSessions(sess);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load workspace data.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setProfileLoading(true);
        try {
          const existing = await getUserProfile(nextUser.uid);
          setProfile(existing);
          await loadWorkspaceData(nextUser.uid);
        } catch (err) {
          setWorkspaceError(err instanceof Error ? err.message : 'Failed to load user profile.');
        } finally {
          setProfileLoading(false);
        }
      } else {
        setProfile(null);
        setCustomCategories([]);
        setCustomQuestions([]);
        setSessions([]);
        setRoute('dashboard');
      }
    });
    return () => unsub();
  }, [loadWorkspaceData]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleSaveProfile = async (data: {
    displayName: string;
    targetRole: string;
    experienceLevel: ExperienceLevel;
  }) => {
    if (!user) return;
    const saved = await saveUserProfile({
      uid: user.uid,
      displayName: data.displayName,
      email: user.email || '',
      targetRole: data.targetRole,
      experienceLevel: data.experienceLevel,
      isNew: !profile,
    });
    setProfile(saved);
    if (route === 'profile') {
      setRoute('dashboard');
    }
  };

  const handleOpenReport = async (session: InterviewSession) => {
    if (!user) return;
    setReportSession(session);
    setReportResponses([]);
    setReportLoading(true);
    setRoute('report');
    try {
      const resps = await listSessionResponses(session.id, user.uid);
      setReportResponses(resps);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load report details.');
    } finally {
      setReportLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!user) return;
    await deleteInterviewSession(sessionId, user.uid);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleLaunchSetup = (defaultMode: InterviewMode = 'demo') => {
    setSetupInitialMode(defaultMode);
    setRoute('setup');
    setMobileMenuOpen(false);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Initializing InterviewLab...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onGoogleSignIn={handleGoogleSignIn}
        signingIn={signingIn}
        authError={authError}
      />
    );
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading candidate workspace...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display">
            InterviewLab
          </span>
          <button
            onClick={handleSignOut}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Sign Out
          </button>
        </header>
        <ProfileSetupView
          initialName={user.displayName || ''}
          email={user.email || ''}
          onSave={handleSaveProfile}
        />
      </div>
    );
  }

  const routeLabel: Record<AppRoute, string> = {
    dashboard: 'Workspace / Overview',
    setup: 'Workspace / Interview Setup',
    live: 'Studio / Live Mock Interview',
    report: 'Reports / Session Performance',
    questions: 'Curriculum / Question Bank',
    history: 'Reports / Interview History',
    profile: 'Account / Candidate Profile',
  };

  const navItems: { id: AppRoute; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'setup', label: 'Start Interview', icon: <Play className="w-4 h-4" /> },
    { id: 'questions', label: 'Question Bank', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile', icon: <UserIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (248px) */}
      <aside className="hidden lg:flex lg:w-[248px] lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 print:hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <button
            onClick={() => setRoute('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap cursor-pointer"
          >
            InterviewLab
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active =
              route === item.id ||
              (item.id === 'setup' && route === 'live') ||
              (item.id === 'history' && route === 'report');
            return (
              <button
                key={item.id}
                onClick={() => setRoute(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="px-2">
            <p className="text-sm font-semibold text-slate-900 truncate">{profile.displayName}</p>
            <p className="text-xs text-slate-500 truncate">{profile.targetRole}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/40 flex">
          <div className="w-64 bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-base font-bold font-display">InterviewLab</span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setRoute(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                    route === item.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[248px] flex flex-col min-w-0">
        {/* Workspace Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-xs font-medium text-slate-500 truncate">
              {routeLabel[route]}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            {route !== 'live' && (
              <button
                onClick={() => handleLaunchSetup('pro')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Interview
              </button>
            )}
          </div>
        </header>
        <OfflineIndicator />

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
          {workspaceError && (
            <div className="mb-6 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-4">
              <span>{workspaceError}</span>
              <button onClick={() => setWorkspaceError(null)} className="font-semibold hover:underline cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {route === 'dashboard' && (
            <DashboardView
              profile={profile}
              sessions={sessions}
              loading={dataLoading}
              onStartSetup={handleLaunchSetup}
              onOpenReport={handleOpenReport}
              onOpenQuestionBank={() => setRoute('questions')}
              onOpenHistory={() => setRoute('history')}
            />
          )}

          {route === 'setup' && (
            <InterviewSetupView
              categories={allCategories}
              questions={allQuestions}
              initialMode={setupInitialMode}
              onBack={() => setRoute('dashboard')}
              onStartSession={(config) => {
                setLiveConfig(config);
                setRoute('live');
              }}
            />
          )}

          {route === 'live' && liveConfig && (
            <LiveInterviewView
              userId={user.uid}
              mode={liveConfig.mode}
              category={liveConfig.category}
              questions={liveConfig.selectedQuestions}
              enableCamera={liveConfig.enableCamera}
              enableMic={liveConfig.enableMic}
              onExit={() => {
                setLiveConfig(null);
                setRoute('dashboard');
                loadWorkspaceData(user.uid);
              }}
              onCompleted={(session, resps) => {
                setLiveConfig(null);
                setReportSession(session);
                setReportResponses(resps);
                setReportLoading(false);
                setRoute('report');
                loadWorkspaceData(user.uid);
              }}
            />
          )}

          {route === 'report' && reportSession && (
            <ResultsReportView
              session={reportSession}
              responses={reportResponses}
              loading={reportLoading}
              onBack={() => setRoute('dashboard')}
              onStartNew={() => handleLaunchSetup('pro')}
            />
          )}

          {route === 'questions' && (
            <QuestionBankView
              userId={user.uid}
              categories={allCategories}
              questions={allQuestions}
              onRefreshCatalog={() => loadWorkspaceData(user.uid)}
            />
          )}

          {route === 'history' && (
            <HistoryView
              sessions={sessions}
              loading={dataLoading}
              onOpenReport={handleOpenReport}
              onDeleteSession={handleDeleteSession}
              onStartNew={() => handleLaunchSetup('demo')}
            />
          )}

          {route === 'profile' && (
            <ProfileSetupView
              initialName={profile.displayName}
              email={profile.email}
              existingProfile={profile}
              onSave={handleSaveProfile}
              onCancel={() => setRoute('dashboard')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
