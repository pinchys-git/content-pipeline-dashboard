import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSites } from '../hooks/useSites';
import { fetchContent, fetchTraces } from '../lib/api';
import type { Content, Trace } from '../lib/types';
import { STAGE_COLORS, formatDatetime } from '../lib/utils';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

interface RunGroup {
  runId: string;
  contentId: string;
  title: string;
  traces: Trace[];
  totalTokens: number;
  totalLatency: number;
  totalCost: number;
  stages: string[];
  status: string;
  createdAt: string;
}

export default function RunsPage() {
  const { selectedSite } = useSites();
  const [runs, setRuns] = useState<RunGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedSite) return;
    setLoading(true);
    fetchContent(selectedSite.id, undefined, 50)
      .then(async (contentList) => {
        const withRuns = contentList.filter((c) => c.run_id);
        const groups: RunGroup[] = [];

        // Fetch traces for each unique run_id (limit to 10 most recent)
        const uniqueRuns = [...new Map(withRuns.map((c) => [c.run_id, c])).values()].slice(0, 10);

        for (const content of uniqueRuns) {
          try {
            const traces = await fetchTraces(content.run_id!);
            const sorted = traces.sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
            groups.push({
              runId: content.run_id!,
              contentId: content.id,
              title: content.title || 'Untitled',
              traces: sorted,
              totalTokens: traces.reduce((s, t) => s + (t.total_tokens || 0), 0),
              totalLatency: traces.reduce((s, t) => s + (t.latency_ms || 0), 0),
              totalCost: traces.reduce((s, t) => s + (t.estimated_cost_usd || 0), 0),
              stages: sorted.map((t) => t.stage),
              status: sorted.every((t) => t.status === 'success') ? 'success' : sorted.some((t) => t.status === 'error') ? 'error' : 'running',
              createdAt: sorted[0]?.created_at || content.created_at || '',
            });
          } catch {}
        }
        setRuns(groups);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSite]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Pipeline Runs</h1>
      {runs.length === 0 ? (
        <EmptyState icon="▸" title="No pipeline runs" description="Run a pipeline from the Topics page to see results here" />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <div
              key={run.runId}
              className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-gray-300 transition cursor-pointer"
              onClick={() => navigate(`/content/${run.contentId}`)}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">{run.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{run.runId.slice(0, 8)}...</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  run.status === 'success' ? 'bg-green-50 text-green-700' :
                  run.status === 'error' ? 'bg-red-50 text-red-700' :
                  'bg-yellow-50 text-yellow-700'
                }`}>
                  {run.status}
                </span>
              </div>

              {/* Stage flow */}
              <div className="flex items-center gap-1 mb-3 overflow-x-auto">
                {run.traces.map((trace, i) => {
                  const colors = STAGE_COLORS[trace.stage] || STAGE_COLORS.failed;
                  return (
                    <div key={trace.id} className="flex items-center">
                      <span className={`px-2 py-0.5 text-xs rounded-md font-medium ${colors.bg} ${colors.text} capitalize whitespace-nowrap`}>
                        {trace.stage}
                      </span>
                      {i < run.traces.length - 1 && (
                        <span className="text-gray-300 mx-0.5 text-xs">→</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-6 text-xs text-gray-500">
                <span>{run.totalTokens.toLocaleString()} tokens</span>
                <span>{(run.totalLatency / 1000).toFixed(1)}s total</span>
                <span>${run.totalCost.toFixed(4)}</span>
                <span>{formatDatetime(run.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
