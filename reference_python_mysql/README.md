# InterviewLab — AI-Based Mock Interview System

## Architecture Overview
This project includes:
1. **Live Full-Stack Web Studio (`/src`, `/server.ts`)**:
   - React + TypeScript + Tailwind CSS frontend with Firebase Authentication & Firestore persistence.
   - Real-time browser Webcam & Microphone capture using **MediaPipe FaceLandmarker** (`@mediapipe/tasks-vision`) and **Web Audio API** RMS/pause telemetry.
   - Server-side **Google Gemini API** integration (`gemini-3.5-transcribe` for audio transcription, `gemini-4-hydrogen` for structured rubric evaluation).
2. **Python + MySQL Reference Backend (`/reference_python_mysql`)**:
   - Complete MySQL 8.x DDL (`database/schema.sql`) and seed data (`database/seed.sql`).
   - Modular Python 3.x OpenCV + MediaPipe (`vision_analyzer.py`) and SpeechRecognition + NumPy (`audio_analyzer.py`) modules for local academic demonstration.

---

## Running in VS Code

### A. Live Web Application (Node.js + Vite + Gemini)
1. Open the workspace root in **VS Code**.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure `.env` (never commit secrets):
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000` in Chrome/Edge (allow Camera & Microphone permissions when prompted).

### B. Python + MySQL Local Reference Setup
1. Ensure **Python 3.10+** and **MySQL 8.x** are installed locally.
2. Create and seed the MySQL database:
   ```bash
   mysql -u root -p < reference_python_mysql/database/schema.sql
   mysql -u root -p < reference_python_mysql/database/seed.sql
   ```
3. Create a Python virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r reference_python_mysql/requirements.txt
   ```
4. Set environment variables in `.env`:
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   MYSQL_HOST="localhost"
   MYSQL_USER="root"
   MYSQL_PASSWORD="your_mysql_password"
   MYSQL_DATABASE="interview_lab_db"
   ```
