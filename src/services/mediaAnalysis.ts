import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { MeasuredTelemetry, VoiceClarityLabel } from '../types/interview';

export interface LiveAudioSnapshot {
  db: number;
  rmsNormalized: number; // 0..100 for meter bar
  clarityLabel: VoiceClarityLabel;
  isSpeaking: boolean;
  pauseCount: number;
}

export class AudioTelemetryTracker {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId: number | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;

  private dbSamples: number[] = [];
  private activeSpeechSamples = 0;
  private silentSamples = 0;
  private hasStartedSpeaking = false;
  private pauseStartedAt: number | null = null;
  private pauseCount = 0;
  private lastSampleTime = 0;

  start(stream: MediaStream, onUpdate?: (snap: LiveAudioSnapshot) => void): boolean {
    this.reset();
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      return false;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      const buffer = new ArrayBuffer(this.analyser.fftSize);
      this.dataArray = new Uint8Array(buffer);

      const sampleLoop = () => {
        if (!this.analyser || !this.dataArray) return;
        const now = performance.now();
        if (now - this.lastSampleTime >= 100) {
          this.lastSampleTime = now;
          this.analyser.getByteTimeDomainData(this.dataArray);
          let sumSq = 0;
          for (let i = 0; i < this.dataArray.length; i++) {
            const norm = (this.dataArray[i] - 128) / 128;
            sumSq += norm * norm;
          }
          const rms = Math.sqrt(sumSq / this.dataArray.length);
          const db = rms > 0.0001 ? Math.max(-80, Math.min(0, 20 * Math.log10(rms))) : -80;
          const isSpeaking = db > -42;

          this.dbSamples.push(db);
          if (isSpeaking) {
            this.activeSpeechSamples += 1;
            this.hasStartedSpeaking = true;
            if (this.pauseStartedAt !== null) {
              const pauseDuration = now - this.pauseStartedAt;
              if (pauseDuration >= 1200) {
                this.pauseCount += 1;
              }
              this.pauseStartedAt = null;
            }
          } else {
            this.silentSamples += 1;
            if (this.hasStartedSpeaking && this.pauseStartedAt === null) {
              this.pauseStartedAt = now;
            }
          }

          const rmsNormalized = Math.max(0, Math.min(100, Math.round(((db + 65) / 55) * 100)));
          const avgDb = this.getAverageSpeechDb();
          const clarityLabel = classifyVoiceClarity(avgDb, this.activeSpeechSamples > 0);

          if (onUpdate) {
            onUpdate({
              db: Math.round(db),
              rmsNormalized,
              clarityLabel,
              isSpeaking,
              pauseCount: this.pauseCount,
            });
          }
        }
        this.rafId = requestAnimationFrame(sampleLoop);
      };

      this.rafId = requestAnimationFrame(sampleLoop);
      return true;
    } catch (err) {
      console.warn('Web Audio API analyzer unavailable:', err);
      return false;
    }
  }

  stop(): {
    pauseCount: number;
    avgSilenceRatio: number;
    voiceClarityLabel: VoiceClarityLabel;
    voiceClarityDb: number;
  } {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    const total = this.activeSpeechSamples + this.silentSamples;
    if (total === 0) {
      return {
        pauseCount: 0,
        avgSilenceRatio: 0,
        voiceClarityLabel: 'Unavailable',
        voiceClarityDb: -100,
      };
    }

    const avgSilenceRatio = Math.round((this.silentSamples / total) * 100);
    const avgSpeechDb = this.getAverageSpeechDb();
    const voiceClarityLabel = classifyVoiceClarity(avgSpeechDb, this.activeSpeechSamples > 0);

    return {
      pauseCount: this.pauseCount,
      avgSilenceRatio,
      voiceClarityLabel,
      voiceClarityDb: Math.round(avgSpeechDb),
    };
  }

  private getAverageSpeechDb(): number {
    const active = this.dbSamples.filter((d) => d > -45);
    const source = active.length > 0 ? active : this.dbSamples;
    if (source.length === 0) return -80;
    const sum = source.reduce((acc, v) => acc + v, 0);
    return sum / source.length;
  }

  private reset() {
    this.dbSamples = [];
    this.activeSpeechSamples = 0;
    this.silentSamples = 0;
    this.hasStartedSpeaking = false;
    this.pauseStartedAt = null;
    this.pauseCount = 0;
    this.lastSampleTime = 0;
  }
}

