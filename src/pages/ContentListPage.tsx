import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSites } from '../hooks/useSites';
import { fetchContent } from '../lib/api';
import type { Content } from '../lib/types';
import { STAGES, formatDate } from '../lib/utils';
import StageBadge from '../components/StageBadge';
import QualityBar from '../components/QualityBar';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function ContentListPage() {
  const { selectedSite } = useSites();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const stageFilter = searchParams.get('stage') || '';

  useEffect(() => {
    if (!selectedSite) return;
    setLoading(true);
    fetchContent(selectedSite.id, stageFilter || undefined, 100)
      .then(setContent)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSite, stageFilter]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Content</h1>
        <div className="flex items-center gap-2">
          <select
            value={stageFilter}
            onChange={(e) => {
              if (e.target.value) {
                setSearchParams({ stage: e.target.value });
              } else {
                setSearchParams({});
              }
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="failed">failed</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {content.length === 0 ? (
          <EmptyState icon="📄" title="No content found" description={stageFilter ? `No content in the "${stageFilter}" stage` : 'No content yet for this site'} />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Stage</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Quality</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Words</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {content.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(item.stage === 'review' ? `/content/${item.id}/review` : `/content/${item.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition"
                >
                  <td className="px-6 py-3.5">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{item.title || 'Untitled'}</div>
                    {item.slug && <div className="text-xs text-gray-400 truncate max-w-xs">/{item.slug}</div>}
                  </td>
                  <td className="px-6 py-3.5"><StageBadge stage={item.stage} /></td>
                  <td className="px-6 py-3.5 hidden md:table-cell"><QualityBar score={item.quality_score} /></td>
                  <td className="px-6 py-3.5 hidden md:table-cell">
                    <span className="text-sm text-gray-500 tabular-nums">{item.word_count?.toLocaleString() || '—'}</span>
                  </td>
                  <td className="px-6 py-3.5 hidden sm:table-cell">
                    <span className="text-sm text-gray-500">{formatDate(item.created_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
