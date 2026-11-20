import React, { useState } from 'react';
import { ArrowRight, User } from 'lucide-react';
import { OfflineIndicator, PWAInstallButton } from './PWAControls';

interface AuthScreenProps {
  onGoogleSignIn: () => Promise<void>;
  onNameSignIn: (name: string) => Promise<void>;
  signingIn: boolean;
  authError: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onGoogleSignIn,
  onNameSignIn,
  signingIn,
  authError,
}) => {
  const [candidateName, setCandidateName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = candidateName.trim();
    if (trimmed.length < 2) {
      setNameError('Please enter your name (at least 2 characters).');
      return;
    }
    setNameError(null);
    await onNameSignIn(trimmed);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
            InterviewLab
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
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
              Sign in with your name or Google to continue.
            </p>
          </div>

          {(authError || nameError) && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {nameError || authError}
            </div>
          )}

          <form onSubmit={handleNameSubmit} className="space-y-3">
            <div>
              <label htmlFor="candidate-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                Your Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="candidate-name"
                  type="text"
                  required
                  maxLength={100}
                  value={candidateName}
                  onChange={(e) => {
                    setCandidateName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Enter your name"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={signingIn}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <span>Sign in with Name</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200" />
            <span className="shrink mx-3 text-xs uppercase tracking-wider text-slate-400">or</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={signingIn}
            className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
};

