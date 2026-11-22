import React, { useState } from 'react';
import { FileText, Search, Trash2 } from 'lucide-react';
import { InterviewMode, InterviewSession } from '../types/interview';
import { formatFirestoreDate } from '../services/firestoreService';

interface HistoryViewProps {
  sessions: InterviewSession[];
  loading: boolean;
  onOpenReport: (session: InterviewSession) => void;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onStartNew: () => void;
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}m ${String(rem).padStart(2, '0')}s`;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sessions,
  loading,
  onOpenReport,
  onDeleteSession,
  onStartNew,
}) => {
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | InterviewMode>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = sessions.filter((s) => {
    if (modeFilter !== 'all' && s.mode !== modeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!s.categoryName.toLowerCase().includes(q) && !s.summaryFeedback.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this interview session and all saved responses? This action cannot be undone.')) {
      return;
    }
    setDeletingId(id);
    setDeleteError(null);
    try {
      await onDeleteSession(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete session.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Interview History</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Review past sessions, compare Demo vs Pro progress, and reopen performance reports.
          </p>
        </div>
        <button
          onClick={onStartNew}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          New Interview
        </button>
      </div>

      {deleteError && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-4">
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="font-semibold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Filter interview sessions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by category or summary..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          {(['all', 'demo', 'pro'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModeFilter(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                modeFilter === m
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m === 'all' ? 'All Modes' : m === 'demo' ? 'Demo Mode' : 'Pro Mode'}
            </button>
          ))}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No interview sessions yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Start a Demo or Pro session to build your evaluation history.
            </p>
            <button
              onClick={onStartNew}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              Start Mock Interview
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No interview sessions match your filter</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Try clearing your search text or switching back to All Modes.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setModeFilter('all');
              }}
              className="px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-6">Category</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Questions</th>
                  <th className="py-2.5 px-4 text-right">Duration</th>
                  <th className="py-2.5 px-4 text-right">Score</th>
                  <th className="py-2.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-6 font-medium text-slate-900">{s.categoryName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {s.mode === 'pro' ? 'Pro' : 'Demo'}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className={s.status === 'completed' ? 'text-emerald-700 font-medium' : 'text-amber-700'}>
                        {s.status === 'completed' ? 'Completed' : 'Incomplete'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {formatFirestoreDate(s.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {s.questionCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatDuration(s.totalDurationSec)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      <span
                        className={
                          s.overallScore >= 75
                            ? 'text-emerald-700'
                            : s.overallScore >= 55
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }
                      >
                        {s.status === 'completed' ? `${s.overallScore}/100` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="inline-flex items-center gap-3">
                        {s.status === 'completed' ? (
                          <button
                            type="button"
                            onClick={() => onOpenReport(s)}
                            className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            View Report
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">No report</span>
                        )}
                        <button
                          type="button"
                          disabled={deletingId === s.id}
                          onClick={() => handleDelete(s.id)}
                          title="Delete session"
                          aria-label={`Delete ${s.categoryName} session`}
                          className="text-slate-400 hover:text-red-700 disabled:opacity-40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
