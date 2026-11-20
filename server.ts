import "dotenv/config";
import { createServer as createHttpServer } from "http";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Add it in Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/interview/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body ?? {};
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return res.status(400).json({ error: "Missing valid audioBase64 payload." });
      }
      if (audioBase64.length > 20_000_000) {
        return res.status(413).json({ error: "Audio recording exceeds 15MB limit." });
      }

      const safeMime =
        typeof mimeType === "string" && mimeType.startsWith("audio/")
          ? mimeType.split(";")[0]
          : "audio/webm";

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: audioBase64,
              },
            },
            {
              text: "Transcribe the spoken interview response accurately verbatim. Output ONLY the transcribed words with natural punctuation, and nothing else. If the recording contains only silence or no intelligible speech, output exactly: [NO_SPEECH_DETECTED]",
            },
          ],
        },
      });

      const rawText = (response.text ?? "").trim();
      const noSpeech = !rawText || rawText === "[NO_SPEECH_DETECTED]";
      res.json({
        transcript: noSpeech ? "" : rawText,
        noSpeechDetected: noSpeech,
      });
    } catch (err: unknown) {
      console.error("Transcription error:", err);
      const message = err instanceof Error ? err.message : "Audio transcription failed.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/interview/evaluate", async (req, res) => {
    try {
      const {
        questionPrompt,
        categoryName,
        difficulty,
        expectedKeywords,
        idealAnswerGuide,
        transcript,
        mode,
        measuredTelemetry,
      } = req.body ?? {};

      if (!questionPrompt || typeof questionPrompt !== "string") {
        return res.status(400).json({ error: "Missing questionPrompt." });
      }

      const cleanTranscript = typeof transcript === "string" ? transcript.trim() : "";
      const keywords: string[] = Array.isArray(expectedKeywords)
        ? expectedKeywords.filter((k): k is string => typeof k === "string").slice(0, 12)
        : [];

      const telemetry = {
        speakingDurationSec: Number(measuredTelemetry?.speakingDurationSec ?? 0),
        wordCount: Number(measuredTelemetry?.wordCount ?? 0),
        wpm: Number(measuredTelemetry?.wpm ?? 0),
        pauseCount: Number(measuredTelemetry?.pauseCount ?? 0),
        avgSilenceRatio: Number(measuredTelemetry?.avgSilenceRatio ?? 0),
        voiceClarityLabel: String(measuredTelemetry?.voiceClarityLabel ?? "Unavailable"),
        voiceClarityDb: Number(measuredTelemetry?.voiceClarityDb ?? -100),
        eyeContactRatio: Number(measuredTelemetry?.eyeContactRatio ?? -1),
        eyeContactStatus: String(measuredTelemetry?.eyeContactStatus ?? "Unavailable (Camera Off)"),
        facePresenceRatio: Number(measuredTelemetry?.facePresenceRatio ?? -1),
      };

      if (!cleanTranscript) {
        return res.json({
          relevanceScore: 0,
          keywordScore: 0,
          communicationScore: 0,
          overallQuestionScore: 0,
          matchedKeywords: [],
          missingKeywords: keywords,
          aiFeedback:
            "No spoken or written response was captured for this question. Ensure your microphone is unmuted or enter a text response if audio capture is unavailable.",
          strengths: ["Attempted question timer workflow"],
          improvements: [
            "Verify microphone permissions before starting recording",
            "Speak clearly for at least 15-30 seconds covering core concepts",
          ],
          measurementNotes: `Measured duration: ${telemetry.speakingDurationSec}s; Transcript: Unavailable/Empty; Visual cues: ${telemetry.eyeContactStatus}. No scores fabricated.`,
        });
      }

      const ai = getGeminiClient();
      const evaluationPrompt = `
You are an objective technical and behavioral interview evaluator.
Evaluate ONLY based on the candidate's actual transcript and the measured telemetry below. Do NOT fabricate metrics or claim visual/audio observations that contradict the telemetry.

Interview Mode: ${mode === "pro" ? "Pro Mode (Comprehensive Evaluation)" : "Demo Mode (Quick Practice)"}
Category: ${categoryName || "General"} (${difficulty || "Medium"})
Question: ${questionPrompt}
Ideal Answer Reference: ${idealAnswerGuide || "Clear structured explanation with concrete examples."}
Expected Keywords: ${keywords.length > 0 ? keywords.join(", ") : "None specified"}

Candidate Transcript:
"""
${cleanTranscript.slice(0, 8000)}
"""

Measured Acoustic & Visual Telemetry (ground truth from sensors):
- Speaking Duration: ${telemetry.speakingDurationSec} seconds
- Word Count: ${telemetry.wordCount} words
- Speaking Pace: ${telemetry.wpm} words/min
- Detected Pauses (>1.2s silence): ${telemetry.pauseCount}
- Silence Ratio: ${telemetry.avgSilenceRatio}%
- Voice Clarity Indicator: ${telemetry.voiceClarityLabel} (${telemetry.voiceClarityDb} dBFS)
- Eye-Contact Visual Cue: ${telemetry.eyeContactStatus}${telemetry.eyeContactRatio >= 0 ? ` (${telemetry.eyeContactRatio}% centered gaze)` : ""}
- Face Presence Ratio: ${telemetry.facePresenceRatio >= 0 ? `${telemetry.facePresenceRatio}%` : "Unavailable"}

Scoring Rules:
1. relevanceScore (0-100): How directly and accurately the transcript answers the question.
2. keywordScore (0-100): Percentage/depth of expectedKeywords addressed (either verbatim or clear conceptual match). Only list keywords in matchedKeywords if genuinely present in the transcript.
3. communicationScore (0-100): Structure, conciseness, and delivery based strictly on the transcript and measured WPM/pauses/clarity (optimal pace ~115-165 WPM; penalize incoherent fragments or extreme brevity).
4. overallQuestionScore (0-100): Weighted composite (45% relevance, 30% keywords, 25% communication).
5. measurementNotes: Explicitly distinguish what was directly measured (duration, audio level, MediaPipe eye contact if active) vs. AI-evaluated (relevance, structure) vs. unavailable.
`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: evaluationPrompt,
        config: {
          systemInstruction:
            "You are a rigorous, fair interview coach for students and software job seekers. Never hallucinate candidate statements or sensor measurements.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              relevanceScore: { type: Type.NUMBER },
              keywordScore: { type: Type.NUMBER },
              communicationScore: { type: Type.NUMBER },
              overallQuestionScore: { type: Type.NUMBER },
              matchedKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              missingKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              aiFeedback: { type: Type.STRING },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              improvements: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              measurementNotes: { type: Type.STRING },
            },
            required: [
              "relevanceScore",
              "keywordScore",
              "communicationScore",
              "overallQuestionScore",
              "matchedKeywords",
              "missingKeywords",
              "aiFeedback",
              "strengths",
              "improvements",
              "measurementNotes",
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      const clamp = (val: unknown) => Math.max(0, Math.min(100, Math.round(Number(val) || 0)));

      res.json({
        relevanceScore: clamp(parsed.relevanceScore),
        keywordScore: clamp(parsed.keywordScore),
        communicationScore: clamp(parsed.communicationScore),
        overallQuestionScore: clamp(parsed.overallQuestionScore),
        matchedKeywords: Array.isArray(parsed.matchedKeywords) ? parsed.matchedKeywords.slice(0, 15) : [],
        missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords.slice(0, 15) : [],
        aiFeedback: String(parsed.aiFeedback || "Evaluation completed.").slice(0, 2400),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 6) : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 6) : [],
        measurementNotes: String(
          parsed.measurementNotes ||
            `Measured: ${telemetry.speakingDurationSec}s duration, ${telemetry.wpm} WPM, ${telemetry.eyeContactStatus}. AI-estimated: content relevance & keyword alignment.`
        ).slice(0, 580),
      });
    } catch (err: unknown) {
      console.error("Evaluation error:", err);
      const message = err instanceof Error ? err.message : "AI answer evaluation failed.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/interview/session-summary", async (req, res) => {
    try {
      const { categoryName, mode, questionSummaries } = req.body ?? {};
      if (!Array.isArray(questionSummaries) || questionSummaries.length === 0) {
        return res.status(400).json({ error: "Missing questionSummaries array." });
      }

      const ai = getGeminiClient();
      const summaryPrompt = `
Synthesize an overall interview performance report based strictly on these evaluated question responses:
Category: ${categoryName || "General"}
Mode: ${mode === "pro" ? "Pro Mode" : "Demo Mode"}

Responses:
${JSON.stringify(questionSummaries, null, 2)}

Produce:
- summaryFeedback: Concise 3-4 sentence executive assessment citing real strengths and concrete gaps observed across the questions.
- topStrengths: 3 concise bullet strings.
- topImprovements: 3 actionable next-step bullet strings.
`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: summaryPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryFeedback: { type: Type.STRING },
              topStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              topImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["summaryFeedback", "topStrengths", "topImprovements"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json({
        summaryFeedback: String(parsed.summaryFeedback || "Session completed.").slice(0, 1900),
        topStrengths: Array.isArray(parsed.topStrengths) ? parsed.topStrengths.slice(0, 6) : [],
        topImprovements: Array.isArray(parsed.topImprovements) ? parsed.topImprovements.slice(0, 6) : [],
      });
    } catch (err: unknown) {
      console.error("Session summary error:", err);
      const message = err instanceof Error ? err.message : "Failed to synthesize session summary.";
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const hmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`InterviewLab server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
