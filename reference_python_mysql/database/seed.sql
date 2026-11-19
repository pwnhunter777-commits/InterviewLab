USE interview_lab_db;

INSERT INTO categories (slug, name, description, difficulty_focus, default_time_sec)
VALUES
  ('swe-python', 'Python & Backend Engineering', 'Core Python internals, REST API design, database indexing, concurrency, and error handling.', 'Easy to Hard', 90),
  ('dsa', 'Data Structures & Algorithms', 'Time/space complexity, hash tables, trees, graphs, dynamic programming, and trade-offs.', 'Medium to Hard', 120),
  ('ai-ml', 'AI, Machine Learning & Data Science', 'Model evaluation, bias-variance trade-off, overfitting, embeddings, and RAG/LLM pipelines.', 'Medium', 105),
  ('web-frontend', 'Frontend & Full-Stack Web', 'React rendering, state management, browser performance, authentication, and web security.', 'Easy to Medium', 90),
  ('behavioral', 'Behavioral & HR Readiness', 'STAR-method conflict resolution, ownership, teamwork, project challenges, and career goals.', 'Foundational', 90)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO questions (category_id, prompt, difficulty, expected_keywords, ideal_answer_guide)
SELECT id,
  'Explain the difference between a Python list and a tuple, and when you would choose one over the other in production code.',
  'Easy',
  JSON_ARRAY('mutable', 'immutable', 'memory', 'hashable', 'performance'),
  'Lists are mutable dynamic arrays; tuples are immutable, use slightly less memory, and can serve as dictionary keys when elements are hashable.'
FROM categories WHERE slug = 'swe-python';

INSERT INTO questions (category_id, prompt, difficulty, expected_keywords, ideal_answer_guide)
SELECT id,
  'How do database indexes improve SQL query performance, and what trade-offs do they introduce on write operations?',
  'Medium',
  JSON_ARRAY('B-tree', 'lookup', 'write overhead', 'storage', 'selectivity'),
  'Indexes maintain sorted structures (B-trees) to speed up SELECT lookups while adding storage overhead and slowing down INSERT/UPDATE/DELETE.'
FROM categories WHERE slug = 'swe-python';

INSERT INTO questions (category_id, prompt, difficulty, expected_keywords, ideal_answer_guide)
SELECT id,
  'Explain the bias-variance trade-off and how you diagnose whether a machine learning model is underfitting or overfitting.',
  'Easy',
  JSON_ARRAY('bias', 'variance', 'training error', 'validation error', 'regularization'),
  'High bias causes underfitting; high variance causes overfitting. Mitigate overfitting with regularization, more training samples, or simpler architectures.'
FROM categories WHERE slug = 'ai-ml';

INSERT INTO questions (category_id, prompt, difficulty, expected_keywords, ideal_answer_guide)
SELECT id,
  'Tell me about a challenging technical bug or project obstacle you faced, how you diagnosed it, and what the outcome was.',
  'Easy',
  JSON_ARRAY('situation', 'task', 'action', 'result', 'root cause'),
  'Use STAR format: clearly describe the context, debugging steps, root cause, and measurable result.'
FROM categories WHERE slug = 'behavioral';
