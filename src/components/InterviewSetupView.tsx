import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Mic, Play, VideoOff, Volume2 } from 'lucide-react';
import { InterviewCategory, InterviewMode, InterviewQuestion } from '../types/interview';

interface InterviewSetupViewProps {
  categories: InterviewCategory[];
  questions: InterviewQuestion[];
  initialMode: InterviewMode;
  onBack: () => void;
  onStartSession: (config: {
    mode: InterviewMode;
    category: InterviewCategory;
    selectedQuestions: InterviewQuestion[];
    enableCamera: boolean;
    enableMic: boolean;
  }) => void;
}

export const InterviewSetupView: React.FC<InterviewSetupViewProps> = ({
  categories,
  questions,
  initialMode,
  onBack,
  onStartSession,
}) => {
  const [mode, setMode] = useState<InterviewMode>(initialMode);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id || '');
  const [enableCamera, setEnableCamera] = useState(true);
  const [enableMic, setEnableMic] = useState(true);
  const [hwStatus, setHwStatus] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle');
  const [hwMessage, setHwMessage] = useState<string>('Run a quick device check or start directly.');
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);

  const selectedCategory =
    categories.find((c) => c.id === selectedCategoryId) || categories[0];

  const categoryQuestions = questions.filter((q) => q.categoryId === selectedCategory?.id);
  const targetCount = mode === 'demo' ? 2 : 5;
  const sessionQuestions = categoryQuestions.slice(0, Math.min(targetCount, categoryQuestions.length));

  const stopTestStream = () => {
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopTestStream();
    };
  }, []);

  const handleTestDevices = async () => {
    stopTestStream();
    if (!enableCamera && !enableMic) {
      setHwStatus('ready');
      setHwMessage('Text-only mode selected. Camera and microphone checks skipped.');
      return;
    }

    setHwStatus('testing');
    setHwMessage('Requesting browser camera and microphone permissions...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: enableCamera ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
        audio: enableMic ? { echoCancellation: true, noiseSuppression: true } : false,
      });
      testStreamRef.current = stream;
      if (enableCamera && previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
      const hasV = stream.getVideoTracks().length > 0;
      const hasA = stream.getAudioTracks().length > 0;
      setHwStatus('ready');
      setHwMessage(
        `Verified: ${hasA ? 'Microphone active' : 'Mic off'} · ${hasV ? 'Webcam feed active' : 'Camera off'}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Permission denied or device unavailable.';
      setHwStatus('error');
      setHwMessage(
        `Device check note: ${msg}. You can toggle Camera/Mic off or use manual text response fallback in the interview room.`
      );
    }
  };

  const handleLaunch = () => {
    stopTestStream();
    if (!selectedCategory || sessionQuestions.length === 0) return;
    onStartSession({
      mode,
      category: selectedCategory,
      selectedQuestions: sessionQuestions,
      enableCamera,
      enableMic,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => {
            stopTestStream();
            onBack();
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Mode & Category Selection */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h1 className="text-xl font-bold text-slate-900 mb-1">Configure Mock Interview</h1>
            <p className="text-sm text-slate-600 mb-6">
              Select your interview depth, topic category, and media capture preferences.
            </p>

            {/* Mode Segmented Selection */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                1. Interview Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('demo')}
                  className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    mode === 'demo'
                      ? 'border-blue-700 bg-blue-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">Demo Mode</span>
                    <span className="text-xs font-mono text-slate-600">2 Questions</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5">
                    60s per question · Ideal for quick warm-ups with optional keyword hints.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('pro')}
                  className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    mode === 'pro'
                      ? 'border-blue-700 bg-blue-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">Pro Mode</span>
                    <span className="text-xs font-mono text-blue-700">Up to 5 Questions</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5">
                    120s per question · Full realistic session without hints and deep synthesis report.
                  </p>
                </button>
              </div>
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                2. Interview Category
              </label>
              <div className="space-y-2.5">
                {categories.map((cat) => {
                  const qCount = questions.filter((q) => q.categoryId === cat.id).length;
                  const active = cat.id === selectedCategory?.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-700 bg-blue-50/50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-semibold text-slate-900">{cat.name}</span>
                        <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
                          {qCount} {qCount === 1 ? 'question' : 'questions'} · {cat.difficultyFocus}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{cat.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Hardware Check & Launch */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">3. Webcam &amp; Microphone Check</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                MediaPipe face/gaze cues and audio clarity run locally in your browser.
              </p>
            </div>

            <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative flex items-center justify-center">
              {enableCamera ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center text-slate-400 px-4">
                  <VideoOff className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-xs">Camera disabled — visual cues will be marked Unavailable</p>
                </div>
              )}
              {hwStatus === 'idle' && enableCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/75 text-slate-200 px-4 text-center">
                  <Camera className="w-7 h-7 mb-2 text-slate-300" />
                  <p className="text-xs">Click &ldquo;Test Camera &amp; Mic&rdquo; below to preview</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableCamera}
                  onChange={(e) => {
                    setEnableCamera(e.target.checked);
                    stopTestStream();
                    setHwStatus('idle');
                  }}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <Camera className="w-4 h-4 text-slate-500" />
                Enable Webcam
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableMic}
                  onChange={(e) => {
                    setEnableMic(e.target.checked);
                    stopTestStream();
                    setHwStatus('idle');
                  }}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <Mic className="w-4 h-4 text-slate-500" />
                Enable Microphone
              </label>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestDevices}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Test Camera &amp; Mic
              </button>
              {hwStatus === 'ready' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified
                </span>
              )}
            </div>

            <p
              className={`text-xs leading-relaxed p-3 rounded-lg border ${
                hwStatus === 'error'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {hwMessage}
            </p>

            <div className="pt-2 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Selected Session</span>
                <span className="font-mono font-medium text-slate-900">
                  {mode === 'pro' ? 'Pro' : 'Demo'} · {sessionQuestions.length} Questions
                </span>
              </div>

              {sessionQuestions.length === 0 ? (
                <p className="text-xs text-red-700">
                  This category has no questions yet. Add a question in Question Bank first.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunch}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  Begin Live Interview
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
