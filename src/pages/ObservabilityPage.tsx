import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSites } from '../hooks/useSites';
import { fetchStats } from '../lib/api';
import type { StatsResponse, StatsDailyTrend } from '../lib/types';
import { STAGE_COLORS } from '../lib/utils';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import StageBadge from '../components/StageBadge';

const PERIOD_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function formatCost(n: number | null | undefined): string {
  if (n == null) return '$0.0000';
  return `$${n.toFixed(4)}`;
}

function formatLatency(ms: number | null | undefined): string {
  if (ms == null || ms === 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ObservabilityPage() {
  const { selectedSite } = useSites();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStats(selectedSite?.id, days)
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSite, days]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;
  if (!stats || !stats.totals) {
    return <EmptyState icon="📊" title="No observability data" description="Run some pipeline tasks to generate LLM usage stats" />;
  }

  const { totals, by_stage, by_model, top_articles, daily_trend } = stats;

  return (
    <div className="space-y-8">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">LLM Observability</h2>
          <p className="text-sm text-gray-500 mt-0.5">Token usage, costs, and latency across your pipeline</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'LLM Calls', value: formatNumber(totals?.total_calls), icon: '⚡' },
          { label: 'Total Tokens', value: formatTokens(totals?.total_tokens), icon: '◈' },
          { label: 'Est. Cost', value: formatCost(totals?.estimated_cost_usd), icon: '💰' },
          { label: 'Avg Latency', value: formatLatency(totals?.avg_latency_ms), icon: '⏱' },
          { label: 'Articles', value: formatNumber(totals?.total_content ?? totals?.total_articles), icon: '📄' },
          { label: 'Runs', value: formatNumber(totals?.total_runs), icon: '▸' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{stat.icon}</span>
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* By Model */}
      {by_model && by_model.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">Cost by Model</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 sm:px-6 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium text-right">Calls</th>
                  <th className="px-4 py-3 font-medium text-right">Input Tokens</th>
                  <th className="px-4 py-3 font-medium text-right">Output Tokens</th>
                  <th className="px-4 py-3 font-medium text-right">Total Tokens</th>
                  <th className="px-4 py-3 font-medium text-right">Est. Cost</th>
                  <th className="px-4 sm:px-6 py-3 font-medium text-right">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {by_model.map((m: any) => {
                  const mCost = m.estimated_cost_usd || 0;
                  const totalCost = totals?.estimated_cost_usd || 1;
                  const costPct = totalCost > 0 ? (mCost / totalCost) * 100 : 0;
                  return (
                    <tr key={m.model} className="hover:bg-gray-50 transition">
                      <td className="px-4 sm:px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{m.model}</div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
                              <div
                                className="bg-gray-800 h-1.5 rounded-full transition-all"
                                style={{ width: `${Math.max(costPct, 2)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatNumber(m.calls)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">{formatNumber(m.input_tokens)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">{formatNumber(m.output_tokens)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatNumber(m.total_tokens)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{formatCost(m.estimated_cost_usd)}</td>
                      <td className="px-4 sm:px-6 py-3 text-right tabular-nums text-gray-500">{formatLatency(m.avg_latency_ms)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-4 sm:px-6 py-3 font-medium text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{formatNumber(totals?.total_calls)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{formatNumber(totals?.total_input_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{formatNumber(totals?.total_output_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{formatNumber(totals?.total_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{formatCost(totals?.estimated_cost_usd)}</td>
                  <td className="px-4 sm:px-6 py-3 text-right tabular-nums text-gray-500">{formatLatency(totals?.avg_latency_ms)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* By Stage */}
      {by_stage && by_stage.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">Usage by Stage</h3>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {by_stage.map((s: any) => {
                const stageName = s.stage_group || s.stage || 'unknown';
                const colors = STAGE_COLORS[stageName] || STAGE_COLORS.research;
                const stageTokens = s.total_tokens || 0;
                const totalTok = totals?.total_tokens || 1;
                const tokenPct = totalTok > 0 ? (stageTokens / totalTok) * 100 : 0;
                return (
                  <div key={stageName} className={`${colors.bg} rounded-xl p-4`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-sm font-medium capitalize ${colors.text}`}>{stageName}</span>
                      <span className={`text-xs ${colors.text} opacity-70`}>{tokenPct.toFixed(1)}% of tokens</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className={`${colors.text} opacity-70`}>Calls</span>
                        <span className={`font-medium ${colors.text} tabular-nums`}>{formatNumber(s.calls)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className={`${colors.text} opacity-70`}>Tokens</span>
                        <span className={`font-medium ${colors.text} tabular-nums`}>{formatNumber(stageTokens)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className={`${colors.text} opacity-70`}>Cost</span>
                        <span className={`font-medium ${colors.text} tabular-nums`}>{formatCost(s.estimated_cost_usd)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className={`${colors.text} opacity-70`}>Avg Latency</span>
                        <span className={`font-medium ${colors.text} tabular-nums`}>{formatLatency(s.avg_latency_ms)}</span>
                      </div>
                      {/* Token bar */}
                      <div className="w-full bg-white/50 rounded-full h-1.5 mt-1">
                        <div
                          className={`${colors.dot} h-1.5 rounded-full transition-all`}
                          style={{ width: `${Math.max(tokenPct, 2)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Daily Trend */}
      {daily_trend && daily_trend.length > 0 && (
        <DailyTrendChart data={daily_trend} />
      )}

      {/* Top Articles by Cost */}
      {top_articles && top_articles.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">Top Articles by Cost</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {top_articles.slice(0, 20).map((a: any, i: number) => (
              <button
                key={a.content_id}
                onClick={() => navigate(`/content/${a.content_id}`)}
                className="w-full px-4 sm:px-6 py-3.5 flex items-center gap-3 sm:gap-4 hover:bg-gray-50 transition text-left"
              >
                <span className="text-xs text-gray-400 tabular-nums w-6 text-right flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{a.title || 'Untitled'}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400 tabular-nums">{formatNumber(a.llm_calls ?? a.calls)} calls</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400 tabular-nums">{formatNumber(a.total_tokens)} tokens</span>
                  </div>
                </div>
                <StageBadge stage={a.current_stage || a.stage} />
                <span className="text-sm font-medium text-gray-900 tabular-nums flex-shrink-0">{formatCost(a.estimated_cost_usd)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Daily trend chart — pure div-based bar chart */
function DailyTrendChart({ data }: { data: StatsDailyTrend[] }) {
  const [metric, setMetric] = useState<'calls' | 'tokens' | 'cost'>('tokens');

  const values = data.map((d: any) => {
    if (metric === 'calls') return d.calls || 0;
    if (metric === 'tokens') return d.tokens ?? d.total_tokens ?? 0;
    return d.estimated_cost_usd ?? 0;
  });
  const maxVal = Math.max(...values, 1);

  const formatVal = (v: number) => {
    if (metric === 'cost') return formatCost(v);
    if (metric === 'tokens') return formatTokens(v);
    return formatNumber(v);
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Daily Trend</h3>
        <div className="flex gap-1">
          {(['tokens', 'calls', 'cost'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                metric === m
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {m === 'tokens' ? 'Tokens' : m === 'calls' ? 'Calls' : 'Cost'}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <div className="flex items-end gap-[3px] sm:gap-1 h-40">
          {data.map((d, i) => {
            const val = values[i] || 0;
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center group relative"
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                    <div className="font-medium">{formatDateLabel(d.date)}</div>
                    <div className="text-gray-300 mt-0.5">{formatVal(val)}</div>
                  </div>
                </div>
                {/* Bar */}
                <div
                  className="w-full bg-gray-800 rounded-t-sm hover:bg-gray-600 transition-all cursor-default"
                  style={{ height: `${Math.max(pct, 1)}%` }}
                />
              </div>
            );
          })}
        </div>
        {/* X-axis labels (show every Nth) */}
        <div className="flex gap-[3px] sm:gap-1 mt-2">
          {data.map((d, i) => {
            const showLabel = data.length <= 14 || i % Math.ceil(data.length / 7) === 0 || i === data.length - 1;
            return (
              <div key={d.date} className="flex-1 text-center">
                {showLabel && (
                  <span className="text-[10px] text-gray-400">{formatDateLabel(d.date)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
