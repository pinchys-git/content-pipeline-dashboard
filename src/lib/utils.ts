export const STAGES = ['research', 'draft', 'verify', 'format', 'edit', 'review', 'scheduled', 'published'] as const;

export const STAGE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  research: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  draft: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  verify: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  format: { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  edit: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  review: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  scheduled: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  published: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export const TOPIC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  idea: { bg: 'bg-gray-100', text: 'text-gray-700' },
  approved: { bg: 'bg-blue-50', text: 'text-blue-700' },
  scheduled: { bg: 'bg-green-50', text: 'text-green-700' },
  'in-progress': { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

export const CLAIM_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  verified: { bg: 'bg-green-50', text: 'text-green-700' },
  disputed: { bg: 'bg-red-50', text: 'text-red-700' },
  unverifiable: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  pending: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

export const RELIABILITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: 'bg-green-50', text: 'text-green-700' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  low: { bg: 'bg-red-50', text: 'text-red-700' },
};

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDatetime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function parseJSON<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return null;
  }
}

export function qualityColor(score: number | null): string {
  if (score === null) return 'bg-gray-200';
  if (score >= 0.8) return 'bg-emerald-500';
  if (score >= 0.6) return 'bg-green-500';
  if (score >= 0.4) return 'bg-yellow-500';
  if (score >= 0.2) return 'bg-orange-500';
  return 'bg-red-500';
}
