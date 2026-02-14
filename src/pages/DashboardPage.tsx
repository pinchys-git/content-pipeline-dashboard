import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSites } from '../hooks/useSites';
import { fetchContent } from '../lib/api';
import type { Content } from '../lib/types';
import { STAGES, STAGE_COLORS, formatDate } from '../lib/utils';
import StageBadge from '../components/StageBadge';
import QualityBar from '../components/QualityBar';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function DashboardPage() {
  const { selectedSite } = useSites();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedSite) return;
    setLoading(true);
    fetchContent(selectedSite.id, undefined, 100)
      .then(setContent)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSite]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;

  const stageCounts = STAGES.reduce((acc, stage) => {
    acc[stage] = content.filter((c) => c.stage === stage).length;
    return acc;
  }, {} as Record<string, number>);

  const recentContent = [...content]
    .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
    .slice(0, 10);

  const totalContent = content.length;
  const avgQuality = content.filter((c) => c.quality_score !== null).reduce((sum, c, _, arr) => sum + (c.quality_score || 0) / arr.length, 0);
  const publishedCount = content.filter((c) => c.stage === 'published').length;

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Content', value: totalContent },
          { label: 'Published', value: publishedCount },
          { label: 'In Pipeline', value: totalContent - publishedCount },
          { label: 'Avg Quality', value: avgQuality ? `${Math.round(avgQuality * 100)}%` : '—' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-2xl font-semibold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline visualization */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
        <h2 className="text-sm font-medium text-gray-900 mb-4">Pipeline Stages</h2>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {STAGES.map((stage, i) => {
            const colors = STAGE_COLORS[stage];
            const count = stageCounts[stage] || 0;
            return (
              <div key={stage} className="flex items-center">
                <button
                  onClick={() => navigate(`/content?stage=${stage}`)}
                  className={`flex flex-col items-center px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl min-w-[75px] sm:min-w-[90px] transition hover:scale-105 ${colors.bg}`}
                >
                  <span className={`text-2xl font-bold ${colors.text}`}>{count}</span>
                  <span className={`text-xs font-medium mt-1 ${colors.text} capitalize`}>{stage}</span>
                </button>
                {i < STAGES.length - 1 && (
                  <svg className="w-5 h-5 text-gray-300 mx-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent content */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">Recent Content</h2>
        </div>
        {recentContent.length === 0 ? (
          <EmptyState icon="📄" title="No content yet" description="Run a pipeline to generate your first piece of content" />
        ) : (
          <div className="divide-y divide-gray-50">
            {recentContent.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/content/${item.id}`)}
                className="w-full px-4 sm:px-6 py-3.5 flex items-center gap-3 sm:gap-4 hover:bg-gray-50 transition text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{item.title || 'Untitled'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</div>
                </div>
                <StageBadge stage={item.stage} />
                <QualityBar score={item.quality_score} />
                {item.word_count && (
                  <span className="text-xs text-gray-400 tabular-nums hidden md:block">{item.word_count.toLocaleString()} words</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
