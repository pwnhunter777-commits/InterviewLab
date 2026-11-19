"""
Acoustic clarity, pause detection, and speech recognition module for local Python execution.
"""
from dataclasses import dataclass
import math
import wave
import numpy as np
import speech_recognition as sr


@dataclass
class AudioTelemetry:
    duration_sec: int
    pause_count: int
    avg_silence_ratio: float
    voice_clarity_label: str
    voice_clarity_db: float
    transcript: str
    transcript_source: str


def analyze_wav_audio(wav_path: str) -> AudioTelemetry:
    with wave.open(wav_path, "rb") as wf:
        sample_rate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

    duration_sec = max(1, int(round(n_frames / max(sample_rate, 1))))
    chunk_size = max(1, int(sample_rate * 0.1))  # 100ms chunks
    db_values = []
    silent_chunks = 0
    total_chunks = 0
    pause_count = 0
    consecutive_silent = 0
    speech_started = False

    for start in range(0, len(samples), chunk_size):
        chunk = samples[start : start + chunk_size]
        if len(chunk) == 0:
            continue
        total_chunks += 1
        rms = float(np.sqrt(np.mean(np.square(chunk))))
        db = 20.0 * math.log10(rms) if rms > 1e-4 else -80.0
        db_values.append(db)

        if db > -42.0:
            speech_started = True
            if consecutive_silent >= 12:  # >= 1.2s pause
                pause_count += 1
            consecutive_silent = 0
        else:
            silent_chunks += 1
            if speech_started:
                consecutive_silent += 1

    active_dbs = [d for d in db_values if d > -45.0]
    avg_db = float(np.mean(active_dbs if active_dbs else db_values)) if db_values else -80.0
    silence_ratio = round((silent_chunks / max(total_chunks, 1)) * 100.0, 2)

    if not active_dbs:
        clarity = "Quiet"
    elif avg_db >= -26.0:
        clarity = "Clear"
    elif avg_db >= -38.0:
        clarity = "Moderate"
    else:
        clarity = "Quiet"

    recognizer = sr.Recognizer()
    transcript = ""
    source = "unavailable"
    with sr.AudioFile(wav_path) as audio_src:
        audio_data = recognizer.record(audio_src)
        try:
            transcript = recognizer.recognize_google(audio_data)
            source = "speech_recognition"
        except sr.UnknownValueError:
            transcript = ""
        except sr.RequestError:
            transcript = ""

    return AudioTelemetry(
        duration_sec=duration_sec,
        pause_count=pause_count,
        avg_silence_ratio=silence_ratio,
        voice_clarity_label=clarity,
        voice_clarity_db=round(avg_db, 2),
        transcript=transcript,
        transcript_source=source,
    )
