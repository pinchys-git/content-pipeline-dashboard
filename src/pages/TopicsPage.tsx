import { useState, useEffect, useRef, useCallback } from 'react';
import { useSites } from '../hooks/useSites';
import { fetchTopics, fetchPillars, createTopic, createPillar, suggestSources, runPipeline } from '../lib/api';
import type { Topic, Pillar, SourceSuggestion } from '../lib/types';
import { TOPIC_STATUS_COLORS, formatDate, parseJSON } from '../lib/utils';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const TONES = ['positive', 'neutral', 'negative', 'contrarian'] as const;
const STYLES = ['technical', 'narrative', 'sarcastic', 'editorial', 'how-to'] as const;
const LENGTHS = [
  { value: 500, label: 'Quick Take' },
  { value: 1000, label: 'Standard' },
  { value: 1500, label: 'Deep Dive' },
  { value: 2500, label: 'Long Form' },
] as const;

export default function TopicsPage() {
  const { selectedSite } = useSites();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [runningTopic, setRunningTopic] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ topicId: string; runId: string } | null>(null);

  useEffect(() => {
    if (!selectedSite) return;
    setLoading(true);
    Promise.all([
      fetchTopics(selectedSite.id),
      fetchPillars(selectedSite.id),
    ])
      .then(([t, p]) => { setTopics(t); setPillars(p); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSite]);

  const handleRunPipeline = async (topic: Topic) => {
    if (!selectedSite) return;
    setRunningTopic(topic.id);
    try {
      const result = await runPipeline(topic.id, selectedSite!.id);
      setRunResult({ topicId: topic.id, runId: result.run_id });
    } catch (e: any) {
      alert(`Pipeline error: ${e.message}`);
    } finally {
      setRunningTopic(null);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Topics</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition"
        >
          {showForm ? 'Cancel' : '+ New Topic'}
        </button>
      </div>

      {showForm && selectedSite && (
        <NewTopicForm
          siteId={selectedSite.id}
          pillars={pillars}
          onPillarsChange={setPillars}
          onCreated={(topic) => {
            setTopics([topic, ...topics]);
            setShowForm(false);
          }}
        />
      )}

      {topics.length === 0 ? (
        <EmptyState icon="💡" title="No topics yet" description="Create your first topic to start the pipeline" />
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => {
            const statusColors = TOPIC_STATUS_COLORS[topic.status] || TOPIC_STATUS_COLORS.idea;
            const keywords = parseJSON<string[]>(topic.target_keywords);
            const canRun = ['approved', 'idea'].includes(topic.status);
            return (
              <div key={topic.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-medium text-gray-900">{topic.title}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.bg} ${statusColors.text} capitalize`}>
                        {topic.status}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">{topic.content_type}</span>
                      {topic.tone && topic.tone !== 'neutral' && (
                        <span className="px-2 py-0.5 text-xs bg-violet-50 text-violet-600 rounded-full capitalize">{topic.tone}</span>
                      )}
                      {topic.style && (
                        <span className="px-2 py-0.5 text-xs bg-sky-50 text-sky-600 rounded-full capitalize">{topic.style}</span>
                      )}
                      {topic.target_length && (
                        <span className="px-2 py-0.5 text-xs bg-amber-50 text-amber-600 rounded-full">{topic.target_length}w</span>
                      )}
                    </div>
                    {topic.description && <p className="text-sm text-gray-500 mb-1">{topic.description}</p>}
                    {topic.angle && <p className="text-xs text-gray-400">Angle: {topic.angle}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>Priority: {topic.priority}</span>
                      {topic.scheduled_at && <span>Scheduled: {formatDate(topic.scheduled_at)}</span>}
                    </div>
                    {keywords && keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {keywords.map((kw: string) => (
                          <span key={kw} className="px-2 py-0.5 text-xs bg-gray-50 text-gray-500 rounded">{kw}</span>
                        ))}
                      </div>
                    )}
                    {runResult?.topicId === topic.id && (
                      <div className="mt-2 px-3 py-2 bg-green-50 text-green-700 text-xs rounded-lg">
                        ✓ Pipeline started — Run ID: {runResult.runId}
                      </div>
                    )}
                  </div>
                  {canRun && (
                    <button
                      onClick={() => handleRunPipeline(topic)}
                      disabled={runningTopic === topic.id}
                      className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
                    >
                      {runningTopic === topic.id ? 'Running...' : '▸ Run Pipeline'}
                    </button>
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
// Pill Selector Component
// ============================================================

function PillSelector<T extends string | number>({
  label,
  options,
  value,
  onChange,
  renderLabel,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (val: T) => void;
  renderLabel?: (val: T) => React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
              value === opt
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {renderLabel ? renderLabel(opt) : String(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Enhanced New Topic Form
// ============================================================

function NewTopicForm({
  siteId,
  pillars,
  onPillarsChange,
  onCreated,
}: {
  siteId: string;
  pillars: Pillar[];
  onPillarsChange: (pillars: Pillar[]) => void;
  onCreated: (topic: Topic) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    angle: '',
    content_type: 'article',
    status: 'idea',
    priority: 5,
    pillar_id: '',
    tone: 'neutral' as string,
    style: 'editorial' as string,
    target_length: 1500 as number,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Pillar creation
  const [showNewPillar, setShowNewPillar] = useState(false);
  const [newPillarName, setNewPillarName] = useState('');
  const [newPillarDesc, setNewPillarDesc] = useState('');
  const [creatingPillar, setCreatingPillar] = useState(false);

  // Source suggestions
  const [sourceSuggestions, setSourceSuggestions] = useState<SourceSuggestion[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [acceptedSources, setAcceptedSources] = useState<SourceSuggestion[]>([]);
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(new Set());
  const [customSource, setCustomSource] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounced source suggestions
  const fetchSuggestions = useCallback(async (title: string, description: string) => {
    if (title.length <= 10 || description.length <= 10) return;
    setLoadingSources(true);
    try {
      const sources = await suggestSources(siteId, title, description);
      setSourceSuggestions(sources);
    } catch {
      // Silently fail source suggestions
    } finally {
      setLoadingSources(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (form.title.length > 10 && form.description.length > 10) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(form.title, form.description);
      }, 800);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.title, form.description, fetchSuggestions]);

  const handleCreatePillar = async () => {
    if (!newPillarName.trim()) return;
    setCreatingPillar(true);
    try {
      const result = await createPillar(siteId, { name: newPillarName.trim(), description: newPillarDesc.trim() || undefined });
      const newPillar: Pillar = {
        id: result.id,
        site_id: siteId,
        name: newPillarName.trim(),
        slug: newPillarName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: newPillarDesc.trim(),
        keywords: '[]',
        priority: 5,
        active: 1,
      };
      onPillarsChange([...pillars, newPillar]);
      setForm({ ...form, pillar_id: result.id });
      setShowNewPillar(false);
      setNewPillarName('');
      setNewPillarDesc('');
    } catch (e: any) {
      setError(`Failed to create pillar: ${e.message}`);
    } finally {
      setCreatingPillar(false);
    }
  };

  const handleAcceptSource = (source: SourceSuggestion) => {
    setAcceptedSources([...acceptedSources, source]);
    setDismissedUrls(new Set([...dismissedUrls, source.url]));
  };

  const handleDismissSource = (source: SourceSuggestion) => {
    setDismissedUrls(new Set([...dismissedUrls, source.url]));
  };

  const handleAddCustomSource = () => {
    if (!customSource.trim()) return;
    setAcceptedSources([...acceptedSources, {
      url: customSource.trim(),
      title: customSource.trim(),
      snippet: '',
      relevance: 'manual',
    }]);
    setCustomSource('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const sourceHints = acceptedSources.length > 0
        ? JSON.stringify(acceptedSources.map(s => s.url))
        : undefined;

      const result = await createTopic(siteId, {
        ...form,
        pillar_id: form.pillar_id || undefined,
        source_hints: sourceHints,
        tone: form.tone,
        style: form.style,
        target_length: form.target_length,
      });
      onCreated({
        id: result.id,
        site_id: siteId,
        pillar_id: form.pillar_id || null,
        title: form.title,
        description: form.description,
        angle: form.angle,
        target_keywords: '[]',
        content_type: form.content_type,
        status: form.status || 'idea',
        priority: form.priority,
        scheduled_at: null,
        source_hints: sourceHints || '[]',
        tone: form.tone,
        style: form.style,
        target_length: form.target_length,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const visibleSuggestions = sourceSuggestions.filter(s => !dismissedUrls.has(s.url));

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-medium text-gray-900">New Topic</h3>

      {/* Title & Description */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="e.g. Why Every Startup Needs a Content Strategy"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Brief description of the article's focus and key points..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Angle</label>
          <input
            type="text"
            value={form.angle}
            onChange={(e) => setForm({ ...form, angle: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Unique perspective or hook for this piece"
          />
        </div>
      </div>

      {/* Tone, Style, Length */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PillSelector
          label="Tone"
          options={TONES}
          value={form.tone}
          onChange={(val) => setForm({ ...form, tone: val })}
          renderLabel={(val) => <span className="capitalize">{val}</span>}
        />
        <PillSelector
          label="Style"
          options={STYLES}
          value={form.style}
          onChange={(val) => setForm({ ...form, style: val })}
          renderLabel={(val) => <span className="capitalize">{val}</span>}
        />
        <PillSelector
          label="Length"
          options={LENGTHS.map(l => l.value)}
          value={form.target_length}
          onChange={(val) => setForm({ ...form, target_length: val })}
          renderLabel={(val) => {
            const l = LENGTHS.find(x => x.value === val);
            return (
              <span className="flex flex-col items-center leading-tight">
                <span>{val}</span>
                <span className="text-[10px] opacity-60">{l?.label}</span>
              </span>
            );
          }}
        />
      </div>

      {/* Content Type, Priority, Pillar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Content Type</label>
          <select
            value={form.content_type}
            onChange={(e) => setForm({ ...form, content_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            {['article', 'listicle', 'how-to', 'opinion', 'review', 'guide'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Priority: {form.priority}</label>
          <input
            type="range"
            min="1"
            max="10"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Pillar</label>
          <select
            value={form.pillar_id}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setShowNewPillar(true);
              } else {
                setForm({ ...form, pillar_id: e.target.value });
              }
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            <option value="">None</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="__new__">+ Add Pillar</option>
          </select>
          {showNewPillar && (
            <div className="mt-2 p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
              <input
                type="text"
                value={newPillarName}
                onChange={(e) => setNewPillarName(e.target.value)}
                placeholder="Pillar name"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <input
                type="text"
                value={newPillarDesc}
                onChange={(e) => setNewPillarDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreatePillar}
                  disabled={creatingPillar || !newPillarName.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
                >
                  {creatingPillar ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewPillar(false)}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Source Suggestions */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Sources</label>

        {/* Accepted sources */}
        {acceptedSources.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {acceptedSources.map((source, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
                <span className="text-green-600">✓</span>
                <span className="text-gray-700 truncate flex-1">{source.title || source.url}</span>
                <button
                  type="button"
                  onClick={() => setAcceptedSources(acceptedSources.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 text-xs transition"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loadingSources && (
          <div className="space-y-2 mb-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-2 bg-gray-100 rounded w-1/2 mb-1" />
                <div className="h-2 bg-gray-100 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Suggested sources */}
        {!loadingSources && visibleSuggestions.length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-xs text-gray-400">AI-suggested sources (verify before using)</p>
            {visibleSuggestions.map((source, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{source.title}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                        source.relevance === 'high' ? 'bg-green-50 text-green-700' :
                        source.relevance === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {source.relevance}
                      </span>
                    </div>
                    <p className="text-xs text-blue-500 truncate">{source.url}</p>
                    {source.snippet && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{source.snippet}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAcceptSource(source)}
                      className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissSource(source)}
                      className="px-2 py-1 text-xs font-medium text-gray-400 bg-gray-50 rounded-md hover:bg-gray-100 transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Custom source input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomSource(); }}}
            placeholder="+ Add custom source URL..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {customSource.trim() && (
            <button
              type="button"
              onClick={handleAddCustomSource}
              className="px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
      >
        {submitting ? 'Creating...' : 'Create Topic'}
      </button>
    </form>
  );
}
