CREATE DATABASE IF NOT EXISTS interview_lab_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE interview_lab_db;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  target_role VARCHAR(100) NOT NULL DEFAULT 'Software Engineer',
  experience_level ENUM('Student', 'Fresher', 'Mid-Level', 'Senior') NOT NULL DEFAULT 'Student',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(400) NOT NULL,
  difficulty_focus VARCHAR(60) NOT NULL DEFAULT 'Mixed',
  default_time_sec INT UNSIGNED NOT NULL DEFAULT 90,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  prompt VARCHAR(600) NOT NULL,
  difficulty ENUM('Easy', 'Medium', 'Hard') NOT NULL DEFAULT 'Medium',
  expected_keywords JSON NOT NULL,
  ideal_answer_guide TEXT NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_questions_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_questions_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  mode ENUM('demo', 'pro') NOT NULL DEFAULT 'demo',
  status ENUM('in_progress', 'completed') NOT NULL DEFAULT 'in_progress',
  question_count INT UNSIGNED NOT NULL DEFAULT 0,
  overall_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  relevance_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  clarity_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  keyword_coverage_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  avg_wpm DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  total_duration_sec INT UNSIGNED NOT NULL DEFAULT 0,
  summary_feedback TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS recorded_responses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  recording_file_path VARCHAR(300) NOT NULL,
  transcript TEXT NOT NULL,
  transcript_source ENUM('gemini_audio', 'speech_recognition', 'manual_text', 'unavailable') NOT NULL,
  speaking_duration_sec INT UNSIGNED NOT NULL DEFAULT 0,
  word_count INT UNSIGNED NOT NULL DEFAULT 0,
  wpm DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  pause_count INT UNSIGNED NOT NULL DEFAULT 0,
  avg_silence_ratio DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  voice_clarity_label ENUM('Clear', 'Moderate', 'Quiet', 'Unavailable') NOT NULL DEFAULT 'Unavailable',
  voice_clarity_db DECIMAL(6,2) NOT NULL DEFAULT -100.00,
  eye_contact_ratio DECIMAL(5,2) NOT NULL DEFAULT -1.00,
  eye_contact_status VARCHAR(80) NOT NULL DEFAULT 'Unavailable',
  face_presence_ratio DECIMAL(5,2) NOT NULL DEFAULT -1.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_responses_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_responses_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_evaluations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  response_id BIGINT UNSIGNED NOT NULL UNIQUE,
  relevance_score DECIMAL(5,2) NOT NULL,
  keyword_score DECIMAL(5,2) NOT NULL,
  communication_score DECIMAL(5,2) NOT NULL,
  overall_question_score DECIMAL(5,2) NOT NULL,
  matched_keywords JSON NOT NULL,
  missing_keywords JSON NOT NULL,
  ai_feedback TEXT NOT NULL,
  strengths JSON NOT NULL,
  improvements JSON NOT NULL,
  measurement_notes VARCHAR(600) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evaluations_response FOREIGN KEY (response_id) REFERENCES recorded_responses(id) ON DELETE CASCADE
);
