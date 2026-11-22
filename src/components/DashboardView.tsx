import React from 'react';
import { ArrowRight, FileText, Play, Plus } from 'lucide-react';
import { InterviewSession, UserProfile } from '../types/interview';
import { formatFirestoreDate, getMillis } from '../services/firestoreService';

interface DashboardViewProps {
  profile: UserProfile;
  sessions: InterviewSession[];
  loading: boolean;
  onStartSetup: (defaultMode?: 'demo' | 'pro') => void;
  onOpenReport: (session: InterviewSession) => void;
  onOpenQuestionBank: () => void;
  onOpenHistory: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  sessions,
  loading,
  onStartSetup,
  onOpenReport,
  onOpenQuestionBank,
  onOpenHistory,
}) => {
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const totalSessions = completedSessions.length;
  const avgScore =
    totalSessions > 0
      ? Math.round(completedSessions.reduce((acc, s) => acc + s.overallScore, 0) / totalSessions)
      : 0;
  const pacedSessions = completedSessions.filter((s) => s.avgWpm > 0);
  const avgWpm =
    pacedSessions.length > 0
      ? Math.round(pacedSessions.reduce((acc, s) => acc + s.avgWpm, 0) / pacedSessions.length)
      : 0;
  const totalQuestionsAnswered = completedSessions.reduce((acc, s) => acc + s.questionCount, 0);

  // Recent 8 sessions chronological for trend chart
  const chartData = [...completedSessions].slice(0, 8).reverse();

  // Category averages grouped by categoryId
  const categoryMap = new Map<string, { name: string; sum: number; count: number }>();
  completedSessions.forEach((s) => {
    const existing = categoryMap.get(s.categoryId) || { name: s.categoryName, sum: 0, count: 0 };
    categoryMap.set(s.categoryId, {
      name: s.categoryName || existing.name,
      sum: existing.sum + s.overallScore,
      count: existing.count + 1,
    });
  });
  const categoryAverages = Array.from(categoryMap.entries()).map(([id, val]) => ({
    id,
    name: val.name,
    avg: Math.round(val.sum / val.count),
    count: val.count,
  }));

  return (
    <div className="space-y-8">
      {/* Welcome & Quick Mode Actions */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">
            {profile.experienceLevel} · Target: {profile.targetRole}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back, {profile.displayName.split(' ')[0]}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => onStartSetup('demo')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 text-slate-700" />
            Demo Mode (2 Qs)
          </button>
          <button
            onClick={() => onStartSetup('pro')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Pro Mode Interview
          </button>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Completed Sessions</p>
          <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-2">
            {loading ? '—' : totalSessions}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {completedSessions.filter((s) => s.mode === 'pro').length} Pro ·{' '}
            {completedSessions.filter((s) => s.mode === 'demo').length} Demo
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Average Overall Score</p>
          <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-2">
            {loading ? '—' : totalSessions > 0 ? `${avgScore}/100` : 'No data'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {avgScore >= 75 ? 'Strong readiness' : avgScore > 0 ? 'Building consistency' : 'Complete 1 session'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Avg Speaking Pace</p>
          <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-2">
            {loading ? '—' : avgWpm > 0 ? `${avgWpm} WPM` : 'No data'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Target conversational band: 120–160 WPM</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Questions Evaluated</p>
          <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-2">
            {loading ? '—' : totalQuestionsAnswered}
          </p>
          <button
            onClick={onOpenQuestionBank}
            className="text-xs font-medium text-blue-700 hover:underline mt-1 cursor-pointer"
          >
            Manage question bank
          </button>
        </div>
      </section>

      {/* Performance Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Score Trajectory</h2>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg text-center px-6">
              <p className="text-sm font-medium text-slate-700 mb-4">No completed sessions yet</p>
              <button
                onClick={() => onStartSetup('demo')}
                className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Start First Demo Interview
              </button>
            </div>
          ) : (
            <div className="h-56">
              <ScoreTrendSvg sessions={chartData} />
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Track Breakdown</h2>
            </div>
          </div>

          {categoryAverages.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg text-center px-6" />
          ) : (
            <div className="space-y-4">
              {categoryAverages.map((cat) => (
                <div key={cat.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-800 truncate pr-3">{cat.name}</span>
                    <span className="font-mono tabular-nums text-slate-600 shrink-0">
                      {cat.avg}% · {cat.count} {cat.count === 1 ? 'run' : 'runs'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        cat.avg >= 75
                          ? 'bg-emerald-600'
                          : cat.avg >= 55
                          ? 'bg-amber-600'
                          : 'bg-red-600'
                      }`}
                      style={{ width: `${Math.max(4, cat.avg)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Recent Sessions Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Interview Sessions</h2>
          </div>
          {sessions.length > 0 && (
            <button
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
            >
              View all history
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No interview reports recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-6">Category</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Questions</th>
                  <th className="py-2.5 px-4 text-right">Pace</th>
                  <th className="py-2.5 px-4 text-right">Score</th>
                  <th className="py-2.5 px-6 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {completedSessions.slice(0, 5).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-6 font-medium text-slate-900">{s.categoryName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {s.mode === 'pro' ? 'Pro Mode' : 'Demo Mode'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {formatFirestoreDate(s.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {s.questionCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {s.avgWpm} WPM
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      <span
                        className={
                          s.overallScore >= 75
                            ? 'text-emerald-700'
                            : s.overallScore >= 55
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }
                      >
                        {s.overallScore}/100
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <button
                        onClick={() => onOpenReport(s)}
                        className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Open Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

const formatShortChartDate = (ts: unknown): string => {
  const ms = getMillis(ts);
  if (!ms) return 'Now';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const ScoreTrendSvg: React.FC<{ sessions: InterviewSession[] }> = ({ sessions }) => {
  const width = 560;
  const height = 200;
  const padX = 40;
  const padY = 22;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const points = sessions.map((s, idx) => {
    const x = sessions.length === 1 ? padX + plotW / 2 : padX + (idx / (sessions.length - 1)) * plotW;
    const y = padY + plotH - (Math.max(0, Math.min(100, s.overallScore)) / 100) * plotH;
    return { x, y, score: s.overallScore, label: formatShortChartDate(s.createdAt) };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath =
    points.length > 1
      ? `M ${points[0].x},${padY + plotH} L ${points.map((p) => `${p.x},${p.y}`).join(' L ')} L ${
          points[points.length - 1].x
        },${padY + plotH} Z`
      : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" role="img" aria-label="Session score trend chart">
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = padY + plotH - (tick / 100) * plotH;
        return (
          <g key={tick}>
            <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text
              x={padX - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono"
            >
              {tick}
            </text>
          </g>
        );
      })}
      {areaPath && <path d={areaPath} fill="#1d4ed8" fillOpacity="0.08" />}
      {points.length > 1 && (
        <polyline fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinejoin="round" points={polyline} />
      )}
      {points.map((p, idx) => (
        <g key={idx}>
          <circle cx={p.x} cy={p.y} r="4.5" fill="#1d4ed8" stroke="#ffffff" strokeWidth="2" />
          <text
            x={p.x}
            y={height - 4}
            textAnchor="middle"
            className="fill-slate-500 text-[10px] font-mono"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
};
