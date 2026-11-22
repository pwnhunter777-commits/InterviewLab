import React, { useEffect, useRef, useState } from 'react';
import { Copy, FolderPlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  DifficultyLevel,
  InterviewCategory,
  InterviewQuestion,
} from '../types/interview';
import {
  createCustomCategory,
  deleteCustomCategory,
  deleteCustomQuestion,
  saveCustomQuestion,
} from '../services/firestoreService';

interface QuestionBankViewProps {
  userId: string;
  categories: InterviewCategory[];
  questions: InterviewQuestion[];
  onRefreshCatalog: () => Promise<void>;
}

function formatErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message.trim();
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) {
        if (parsed.error.toLowerCase().includes('permission')) {
          return 'Permission denied while saving to Firestore. Verify your input fields and sign-in session.';
        }
        return parsed.error;
      }
    } catch {
      return fallback;
    }
  }
  return raw || fallback;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  userId,
  categories,
  questions,
  onRefreshCatalog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');

  const [showCatModal, setShowCatModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catFocus, setCatFocus] = useState('Mixed');
  const [catTime, setCatTime] = useState('90');
  const [catModalError, setCatModalError] = useState<string | null>(null);

  const [showQModal, setShowQModal] = useState(false);
  const [editingQId, setEditingQId] = useState<string | undefined>(undefined);
  const [qCategory, setQCategory] = useState(categories[0]?.id || '');
  const [qPrompt, setQPrompt] = useState('');
  const [qDifficulty, setQDifficulty] = useState<DifficultyLevel>('Medium');
  const [qKeywords, setQKeywords] = useState('');
  const [qGuide, setQGuide] = useState('');
  const [qModalError, setQModalError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const catModalRef = useRef<HTMLDivElement | null>(null);
  const qModalRef = useRef<HTMLDivElement | null>(null);

  // Escape key & focus trap for open modals
  useEffect(() => {
    const activeModal = showCatModal ? catModalRef.current : showQModal ? qModalRef.current : null;
    if (!activeModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCatModal) setShowCatModal(false);
        if (showQModal) setShowQModal(false);
        return;
      }

      if (e.key === 'Tab') {
        const focusable = activeModal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCatModal, showQModal]);

  const filteredQuestions = questions.filter((q) => {
    if (selectedCategory !== 'all' && q.categoryId !== selectedCategory) return false;
    if (difficultyFilter !== 'all' && q.difficulty !== difficultyFilter) return false;
    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      const hay = `${q.prompt} ${q.expectedKeywords.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const openCreateCategory = () => {
    setCatName('');
    setCatDesc('');
    setCatFocus('Mixed');
    setCatTime('90');
    setCatModalError(null);
    setShowCatModal(true);
  };

  const openCreateQuestion = () => {
    setEditingQId(undefined);
    setQCategory(categories[0]?.id || '');
    setQPrompt('');
    setQDifficulty('Medium');
    setQKeywords('');
    setQGuide('');
    setQModalError(null);
    setShowQModal(true);
  };

  const openEditQuestion = (q: InterviewQuestion) => {
    setEditingQId(q.id);
    setQCategory(q.categoryId);
    setQPrompt(q.prompt);
    setQDifficulty(q.difficulty);
    setQKeywords(q.expectedKeywords.join(', '));
    setQGuide(q.idealAnswerGuide);
    setQModalError(null);
    setShowQModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatModalError(null);

    const cleanName = catName.trim();
    const cleanDesc = catDesc.trim();
    const cleanFocus = catFocus.trim() || 'Mixed';
    const parsedTime = Number(catTime);

    if (cleanName.length < 2 || cleanName.length > 80) {
      setCatModalError('Category name must be between 2 and 80 characters.');
      return;
    }
    if (cleanDesc.length < 1 || cleanDesc.length > 400) {
      setCatModalError('Description is required and must be 400 characters or fewer.');
      return;
    }
    if (cleanFocus.length < 1 || cleanFocus.length > 60) {
      setCatModalError('Difficulty focus must be between 1 and 60 characters.');
      return;
    }
    if (!Number.isFinite(parsedTime) || parsedTime < 30 || parsedTime > 600) {
      setCatModalError('Default time per question must be between 30 and 600 seconds.');
      return;
    }

    const clampedTime = Math.round(parsedTime);
    setSaving(true);
    try {
      await createCustomCategory({
        ownerId: userId,
        name: cleanName,
        description: cleanDesc,
        difficultyFocus: cleanFocus,
        defaultTimePerQuestionSec: clampedTime,
      });
      setShowCatModal(false);
      setNoticeMsg(`Created custom category "${cleanName}".`);
      await onRefreshCatalog();
    } catch (err) {
      setCatModalError(formatErrorMessage(err, 'Failed to create category.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (cat: InterviewCategory) => {
    const confirmed = window.confirm(
      `Delete category "${cat.name}" and any custom questions inside it? This cannot be undone.`
    );
    if (!confirmed) return;

    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await deleteCustomCategory(cat.id, userId);
      if (selectedCategory === cat.id) {
        setSelectedCategory('all');
      }
      await onRefreshCatalog();
    } catch (err) {
      setErrorMsg(formatErrorMessage(err, 'Failed to delete category.'));
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setQModalError(null);

    const cleanPrompt = qPrompt.trim();
    const cleanGuide = qGuide.trim();
    const keywords = qKeywords
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!qCategory) {
      setQModalError('Please choose a category.');
      return;
    }
    if (cleanPrompt.length < 5 || cleanPrompt.length > 600) {
      setQModalError('Interview prompt must be between 5 and 600 characters.');
      return;
    }
    if (cleanGuide.length < 1 || cleanGuide.length > 1500) {
      setQModalError('Ideal answer reference guide is required and must be 1,500 characters or fewer.');
      return;
    }
    if (keywords.length > 12) {
      setQModalError('Please enter at most 12 expected keywords.');
      return;
    }
    if (keywords.some((kw) => kw.length > 60)) {
      setQModalError('Each keyword must be 60 characters or fewer.');
      return;
    }

    setSaving(true);
    try {
      await saveCustomQuestion({
        id: editingQId,
        ownerId: userId,
        categoryId: qCategory,
        prompt: cleanPrompt,
        difficulty: qDifficulty,
        expectedKeywords: keywords,
        idealAnswerGuide: cleanGuide,
      });
      setShowQModal(false);
      setNoticeMsg(editingQId ? 'Updated custom question.' : 'Added custom question to your bank.');
      await onRefreshCatalog();
    } catch (err) {
      setQModalError(formatErrorMessage(err, 'Failed to save question.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateQuestion = async (q: InterviewQuestion) => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setDuplicatingId(q.id);
    try {
      await saveCustomQuestion({
        ownerId: userId,
        categoryId: q.categoryId,
        prompt: q.prompt.slice(0, 600),
        difficulty: q.difficulty,
        expectedKeywords: q.expectedKeywords.slice(0, 12),
        idealAnswerGuide: q.idealAnswerGuide.slice(0, 1500),
      });
      await onRefreshCatalog();
      setNoticeMsg('Duplicated question into your custom bank. You can now edit it.');
    } catch (err) {
      setErrorMsg(formatErrorMessage(err, 'Failed to duplicate question.'));
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDeleteQuestion = async (q: InterviewQuestion) => {
    const confirmed = window.confirm(
      'Delete this custom question? Past session reports will still keep their saved prompt text.'
    );
    if (!confirmed) return;

    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await deleteCustomQuestion(q.id);
      await onRefreshCatalog();
    } catch (err) {
      setErrorMsg(formatErrorMessage(err, 'Failed to delete question.'));
    }
  };

  const getCategoryName = (catId: string) =>
    categories.find((c) => c.id === catId)?.name || 'General';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Interview Question Bank</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Browse curated tracks or add custom categories and prompts for your target roles.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={openCreateCategory}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New Category
          </button>
          <button
            type="button"
            onClick={openCreateQuestion}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Question
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-4">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-semibold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {noticeMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-4">
          <span>{noticeMsg}</span>
          <button
            type="button"
            onClick={() => setNoticeMsg(null)}
            className="font-semibold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Custom Categories Summary Strip if any */}
      {categories.some((c) => !c.isBuiltIn) && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Custom Categories</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories
              .filter((c) => !c.isBuiltIn)
              .map((cat) => (
                <div
                  key={cat.id}
                  className="p-3.5 border border-slate-200 rounded-lg flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{cat.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat)}
                    title="Delete custom category"
                    aria-label={`Delete custom category ${cat.name}`}
                    className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search prompts or keywords"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts or keywords..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-600 focus:outline-none"
          />
        </div>

        <select
          aria-label="Filter by category"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:border-blue-600 focus:outline-none"
        >
          <option value="all">All Categories ({questions.length})</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          {['all', 'Easy', 'Medium', 'Hard'].map((diff) => (
            <button
              key={diff}
              type="button"
              onClick={() => setDifficultyFilter(diff)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                difficultyFilter === diff
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {diff === 'all' ? 'All' : diff}
            </button>
          ))}
        </div>
      </div>

      {/* Questions List */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {filteredQuestions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-700">No matching questions found</p>
            <p className="text-xs text-slate-500 mt-1">
              Try clearing filters or create a custom question for this track.
            </p>
          </div>
        ) : (
          filteredQuestions.map((q) => (
            <div key={q.id} className="p-5 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">
                  {getCategoryName(q.categoryId)} · {q.difficulty} ·{' '}
                  {q.isBuiltIn ? 'Built-in Curated' : 'Custom Question'}
                </p>
                <p className="text-sm font-semibold text-slate-900 leading-snug">{q.prompt}</p>
                <p className="text-xs text-slate-600">
                  Keywords: {q.expectedKeywords.join(', ') || 'None specified'}
                </p>
              </div>

              {q.isBuiltIn ? (
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDuplicateQuestion(q)}
                    disabled={duplicatingId === q.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {duplicatingId === q.id ? 'Duplicating...' : 'Duplicate to my bank'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditQuestion(q)}
                    title="Edit question"
                    aria-label="Edit custom question"
                    className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q)}
                    title="Delete question"
                    aria-label="Delete custom question"
                    className="p-2 text-slate-500 hover:text-red-700 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Category Modal */}
      {showCatModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-modal-title"
        >
          <div
            ref={catModalRef}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 id="cat-modal-title" className="text-base font-bold text-slate-900">
                Create Custom Category
              </h2>
              <button
                type="button"
                aria-label="Close category modal"
                onClick={() => setShowCatModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {catModalError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {catModalError}
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label htmlFor="cat-name-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Category Name
                </label>
                <input
                  id="cat-name-input"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Cloud & DevOps Engineering"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="cat-desc-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  id="cat-desc-input"
                  required
                  maxLength={400}
                  rows={2}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Topics covered in this interview track..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cat-focus-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Difficulty Focus
                  </label>
                  <input
                    id="cat-focus-input"
                    type="text"
                    required
                    maxLength={60}
                    value={catFocus}
                    onChange={(e) => setCatFocus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="cat-time-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Default Time (sec)
                  </label>
                  <input
                    id="cat-time-input"
                    type="number"
                    required
                    min={30}
                    max={600}
                    value={catTime}
                    onChange={(e) => setCatTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Question Modal */}
      {showQModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="q-modal-title"
        >
          <div
            ref={qModalRef}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 id="q-modal-title" className="text-base font-bold text-slate-900">
                {editingQId ? 'Edit Custom Question' : 'Add Custom Question'}
              </h2>
              <button
                type="button"
                aria-label="Close question modal"
                onClick={() => setShowQModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {qModalError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {qModalError}
              </div>
            )}

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="q-category-select" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    id="q-category-select"
                    value={qCategory}
                    onChange={(e) => setQCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="q-difficulty-select" className="block text-xs font-medium text-slate-700 mb-1">
                    Difficulty
                  </label>
                  <select
                    id="q-difficulty-select"
                    value={qDifficulty}
                    onChange={(e) => setQDifficulty(e.target.value as DifficultyLevel)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="q-prompt-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Interview Prompt
                </label>
                <textarea
                  id="q-prompt-input"
                  required
                  minLength={5}
                  maxLength={600}
                  rows={3}
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  placeholder="Write the exact question the interviewer will ask..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="q-keywords-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Expected Keywords (comma-separated, up to 12)
                </label>
                <input
                  id="q-keywords-input"
                  type="text"
                  value={qKeywords}
                  onChange={(e) => setQKeywords(e.target.value)}
                  placeholder="e.g. caching, TTL, invalidation, latency"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="q-guide-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Ideal Answer Reference Guide
                </label>
                <textarea
                  id="q-guide-input"
                  required
                  maxLength={1500}
                  rows={3}
                  value={qGuide}
                  onChange={(e) => setQGuide(e.target.value)}
                  placeholder="Key points that define a strong answer..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
