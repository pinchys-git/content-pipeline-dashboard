import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { fetchContentDetail, fetchTraces, fetchAudit, fetchTracePayload, fetchPipelineStatus, deleteContent, updateContent, approveContent, rejectContent, resumePipeline } from '../lib/api';
import type { Content, Claim, Source, Trace, Revision, AuditResponse, AuditTimelineEvent, AuditSummary, TracePayloadResponse } from '../lib/types';
import { STAGE_COLORS, CLAIM_STATUS_COLORS, RELIABILITY_COLORS, formatDate, formatDatetime, parseJSON, qualityColor } from '../lib/utils';
import StageBadge from '../components/StageBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const TABS = ['Article', 'Claims', 'Sources', 'Traces', 'Platforms', 'Meta'] as const;
type Tab = typeof TABS[number];

const PIPELINE_STAGES = ['queued', 'research', 'draft', 'verify', 'format', 'edit'];
const TERMINAL_STAGES = ['review', 'scheduled', 'published', 'failed'];

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
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Action states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshContent = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchContentDetail(id);
      setContent(data.content);
      setClaims(data.claims || []);
      setSources(data.sources || []);
    } catch { /* ignore */ }
  }, [id]);

  // Action handlers
  const handleDelete = useCallback(async () => {
    if (!id) return;
    setActionLoading('delete');
    try {
      await deleteContent(id);
      showToast('Content deleted');
      navigate(-1);
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error');
    } finally {
      setActionLoading(null);
      setConfirmingDelete(false);
    }
  }, [id, navigate, showToast]);

  const handleRetry = useCallback(async () => {
    if (!id) return;
    setActionLoading('retry');
    try {
      await resumePipeline(id);
      showToast('Pipeline restarted');
      await refreshContent();
      setIsPolling(true);
    } catch (e: any) {
      showToast(e?.message || 'Retry failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [id, showToast, refreshContent]);

  const handleApprove = useCallback(async () => {
    if (!id) return;
    setActionLoading('approve');
    try {
      await approveContent(id, 'published');
      showToast('Content approved & published');
      await refreshContent();
    } catch (e: any) {
      showToast(e?.message || 'Approve failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [id, showToast, refreshContent]);

  const handleReject = useCallback(async () => {
    if (!id || !rejectReason.trim()) return;
    setActionLoading('reject');
    try {
      await rejectContent(id, 'draft', rejectReason.trim());
      showToast('Content rejected');
      setRejectMode(false);
      setRejectReason('');
      await refreshContent();
    } catch (e: any) {
      showToast(e?.message || 'Reject failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [id, rejectReason, showToast, refreshContent]);

  const handleCancel = useCallback(async () => {
    if (!id) return;
    if (!window.confirm('Cancel this pipeline run? This will mark it as failed.')) return;
    setActionLoading('cancel');
    try {
      await updateContent(id, { stage: 'failed' } as any);
      showToast('Pipeline cancelled');
      setIsPolling(false);
      await refreshContent();
    } catch (e: any) {
      showToast(e?.message || 'Cancel failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [id, showToast, refreshContent]);

  const handlePublishNow = useCallback(async () => {
    if (!id) return;
    setActionLoading('publish');
    try {
      await approveContent(id, 'published');
      showToast('Published');
      await refreshContent();
    } catch (e: any) {
      showToast(e?.message || 'Publish failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [id, showToast, refreshContent]);

  const handleUnpublish = useCallback(async () => {
    if (!id) return;
    if (!window.confirm('Move this article back to review?')) return;
    setActionLoading('unpublish');
    try {
      await updateContent(id, { stage: 'review' } as any);
      showToast('Moved back to review');
      await refreshContent();
    } catch (e: any) {
      showToast(e?.message || 'Unpublish failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [id, showToast, refreshContent]);

  // Initial data load
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchContentDetail(id)
      .then(async (data) => {
        setContent(data.content);
        setClaims(data.claims || []);
        setSources(data.sources || []);
        if (data.content.run_id) {
          try {
            const t = await fetchTraces(data.content.run_id);
            setTraces(t);
          } catch { /* ignore */ }
        }
        // Start polling if in pipeline stage
        if (PIPELINE_STAGES.includes(data.content.stage)) {
          setIsPolling(true);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Live polling for in-progress articles
  useEffect(() => {
    if (!isPolling || !content?.run_id) return;

    const poll = async () => {
      try {
        const status = await fetchPipelineStatus(content.run_id!);
        if (status.content) {
          setContent(status.content);
          if (TERMINAL_STAGES.includes(status.content.stage)) {
            setIsPolling(false);
          }
        }
        if (status.traces) {
          setTraces(status.traces);
        }
      } catch { /* ignore polling errors */ }
    };

    pollingRef.current = setInterval(poll, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isPolling, content?.run_id, content?.stage]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;
  if (!content) return <EmptyState title="Content not found" />;

  const markdown = content.final_md || content.draft_md || '';
  const platforms = parseJSON<Record<string, string>>(content.platforms);
  const tags = parseJSON<string[]>(content.tags);

  const stage = content.stage;
  const inProgressStages = ['queued', 'research', 'draft', 'verify', 'format', 'edit'];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Back */}
      <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-600 transition flex items-center gap-1">
        <span>←</span> Back
      </button>

      {/* Pipeline running banner */}
      {isPolling && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
          </span>
          <div>
            <span className="text-sm font-medium text-blue-800">🔄 Pipeline running...</span>
            <span className="text-sm text-blue-600 ml-2">Stage: <span className="font-medium capitalize">{content.stage}</span></span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <div className="relative">
            <StageBadge stage={content.stage} size="md" />
            {isPolling && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
            )}
          </div>
          {content.requires_review ? (
            <span className="px-2.5 py-1 text-sm rounded-full bg-amber-50 text-amber-700 font-medium">Needs Review</span>
          ) : null}
          <Link
            to={`/content/${content.id}/review`}
            className="px-4 py-1.5 text-sm font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
          >
            ✏️ Edit Article
          </Link>
        </div>

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Failed: Retry */}
          {stage === 'failed' && (
            <button
              onClick={handleRetry}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {actionLoading === 'retry' ? '⏳ Retrying...' : '🔄 Retry Pipeline'}
            </button>
          )}

          {/* Review: Approve & Reject */}
          {stage === 'review' && (
            <>
              <button
                onClick={handleApprove}
                disabled={!!actionLoading}
                className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                {actionLoading === 'approve' ? '⏳ Approving...' : '✅ Approve & Publish'}
              </button>
              {!rejectMode ? (
                <button
                  onClick={() => setRejectMode(true)}
                  disabled={!!actionLoading}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                >
                  ❌ Reject
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason..."
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 w-64"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleReject(); }}
                    autoFocus
                  />
                  <button
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || !!actionLoading}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {actionLoading === 'reject' ? '⏳...' : 'Send'}
                  </button>
                  <button
                    onClick={() => { setRejectMode(false); setRejectReason(''); }}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-gray-100 text-gray-600 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}

          {/* In-progress: Cancel */}
          {inProgressStages.includes(stage) && (
            <button
              onClick={handleCancel}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {actionLoading === 'cancel' ? '⏳ Cancelling...' : '⏸️ Cancel'}
            </button>
          )}

          {/* Scheduled: Publish Now & Cancel */}
          {stage === 'scheduled' && (
            <>
              <button
                onClick={handlePublishNow}
                disabled={!!actionLoading}
                className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                {actionLoading === 'publish' ? '⏳ Publishing...' : '🚀 Publish Now'}
              </button>
              <button
                onClick={handleCancel}
                disabled={!!actionLoading}
                className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                {actionLoading === 'cancel' ? '⏳...' : '❌ Cancel'}
              </button>
            </>
          )}

          {/* Published: Unpublish */}
          {stage === 'published' && (
            <button
              onClick={handleUnpublish}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              {actionLoading === 'unpublish' ? '⏳...' : '📝 Unpublish'}
            </button>
          )}

          {/* Delete — all stages, always last */}
          <div className="ml-auto">
            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={!!actionLoading}
                className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                🗑️ Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Are you sure? This deletes the article and all traces/claims/sources.</span>
                <button
                  onClick={handleDelete}
                  disabled={!!actionLoading}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading === 'delete' ? '⏳...' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg transition bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{content.title || 'Untitled'}</h1>
        {content.excerpt && <p className="text-sm text-gray-500 mb-4">{content.excerpt}</p>}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm text-gray-500">
          {content.quality_score !== null && content.quality_score !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Quality</span>
              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${qualityColor(content.quality_score)}`} style={{ width: `${Math.round((content.quality_score || 0) * 100)}%` }} />
              </div>
              <span className="font-medium tabular-nums">{Math.round((content.quality_score || 0) * 100)}%</span>
            </div>
          )}
          {content.word_count && <span>{(content.word_count || 0).toLocaleString()} words</span>}
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
          {tab === 'Claims' && <ClaimsTab claims={claims} sources={sources} />}
          {tab === 'Sources' && <SourcesTab sources={sources} claims={claims} />}
          {tab === 'Traces' && <EnhancedTracesTab contentId={content.id} runId={content.run_id} fallbackTraces={traces} />}
          {tab === 'Platforms' && <PlatformsTab platforms={platforms} />}
          {tab === 'Meta' && <MetaTab content={content} tags={tags} />}
        </div>
      </div>
    </div>
  );
}

/* ========== Article Tab ========== */
function ArticleTab({ markdown }: { markdown: string }) {
  if (!markdown) return <EmptyState title="No article content" description="This content hasn't been drafted yet" />;
  return (
    <div className="prose max-w-none">
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}

/* ========== Claims Tab ========== */
function ClaimsTab({ claims, sources }: { claims: Claim[]; sources: Source[] }) {
  const [showSuperseded, setShowSuperseded] = useState(false);

  if (claims.length === 0) return <EmptyState title="No claims" description="No claims have been extracted for this content" />;

  const sourcesByClaim = sources.reduce<Record<string, Source[]>>((acc, src) => {
    if (src.claim_id) {
      if (!acc[src.claim_id]) acc[src.claim_id] = [];
      acc[src.claim_id].push(src);
    }
    return acc;
  }, {});

  // Build claim lookup by ID for lineage
  const claimsById = claims.reduce<Record<string, Claim>>((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {});

  const activeClaims = claims.filter(c => c.resolution_status !== 'superseded');
  const supersededClaims = claims.filter(c => c.resolution_status === 'superseded');

  const renderClaim = (claim: Claim, dimmed: boolean) => {
    const colors = CLAIM_STATUS_COLORS[claim.status] || CLAIM_STATUS_COLORS.pending;
    const claimSources = sourcesByClaim[claim.id] || [];
    const previousClaim = claim.previous_claim_id ? claimsById[claim.previous_claim_id] : null;

    return (
      <div key={claim.id} className={`border border-gray-100 rounded-lg p-4 ${dimmed ? 'opacity-50 bg-gray-50' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${colors.bg} ${colors.text} capitalize`}>
              {claim.status}
            </span>
            {claim.resolution_status === 'superseded' && (
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-600">
                Superseded
              </span>
            )}
            {claim.resolution_status && claim.resolution_status !== 'superseded' && (
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                claim.resolution_status === 'corrected' ? 'bg-blue-50 text-blue-700' :
                claim.resolution_status === 'dismissed' ? 'bg-gray-100 text-gray-500' :
                claim.resolution_status === 'verified_override' ? 'bg-green-50 text-green-700' :
                claim.resolution_status === 'flagged_for_review' ? 'bg-amber-50 text-amber-700' :
                claim.resolution_status === 'verified' ? 'bg-green-50 text-green-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {claim.resolution_status === 'corrected' ? '✏️ Corrected' :
                 claim.resolution_status === 'dismissed' ? '🚫 Dismissed' :
                 claim.resolution_status === 'verified_override' ? '✓ Override' :
                 claim.resolution_status === 'flagged_for_review' ? '⚠️ Review' :
                 claim.resolution_status === 'verified' ? '✓ Verified' :
                 claim.resolution_status}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {claim.suggested_revision ? (
              <div className="text-sm">
                <span className="text-gray-900">{claim.claim_text}</span>
                <span className="mx-2 text-gray-400">→</span>
                <span className="text-blue-700 font-medium">&quot;{claim.suggested_revision}&quot;</span>
              </div>
            ) : (
              <p className="text-sm text-gray-900">{claim.claim_text}</p>
            )}
            {claim.revision_loop != null && (
              <span className="inline-flex px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500 mt-1">
                Loop #{claim.revision_loop}
              </span>
            )}
            {previousClaim && (
              <div className="mt-2 p-2 bg-gray-50 rounded-md border border-gray-100 text-xs text-gray-500">
                <span className="font-medium">Revised from:</span> &quot;{previousClaim.claim_text}&quot;
              </div>
            )}
            {claim.context && <p className="text-xs text-gray-400 mt-1">{claim.context}</p>}
            {claim.verification_notes && (
              <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-md p-2">{claim.verification_notes}</p>
            )}
            {claimSources.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Sources ({claimSources.length})</p>
                {claimSources.map((src) => {
                  const srcUrl = src.resolved_url || src.url;
                  const srcTitle = src.page_title || src.title;
                  const srcDomain = (() => { try { return new URL(srcUrl || src.url || '').hostname.replace(/^www\./, ''); } catch { return null; } })();
                  // Use real title, fall back to domain, last resort raw URL
                  const linkText = srcTitle && srcTitle !== srcDomain ? srcTitle : srcDomain || srcUrl;
                  return (
                    <div key={src.id} className="flex items-center gap-2 text-xs">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        src.reliability === 'high' ? 'bg-green-400' : src.reliability === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
                      }`} />
                      {srcUrl ? (
                        <a href={srcUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                          {linkText}
                        </a>
                      ) : (
                        <span className="text-gray-500">{linkText || 'Unknown source'}</span>
                      )}
                      {srcTitle && srcDomain && srcTitle !== srcDomain && (
                        <span className="text-gray-400 flex-shrink-0">({srcDomain})</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-medium text-gray-900 tabular-nums">{Math.round((claim.confidence ?? 0) * 100)}%</div>
            <div className="text-xs text-gray-400">confidence</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {activeClaims.map((claim) => renderClaim(claim, false))}
      {supersededClaims.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowSuperseded(!showSuperseded)}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
          >
            <span className="select-none">{showSuperseded ? '▼' : '▶'}</span>
            <span>Show superseded claims ({supersededClaims.length})</span>
          </button>
          {showSuperseded && (
            <div className="mt-2 space-y-3">
              {supersededClaims.map((claim) => renderClaim(claim, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ========== Sources Tab (grouped by claim) ========== */
function SourcesTab({ sources, claims }: { sources: Source[]; claims: Claim[] }) {
  if (sources.length === 0) return <EmptyState title="No sources" description="No sources have been collected for this content" />;

  // Build a map of claims by id
  const claimsById = claims.reduce<Record<string, Claim>>((acc, claim) => {
    acc[claim.id] = claim;
    return acc;
  }, {});

  // Group sources by claim_id
  const sourcesByClaim: Record<string, Source[]> = {};
  const uncategorized: Source[] = [];

  sources.forEach((src) => {
    if (src.claim_id && claimsById[src.claim_id]) {
      if (!sourcesByClaim[src.claim_id]) sourcesByClaim[src.claim_id] = [];
      sourcesByClaim[src.claim_id].push(src);
    } else {
      uncategorized.push(src);
    }
  });

  // Order claim groups by the claim order in the claims array
  const orderedClaimIds = claims
    .filter((c) => sourcesByClaim[c.id])
    .map((c) => c.id);

  return (
    <div className="space-y-6">
      {orderedClaimIds.map((claimId) => {
        const claim = claimsById[claimId];
        const claimSources = sourcesByClaim[claimId];
        const statusColors = CLAIM_STATUS_COLORS[claim?.status] || CLAIM_STATUS_COLORS.pending;
        const confidence = Math.round((claim?.confidence ?? 0) * 100);

        return (
          <div key={claimId} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Claim header */}
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-start gap-3">
                <span className="text-base flex-shrink-0 mt-0.5">📌</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium text-gray-900">Claim</span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.bg} ${statusColors.text} capitalize`}>
                      {claim?.status || 'pending'}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">{confidence}% confidence</span>
                    {claim?.resolution_status && (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        claim.resolution_status === 'corrected' ? 'bg-blue-50 text-blue-700' :
                        claim.resolution_status === 'flagged_for_review' ? 'bg-amber-50 text-amber-700' :
                        claim.resolution_status === 'verified' ? 'bg-green-50 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {claim.resolution_status === 'corrected' ? '✏️ Corrected' :
                         claim.resolution_status === 'flagged_for_review' ? '⚠️ Needs Review' :
                         claim.resolution_status === 'verified' ? '✓ Verified' :
                         claim.resolution_status}
                      </span>
                    )}
                  </div>
                  {claim?.suggested_revision ? (
                    <div className="text-sm">
                      <span className="text-gray-800">{claim?.claim_text || 'Unknown claim'}</span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="text-blue-700 font-medium">Suggested: &quot;{claim.suggested_revision}&quot;</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-800">{claim?.claim_text || 'Unknown claim'}</p>
                  )}
                  {claim?.verification_notes && (
                    <div className="mt-2 p-2.5 bg-white rounded-lg border border-gray-100 text-xs text-gray-600">
                      <span className="font-medium text-gray-500">Verification: </span>
                      {claim.verification_notes}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Sources under this claim */}
            <div className="divide-y divide-gray-100">
              {claimSources.map((source) => (
                <SourceRow key={source.id} source={source} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Uncategorized sources */}
      {uncategorized.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-base">📎</span>
              <span className="text-sm font-medium text-gray-700">Uncategorized Sources</span>
              <span className="text-xs text-gray-400">({uncategorized.length})</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {uncategorized.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Source Row (reusable) ---- */
function SourceRow({ source }: { source: Source }) {
  const reliabilityColors = RELIABILITY_COLORS[source.reliability] || RELIABILITY_COLORS.medium;
  const displayTitle = source.page_title || source.title;
  const displayUrl = source.resolved_url || source.url;
  const displayDate = source.publish_date || source.published_date;

  // Filter out generic/useless snippets
  const isUsefulSnippet = source.snippet
    && source.snippet !== 'Verified via Gemini search grounding'
    && source.snippet.length > 10;

  // Extract domain for display
  const domain = (() => {
    try {
      const url = new URL(displayUrl || source.url || '');
      return url.hostname.replace(/^www\./, '');
    } catch { return null; }
  })();

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 flex-shrink-0">📄</span>
            {displayUrl ? (
              <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline line-clamp-2">
                {displayTitle || domain || displayUrl}
              </a>
            ) : (
              <span className="text-sm font-medium text-gray-700">{displayTitle || 'Unknown source'}</span>
            )}
            {source.author && <span className="text-xs text-gray-400 flex-shrink-0">by {source.author}</span>}
          </div>
          {/* Show domain separately when we have a real title */}
          {displayTitle && domain && (
            <span className="text-xs text-gray-400 mt-0.5 ml-5 flex items-center gap-2">
              {domain}
              {source.author && <span>· {source.author}</span>}
            </span>
          )}
          {!displayTitle && source.author && (
            <p className="text-xs text-gray-400 mt-0.5 ml-5">by {source.author}</p>
          )}
          {source.page_description && (
            <p className="text-xs text-gray-500 mt-1 ml-5 line-clamp-2">{source.page_description}</p>
          )}
          {(displayDate || source.last_modified) && (
            <p className="text-xs text-gray-400 mt-1 ml-5 flex items-center gap-3">
              {displayDate && <span>📅 Published {formatDate(displayDate)}</span>}
              {source.last_modified && <span>✏️ Updated {formatDate(source.last_modified)}</span>}
            </p>
          )}
          {isUsefulSnippet && (
            <p className="text-xs text-gray-600 mt-1.5 ml-5 bg-gray-50 rounded-md p-2 border border-gray-100">
              {source.snippet}
            </p>
          )}
        </div>
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${reliabilityColors.bg} ${reliabilityColors.text} capitalize flex-shrink-0`}>
          {source.reliability || 'medium'}
        </span>
      </div>
    </div>
  );
}

/* ========== Enhanced Traces / Audit Tab ========== */
const STAGE_FILTER_OPTIONS = ['all', 'research', 'draft', 'verify', 'format', 'edit'] as const;

function EnhancedTracesTab({ contentId, runId, fallbackTraces }: { contentId: string; runId: string | null; fallbackTraces: Trace[] }) {
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [tracePayloads, setTracePayloads] = useState<Record<string, TracePayloadResponse>>({});
  const [loadingPayloads, setLoadingPayloads] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetchAudit(contentId)
      .then(setAudit)
      .catch((e) => {
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [contentId]);

  const toggleEvent = useCallback((eventKey: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventKey)) {
        next.delete(eventKey);
      } else {
        next.add(eventKey);
      }
      return next;
    });
  }, []);

  const loadTracePayload = useCallback(async (traceId: string) => {
    if (tracePayloads[traceId] || loadingPayloads.has(traceId)) return;
    setLoadingPayloads(prev => new Set(prev).add(traceId));
    try {
      const payload = await fetchTracePayload(contentId, traceId);
      setTracePayloads(prev => ({ ...prev, [traceId]: payload }));
    } catch { /* ignore */ }
    setLoadingPayloads(prev => {
      const next = new Set(prev);
      next.delete(traceId);
      return next;
    });
  }, [contentId, tracePayloads, loadingPayloads]);

  if (loading) return <LoadingSpinner />;

  // If audit API fails, fall back to basic traces view
  if (error || !audit) {
    if (fallbackTraces.length === 0) return <EmptyState title="No traces" description="No pipeline traces found for this content" />;
    return <FallbackTracesView traces={fallbackTraces} />;
  }

  const { summary, timeline } = audit;
  const filteredTimeline = stageFilter === 'all'
    ? timeline
    : timeline.filter(e => (e.stage || '') === stageFilter);

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <AuditSummaryBar summary={summary} />

      {/* Stage Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filter by stage:</span>
        {STAGE_FILTER_OPTIONS.map(stage => (
          <button
            key={stage}
            onClick={() => setStageFilter(stage)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition capitalize ${
              stageFilter === stage
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {stage}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filteredTimeline.length === 0 ? (
        <EmptyState title="No events" description={stageFilter === 'all' ? 'No timeline events found' : `No events for the "${stageFilter}" stage`} />
      ) : (
        <div className="space-y-0">
          {filteredTimeline.map((event, i) => {
            const eventKey = `${event.type}-${event.timestamp}-${i}`;
            const isExpanded = expandedEvents.has(eventKey);
            const isLast = i === filteredTimeline.length - 1;

            return (
              <TimelineEvent
                key={eventKey}
                event={event}
                eventKey={eventKey}
                isExpanded={isExpanded}
                isLast={isLast}
                onToggle={toggleEvent}
                onLoadPayload={loadTracePayload}
                payload={event.type === 'trace' && event.data?.id ? tracePayloads[event.data.id] : undefined}
                isLoadingPayload={event.type === 'trace' && event.data?.id ? loadingPayloads.has(event.data.id) : false}
                contentId={contentId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---- Summary Bar ---- */
function AuditSummaryBar({ summary }: { summary: AuditSummary }) {
  return (
    <div className="space-y-3">
      {/* Top row: LLM stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon="⚡" label="LLM Calls" value={(summary.total_calls || 0).toLocaleString()} />
        <SummaryCard icon="◈" label="Total Tokens" value={formatTokensShort(summary.total_tokens)} />
        <SummaryCard icon="💰" label="Est. Cost" value={`$${(summary.estimated_cost_usd ?? 0).toFixed(4)}`} />
        <SummaryCard icon="⏱" label="Total Latency" value={`${((summary.total_latency_ms || 0) / 1000).toFixed(1)}s`} />
      </div>
      {/* Bottom row: claims + revisions */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard icon="📋" label="Total Claims" value={(summary.claims?.total || 0).toLocaleString()} small />
        <SummaryCard icon="✅" label="Verified" value={(summary.claims?.verified || 0).toLocaleString()} small color="text-green-600" />
        <SummaryCard icon="⚠️" label="Disputed" value={(summary.claims?.disputed || 0).toLocaleString()} small color="text-red-600" />
        <SummaryCard icon="❓" label="Unverifiable" value={(summary.claims?.unverifiable || 0).toLocaleString()} small color="text-yellow-600" />
        <SummaryCard icon="📝" label="Revisions" value={(summary.revisions || 0).toLocaleString()} small />
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, small, color }: { icon: string; label: string; value: string; small?: boolean; color?: string }) {
  return (
    <div className={`bg-gray-50 rounded-lg ${small ? 'p-2.5' : 'p-3'} text-center`}>
      <div className={`${small ? 'text-base' : 'text-lg'} font-semibold tabular-nums ${color || 'text-gray-900'}`}>
        <span className="mr-1">{icon}</span>{value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function formatTokensShort(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return (n || 0).toLocaleString();
}

/* ---- Timeline Event ---- */
function TimelineEvent({
  event, eventKey, isExpanded, isLast, onToggle, onLoadPayload, payload, isLoadingPayload, contentId
}: {
  event: AuditTimelineEvent;
  eventKey: string;
  isExpanded: boolean;
  isLast: boolean;
  onToggle: (key: string) => void;
  onLoadPayload: (traceId: string) => void;
  payload?: TracePayloadResponse;
  isLoadingPayload: boolean;
  contentId: string;
}) {
  const handleClick = () => {
    onToggle(eventKey);
    // Lazy-load trace payload on first expand
    if (!isExpanded && event.type === 'trace' && event.data?.id) {
      onLoadPayload(event.data.id);
    }
  };

  const stageColors = STAGE_COLORS[event.stage || ''] || STAGE_COLORS.failed;
  const eventTime = event.timestamp ? new Date(event.timestamp) : null;
  const timeStr = eventTime ? eventTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
  const dateStr = eventTime ? eventTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

  // Dot color by event type
  let dotColor = stageColors.dot;
  if (event.type === 'claim') {
    const status = event.data?.status || '';
    if (status === 'verified') dotColor = 'bg-green-500';
    else if (status === 'disputed') dotColor = 'bg-red-500';
    else if (status === 'unverifiable') dotColor = 'bg-yellow-500';
    else dotColor = 'bg-gray-400';
  } else if (event.type === 'revision') {
    dotColor = 'bg-indigo-500';
  } else if (event.type === 'stage_change') {
    dotColor = 'bg-gray-800';
  }

  // Status color for traces
  let statusBadge = null;
  if (event.type === 'trace') {
    const status = event.data?.status || '';
    if (status === 'success') {
      statusBadge = <span className="px-1.5 py-0.5 text-xs rounded bg-green-50 text-green-700">success</span>;
    } else if (status === 'error') {
      statusBadge = <span className="px-1.5 py-0.5 text-xs rounded bg-red-50 text-red-700">error</span>;
    } else if (status === 'warning') {
      statusBadge = <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-50 text-yellow-700">warning</span>;
    }
  }

  return (
    <div className="flex gap-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-3 h-3 rounded-full ${dotColor} flex-shrink-0 mt-1.5`} />
        {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
      </div>
      {/* Content */}
      <div className={`flex-1 pb-4 min-w-0`}>
        <button
          onClick={handleClick}
          className="flex items-start gap-2 w-full text-left group"
        >
          <span className="text-gray-400 text-xs mt-0.5 select-none">{isExpanded ? '▼' : '▶'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EventTypeIcon type={event.type} />
              {event.stage && (
                <span className={`text-sm font-medium ${stageColors.text} capitalize`}>{event.stage}</span>
              )}
              {statusBadge}
              <span className="text-xs text-gray-400 tabular-nums">{dateStr} {timeStr}</span>
            </div>
            <p className="text-sm text-gray-700 mt-0.5">{event.summary}</p>
            {/* Quick stats for traces */}
            {event.type === 'trace' && (
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                {event.data?.model && <span>{event.data.model}</span>}
                {event.data?.total_tokens != null && <span>{(event.data.total_tokens || 0).toLocaleString()} tokens</span>}
                {event.data?.latency_ms != null && <span>{((event.data.latency_ms || 0) / 1000).toFixed(1)}s</span>}
                {event.data?.estimated_cost_usd != null && <span>${(event.data.estimated_cost_usd || 0).toFixed(4)}</span>}
              </div>
            )}
            {/* Claim details */}
            {event.type === 'claim' && (
              <div className="flex flex-wrap gap-3 text-xs mt-1">
                {event.data?.status && (
                  <span className={`px-1.5 py-0.5 rounded capitalize ${
                    event.data.status === 'verified' ? 'bg-green-50 text-green-700' :
                    event.data.status === 'disputed' ? 'bg-red-50 text-red-700' :
                    event.data.status === 'unverifiable' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{event.data.status}</span>
                )}
                {event.data?.confidence != null && (
                  <span className="text-gray-500">{Math.round((event.data.confidence || 0) * 100)}% confidence</span>
                )}
              </div>
            )}
            {/* Error messages */}
            {event.data?.error_message && (
              <p className="text-xs text-red-500 mt-1 bg-red-50 p-2 rounded">{event.data.error_message}</p>
            )}
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3 ml-5">
            {event.type === 'trace' && (
              <TracePayloadViewer
                payload={payload}
                isLoading={isLoadingPayload}
              />
            )}
            {event.type === 'claim' && (
              <ClaimEventDetail event={event} />
            )}
            {event.type === 'revision' && (
              <RevisionEventDetail event={event} />
            )}
            {event.type === 'source' && (
              <SourceEventDetail event={event} />
            )}
            {event.detail && event.type !== 'claim' && event.type !== 'revision' && event.type !== 'source' && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">{event.detail}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    trace: '🤖',
    claim: '📋',
    source: '🔗',
    revision: '📝',
    stage_change: '🔄',
  };
  return <span className="text-sm">{icons[type] || '•'}</span>;
}

/* ---- Trace Payload Viewer ---- */
function TracePayloadViewer({ payload, isLoading }: { payload?: TracePayloadResponse; isLoading: boolean }) {
  const [showSystem, setShowSystem] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showResponse, setShowResponse] = useState(true);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
        <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading trace payload...
      </div>
    );
  }

  if (!payload) {
    return <div className="text-xs text-gray-400 py-2">Payload not available</div>;
  }

  const { parsed_request, response_text } = payload;

  return (
    <div className="space-y-3 border border-gray-200 rounded-lg overflow-hidden">
      {/* System Prompt */}
      {parsed_request?.system && (
        <div>
          <button
            onClick={() => setShowSystem(!showSystem)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition text-left"
          >
            <span className="text-gray-400 text-xs select-none">{showSystem ? '▼' : '▶'}</span>
            <span className="text-xs font-medium text-gray-700">System Prompt</span>
            <span className="text-xs text-gray-400 ml-auto">{(parsed_request.system || '').length} chars</span>
          </button>
          {showSystem && (
            <div className="px-3 py-2 max-h-64 overflow-y-auto">
              <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-words">{parsed_request.system}</pre>
            </div>
          )}
        </div>
      )}

      {/* Messages (user prompts) */}
      {parsed_request?.messages && parsed_request.messages.length > 0 && (
        <div>
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition text-left border-t border-gray-200"
          >
            <span className="text-gray-400 text-xs select-none">{showMessages ? '▼' : '▶'}</span>
            <span className="text-xs font-medium text-gray-700">Messages ({parsed_request.messages.length})</span>
            {parsed_request.model && <span className="text-xs text-gray-400 ml-auto">{parsed_request.model}</span>}
          </button>
          {showMessages && (
            <div className="px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
              {parsed_request.messages.map((msg, i) => (
                <div key={i} className="border-l-2 border-gray-200 pl-3">
                  <span className={`text-xs font-medium uppercase ${
                    msg.role === 'user' ? 'text-blue-600' : msg.role === 'assistant' ? 'text-green-600' : 'text-gray-500'
                  }`}>{msg.role}</span>
                  <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-words mt-0.5">
                    {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Response */}
      {response_text && (
        <div>
          <button
            onClick={() => setShowResponse(!showResponse)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition text-left border-t border-gray-200"
          >
            <span className="text-gray-400 text-xs select-none">{showResponse ? '▼' : '▶'}</span>
            <span className="text-xs font-medium text-gray-700">Response</span>
            <span className="text-xs text-gray-400 ml-auto">{(response_text || '').length} chars</span>
          </button>
          {showResponse && (
            <div className="px-3 py-2 max-h-96 overflow-y-auto">
              <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-words">{response_text}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Claim Event Detail ---- */
function ClaimEventDetail({ event }: { event: AuditTimelineEvent }) {
  const data = event.data || {};
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      {data.claim_text && (
        <div>
          <span className="text-xs font-medium text-gray-500">Claim:</span>
          <p className="text-sm text-gray-800 mt-0.5">{data.claim_text}</p>
        </div>
      )}
      {data.verification_notes && (
        <div>
          <span className="text-xs font-medium text-gray-500">Verification Notes:</span>
          <p className="text-xs text-gray-600 mt-0.5">{data.verification_notes}</p>
        </div>
      )}
      {data.context && (
        <div>
          <span className="text-xs font-medium text-gray-500">Context:</span>
          <p className="text-xs text-gray-600 mt-0.5">{data.context}</p>
        </div>
      )}
    </div>
  );
}

/* ---- Revision Event Detail ---- */
function RevisionEventDetail({ event }: { event: AuditTimelineEvent }) {
  const data = event.data || {};
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        {data.revision_number != null && <span>Revision #{data.revision_number}</span>}
        {data.changed_by && <span>By: {data.changed_by}</span>}
        {data.change_type && <span>Type: {data.change_type}</span>}
      </div>
      {data.diff_summary && (
        <div>
          <span className="text-xs font-medium text-gray-500">Changes:</span>
          <p className="text-xs text-gray-600 mt-0.5">{data.diff_summary}</p>
        </div>
      )}
      {data.feedback && (
        <div>
          <span className="text-xs font-medium text-gray-500">Feedback:</span>
          <p className="text-xs text-gray-600 mt-0.5">{data.feedback}</p>
        </div>
      )}
      {data.agent_notes && (
        <div>
          <span className="text-xs font-medium text-gray-500">Agent Notes:</span>
          <p className="text-xs text-gray-600 mt-0.5">{data.agent_notes}</p>
        </div>
      )}
    </div>
  );
}

/* ---- Source Event Detail ---- */
function SourceEventDetail({ event }: { event: AuditTimelineEvent }) {
  const data = event.data || {};
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      {data.url && (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block truncate">
          {data.url}
        </a>
      )}
      {data.snippet && <p className="text-xs text-gray-600">{data.snippet}</p>}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {data.source_type && <span>Type: {data.source_type}</span>}
        {data.reliability && (
          <span className={`px-1.5 py-0.5 rounded capitalize ${
            data.reliability === 'high' ? 'bg-green-50 text-green-700' :
            data.reliability === 'medium' ? 'bg-yellow-50 text-yellow-700' :
            'bg-red-50 text-red-700'
          }`}>{data.reliability}</span>
        )}
        {data.author && <span>By: {data.author}</span>}
      </div>
    </div>
  );
}

/* ---- Fallback Traces View (when audit API fails) ---- */
function FallbackTracesView({ traces }: { traces: Trace[] }) {
  const sortedTraces = [...traces].sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
  const totalTokens = traces.reduce((s, t) => s + (t.total_tokens || 0), 0);
  const totalLatency = traces.reduce((s, t) => s + (t.latency_ms || 0), 0);
  const totalCost = traces.reduce((s, t) => s + (t.estimated_cost_usd || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-gray-900 tabular-nums">{(totalTokens || 0).toLocaleString()}</div>
          <div className="text-xs text-gray-500">Total Tokens</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-gray-900 tabular-nums">{((totalLatency || 0) / 1000).toFixed(1)}s</div>
          <div className="text-xs text-gray-500">Total Latency</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-gray-900 tabular-nums">${(totalCost || 0).toFixed(4)}</div>
          <div className="text-xs text-gray-500">Est. Cost</div>
        </div>
      </div>
      <div className="space-y-0">
        {sortedTraces.map((trace, i) => {
          const stageColors = STAGE_COLORS[trace.stage] || STAGE_COLORS.failed;
          const isLast = i === sortedTraces.length - 1;
          return (
            <div key={trace.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${stageColors.dot} flex-shrink-0 mt-1.5`} />
                {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
              </div>
              <div className="flex-1 pb-4">
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
                  {trace.estimated_cost_usd != null && <span>${(trace.estimated_cost_usd || 0).toFixed(4)}</span>}
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

/* ========== Platforms Tab ========== */
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

/* ========== Meta Tab ========== */
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
