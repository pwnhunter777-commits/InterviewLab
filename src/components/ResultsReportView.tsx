import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Download, Printer } from 'lucide-react';
import { InterviewSession, SessionResponse, TranscriptSource } from '../types/interview';
import { formatFirestoreDate } from '../services/firestoreService';

const TRANSCRIPT_SOURCE_LABELS: Record<TranscriptSource, string> = {
  gemini_audio: 'Gemini audio',
  web_speech: 'Browser speech',
  manual_text: 'Typed',
  unavailable: 'None',
};

interface ResultsReportViewProps {
  session: InterviewSession;
  responses: SessionResponse[];
  loading: boolean;
  onBack: () => void;
  onStartNew: () => void;
}

export const ResultsReportView: React.FC<ResultsReportViewProps> = ({
  session,
  responses,
  loading,
  onBack,
  onStartNew,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(responses[0]?.id || responses[0]?.questionId || null);

  const handleDownloadJson = () => {
    const payload = {
      session,
      responses,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${session.id}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
          <button
            onClick={onStartNew}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
          >
            New Interview
          </button>
        </div>
      </div>

      {/* Executive Summary Banner */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs text-slate-500 mb-1">
              {session.mode === 'pro' ? 'Pro Mode' : 'Demo Mode'} · {session.categoryName} ·{' '}
              {formatFirestoreDate(session.createdAt)}
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Interview Performance Report</h1>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold font-mono tabular-nums text-blue-700">
              {session.overallScore}
            </span>
            <span className="text-sm font-mono text-slate-500">/ 100 Overall</span>
          </div>
        </div>

        {/* 5-Metric Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 py-6 border-b border-slate-200">
          <div>
            <p className="text-xs text-slate-500">Relevance</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {session.relevanceScore}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Keyword Match</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {session.keywordCoverageScore}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Communication</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {session.clarityScore}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Avg Speaking Pace</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {session.avgWpm} WPM
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Speaking Time</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {session.totalDurationSec}s
            </p>
          </div>
        </div>

        {/* Executive Feedback & Strengths/Improvements */}
        <div className="pt-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Executive AI Assessment</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              {session.summaryFeedback || 'Session evaluation completed.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <h3 className="text-xs font-semibold text-emerald-800 mb-2">Key Strengths Observed</h3>
              <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">
                {session.topStrengths.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <h3 className="text-xs font-semibold text-amber-800 mb-2">Actionable Next Improvements</h3>
              <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">
                {session.topImprovements.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Per-Question Score Chart */}
      {responses.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Question-by-Question Score Breakdown</h2>
          <p className="text-xs text-slate-500 mb-5">
            Comparing overall score, content relevance, and keyword coverage across questions
          </p>
          <div className="space-y-4">
            {responses.map((resp, idx) => (
              <div key={resp.id || idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 truncate pr-4">
                    Q{idx + 1}: {resp.questionPrompt}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                    {resp.overallQuestionScore}/100
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      resp.overallQuestionScore >= 75
                        ? 'bg-emerald-600'
                        : resp.overallQuestionScore >= 55
                        ? 'bg-blue-700'
                        : 'bg-amber-600'
                    }`}
                    style={{ width: `${Math.max(3, resp.overallQuestionScore)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detailed Question Audit List */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Detailed Question &amp; Telemetry Audit</h2>
          <p className="text-xs text-slate-500">
            Explicitly separates directly measured audio/video signals from AI rubric evaluations
          </p>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : responses.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No individual question records were found for this session.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {responses.map((resp, idx) => {
              const key = resp.id || resp.questionId || String(idx);
              const isOpen = expandedId === key;
              return (
                <div key={key} className="p-6">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : key)}
                    className="w-full flex items-start justify-between gap-4 text-left cursor-pointer"
                  >
                    <div>
                      <p className="text-xs text-slate-500 mb-1">
                        Question {idx + 1} · {resp.speakingDurationSec}s · {resp.wpm} WPM · Voice:{' '}
                        {resp.voiceClarityLabel} · {resp.eyeContactStatus}
                      </p>
                      <h3 className="text-sm font-semibold text-slate-900">{resp.questionPrompt}</h3>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                        {resp.overallQuestionScore}/100
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-500 print:hidden" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500 print:hidden" />
                      )}
                    </div>
                  </button>

                  <div
                    className={`${
                      isOpen ? 'block' : 'hidden print:block'
                    } mt-5 pt-5 border-t border-slate-200 space-y-5 text-sm`}
                  >
                    {/* Measured Telemetry Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs">
                      <div>
                        <p className="text-slate-500">Speaking Duration</p>
                        <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                          {resp.speakingDurationSec}s ({resp.wordCount} words)
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Pace &amp; Pauses</p>
                        <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                          {resp.wpm} WPM · {resp.pauseCount} pauses
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Voice Level (Measured)</p>
                        <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                          {resp.voiceClarityLabel} ({resp.voiceClarityDb} dBFS)
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Face Position (Visual Cue)</p>
                        <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                          {resp.eyeContactRatio >= 0
                            ? `${resp.eyeContactRatio}% face centered`
                            : 'Unavailable'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">
                        Captured Transcript ({TRANSCRIPT_SOURCE_LABELS[resp.transcriptSource] || 'None'})
                      </p>
                      <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3.5 leading-relaxed">
                        {resp.transcript || 'No transcript recorded.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="font-semibold text-slate-800 mb-1">Matched Keywords</p>
                        <p className="text-emerald-800">
                          {resp.matchedKeywords.length > 0 ? resp.matchedKeywords.join(' · ') : 'None matched'}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 mb-1">Missed Keywords</p>
                        <p className="text-slate-600">
                          {resp.missingKeywords.length > 0 ? resp.missingKeywords.join(' · ') : 'All key concepts covered'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-800 mb-1">AI Evaluation &amp; Feedback</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{resp.aiFeedback}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        Transparency Note: {resp.measurementNotes} · Audio not stored
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