function classifyVoiceClarity(avgDb: number, hasSpeech: boolean): VoiceClarityLabel {
  if (!hasSpeech) return 'Quiet';
  if (avgDb >= -26) return 'Clear';
  if (avgDb >= -38) return 'Moderate';
  return 'Quiet';
}

export interface LiveVisualSnapshot {
  status: string;
  faceDetected: boolean;
  centeredGaze: boolean;
  eyeContactRatio: number; // -1 if unavailable
}

export class VisualCueTracker {
  private landmarker: FaceLandmarker | null = null;
  private timerId: number | null = null;
  private runId = 0;
  private initPromise: Promise<boolean> | null = null;
  private totalFrames = 0;
  private faceFrames = 0;
  private centeredGazeFrames = 0;
  private modelReady = false;
  private modelFailed = false;

  async init(): Promise<boolean> {
    if (this.modelReady && this.landmarker) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const origConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        const first = typeof args[0] === 'string' ? args[0] : '';
        if (first.includes('INFO: Created TensorFlow Lite XNNPACK delegate for CPU')) {
          console.info(...args);
          return;
        }
        origConsoleError(...args);
      };

      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe-wasm/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        this.modelReady = true;
        this.modelFailed = false;
        return true;
      } catch (err) {
        console.warn('MediaPipe FaceLandmarker initialization unavailable, falling back transparently:', err);
        this.modelReady = false;
        this.modelFailed = true;
        return false;
      } finally {
        console.error = origConsoleError;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async start(videoEl: HTMLVideoElement, hasVideoTrack: boolean, onUpdate?: (snap: LiveVisualSnapshot) => void) {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    const myRun = ++this.runId;
    this.totalFrames = 0;
    this.faceFrames = 0;
    this.centeredGazeFrames = 0;

    if (!hasVideoTrack) {
      onUpdate?.({
        status: 'Unavailable (Camera Off)',
        faceDetected: false,
        centeredGaze: false,
        eyeContactRatio: -1,
      });
      return;
    }

    const ready = await this.init();
    if (myRun !== this.runId) return;
    if (!ready || !this.landmarker) {
      onUpdate?.({
        status: 'Unavailable (Model Fallback)',
        faceDetected: false,
        centeredGaze: false,
        eyeContactRatio: -1,
      });
      return;
    }

    this.timerId = window.setInterval(() => {
      if (myRun !== this.runId || !this.landmarker || videoEl.readyState < 2 || videoEl.videoWidth === 0) return;
      try {
        const prevErr = console.error;
        console.error = (...args: unknown[]) => {
          const first = typeof args[0] === 'string' ? args[0] : '';
          if (first.includes('INFO: Created TensorFlow Lite XNNPACK delegate for CPU')) {
            console.info(...args);
            return;
          }
          prevErr(...args);
        };
        let result;
        try {
          result = this.landmarker.detectForVideo(videoEl, performance.now());
        } finally {
          console.error = prevErr;
        }
        this.totalFrames += 1;
        const landmarks = result.faceLandmarks?.[0];
        if (!landmarks || landmarks.length < 400) {
          const ratio = this.totalFrames > 0 ? Math.round((this.centeredGazeFrames / this.totalFrames) * 100) : -1;
          onUpdate?.({
            status: 'Measured (MediaPipe)',
            faceDetected: false,
            centeredGaze: false,
            eyeContactRatio: ratio,
          });
          return;
        }

        this.faceFrames += 1;
        // Nose tip (1), left cheek/eye outer (33), right cheek/eye outer (263), forehead (10), chin (152)
        const nose = landmarks[1];
        const leftEyeOuter = landmarks[33];
        const rightEyeOuter = landmarks[263];
        const forehead = landmarks[10];
        const chin = landmarks[152];

        const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
        const faceWidth = Math.abs(rightEyeOuter.x - leftEyeOuter.x) || 0.2;
        const horizontalYawOffset = Math.abs(nose.x - eyeMidX) / faceWidth;

        const faceMidY = (forehead.y + chin.y) / 2;
        const faceHeight = Math.abs(chin.y - forehead.y) || 0.3;
        const verticalPitchOffset = Math.abs(nose.y - faceMidY) / faceHeight;

        // Centered camera-facing gaze heuristic based on MediaPipe facial landmarks
        const centeredGaze =
          horizontalYawOffset < 0.18 &&
          verticalPitchOffset < 0.22 &&
          nose.x > 0.2 &&
          nose.x < 0.8 &&
          nose.y > 0.18 &&
          nose.y < 0.82;

        if (centeredGaze) {
          this.centeredGazeFrames += 1;
        }

        const ratio = Math.round((this.centeredGazeFrames / this.totalFrames) * 100);
        onUpdate?.({
          status: 'Measured (MediaPipe)',
          faceDetected: true,
          centeredGaze,
          eyeContactRatio: ratio,
        });
      } catch {
        // Ignore single-frame detection errors during stream transitions
      }
    }, 300);
  }

  stop(hasVideoTrack: boolean): {
    eyeContactRatio: number;
    eyeContactStatus: string;
    facePresenceRatio: number;
  } {
    this.runId += 1;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (!hasVideoTrack) {
      return {
        eyeContactRatio: -1,
        eyeContactStatus: 'Unavailable (Camera Off)',
        facePresenceRatio: -1,
      };
    }

    if (this.modelFailed || this.totalFrames === 0) {
      return {
        eyeContactRatio: -1,
        eyeContactStatus: 'Unavailable (Model Fallback)',
        facePresenceRatio: -1,
      };
    }

    return {
      eyeContactRatio: Math.round((this.centeredGazeFrames / this.totalFrames) * 100),
      eyeContactStatus: 'Measured (MediaPipe)',
      facePresenceRatio: Math.round((this.faceFrames / this.totalFrames) * 100),
    };
  }

  dispose(): void {
    this.runId += 1;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        // ignore close errors during unmount
      }
      this.landmarker = null;
    }
    this.modelReady = false;
    this.initPromise = null;
  }
}

