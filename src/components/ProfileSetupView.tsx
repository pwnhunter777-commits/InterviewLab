import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { ExperienceLevel, UserProfile } from '../types/interview';

interface ProfileSetupViewProps {
  initialName: string;
  email: string;
  existingProfile?: UserProfile | null;
  onSave: (data: {
    displayName: string;
    targetRole: string;
    experienceLevel: ExperienceLevel;
  }) => Promise<void>;
  onCancel?: () => void;
}

export const ProfileSetupView: React.FC<ProfileSetupViewProps> = ({
  initialName,
  email,
  existingProfile,
  onSave,
  onCancel,
}) => {
  const [displayName, setDisplayName] = useState(existingProfile?.displayName || initialName || '');
  const [targetRole, setTargetRole] = useState(existingProfile?.targetRole || 'Software Engineer');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    existingProfile?.experienceLevel || 'Student'
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !targetRole.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await onSave({
        displayName: displayName.trim(),
        targetRole: targetRole.trim(),
        experienceLevel,
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save candidate profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {existingProfile ? 'Candidate Profile' : 'Complete Your Registration'}
            </h1>
            <p className="text-xs text-slate-500">{email}</p>
          </div>
        </div>

        {err && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Role</label>
            <input
              type="text"
              required
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Backend Python Developer, ML Engineer"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Experience Level</label>
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none bg-white"
            >
              <option value="Student">Student (Final-Year / Intern)</option>
              <option value="Fresher">Fresher (0–1 Years)</option>
              <option value="Mid-Level">Mid-Level (2–5 Years)</option>
              <option value="Senior">Senior (5+ Years)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : existingProfile ? 'Save Profile' : 'Enter Practice Studio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
