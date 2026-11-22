import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  SkipForward,
  Square,
  VideoOff,
} from 'lucide-react';
import {
  EvaluationResult,
  InterviewCategory,
  InterviewMode,
  InterviewQuestion,
  InterviewSession,
  SessionResponse,
  TranscriptSource,
} from '../types/interview';
import {
  AudioTelemetryTracker,
  blobToBase64,
  buildMeasuredTelemetry,
  LiveAudioSnapshot,
  LiveVisualSnapshot,
  VisualCueTracker,
} from '../services/mediaAnalysis';
import {
  evaluateInterviewAnswer,
  synthesizeSessionSummary,
  transcribeAudioBlob,
} from '../services/interviewApi';
import {
  completeInterviewSession,
  createInterviewSession,
  saveSessionResponse,
} from '../services/firestoreService';

interface LiveInterviewViewProps {
  userId: string;
  mode: InterviewMode;
  category: InterviewCategory;
  questions: InterviewQuestion[];
  enableCamera: boolean;
  enableMic: boolean;
  enableWebSpeech?: boolean;
  onExit: () => void;
  onCompleted: (session: InterviewSession, responses: SessionResponse[]) => void;
}

type QuestionPhase = 'ready' | 'recording' | 'transcribing' | 'reviewed' | 'evaluating' | 'evaluated';

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const LiveInterviewView: React.FC<LiveInterviewViewProps> = ({
  userId,
  mode,
  category,
  questions,
  enableCamera,
  enableMic,
  enableWebSpeech = true,
  onExit,
  onCompleted,
}) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCreateFailed, setSessionCreateFailed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase>('ready');
  const [showHint, setShowHint] = useState(false);

  const timeLimitSec = mode === 'demo' ? 60 : Math.max(90, category.defaultTimePerQuestionSec || 120);
  const [secondsLeft, setSecondsLeft] = useState(timeLimitSec);
  const [elapsedRecordingSec, setElapsedRecordingSec] = useState(0);
  const [timerAnnouncement, setTimerAnnouncement] = useState('');

  const [transcript, setTranscript] = useState('');
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource>('unavailable');
  const [recordingRef, setRecordingRef] = useState('Audio not stored');

  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(enableCamera);

  const [audioSnap, setAudioSnap] = useState<LiveAudioSnapshot>({
    db: -80,
    rmsNormalized: 0,
    clarityLabel: enableMic ? 'Moderate' : 'Unavailable',
    isSpeaking: false,
    pauseCount: 0,
  });
  const [visualSnap, setVisualSnap] = useState<LiveVisualSnapshot>({
    status: enableCamera ? 'Initializing MediaPipe...' : 'Unavailable (Camera Off)',
    faceDetected: false,
    centeredGaze: false,
    eyeContactRatio: -1,
  });

  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [currentEval, setCurrentEval] = useState<EvaluationResult | null>(null);
  const [savedResponses, setSavedResponses] = useState<SessionResponse[]>([]);
  const [finalizing, setFinalizing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioTrackerRef = useRef<AudioTelemetryTracker>(new AudioTelemetryTracker());
  const visualTrackerRef = useRef<VisualCueTracker>(new VisualCueTracker());
  const speechRecRef = useRef<SpeechRecognitionInstance | null>(null);
  const liveSpeechCommittedRef = useRef<string>('');
  const liveSpeechTextRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
  const speechFatalErrorRef = useRef<boolean>(false);
  const hasRecordedCurrentRef = useRef<boolean>(false);
  const recordStartMsRef = useRef<number>(0);
  const lastAnnouncedMarkRef = useRef<number | null>(null);

  const lastAudioStatsRef = useRef<{
    pauseCount: number;
    avgSilenceRatio: number;
    voiceClarityLabel: 'Clear' | 'Moderate' | 'Quiet' | 'Unavailable';
    voiceClarityDb: number;
  }>({
    pauseCount: 0,
    avgSilenceRatio: 0,
    voiceClarityLabel: 'Unavailable',
    voiceClarityDb: -100,
  });

  const lastVisualStatsRef = useRef<{
    eyeContactRatio: number;
    eyeContactStatus: string;
    facePresenceRatio: number;
  }>({
    eyeContactRatio: -1,
    eyeContactStatus: enableCamera ? 'Unavailable' : 'Unavailable (Camera Off)',
    facePresenceRatio: -1,
  });

  const currentQuestion = questions[currentIndex];

  const resetQuestionTelemetry = (nextHasVideo: boolean, nextHasAudio: boolean) => {
    hasRecordedCurrentRef.current = false;
    liveSpeechCommittedRef.current = '';
    liveSpeechTextRef.current = '';
    lastAnnouncedMarkRef.current = null;
    setTimerAnnouncement('');
    setRecordingRef('Audio not stored');
    lastAudioStatsRef.current = {
      pauseCount: 0,
      avgSilenceRatio: 0,
      voiceClarityLabel: 'Unavailable',
      voiceClarityDb: -100,
    };
    lastVisualStatsRef.current = {
      eyeContactRatio: -1,
      eyeContactStatus: nextHasVideo ? 'Unavailable' : 'Unavailable (Camera Off)',
      facePresenceRatio: -1,
    };
    setAudioSnap({
      db: -80,
      rmsNormalized: 0,
      clarityLabel: nextHasAudio ? 'Moderate' : 'Unavailable',
      isSpeaking: false,
      pauseCount: 0,
    });
    setVisualSnap({
      status: nextHasVideo ? 'Standby' : 'Unavailable (Camera Off)',
      faceDetected: false,
      centeredGaze: false,
      eyeContactRatio: -1,
    });
  };

  // Dispose VisualCueTracker on component unmount
  useEffect(() => {
    const tracker = visualTrackerRef.current;
    return () => {
      tracker.dispose();
    };
  }, []);

  // Setup camera & microphone stream (with audio-only fallback when cam+mic fails)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHasAudioTrack(false);
      setHasVideoTrack(false);
      setMediaWarning(null);

      if (!enableCamera && !enableMic) {
        setMediaWarning('Camera and microphone are disabled. Enter or paste your answer in the transcript panel.');
        setVisualSnap({
          status: 'Unavailable (Camera Off)',
          faceDetected: false,
          centeredGaze: false,
          eyeContactRatio: -1,
        });
        return;
      }

      const attachStream = async (stream: MediaStream, warning: string | null) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const vTracks = stream.getVideoTracks().length > 0;
        const aTracks = stream.getAudioTracks().length > 0;
        setHasVideoTrack(vTracks);
        setHasAudioTrack(aTracks);
        setMediaWarning(warning);

        if (vTracks && videoRef.current) {
          videoRef.current.srcObject = stream;
          // Preload MediaPipe model as soon as camera stream is ready
          visualTrackerRef.current.init().catch(() => {
            // Tracked inside VisualCueTracker on start if init fails
          });
          setVisualSnap({
            status: 'Ready (MediaPipe)',
            faceDetected: false,
            centeredGaze: false,
            eyeContactRatio: -1,
          });
        } else {
          setVisualSnap({
            status: 'Unavailable (Camera Off)',
            faceDetected: false,
            centeredGaze: false,
            eyeContactRatio: -1,
          });
        }

        if (!aTracks) {
          setAudioSnap((prev) => ({ ...prev, clarityLabel: 'Unavailable' }));
        }
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: enableCamera ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
          audio: enableMic ? { echoCancellation: true, noiseSuppression: true } : false,
        });
        await attachStream(stream, null);
      } catch (err) {
        if (enableCamera && enableMic) {
          // Fallback to audio-only so user does not lose their microphone
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: { echoCancellation: true, noiseSuppression: true },
            });
            await attachStream(
              audioStream,
              'Camera unavailable or blocked. Continuing with microphone audio only — visual cues are disabled.'
            );
            return;
          } catch (audioErr) {
            const audioMsg = audioErr instanceof Error ? audioErr.message : 'Microphone unavailable.';
            if (!cancelled) {
              setHasAudioTrack(false);
              setHasVideoTrack(false);
              setVisualSnap({
                status: 'Unavailable (Camera Off)',
                faceDetected: false,
                centeredGaze: false,
                eyeContactRatio: -1,
              });
              setMediaWarning(`Camera and microphone unavailable (${audioMsg}). Type your response below.`);
            }
            return;
          }
        }

        const msg = err instanceof Error ? err.message : 'Device access unavailable.';
        if (!cancelled) {
          setHasAudioTrack(false);
          setHasVideoTrack(false);
          setVisualSnap({
            status: 'Unavailable (Camera Off)',
            faceDetected: false,
            centeredGaze: false,
            eyeContactRatio: -1,
          });
          setMediaWarning(`Media access unavailable (${msg}). You may continue using the text response box.`);
        }
      }
    })();

    return () => {
      cancelled = true;
      isRecordingRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      audioTrackerRef.current.stop();
      visualTrackerRef.current.stop(false);
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {
          // ignore
        }
        speechRecRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [enableCamera, enableMic]);

  // Countdown timer during recording + milestone announcements (30s and 10s only)
  useEffect(() => {
    if (phase !== 'recording') return;
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartMsRef.current) / 1000);
      setElapsedRecordingSec(elapsed);
      const remaining = Math.max(0, timeLimitSec - elapsed);
      setSecondsLeft(remaining);

      if ((remaining === 30 || remaining === 10) && lastAnnouncedMarkRef.current !== remaining) {
        lastAnnouncedMarkRef.current = remaining;
        setTimerAnnouncement(`${remaining} seconds remaining`);
      }

      if (remaining <= 0) {
        handleStopRecording();
      }
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLimitSec]);

  const stopBrowserSpeechPreview = () => {
    if (speechRecRef.current) {
      const activeRec = speechRecRef.current;
      speechRecRef.current = null;
      activeRec.onend = null;
      try {
        activeRec.stop();
      } catch {
        // ignore
      }
    }
  };

  const startBrowserSpeechPreview = () => {
    if (!enableWebSpeech) return;

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) return;

    speechFatalErrorRef.current = false;
    liveSpeechCommittedRef.current = '';
    liveSpeechTextRef.current = '';

    const spawnRecognition = () => {
      if (!isRecordingRef.current || speechFatalErrorRef.current) return;
      try {
        const rec = new SpeechRec() as SpeechRecognitionInstance;
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = navigator.language || 'en-US';

        let sessionFinalText = '';

        rec.onresult = (event) => {
          let finals = '';
          let interim = '';
          for (let i = 0; i < event.results.length; i++) {
            const chunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finals += chunk + ' ';
            } else {
              interim += chunk + ' ';
            }
          }
          sessionFinalText = finals.trim();
          const combined = [liveSpeechCommittedRef.current, sessionFinalText, interim.trim()]
            .filter(Boolean)
            .join(' ')
            .trim();
          liveSpeechTextRef.current = combined;
          setTranscript(combined);
          setTranscriptSource('web_speech');
        };

        rec.onerror = (ev) => {
          const errCode = ev?.error || '';
          if (
            errCode === 'not-allowed' ||
            errCode === 'service-not-allowed' ||
            errCode === 'audio-capture'
          ) {
            speechFatalErrorRef.current = true;
          }
        };

        rec.onend = () => {
          if (sessionFinalText) {
            liveSpeechCommittedRef.current = [liveSpeechCommittedRef.current, sessionFinalText]
              .filter(Boolean)
              .join(' ')
              .trim();
          }
          if (isRecordingRef.current && !speechFatalErrorRef.current) {
            spawnRecognition();
          }
        };

        rec.start();
        speechRecRef.current = rec;
      } catch {
        // Browser speech preview optional; Gemini transcription handles recorded audio
      }
    };

    spawnRecognition();
  };

  const handleStartRecording = async () => {
    const stream = streamRef.current;
    const hasAudio = Boolean(stream && stream.getAudioTracks().length > 0);
    const hasVideo = Boolean(stream && stream.getVideoTracks().length > 0);
    if (!hasAudio) return;

    setErrorBanner(null);
    setSessionCreateFailed(false);
    setCurrentEval(null);
    setTranscript('');
    setTranscriptSource('unavailable');
    setElapsedRecordingSec(0);
    setSecondsLeft(timeLimitSec);
    resetQuestionTelemetry(hasVideo, hasAudio);

    isRecordingRef.current = true;
    hasRecordedCurrentRef.current = true;
    recordStartMsRef.current = Date.now();
    audioChunksRef.current = [];
    setPhase('recording');

    if (stream && hasAudio) {
      audioTrackerRef.current.start(stream, (snap) => setAudioSnap(snap));
      startBrowserSpeechPreview();

      try {
        const audioOnlyStream = new MediaStream(stream.getAudioTracks());
        const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
        const recorder = preferredMime
          ? new MediaRecorder(audioOnlyStream, { mimeType: preferredMime })
          : new MediaRecorder(audioOnlyStream);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };
        recorder.start(500);
        recorderRef.current = recorder;
      } catch (err) {
        console.warn('MediaRecorder start warning:', err);
      }
    }

    if (videoRef.current && hasVideo) {
      visualTrackerRef.current.start(videoRef.current, true, (snap) => setVisualSnap(snap));
    } else {
      setVisualSnap({
        status: 'Unavailable (Camera Off)',
        faceDetected: false,
        centeredGaze: false,
        eyeContactRatio: -1,
      });
    }
  };

  const handleStopRecording = async () => {
    if (phase !== 'recording') return;
    isRecordingRef.current = false;
    setPhase('transcribing');
    setTimerAnnouncement('');

    const elapsedSec = Math.max(1, Math.round((Date.now() - recordStartMsRef.current) / 1000));
    setElapsedRecordingSec(elapsedSec);

    stopBrowserSpeechPreview();

    const audioStats = audioTrackerRef.current.stop();
    lastAudioStatsRef.current = audioStats;

    const hasVideo = Boolean(streamRef.current && streamRef.current.getVideoTracks().length > 0);
    const visualStats = visualTrackerRef.current.stop(hasVideo);
    lastVisualStatsRef.current = visualStats;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }

    setRecordingRef('Audio not stored');

    const chunks = audioChunksRef.current;
    if (chunks.length > 0) {
      const mimeType = recorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(chunks, { type: mimeType });

      try {
        const b64 = await blobToBase64(audioBlob);
        const res = await transcribeAudioBlob(b64, mimeType);
        if (res.transcript) {
          setTranscript(res.transcript);
          setTranscriptSource('gemini_audio');
        } else if (liveSpeechTextRef.current) {
          setTranscript(liveSpeechTextRef.current);
          setTranscriptSource('web_speech');
        } else {
          setTranscript('');
          setTranscriptSource('unavailable');
        }
      } catch (err) {
        console.warn('Gemini transcription fallback:', err);
        if (liveSpeechTextRef.current) {
          setTranscript(liveSpeechTextRef.current);
          setTranscriptSource('web_speech');
        } else {
          setErrorBanner(
            err instanceof Error
              ? `${err.message} You can type or paste your answer below to continue evaluation.`
              : 'Audio transcription failed. Enter your response manually below.'
          );
        }
      }
    }

    setPhase('reviewed');
  };

  const ensureSessionId = async (): Promise<string> => {
    if (sessionId) return sessionId;
    try {
      const created = await createInterviewSession({
        userId,
        mode,
        categoryId: category.id,
        categoryName: category.name,
        questionCount: questions.length,
      });
      setSessionId(created.id);
      setSessionCreateFailed(false);
      return created.id;
    } catch (err) {
      setSessionCreateFailed(true);
      throw err;
    }
  };

  const handleEvaluateAnswer = async () => {
    if (!currentQuestion) return;
    const prevPhase = phase;
    setErrorBanner(null);
    setSessionCreateFailed(false);
    setPhase('evaluating');

    // Typed or unrecorded answers must NOT get a synthetic duration or pace
    const measuredDurationSec =
      hasRecordedCurrentRef.current && elapsedRecordingSec > 0 ? elapsedRecordingSec : 0;

    const telemetry = buildMeasuredTelemetry({
      durationSec: measuredDurationSec,
      transcript,
      audioStats: lastAudioStatsRef.current,
      visualStats: lastVisualStatsRef.current,
    });

    try {
      const evaluation = await evaluateInterviewAnswer({
        questionPrompt: currentQuestion.prompt,
        categoryName: category.name,
        difficulty: currentQuestion.difficulty,
        expectedKeywords: currentQuestion.expectedKeywords,
        idealAnswerGuide: currentQuestion.idealAnswerGuide,
        transcript,
        mode,
        measuredTelemetry: telemetry,
      });

      const activeSessionId = await ensureSessionId();

      const saved = await saveSessionResponse({
        userId,
        sessionId: activeSessionId,
        questionId: currentQuestion.id,
        questionPrompt: currentQuestion.prompt,
        transcript: transcript.trim(),
        transcriptSource: transcript.trim()
          ? transcriptSource === 'unavailable'
            ? 'manual_text'
            : transcriptSource
          : 'unavailable',
        speakingDurationSec: telemetry.speakingDurationSec,
        wordCount: telemetry.wordCount,
        wpm: telemetry.wpm,
        pauseCount: telemetry.pauseCount,
        avgSilenceRatio: telemetry.avgSilenceRatio,
        voiceClarityLabel: telemetry.voiceClarityLabel,
        voiceClarityDb: telemetry.voiceClarityDb,
        eyeContactRatio: telemetry.eyeContactRatio,
        eyeContactStatus: telemetry.eyeContactStatus,
        facePresenceRatio: telemetry.facePresenceRatio,
        relevanceScore: evaluation.relevanceScore,
        keywordScore: evaluation.keywordScore,
        communicationScore: evaluation.communicationScore,
        overallQuestionScore: evaluation.overallQuestionScore,
        matchedKeywords: evaluation.matchedKeywords,
        missingKeywords: evaluation.missingKeywords,
        aiFeedback: evaluation.aiFeedback,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        measurementNotes: evaluation.measurementNotes,
        recordingRef: 'Audio not stored',
      });

      setCurrentEval(evaluation);
      setSavedResponses((prev) => [...prev, saved]);
      setPhase('evaluated');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Evaluation failed.');
      setPhase(prevPhase === 'ready' ? 'ready' : 'reviewed');
    }
  };

  const finalizeSession = async (activeSessionId: string, responsesToFinalize: SessionResponse[]) => {
    setFinalizing(true);
    setErrorBanner(null);

    try {
      const count = responsesToFinalize.length || 1;
      const avgOverall = Math.round(
        responsesToFinalize.reduce((a, r) => a + r.overallQuestionScore, 0) / count
      );
      const avgRelevance = Math.round(
        responsesToFinalize.reduce((a, r) => a + r.relevanceScore, 0) / count
      );
      const avgClarity = Math.round(
        responsesToFinalize.reduce((a, r) => a + r.communicationScore, 0) / count
      );
      const avgKeyword = Math.round(
        responsesToFinalize.reduce((a, r) => a + r.keywordScore, 0) / count
      );
      const wpmMeasured = responsesToFinalize.filter((r) => r.wpm > 0);
      const avgWpm =
        wpmMeasured.length > 0
          ? Math.round(wpmMeasured.reduce((a, r) => a + r.wpm, 0) / wpmMeasured.length)
          : 0;
      const totalDur = Math.round(
        responsesToFinalize.reduce((a, r) => a + r.speakingDurationSec, 0)
      );

      const summary = await synthesizeSessionSummary({
        categoryName: category.name,
        mode,
        questionSummaries: responsesToFinalize.map((r) => ({
          questionPrompt: r.questionPrompt,
          overallQuestionScore: r.overallQuestionScore,
          relevanceScore: r.relevanceScore,
          keywordScore: r.keywordScore,
          communicationScore: r.communicationScore,
          wpm: r.wpm,
          aiFeedback: r.aiFeedback,
        })),
      });

      await completeInterviewSession({
        sessionId: activeSessionId,
        questionCount: responsesToFinalize.length,
        overallScore: avgOverall,
        relevanceScore: avgRelevance,
        clarityScore: avgClarity,
        keywordCoverageScore: avgKeyword,
        avgWpm,
        totalDurationSec: totalDur,
        summaryFeedback: summary.summaryFeedback,
        topStrengths: summary.topStrengths,
        topImprovements: summary.topImprovements,
      });

      const finalSession: InterviewSession = {
        id: activeSessionId,
        userId,
        mode,
        categoryId: category.id,
        categoryName: category.name,
        status: 'completed',
        questionCount: responsesToFinalize.length,
        overallScore: avgOverall,
        relevanceScore: avgRelevance,
        clarityScore: avgClarity,
        keywordCoverageScore: avgKeyword,
        avgWpm,
        totalDurationSec: totalDur,
        summaryFeedback: summary.summaryFeedback,
        topStrengths: summary.topStrengths,
        topImprovements: summary.topImprovements,
      };

      onCompleted(finalSession, responsesToFinalize);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to finalize interview report.');
      setFinalizing(false);
    }
  };

  const advanceQuestion = () => {
    setCurrentIndex((i) => i + 1);
    setPhase('ready');
    setShowHint(false);
    setSecondsLeft(timeLimitSec);
    setElapsedRecordingSec(0);
    setTranscript('');
    setTranscriptSource('unavailable');
    setCurrentEval(null);
    setErrorBanner(null);
    setSessionCreateFailed(false);
    resetQuestionTelemetry(hasVideoTrack, hasAudioTrack);
  };

  const handleNextOrFinish = async () => {
    if (currentIndex + 1 < questions.length) {
      advanceQuestion();
      return;
    }

    if (!sessionId || savedResponses.length === 0) {
      setErrorBanner(
        'No evaluated answers have been saved to this session yet. Please evaluate an answer before viewing your report.'
      );
      return;
    }

    await finalizeSession(sessionId, savedResponses);
  };

  const handleSkipQuestion = async () => {
    if (phase === 'recording' || phase === 'transcribing' || phase === 'evaluating' || finalizing) {
      return;
    }
    if (currentIndex + 1 < questions.length) {
      advanceQuestion();
      return;
    }

    if (savedResponses.length > 0 && sessionId) {
      await finalizeSession(sessionId, savedResponses);
    } else {
      setErrorBanner(
        'All questions were skipped. Answer at least one question to generate a report, or click Exit Session.'
      );
    }
  };

  const handleConfirmExit = () => {
    const confirmed = window.confirm(
      'Exit this live interview session? Unfinished progress on the current question will not be saved.'
    );
    if (confirmed) {
      onExit();
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Screen-reader milestone announcements only (never fires every second) */}
      <span className="sr-only" aria-live="polite">
        {timerAnnouncement}
      </span>

      {/* Studio Top Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">
            {mode === 'pro' ? 'Pro Mode' : 'Demo Mode'} · {category.name}
          </p>
          <h1 className="text-base font-bold text-slate-900">
            Question {currentIndex + 1} of {questions.length}
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <Clock className={`w-4 h-4 ${secondsLeft <= 15 && phase === 'recording' ? 'text-red-600' : 'text-slate-500'}`} />
            <span
              className={`text-lg font-semibold ${
                secondsLeft <= 15 && phase === 'recording' ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {formatTimer(secondsLeft)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleConfirmExit}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Exit Session
          </button>
        </div>
      </div>

      {/* Question Stepper Progress */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${questions.length}, minmax(0, 1fr))` }}>
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className={`h-1.5 rounded-full transition-colors ${
              idx < currentIndex
                ? 'bg-emerald-600'
                : idx === currentIndex
                ? 'bg-blue-700'
                : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      {mediaWarning && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          <span>{mediaWarning}</span>
        </div>
      )}

      {errorBanner && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
            <span>{errorBanner}</span>
          </div>
          {sessionCreateFailed && (
            <button
              type="button"
              onClick={handleEvaluateAnswer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interviewer Question + Transcript + Immediate Evaluation */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Interview Question</p>
                <p className="text-xs text-slate-500">
                  {currentQuestion.difficulty} · {timeLimitSec}s target
                </p>
              </div>

              {mode === 'demo' && (
                <button
                  type="button"
                  onClick={() => setShowHint((h) => !h)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {showHint ? 'Hide Keywords Hint' : 'Show Keywords Hint'}
                </button>
              )}
            </div>

            <h2 className="text-lg font-semibold text-slate-900 leading-snug">
              {currentQuestion.prompt}
            </h2>

            {showHint && mode === 'demo' && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Key concepts to address: </span>
                {currentQuestion.expectedKeywords.join(', ')}
              </div>
            )}
          </div>

          {/* Transcript Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Captured Response Transcript</h3>
                <p className="text-xs text-slate-500">
                  Source:{' '}
                  {transcriptSource === 'gemini_audio'
                    ? 'Gemini Audio Transcription'
                    : transcriptSource === 'web_speech'
                    ? 'Live Browser Speech Preview'
                    : transcriptSource === 'manual_text'
                    ? 'Manual Candidate Entry'
                    : 'Waiting for response'}
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {transcript.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>

            <textarea
              aria-label="Captured response transcript"
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                if (transcriptSource === 'unavailable') {
                  setTranscriptSource('manual_text');
                }
              }}
              disabled={phase === 'recording' || phase === 'transcribing' || phase === 'evaluating' || phase === 'evaluated'}
              rows={6}
              placeholder={
                phase === 'recording'
                  ? 'Listening... Gemini will transcribe your full audio cleanly when you stop recording.'
                  : 'Click Start Recording to speak your answer, or type/edit your response here if microphone access is unavailable.'
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none disabled:opacity-80"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {phase === 'ready' && (
                <div className="flex flex-wrap items-center gap-3 w-full justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleStartRecording}
                      disabled={!hasAudioTrack}
                      title={!hasAudioTrack ? 'Microphone unavailable — type your answer instead' : undefined}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      Start Recording
                    </button>
                    {transcript.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={handleEvaluateAnswer}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        Evaluate Typed Answer
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSkipQuestion}
                    disabled={finalizing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    Skip question
                  </button>
                </div>
              )}

              {phase === 'recording' && (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                  Stop &amp; Transcribe
                </button>
              )}

              {phase === 'transcribing' && (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                  Transcribing recorded audio with Gemini...
                </div>
              )}

              {phase === 'reviewed' && (
                <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleEvaluateAnswer}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Evaluate &amp; Save Answer
                    </button>
                    <button
                      type="button"
                      onClick={handleStartRecording}
                      disabled={!hasAudioTrack}
                      title={!hasAudioTrack ? 'Microphone unavailable — type your answer instead' : undefined}
                      className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Re-record Answer
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSkipQuestion}
                    disabled={finalizing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    Skip question
                  </button>
                </div>
              )}

              {phase === 'evaluating' && (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                  Analyzing relevance, keywords, and measured telemetry...
                </div>
              )}

              {phase === 'evaluated' && (
                <button
                  type="button"
                  onClick={handleNextOrFinish}
                  disabled={finalizing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  {finalizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Performance Report...
                    </>
                  ) : currentIndex + 1 < questions.length ? (
                    <>
                      Next Question
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Finish &amp; View Report
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Immediate Question Evaluation Card */}
          {currentEval && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Question Evaluation</h3>
                  <p className="text-xs text-slate-500">{currentEval.measurementNotes}</p>
                </div>
                <span className="text-2xl font-bold font-mono tabular-nums text-blue-700">
                  {currentEval.overallQuestionScore}/100
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center py-2 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">Relevance</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {currentEval.relevanceScore}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Keywords</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {currentEval.keywordScore}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Communication</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {currentEval.communicationScore}%
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">{currentEval.aiFeedback}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                <div>
                  <p className="font-semibold text-emerald-800 mb-1.5">Strengths</p>
                  <ul className="space-y-1 text-slate-600 list-disc pl-4">
                    {currentEval.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-amber-800 mb-1.5">Improvements</p>
                  <ul className="space-y-1 text-slate-600 list-disc pl-4">
                    {currentEval.improvements.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Webcam Preview & Real-Time Acoustic / Visual Telemetry */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Webcam &amp; Sensor Monitor</h3>
              {phase === 'recording' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                  Recording · {formatTimer(elapsedRecordingSec)}
                </span>
              ) : (
                <span className="text-xs text-slate-500">Standby</span>
              )}
            </div>

            <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative flex items-center justify-center">
              {hasVideoTrack ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center text-slate-400 px-4">
                  <VideoOff className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-xs">Camera off — Visual telemetry unavailable</p>
                </div>
              )}
            </div>

            {/* Live Audio Meter */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  {hasAudioTrack ? <Mic className="w-3.5 h-3.5 text-blue-700" /> : <MicOff className="w-3.5 h-3.5 text-slate-400" />}
                  Voice Level
                </span>
                <span className="font-mono tabular-nums text-slate-600">
                  {hasAudioTrack ? `${audioSnap.clarityLabel} (${audioSnap.db} dBFS)` : 'Unavailable'}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-all duration-100"
                  style={{ width: `${phase === 'recording' && hasAudioTrack ? audioSnap.rmsNormalized : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Detected Pauses (&gt;1.2s)</span>
                <span className="font-mono tabular-nums text-slate-800">{audioSnap.pauseCount}</span>
              </div>
            </div>

            {/* Live MediaPipe Visual Cues */}
            <div className="space-y-2 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <Eye className="w-3.5 h-3.5 text-blue-700" />
                  Face Position
                </span>
                <span className="font-mono tabular-nums text-slate-600">
                  {visualSnap.eyeContactRatio >= 0 ? `${visualSnap.eyeContactRatio}% centered` : 'Unavailable'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Measurement Source</span>
                <span className="text-slate-700">{visualSnap.status}</span>
              </div>
              {hasVideoTrack && phase === 'recording' && visualSnap.status === 'Measured (MediaPipe)' && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Frame Status</span>
                  <span className={visualSnap.centeredGaze ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                    {visualSnap.faceDetected
                      ? visualSnap.centeredGaze
                        ? 'Face Centered'
                        : 'Center Face in Frame'
                      : 'Face Not Centered'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