export function buildMeasuredTelemetry(params: {
  durationSec: number;
  transcript: string;
  audioStats: {
    pauseCount: number;
    avgSilenceRatio: number;
    voiceClarityLabel: VoiceClarityLabel;
    voiceClarityDb: number;
  };
  visualStats: {
    eyeContactRatio: number;
    eyeContactStatus: string;
    facePresenceRatio: number;
  };
}): MeasuredTelemetry {
  const words = params.transcript
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const wordCount = words.length;
  const recordedDuration = Math.max(0, Math.round(params.durationSec));
  const wpm =
    recordedDuration > 0 && wordCount > 0
      ? Math.min(350, Math.round((wordCount / recordedDuration) * 60))
      : 0;

  return {
    speakingDurationSec: recordedDuration,
    wordCount,
    wpm,
    pauseCount: params.audioStats.pauseCount,
    avgSilenceRatio: params.audioStats.avgSilenceRatio,
    voiceClarityLabel: params.audioStats.voiceClarityLabel,
    voiceClarityDb: params.audioStats.voiceClarityDb,
    eyeContactRatio: params.visualStats.eyeContactRatio,
    eyeContactStatus: params.visualStats.eyeContactStatus,
    facePresenceRatio: params.visualStats.facePresenceRatio,
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio blob.'));
    reader.readAsDataURL(blob);
  });
}
