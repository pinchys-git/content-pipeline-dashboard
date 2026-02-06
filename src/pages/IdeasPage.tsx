import { useState, useEffect } from 'react';
import { useSites } from '../hooks/useSites';
import {
  fetchWatchTopics, createWatchTopic, deleteWatchTopic,
  fetchIdeas, approveIdea, dismissIdea,
  fetchScanRuns, triggerIdeaScan,
  fetchPillars,
} from '../lib/api';
import type { WatchTopic, Idea, IdeaScanRun, Pillar } from '../lib/types';
import { IDEA_STATUS_COLORS, SCAN_STATUS_COLORS, formatDatetime, parseJSON } from '../lib/utils';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

type Tab = 'watch-topics' | 'ideas' | 'scan-runs';

const SOURCE_TYPE_OPTIONS = ['google', 'twitter', 'reddit'] as const;

function scoreColor(score: number | null): string {
  if (score === null) return 'bg-gray-100 text-gray-500';
  if (score >= 0.8) return 'bg-emerald-50 text-emerald-700';
  if (score >= 0.6) return 'bg-yellow-50 text-yellow-700';
  return 'bg-orange-50 text-orange-700';
}

export default function IdeasPage() {
  const { selectedSite } = useSites();
  const [tab, setTab] = useState<Tab>('ideas');
  const [pillars, setPillars] = useState<Pillar[]>([]);

  useEffect(() => {
    if (!selectedSite) return;
    fetchPillars(selectedSite.id).then(setPillars).catch(() => {});
  }, [selectedSite]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ideas', label: 'Ideas' },
    { key: 'watch-topics', label: 'Watch Topics' },
    { key: 'scan-runs', label: 'Scan Runs' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Ideas Engine</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-2.5 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'watch-topics' && selectedSite && (
        <WatchTopicsTab siteId={selectedSite.id} pillars={pillars} />
      )}
      {tab === 'ideas' && selectedSite && (
        <IdeasTab siteId={selectedSite.id} />
      )}
      {tab === 'scan-runs' && selectedSite && (
        <ScanRunsTab siteId={selectedSite.id} />
      )}
    </div>
  );
}

// ============================================================
// Watch Topics Tab
// ============================================================

