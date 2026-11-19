import React, { useState } from 'react';
import { FolderPlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
  const [catTime, setCatTime] = useState(90);

  const [showQModal, setShowQModal] = useState(false);
  const [editingQId, setEditingQId] = useState<string | undefined>(undefined);
  const [qCategory, setQCategory] = useState(categories[0]?.id || '');
  const [qPrompt, setQPrompt] = useState('');
  const [qDifficulty, setQDifficulty] = useState<DifficultyLevel>('Medium');
  const [qKeywords, setQKeywords] = useState('');
  const [qGuide, setQGuide] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const openCreateQuestion = () => {
    setEditingQId(undefined);
    setQCategory(categories[0]?.id || '');
    setQPrompt('');
    setQDifficulty('Medium');
    setQKeywords('');
    setQGuide('');
    setErrorMsg(null);
    setShowQModal(true);
  };

  const openEditQuestion = (q: InterviewQuestion) => {
    setEditingQId(q.id);
    setQCategory(q.categoryId);
    setQPrompt(q.prompt);
    setQDifficulty(q.difficulty);
    setQKeywords(q.expectedKeywords.join(', '));
    setQGuide(q.idealAnswerGuide);
    setErrorMsg(null);
    setShowQModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim() || !catDesc.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await createCustomCategory({
        ownerId: userId,
        name: catName,
        description: catDesc,
        difficultyFocus: catFocus,
        defaultTimePerQuestionSec: catTime,
      });
      setCatName('');
      setCatDesc('');
      setShowCatModal(false);
      await onRefreshCatalog();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setErrorMsg(null);
    try {
      await deleteCustomCategory(categoryId);
      await onRefreshCatalog();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete category.');
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qPrompt.trim() || !qCategory || !qGuide.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveCustomQuestion({
        id: editingQId,
        ownerId: userId,
        categoryId: qCategory,
        prompt: qPrompt,
        difficulty: qDifficulty,
        expectedKeywords: qKeywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        idealAnswerGuide: qGuide,
      });
      setShowQModal(false);
      await onRefreshCatalog();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    setErrorMsg(null);
    try {
      await deleteCustomQuestion(questionId);
      await onRefreshCatalog();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete question.');
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
            onClick={() => {
              setErrorMsg(null);
              setShowCatModal(true);
            }}
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
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          {errorMsg}
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
                    onClick={() => handleDeleteCategory(cat.id)}
                    title="Delete custom category"
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts or keywords..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-600 focus:outline-none"
          />
        </div>

        <select
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

              {!q.isBuiltIn && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditQuestion(q)}
                    title="Edit question"
                    className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q.id)}
                    title="Delete question"
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Create Custom Category</h2>
              <button onClick={() => setShowCatModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Cloud & DevOps Engineering"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  required
                  rows={2}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Topics covered in this interview track..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Difficulty Focus</label>
                  <input
                    type="text"
                    value={catFocus}
                    onChange={(e) => setCatFocus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Default Time (sec)</label>
                  <input
                    type="number"
                    min={30}
                    max={600}
                    value={catTime}
                    onChange={(e) => setCatTime(Number(e.target.value))}
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {editingQId ? 'Edit Custom Question' : 'Add Custom Question'}
              </h2>
              <button onClick={() => setShowQModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">Difficulty</label>
                  <select
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Interview Prompt</label>
                <textarea
                  required
                  rows={3}
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  placeholder="Write the exact question the interviewer will ask..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expected Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={qKeywords}
                  onChange={(e) => setQKeywords(e.target.value)}
                  placeholder="e.g. caching, TTL, invalidation, latency"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ideal Answer Reference Guide
                </label>
                <textarea
                  required
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
