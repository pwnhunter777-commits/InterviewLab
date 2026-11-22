import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  AlertCircle,
  BookOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Play,
  Plus,
  RotateCcw,
  User as UserIcon,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase';
import { BUILT_IN_CATEGORIES, BUILT_IN_QUESTIONS } from './data/defaultCatalog';
import {
  clearActiveLocalSession,
  getActiveLocalSession,
  LocalUserSession,
  setActiveLocalSession,
} from './services/localWorkspaceService';
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
  enableWebSpeech: boolean;
}

const ALLOW_LOCAL_LOGIN = import.meta.env.VITE_ALLOW_LOCAL_LOGIN === 'true';

const VALID_TOP_ROUTES: ReadonlySet<AppRoute> = new Set([
  'dashboard',
  'setup',
  'questions',
  'history',
  'profile',
]);

function parseHashRoute(hashStr: string): AppRoute {
  const cleaned = hashStr.replace(/^#\/?/, '').trim().toLowerCase() as AppRoute;
  if (VALID_TOP_ROUTES.has(cleaned)) {
    return cleaned;
  }
  return 'dashboard';
}

function hashForRoute(nextRoute: AppRoute): string {
  const hashable: AppRoute = VALID_TOP_ROUTES.has(nextRoute) ? nextRoute : 'dashboard';
  return `#/${hashable}`;
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
  const [localUser, setLocalUser] = useState<LocalUserSession | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const activeUid = user?.uid || (ALLOW_LOCAL_LOGIN ? localUser?.uid : '') || '';
  const activeEmail = user?.email || (ALLOW_LOCAL_LOGIN && localUser ? 'Local candidate session' : '');
  const activeInitialName =
    user?.displayName || (ALLOW_LOCAL_LOGIN ? localUser?.displayName : '') || '';

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute(window.location.hash));
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

  const loadProfileAndWorkspace = useCallback(
    async (uid: string) => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const existing = await getUserProfile(uid);
        setProfile(existing);
        await loadWorkspaceData(uid);
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : 'Failed to load user profile.');
      } finally {
        setProfileLoading(false);
      }
    },
    [loadWorkspaceData]
  );

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  // Keep hash synchronized with top-level routes
  useEffect(() => {
    if (VALID_TOP_ROUTES.has(route)) {
      const targetHash = hashForRoute(route);
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash);
      }
    }
  }, [route]);

  // Listen for browser back/forward hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const targetRoute = parseHashRoute(window.location.hash);
      if (route === 'live' && targetRoute !== 'live') {
        const confirmed = window.confirm(
          'Leave the active interview session? Any unsaved progress on the current question will be lost.'
        );
        if (!confirmed) {
          window.history.replaceState(null, '', hashForRoute('setup'));
          return;
        }
        setLiveConfig(null);
      }
      setRoute(targetRoute);
      setMobileMenuOpen(false);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [route]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        clearActiveLocalSession();
        setLocalUser(null);
        setAuthReady(true);
        await loadProfileAndWorkspace(nextUser.uid);
      } else {
        const savedLocal = ALLOW_LOCAL_LOGIN ? getActiveLocalSession() : null;
        if (savedLocal) {
          setLocalUser(savedLocal);
          setAuthReady(true);
          await loadProfileAndWorkspace(savedLocal.uid);
        } else {
          if (!ALLOW_LOCAL_LOGIN) {
            clearActiveLocalSession();
          }
          setLocalUser(null);
          setAuthReady(true);
          setProfile(null);
          setProfileError(null);
          setWorkspaceError(null);
          setCustomCategories([]);
          setCustomQuestions([]);
          setSessions([]);
          setLiveConfig(null);
          setReportSession(null);
          setReportResponses([]);
          setRoute('dashboard');
        }
      }
    });
    return () => unsub();
  }, [loadProfileAndWorkspace]);

  const navigateTo = (nextRoute: AppRoute) => {
    if (route === 'live' && nextRoute !== 'live') {
      const confirmed = window.confirm(
        'Leave the active interview session? Any unsaved progress on the current question will be lost.'
      );
      if (!confirmed) return;
      setLiveConfig(null);
      if (activeUid) {
        loadWorkspaceData(activeUid);
      }
    }
    setRoute(nextRoute);
    setMobileMenuOpen(false);
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/unauthorized-domain') {
        const host = window.location.hostname;
        setAuthError(
          `Domain "${host}" is not authorized in Firebase Auth yet. Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains (Project: gen-lang-client-0331851904)${
            ALLOW_LOCAL_LOGIN ? ', or sign in with your name above.' : '.'
          }`
        );
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          `Sign-in popup was blocked by the browser. Allow popups${
            ALLOW_LOCAL_LOGIN ? ' or sign in with your name above.' : ' and try again.'
          }`
        );
      } else {
        setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleNameSignIn = async (name: string) => {
    if (!ALLOW_LOCAL_LOGIN) {
      setAuthError('Local name sign-in is disabled in this environment.');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      const session = setActiveLocalSession(name);
      setLocalUser(session);
      await loadProfileAndWorkspace(session.uid);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Name Sign-In failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    clearActiveLocalSession();
    setLocalUser(null);
    setProfile(null);
    setProfileError(null);
    setWorkspaceError(null);
    setCustomCategories([]);
    setCustomQuestions([]);
    setSessions([]);
    setLiveConfig(null);
    setReportSession(null);
    setReportResponses([]);
    setRoute('dashboard');
    if (user) {
      await signOut(auth);
    }
  };

  const handleSaveProfile = async (data: {
    displayName: string;
    targetRole: string;
    experienceLevel: ExperienceLevel;
  }) => {
    if (!activeUid) return;
    const saved = await saveUserProfile({
      uid: activeUid,
      displayName: data.displayName,
      email: activeEmail || 'local@interviewlab.app',
      targetRole: data.targetRole,
      experienceLevel: data.experienceLevel,
      isNew: !profile,
    });
    setProfile(saved);
    if (route === 'profile') {
      navigateTo('dashboard');
    }
  };

  const handleOpenReport = async (session: InterviewSession) => {
    if (!activeUid) return;
    setReportSession(session);
    setReportResponses([]);
    setReportLoading(true);
    navigateTo('report');
    try {
      const resps = await listSessionResponses(session.id, activeUid);
      setReportResponses(resps);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load report details.');
    } finally {
      setReportLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!activeUid) return;
    await deleteInterviewSession(sessionId, activeUid);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleLaunchSetup = (defaultMode: InterviewMode = 'demo') => {
    if (route === 'live') {
      const confirmed = window.confirm(
        'Leave the active interview session? Any unsaved progress on the current question will be lost.'
      );
      if (!confirmed) return;
      setLiveConfig(null);
    }
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

  if (!activeUid) {
    return (
      <AuthScreen
        onGoogleSignIn={handleGoogleSignIn}
        onNameSignIn={handleNameSignIn}
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

  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-base font-bold text-slate-900">Unable to Load Profile</h1>
              <p className="text-xs text-slate-600 mt-1">{profileError}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => loadProfileAndWorkspace(activeUid)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
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
          initialName={activeInitialName}
          email={activeEmail}
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

  const isNavItemActive = (itemId: AppRoute) =>
    route === itemId ||
    (itemId === 'setup' && route === 'live') ||
    (itemId === 'history' && route === 'report');

  const isLocalDemoActive = ALLOW_LOCAL_LOGIN && Boolean(localUser && !user);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (248px) */}
      <aside className="hidden lg:flex lg:w-[248px] lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 print:hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap cursor-pointer"
          >
            InterviewLab
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = isNavItemActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
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
            type="button"
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
              <button
                type="button"
                onClick={() => navigateTo('dashboard')}
                className="text-base font-bold font-display text-slate-900 cursor-pointer"
              >
                InterviewLab
              </button>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const active = isNavItemActive(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer ${
                      active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
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
              type="button"
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
                type="button"
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
        {isLocalDemoActive && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-900 font-medium print:hidden">
            Local demo mode - data stays on this device
          </div>
        )}

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
          {workspaceError && (
            <div className="mb-6 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-4">
              <span>{workspaceError}</span>
              <button
                type="button"
                onClick={() => setWorkspaceError(null)}
                className="font-semibold hover:underline cursor-pointer"
              >
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
              onOpenQuestionBank={() => navigateTo('questions')}
              onOpenHistory={() => navigateTo('history')}
            />
          )}

          {route === 'setup' && (
            <InterviewSetupView
              categories={allCategories}
              questions={allQuestions}
              initialMode={setupInitialMode}
              onBack={() => navigateTo('dashboard')}
              onStartSession={(config) => {
                setLiveConfig(config);
                setRoute('live');
              }}
            />
          )}

          {route === 'live' && liveConfig && (
            <LiveInterviewView
              userId={activeUid}
              mode={liveConfig.mode}
              category={liveConfig.category}
              questions={liveConfig.selectedQuestions}
              enableCamera={liveConfig.enableCamera}
              enableMic={liveConfig.enableMic}
              enableWebSpeech={liveConfig.enableWebSpeech}
              onExit={() => {
                setLiveConfig(null);
                setRoute('dashboard');
                loadWorkspaceData(activeUid);
              }}
              onCompleted={(session, resps) => {
                setLiveConfig(null);
                setReportSession(session);
                setReportResponses(resps);
                setReportLoading(false);
                setRoute('report');
                loadWorkspaceData(activeUid);
              }}
            />
          )}

          {route === 'report' && reportSession && (
            <ResultsReportView
              session={reportSession}
              responses={reportResponses}
              loading={reportLoading}
              onBack={() => navigateTo('dashboard')}
              onStartNew={() => handleLaunchSetup('pro')}
            />
          )}

          {route === 'questions' && (
            <QuestionBankView
              userId={activeUid}
              categories={allCategories}
              questions={allQuestions}
              onRefreshCatalog={() => loadWorkspaceData(activeUid)}
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
              onCancel={() => navigateTo('dashboard')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
