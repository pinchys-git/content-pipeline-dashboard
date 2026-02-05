import { useState, useEffect } from 'react';
import { useSites } from '../hooks/useSites';
import { fetchTopics, fetchPillars, createTopic, runPipeline } from '../lib/api';
import type { Topic, Pillar } from '../lib/types';
import { TOPIC_STATUS_COLORS, formatDate, parseJSON } from '../lib/utils';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

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
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-gray-900">{topic.title}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.bg} ${statusColors.text} capitalize`}>
                        {topic.status}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">{topic.content_type}</span>
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

function NewTopicForm({ siteId, pillars, onCreated }: { siteId: string; pillars: Pillar[]; onCreated: (topic: Topic) => void }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    angle: '',
    content_type: 'article',
    status: 'idea',
    priority: 5,
    pillar_id: '',
    source_hints: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const result = await createTopic(siteId, {
        ...form,
        pillar_id: form.pillar_id || undefined,
        source_hints: form.source_hints ? JSON.stringify(form.source_hints.split('\n').filter(Boolean)) : undefined,
      });
      // Construct a minimal topic for the list
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
        source_hints: form.source_hints || '[]',
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h3 className="text-sm font-medium text-gray-900">New Topic</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Angle</label>
          <input type="text" value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Content Type</label>
          <select value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
            {['article', 'listicle', 'how-to', 'opinion', 'review', 'guide'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Priority: {form.priority}</label>
          <input type="range" min="1" max="10" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            className="w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Pillar</label>
          <select value={form.pillar_id} onChange={(e) => setForm({ ...form, pillar_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
            <option value="">None</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Source Hints</label>
          <textarea value={form.source_hints} onChange={(e) => setForm({ ...form, source_hints: e.target.value })}
            rows={2} placeholder="URLs or notes for research..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={submitting}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50">
        {submitting ? 'Creating...' : 'Create Topic'}
      </button>
    </form>
  );
}
