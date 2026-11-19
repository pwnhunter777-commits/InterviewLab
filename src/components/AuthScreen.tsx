import React from 'react';
import { ArrowRight } from 'lucide-react';
import { OfflineIndicator, PWAInstallButton } from './PWAControls';

interface AuthScreenProps {
  onGoogleSignIn: () => Promise<void>;
  signingIn: boolean;
  authError: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onGoogleSignIn,
  signingIn,
  authError,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
            InterviewLab
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            <button
              onClick={onGoogleSignIn}
              disabled={signingIn}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {signingIn ? 'Connecting...' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>
      <OfflineIndicator />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Mock Interview System
            </h1>
            <p className="text-sm text-slate-600 mt-1.5">
              Sign in with Google to continue.
            </p>
          </div>

          {authError && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {authError}
            </div>
          )}

          <button
            onClick={onGoogleSignIn}
            disabled={signingIn}
            className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
};
