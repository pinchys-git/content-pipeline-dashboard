import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { fetchContentDetail, fetchTraces } from '../lib/api';
import type { Content, Claim, Source, Trace } from '../lib/types';
import { STAGE_COLORS, CLAIM_STATUS_COLORS, RELIABILITY_COLORS, formatDate, formatDatetime, parseJSON, qualityColor } from '../lib/utils';
import StageBadge from '../components/StageBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const TABS = ['Article', 'Claims', 'Sources', 'Traces', 'Platforms', 'Meta'] as const;
type Tab = typeof TABS[number];

export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<Content | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [tab, setTab] = useState<Tab>('Article');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchContentDetail(id!)
      .then(async (data) => {
        setContent(data.content);
        setClaims(data.claims || []);
        setSources(data.sources || []);
        if (data.content.run_id) {
          try {
            const t = await fetchTraces(data.content.run_id);
            setTraces(t);
          } catch {}
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;
  if (!content) return <EmptyState title="Content not found" />;

  const markdown = content.final_md || content.draft_md || '';
  const platforms = parseJSON<Record<string, string>>(content.platforms);
  const tags = parseJSON<string[]>(content.tags);

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-600 transition flex items-center gap-1">
        <span>←</span> Back
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <StageBadge stage={content.stage} size="md" />
          {content.requires_review ? (
            <span className="px-2.5 py-1 text-sm rounded-full bg-amber-50 text-amber-700 font-medium">Needs Review</span>
          ) : null}
          {content.stage === 'review' && (
            <Link
              to={`/content/${content.id}/review`}
              className="px-4 py-1.5 text-sm font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
            >
              ✏ Review Article
            </Link>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{content.title || 'Untitled'}</h1>
        {content.excerpt && <p className="text-sm text-gray-500 mb-4">{content.excerpt}</p>}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm text-gray-500">
          {content.quality_score !== null && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Quality</span>
              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${qualityColor(content.quality_score)}`} style={{ width: `${Math.round(content.quality_score * 100)}%` }} />
              </div>
              <span className="font-medium tabular-nums">{Math.round(content.quality_score * 100)}%</span>
            </div>
          )}
          {content.word_count && <span>{content.word_count.toLocaleString()} words</span>}
          {content.reading_time && <span>{content.reading_time} min read</span>}
          <span>{formatDate(content.created_at)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="border-b border-gray-100 px-3 sm:px-6 flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                tab === t
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t}
              {t === 'Claims' && claims.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{claims.length}</span>
              )}
              {t === 'Sources' && sources.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{sources.length}</span>
              )}
              {t === 'Traces' && traces.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{traces.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4 sm:p-6">
          {tab === 'Article' && <ArticleTab markdown={markdown} />}
          {tab === 'Claims' && <ClaimsTab claims={claims} />}
          {tab === 'Sources' && <SourcesTab sources={sources} />}
          {tab === 'Traces' && <TracesTab traces={traces} />}
          {tab === 'Platforms' && <PlatformsTab platforms={platforms} />}
          {tab === 'Meta' && <MetaTab content={content} tags={tags} />}
        </div>
      </div>
    </div>
  );
}

function ArticleTab({ markdown }: { markdown: string }) {
  if (!markdown) return <EmptyState title="No article content" description="This content hasn't been drafted yet" />;
  return (
    <div className="prose max-w-none">
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}

function ClaimsTab({ claims }: { claims: Claim[] }) {
  if (claims.length === 0) return <EmptyState title="No claims" description="No claims have been extracted for this content" />;
  return (
    <div className="space-y-3">
      {claims.map((claim) => {
        const colors = CLAIM_STATUS_COLORS[claim.status] || CLAIM_STATUS_COLORS.pending;
        return (
          <div key={claim.id} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${colors.bg} ${colors.text} capitalize flex-shrink-0 mt-0.5`}>
                {claim.status}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{claim.claim_text}</p>
                {claim.context && <p className="text-xs text-gray-400 mt-1">{claim.context}</p>}
                {claim.verification_notes && (
                  <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-md p-2">{claim.verification_notes}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-medium text-gray-900 tabular-nums">{Math.round((claim.confidence ?? 0) * 100)}%</div>
                <div className="text-xs text-gray-400">confidence</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourcesTab({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return <EmptyState title="No sources" description="No sources have been collected for this content" />;
  return (
    <div className="space-y-3">
      {sources.map((source) => {
        const colors = RELIABILITY_COLORS[source.reliability] || RELIABILITY_COLORS.medium;
        return (
          <div key={source.id} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <a href={source.url || undefined} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline">
                  {source.title || source.url || 'Unknown source'}
                </a>
                {source.author && <span className="text-xs text-gray-400 ml-2">by {source.author}</span>}
                {source.snippet && <p className="text-xs text-gray-500 mt-1">{source.snippet}</p>}
                {source.published_date && <p className="text-xs text-gray-400 mt-1">{formatDate(source.published_date)}</p>}
              </div>
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${colors.bg} ${colors.text} capitalize flex-shrink-0`}>
                {source.reliability}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TracesTab({ traces }: { traces: Trace[] }) {
  if (traces.length === 0) return <EmptyState title="No traces" description="No pipeline traces found for this content" />;

  const sortedTraces = [...traces].sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
  const totalTokens = traces.reduce((s, t) => s + (t.total_tokens || 0), 0);
  const totalLatency = traces.reduce((s, t) => s + (t.latency_ms || 0), 0);
  const totalCost = traces.reduce((s, t) => s + (t.estimated_cost_usd || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-gray-900 tabular-nums">{totalTokens.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Total Tokens</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-gray-900 tabular-nums">{(totalLatency / 1000).toFixed(1)}s</div>
          <div className="text-xs text-gray-500">Total Latency</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-gray-900 tabular-nums">${totalCost.toFixed(4)}</div>
          <div className="text-xs text-gray-500">Est. Cost</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {sortedTraces.map((trace, i) => {
          const stageColors = STAGE_COLORS[trace.stage] || STAGE_COLORS.failed;
          const isLast = i === sortedTraces.length - 1;
          return (
            <div key={trace.id} className="flex gap-4">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${stageColors.dot} flex-shrink-0 mt-1.5`} />
                {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
              </div>
              {/* Content */}
              <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-medium ${stageColors.text} capitalize`}>{trace.stage}</span>
                  <span className={`px-1.5 py-0.5 text-xs rounded ${trace.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {trace.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>{trace.model}</span>
                  <span>{(trace.total_tokens || 0).toLocaleString()} tokens</span>
                  <span>{((trace.latency_ms || 0) / 1000).toFixed(1)}s</span>
                  {trace.estimated_cost_usd && <span>${trace.estimated_cost_usd.toFixed(4)}</span>}
                </div>
                {trace.error_message && (
                  <p className="text-xs text-red-500 mt-1 bg-red-50 p-2 rounded">{trace.error_message}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlatformsTab({ platforms }: { platforms: Record<string, string> | null }) {
  if (!platforms || Object.keys(platforms).length === 0) {
    return <EmptyState title="No platform versions" description="Platform-specific content hasn't been generated yet" />;
  }
  return (
    <div className="space-y-4">
      {Object.entries(platforms).map(([platform, content]) => (
        <div key={platform} className="border border-gray-100 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 capitalize mb-2">{platform}</h3>
          <pre className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-4">{typeof content === 'string' ? content : JSON.stringify(content, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

function MetaTab({ content, tags }: { content: Content; tags: string[] | null }) {
  const fields = [
    { label: 'Meta Description', value: content.meta_description },
    { label: 'Meta Keywords', value: content.meta_keywords },
    { label: 'Category', value: content.category },
    { label: 'Slug', value: content.slug },
    { label: 'OG Image Prompt', value: content.og_image_prompt },
  ];

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.label}>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{f.label}</div>
          <div className="text-sm text-gray-700">{f.value || <span className="text-gray-300">Not set</span>}</div>
        </div>
      ))}
      {tags && tags.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Tags</div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      )}
      {content.scheduled_publish_at && (
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Scheduled Publish</div>
          <div className="text-sm text-gray-700">{formatDatetime(content.scheduled_publish_at)}</div>
        </div>
      )}
      {content.published_at && (
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Published At</div>
          <div className="text-sm text-gray-700">{formatDatetime(content.published_at)}</div>
        </div>
      )}
    </div>
  );
}