function WatchTopicsTab({ siteId, pillars }: { siteId: string; pillars: Pillar[] }) {
  const [topics, setTopics] = useState<WatchTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchWatchTopics(siteId)
      .then(setTopics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [siteId]);

  const handleScan = async (wtId: string) => {
    setScanning(wtId);
    setScanResult(null);
    try {
      const result = await triggerIdeaScan(siteId, wtId);
      setScanResult(`Found ${result.total_ideas_found} ideas, stored ${result.total_ideas_stored}, deduped ${result.total_ideas_deduped}`);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanResult(`Scan failed: ${msg}`);
    } finally {
      setScanning(null);
    }
  };

  const handleDelete = async (wt: WatchTopic) => {
    if (!confirm(`Deactivate "${wt.name}"?`)) return;
    try {
      await deleteWatchTopic(siteId, wt.id);
      setTopics(topics.filter((t) => t.id !== wt.id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Failed: ${msg}`);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{topics.length} watch topic{topics.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition"
        >
          {showForm ? 'Cancel' : '+ New Watch Topic'}
        </button>
      </div>

      {showForm && (
        <NewWatchTopicForm
          siteId={siteId}
          pillars={pillars}
          onCreated={(wt) => {
            setTopics([wt, ...topics]);
            setShowForm(false);
          }}
        />
      )}

      {scanResult && (
        <div className="px-4 py-3 bg-blue-50 text-blue-700 text-sm rounded-xl">
          {scanResult}
        </div>
      )}

      {topics.length === 0 ? (
        <EmptyState icon="🔭" title="No watch topics" description="Create a watch topic to start scanning for content ideas" />
      ) : (
        <div className="space-y-2">
          {topics.map((wt) => {
            const keywords = parseJSON<string[]>(wt.keywords) || [];
            const sourceTypes = parseJSON<string[]>(wt.source_types) || [];
            return (
              <div key={wt.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-medium text-gray-900">{wt.name}</h3>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
                        every {wt.scan_interval_hours}h
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
                        max {wt.max_ideas_per_scan}/scan
                      </span>
                    </div>
                    {wt.description && <p className="text-sm text-gray-500 mb-1">{wt.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sourceTypes.map((st) => (
                        <span key={st} className="px-2 py-0.5 text-xs bg-violet-50 text-violet-600 rounded-full capitalize">{st}</span>
                      ))}
                      {keywords.map((kw) => (
                        <span key={kw} className="px-2 py-0.5 text-xs bg-sky-50 text-sky-600 rounded">{kw}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>Last scanned: {wt.last_scanned_at ? formatDatetime(wt.last_scanned_at) : 'never'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleScan(wt.id)}
                      disabled={scanning === wt.id}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
                    >
                      {scanning === wt.id ? 'Scanning...' : '▸ Scan Now'}
                    </button>
                    <button
                      onClick={() => handleDelete(wt)}
                      className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 transition"
                      title="Deactivate"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// New Watch Topic Form
// ============================================================

function NewWatchTopicForm({
  siteId,
  pillars,
  onCreated,
}: {
  siteId: string;
  pillars: Pillar[];
  onCreated: (wt: WatchTopic) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    keywords: [] as string[],
    source_types: ['google'] as string[],
    scan_interval_hours: 12,
    max_ideas_per_scan: 5,
    pillar_id: '',
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !form.keywords.includes(kw)) {
      setForm({ ...form, keywords: [...form.keywords, kw] });
      setKeywordInput('');
    }
  };

  const toggleSource = (src: string) => {
    const current = form.source_types;
    if (current.includes(src)) {
      if (current.length <= 1) return; // need at least one
      setForm({ ...form, source_types: current.filter((s) => s !== src) });
    } else {
      setForm({ ...form, source_types: [...current, src] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const result = await createWatchTopic(siteId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        keywords: JSON.stringify(form.keywords),
        source_types: JSON.stringify(form.source_types),
        scan_interval_hours: form.scan_interval_hours,
        max_ideas_per_scan: form.max_ideas_per_scan,
        pillar_id: form.pillar_id || undefined,
      });
      onCreated({
        id: result.id,
        site_id: siteId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        keywords: JSON.stringify(form.keywords),
        source_types: JSON.stringify(form.source_types),
        source_config: '{}',
        scan_interval_hours: form.scan_interval_hours,
        max_ideas_per_scan: form.max_ideas_per_scan,
        pillar_id: form.pillar_id || null,
        last_scanned_at: null,
        active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-medium text-gray-900">New Watch Topic</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="e.g. AI in Marketing & Growth"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="What kind of content ideas should this watch for?"
          />
        </div>
      </div>

      {/* Source Types */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Source Types</label>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_TYPE_OPTIONS.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => toggleSource(src)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition capitalize ${
                form.source_types.includes(src)
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Keywords</label>
        {form.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.keywords.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-sky-50 text-sky-700 rounded-full">
                {kw}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, keywords: form.keywords.filter((k) => k !== kw) })}
                  className="text-sky-400 hover:text-sky-600"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="Add keyword and press Enter"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {keywordInput.trim() && (
            <button
              type="button"
              onClick={addKeyword}
              className="px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {/* Settings row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Scan Interval (hours)</label>
          <select
            value={form.scan_interval_hours}
            onChange={(e) => setForm({ ...form, scan_interval_hours: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            {[4, 8, 12, 24, 48].map((h) => (
              <option key={h} value={h}>Every {h} hours</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Max Ideas per Scan</label>
          <select
            value={form.max_ideas_per_scan}
            onChange={(e) => setForm({ ...form, max_ideas_per_scan: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            {[3, 5, 10, 15].map((n) => (
              <option key={n} value={n}>{n} ideas</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Pillar</label>
          <select
            value={form.pillar_id}
            onChange={(e) => setForm({ ...form, pillar_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            <option value="">None</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
      >
        {submitting ? 'Creating...' : 'Create Watch Topic'}
      </button>
    </form>
  );
}

// ============================================================
// Ideas Tab
// ============================================================

function IdeasTab({ siteId }: { siteId: string }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [watchTopics, setWatchTopics] = useState<WatchTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [wtFilter, setWtFilter] = useState<string>('');
  const [actionPending, setActionPending] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchIdeas(siteId, {
        status: statusFilter || undefined,
        watch_topic_id: wtFilter || undefined,
      }),
      fetchWatchTopics(siteId),
    ])
      .then(([i, wt]) => { setIdeas(i); setWatchTopics(wt); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [siteId, statusFilter, wtFilter]);

  const wtName = (id: string | null) => {
    if (!id) return null;
    const wt = watchTopics.find((w) => w.id === id);
    return wt?.name || id;
  };

  const handleApprove = async (idea: Idea) => {
    if (!confirm(`Approve "${idea.title}"?\n\nThis will create a new Topic ready for pipeline run.`)) return;
    setActionPending(idea.id);
    try {
      await approveIdea(siteId, idea.id);
      setIdeas(ideas.map((i) => i.id === idea.id ? { ...i, status: 'converted' } : i));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Failed: ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  const handleDismiss = async (idea: Idea) => {
    const reason = prompt('Dismiss reason (optional):');
    if (reason === null) return; // cancelled
    setActionPending(idea.id);
    try {
      await dismissIdea(siteId, idea.id, reason || undefined);
      setIdeas(ideas.map((i) => i.id === idea.id ? { ...i, status: 'dismissed', dismissed_reason: reason || null } : i));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Failed: ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All statuses</option>
          <option value="proposed">Proposed</option>
          <option value="approved">Approved</option>
          <option value="dismissed">Dismissed</option>
          <option value="converted">Converted</option>
        </select>
        <select
          value={wtFilter}
          onChange={(e) => setWtFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All watch topics</option>
          {watchTopics.map((wt) => (
            <option key={wt.id} value={wt.id}>{wt.name}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400">{ideas.length} idea{ideas.length !== 1 ? 's' : ''}</span>
      </div>

      {ideas.length === 0 ? (
        <EmptyState icon="💡" title="No ideas yet" description="Run a scan on a watch topic to discover content ideas" />
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => {
            const statusColors = IDEA_STATUS_COLORS[idea.status] || IDEA_STATUS_COLORS.proposed;
            const sourceUrls = parseJSON<string[]>(idea.source_urls) || [];
            const isActive = idea.status === 'proposed';
            return (
              <div key={idea.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {idea.overall_score !== null && (
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full tabular-nums ${scoreColor(idea.overall_score)}`}>
                          {idea.overall_score.toFixed(2)}
                        </span>
                      )}
                      <h3 className="text-sm font-medium text-gray-900">{idea.title}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.bg} ${statusColors.text} capitalize`}>
                        {idea.status}
                      </span>
                      {idea.suggested_content_type && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">{idea.suggested_content_type}</span>
                      )}
                    </div>
                    {idea.description && <p className="text-sm text-gray-500 mb-1">{idea.description}</p>}
                    {idea.angle && <p className="text-xs text-gray-400 mb-1">Angle: {idea.angle}</p>}

                    {/* Sub-scores */}
                    {(idea.relevance_score !== null || idea.freshness_score !== null || idea.uniqueness_score !== null) && (
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {idea.relevance_score !== null && <span>Relevance: {idea.relevance_score.toFixed(2)}</span>}
                        {idea.freshness_score !== null && <span>Freshness: {idea.freshness_score.toFixed(2)}</span>}
                        {idea.uniqueness_score !== null && <span>Uniqueness: {idea.uniqueness_score.toFixed(2)}</span>}
                      </div>
                    )}

                    {/* Source URLs */}
                    {sourceUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {sourceUrls.map((url, i) => {
                          let hostname = url;
                          try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
                          return (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-700 hover:underline truncate max-w-[200px]"
                            >
                              {hostname}
                            </a>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      {idea.watch_topic_id && (
                        <span>Watch: {wtName(idea.watch_topic_id)}</span>
                      )}
                      <span>{formatDatetime(idea.created_at)}</span>
                    </div>

                    {idea.status === 'converted' && idea.topic_id && (
                      <div className="mt-2 px-3 py-2 bg-green-50 text-green-700 text-xs rounded-lg">
                        ✓ Converted to topic {idea.topic_id}
                      </div>
                    )}
                    {idea.dismissed_reason && (
                      <div className="mt-2 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg">
                        Dismissed: {idea.dismissed_reason}
                      </div>
                    )}
                  </div>

                  {isActive && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleApprove(idea)}
                        disabled={actionPending === idea.id}
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
                      >
                        {actionPending === idea.id ? '...' : '✓ Approve'}
                      </button>
                      <button
                        onClick={() => handleDismiss(idea)}
                        disabled={actionPending === idea.id}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
                      >
                        ✕ Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Scan Runs Tab
// ============================================================

function ScanRunsTab({ siteId }: { siteId: string }) {
  const [runs, setRuns] = useState<IdeaScanRun[]>([]);
  const [watchTopics, setWatchTopics] = useState<WatchTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchScanRuns(siteId),
      fetchWatchTopics(siteId),
    ])
      .then(([r, wt]) => { setRuns(r); setWatchTopics(wt); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  const wtName = (id: string | null) => {
    if (!id) return '—';
    const wt = watchTopics.find((w) => w.id === id);
    return wt?.name || id;
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;

  if (runs.length === 0) {
    return <EmptyState icon="📡" title="No scan runs yet" description="Trigger a scan from the Watch Topics tab" />;
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const statusColors = SCAN_STATUS_COLORS[run.status] || SCAN_STATUS_COLORS.completed;
        const sourceTypes = parseJSON<string[]>(run.source_types_used) || [];
        return (
          <div key={run.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-sm font-medium text-gray-900">{wtName(run.watch_topic_id)}</h3>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.bg} ${statusColors.text} capitalize`}>
                    {run.status}
                  </span>
                  {sourceTypes.map((st) => (
                    <span key={st} className="px-2 py-0.5 text-xs bg-violet-50 text-violet-600 rounded-full capitalize">{st}</span>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>Found: <strong className="text-gray-700">{run.ideas_found}</strong></span>
                  <span>Stored: <strong className="text-gray-700">{run.ideas_stored}</strong></span>
                  <span>Deduped: <strong className="text-gray-700">{run.ideas_deduped}</strong></span>
                  {run.latency_ms !== null && (
                    <span>{(run.latency_ms / 1000).toFixed(1)}s</span>
                  )}
                  {run.tokens_used > 0 && (
                    <span>{run.tokens_used.toLocaleString()} tokens</span>
                  )}
                </div>
                {run.error_message && (
                  <p className="mt-2 text-xs text-red-500">{run.error_message}</p>
                )}
                <div className="mt-1 text-xs text-gray-400">
                  {formatDatetime(run.created_at)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
