import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import TurndownService from 'turndown';
import {
  fetchContentDetail,
  fetchReviewMessages,
  fetchRevisions,
  sendReviewChat,
  createRevision,
  approveContent,
  rejectContent,
  resolveClaim,
  resolveAllClaims,
  getClaimsSummary,
  reVerifyClaims,
} from '../lib/api';
import type { ClaimsSummary } from '../lib/api';
import type { Content, Claim, ReviewMessage, Revision } from '../lib/types';
import { CLAIM_STATUS_COLORS, formatDatetime, parseJSON } from '../lib/utils';
import LoadingSpinner from '../components/LoadingSpinner';
import StageBadge from '../components/StageBadge';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

const SIDEBAR_TABS = ['Chat', 'Claims', 'Revisions', 'Meta'] as const;
type SidebarTab = typeof SIDEBAR_TABS[number];

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [content, setContent] = useState<Content | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [messages, setMessages] = useState<ReviewMessage[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('Chat');

  // Claims summary state
  const [claimsSummary, setClaimsSummary] = useState<ClaimsSummary | null>(null);

  // Editor state
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectStage, setRejectStage] = useState<'research' | 'draft'>('draft');
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Approve state
  const [approving, setApproving] = useState(false);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline' },
      }),
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[400px] px-6 py-4',
      },
    },
  });

  // Refresh content detail + claims
  const refreshContentAndClaims = useCallback(async () => {
    if (!id) return;
    try {
      const [detail, summary] = await Promise.all([
        fetchContentDetail(id),
        getClaimsSummary(id).catch(() => null),
      ]);
      setContent(detail.content);
      setClaims(detail.claims || []);
      if (summary) setClaimsSummary(summary);
    } catch (e: any) {
      // silent refresh failure
    }
  }, [id]);

  // Load data
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchContentDetail(id),
      fetchReviewMessages(id),
      fetchRevisions(id),
      getClaimsSummary(id).catch(() => null),
    ])
      .then(([detail, msgs, revs, summary]) => {
        setContent(detail.content);
        setClaims(detail.claims || []);
        setMessages(msgs);
        setRevisions(revs);
        if (summary) setClaimsSummary(summary);

        // Load markdown into editor
        const md = detail.content.final_md || detail.content.draft_md || '';
        if (editor && md) {
          const html = marked.parse(md, { async: false }) as string;
          editor.commands.setContent(html);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, editor]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load content into editor when editor becomes ready
  const loadContentIntoEditor = useCallback((md: string) => {
    if (!editor || !md) return;
    const html = marked.parse(md, { async: false }) as string;
    editor.commands.setContent(html);
  }, [editor]);

  // Save changes
  const handleSave = async () => {
    if (!editor || !id) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const html = editor.getHTML();
      const markdown = turndown.turndown(html);
      const result = await createRevision(id, markdown);

      // Refresh revisions
      const revs = await fetchRevisions(id);
      setRevisions(revs);

      if (result.concerns && result.concerns.length > 0) {
        setSaveMessage({ type: 'warning', text: `Saved. Concerns: ${result.concerns.join(', ')}` });
      } else {
        setSaveMessage({ type: 'success', text: result.revision.diff_summary || 'Changes saved.' });
      }

      // Auto-dismiss after 5s
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (e: any) {
      setSaveMessage({ type: 'warning', text: `Save failed: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  // Send chat message
  const handleSendChat = async () => {
    if (!chatInput.trim() || !id) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatSending(true);

    // Optimistic add
    const optimisticMsg: ReviewMessage = {
      id: 'temp-' + Date.now(),
      content_id: id,
      role: 'human',
      message: msg,
      actions_taken: '[]',
      stage_triggered: null,
      revision_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const response = await sendReviewChat(id, msg);

      // Add agent response
      const agentMsg: ReviewMessage = {
        id: 'agent-' + Date.now(),
        content_id: id,
        role: 'agent',
        message: response.message,
        actions_taken: JSON.stringify(response.actions_taken),
        stage_triggered: null,
        revision_id: response.revision?.id || null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, agentMsg]);

      // If content was updated, reload editor
      if (response.updated_content) {
        const newMd = response.updated_content.final_md || response.updated_content.draft_md || '';
        loadContentIntoEditor(newMd);
        setContent(response.updated_content);
      }

      // If there's a revision, refresh revision list
      if (response.revision) {
        const revs = await fetchRevisions(id);
        setRevisions(revs);
      }
    } catch (e: any) {
      // Add error message
      const errMsg: ReviewMessage = {
        id: 'err-' + Date.now(),
        content_id: id,
        role: 'agent',
        message: `Error: ${e.message}`,
        actions_taken: '[]',
        stage_triggered: null,
        revision_id: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setChatSending(false);
    }
  };

  // Approve
  const handleApprove = async (force?: boolean) => {
    if (!id) return;
    setApproving(true);
    try {
      await approveContent(id, 'published', force);
      navigate('/content');
    } catch (e: any) {
      alert(`Approve failed: ${e.message}`);
    } finally {
      setApproving(false);
    }
  };

  // Reject
  const handleReject = async () => {
    if (!id || !rejectFeedback.trim()) return;
    setRejecting(true);
    try {
      await rejectContent(id, rejectStage, rejectFeedback.trim());
      navigate('/content');
    } catch (e: any) {
      alert(`Reject failed: ${e.message}`);
    } finally {
      setRejecting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500 text-sm text-center py-8">{error}</div>;
  if (!content) return <div className="text-gray-500 text-sm text-center py-8">Content not found</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-600 transition flex-shrink-0">
            ← Back
          </button>
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate max-w-[200px] sm:max-w-md">{content.title || 'Untitled'}</h1>
          <StageBadge stage={content.stage} />
        </div>
      </div>

      {/* Two-panel layout - stacks vertically on mobile */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left Panel: Editor (scrolls naturally) */}
        <div className="w-full lg:w-[65%] flex flex-col">
          <div className="bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
            {/* Toolbar */}
            {editor && <EditorToolbar editor={editor} />}

            {/* Editor content */}
            <div className="flex-1 overflow-y-auto">
              <EditorContent editor={editor} />
            </div>

            {/* Save bar */}
            <div className="border-t border-gray-100 px-3 sm:px-4 py-3 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {saveMessage && (
                <span className={`text-xs px-3 py-1.5 rounded-lg ${
                  saveMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {saveMessage.text}
                </span>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="mt-3 bg-white border border-gray-200 rounded-xl px-3 sm:px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Claims status indicator */}
            {claimsSummary && claimsSummary.unresolved_count > 0 ? (
              <>
                <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full font-medium">
                  ⚠️ {claimsSummary.unresolved_count} unresolved claim{claimsSummary.unresolved_count !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => handleApprove(true)}
                  disabled={approving}
                  className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
                >
                  {approving ? 'Publishing...' : `Force Publish (${claimsSummary.unresolved_count} unresolved)`}
                </button>
              </>
            ) : (
              <>
                {claimsSummary && (
                  <span className="text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded-full font-medium">
                    ✅ All claims resolved
                  </span>
                )}
                <button
                  onClick={() => handleApprove(false)}
                  disabled={approving}
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {approving ? 'Publishing...' : 'Publish'}
                </button>
              </>
            )}
            <div className="flex-1" />
            <button
              onClick={() => setShowRejectModal(true)}
              className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
            >
              Reject
            </button>
          </div>
        </div>

        {/* Right Panel: Sidebar - below editor on mobile, sticky sidebar on desktop */}
        <div className="w-full lg:w-[35%] bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden lg:sticky lg:top-20" style={{ maxHeight: 'calc(100vh - 6rem)' }}>
          {/* Tabs */}
          <div className="border-b border-gray-100 px-3 sm:px-4 flex gap-0 overflow-x-auto">
            {SIDEBAR_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  sidebarTab === tab
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab}
                {tab === 'Claims' && claims.length > 0 && (
                  <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded-full">{claims.length}</span>
                )}
                {tab === 'Revisions' && revisions.length > 0 && (
                  <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded-full">{revisions.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content - on mobile, give it a fixed height so it doesn't collapse */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-[400px] lg:min-h-0">
            {sidebarTab === 'Chat' && (
              <ChatTab
                messages={messages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSend={handleSendChat}
                sending={chatSending}
                chatEndRef={chatEndRef}
              />
            )}
            {sidebarTab === 'Claims' && <ClaimsTab claims={claims} contentId={id!} onRefresh={refreshContentAndClaims} />}
            {sidebarTab === 'Revisions' && <RevisionsTab revisions={revisions} />}
            {sidebarTab === 'Meta' && <MetaTab content={content} />}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Reject Content</h3>
            <p className="text-sm text-gray-500">Send this article back for revision.</p>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Send back to</label>
              <div className="flex gap-2">
                {(['research', 'draft'] as const).map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setRejectStage(stage)}
                    className={`px-4 py-2 text-sm font-medium rounded-full border transition capitalize ${
                      rejectStage === stage
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Feedback *</label>
              <textarea
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                rows={4}
                placeholder="What needs to be changed and why..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectFeedback(''); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectFeedback.trim()}
                className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50"
              >
                {rejecting ? 'Rejecting...' : 'Reject & Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Editor Toolbar
// ============================================================

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `p-1.5 rounded-md text-sm transition ${
      active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
    }`;

  const handleLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
  };

  return (
    <div className="border-b border-gray-100 px-4 py-2 flex items-center gap-1 flex-wrap">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="Bold">
        <span className="font-bold">B</span>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="Italic">
        <span className="italic">I</span>
      </button>
      <div className="w-px h-5 bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnClass(editor.isActive('heading', { level: 1 }))} title="Heading 1">
        H1
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive('heading', { level: 2 }))} title="Heading 2">
        H2
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editor.isActive('heading', { level: 3 }))} title="Heading 3">
        H3
      </button>
      <div className="w-px h-5 bg-gray-200 mx-1" />
      <button type="button" onClick={handleLink} className={btnClass(editor.isActive('link'))} title="Link">
        🔗
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="Blockquote">
        ❝
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title="Bullet List">
        •≡
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title="Ordered List">
        1.
      </button>
      <div className="w-px h-5 bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={`${btnClass(false)} disabled:opacity-30`} title="Undo">
        ↩
      </button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={`${btnClass(false)} disabled:opacity-30`} title="Redo">
        ↪
      </button>
    </div>
  );
}

// ============================================================
// Chat Tab
// ============================================================

function ChatTab({
  messages,
  chatInput,
  setChatInput,
  onSend,
  sending,
  chatEndRef,
}: {
  messages: ReviewMessage[];
  chatInput: string;
  setChatInput: (val: string) => void;
  onSend: () => void;
  sending: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-300 mt-1">Send feedback to the AI reviewer</p>
          </div>
        )}
        {messages.map((msg) => {
          const isHuman = msg.role === 'human';
          const actions = parseJSON<Array<{ action: string; details: string }>>(msg.actions_taken) || [];
          return (
            <div key={msg.id} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${isHuman ? 'order-last' : ''}`}>
                <div className={`px-3 py-2 rounded-xl text-sm ${
                  isHuman
                    ? 'bg-blue-500 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.message}</p>
                </div>
                {/* Action badges */}
                {!isHuman && actions.length > 0 && actions[0]?.action !== 'no_change_needed' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {actions.map((a, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">
                        {a.action === 'rewrite_section' && '🔄 Rewrote section'}
                        {a.action === 'add_research' && '🔍 Researched & updated'}
                        {a.action === 'needs_research' && '🔬 Research triggered'}
                        {a.action === 'update_claim' && '📋 Updated claim'}
                        {a.action === 'reformat' && '✨ Reformatted'}
                        {a.action === 'update_meta' && '📝 Updated meta'}
                        {!['rewrite_section', 'add_research', 'needs_research', 'update_claim', 'reformat', 'update_meta'].includes(a.action) && `⚡ ${a.action}`}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1 px-1">
                  {formatDatetime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 bg-gray-100 rounded-xl rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }}}
            placeholder="Give feedback to the reviewer..."
            disabled={sending}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
          />
          <button
            onClick={onSend}
            disabled={sending || !chatInput.trim()}
            className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Claims Tab
// ============================================================

const RESOLUTION_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  corrected: { bg: 'bg-blue-50', text: 'text-blue-700', label: '✏️ Corrected' },
  dismissed: { bg: 'bg-gray-100', text: 'text-gray-500', label: '🚫 Dismissed' },
  verified_override: { bg: 'bg-green-50', text: 'text-green-700', label: '✓ Override' },
  verified: { bg: 'bg-green-50', text: 'text-green-700', label: '✓ Verified' },
};

function ClaimsTab({ claims, contentId, onRefresh }: { claims: Claim[]; contentId: string; onRefresh: () => Promise<void> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [reVerifying, setReVerifying] = useState(false);
  const [dismissingAll, setDismissingAll] = useState(false);
  const [editingClaim, setEditingClaim] = useState<string | null>(null);  // claim ID being edited
  const [editText, setEditText] = useState('');

  if (claims.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-gray-400">No claims extracted</p>
      </div>
    );
  }

  // Filter out superseded claims
  const activeClaims = claims.filter(c => c.resolution_status !== 'superseded');

  // Count stats
  const unresolvedClaims = activeClaims.filter(c =>
    ['disputed', 'unverifiable', 'pending'].includes(c.status) &&
    !c.resolution_status
  );
  const verifiedCount = activeClaims.filter(c => c.status === 'verified' || c.resolution_status === 'verified_override').length;
  const resolvedCount = activeClaims.filter(c => c.resolution_status && c.resolution_status !== 'superseded').length;
  const unverifiableUnresolved = activeClaims.filter(c => c.status === 'unverifiable' && !c.resolution_status).length;

  const handleResolve = async (claimId: string, resolution: string, correctedText?: string) => {
    setResolving(prev => new Set(prev).add(claimId));
    try {
      await resolveClaim(contentId, claimId, resolution, undefined, correctedText);
      setEditingClaim(null);
      setEditText('');
      await onRefresh();
    } catch (e: any) {
      alert(`Failed to resolve: ${e.message}`);
    } finally {
      setResolving(prev => {
        const next = new Set(prev);
        next.delete(claimId);
        return next;
      });
    }
  };

  const handleReVerify = async () => {
    setReVerifying(true);
    try {
      await reVerifyClaims(contentId);
      await onRefresh();
    } catch (e: any) {
      alert(`Re-verify failed: ${e.message}`);
    } finally {
      setReVerifying(false);
    }
  };

  const handleDismissAllUnverifiable = async () => {
    setDismissingAll(true);
    try {
      await resolveAllClaims(contentId, 'unverifiable', 'dismissed', 'Bulk dismissed unverifiable claims');
      await onRefresh();
    } catch (e: any) {
      alert(`Dismiss all failed: ${e.message}`);
    } finally {
      setDismissingAll(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Header with stats and bulk actions */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100 space-y-2 flex-shrink-0">
        <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
          {unresolvedClaims.length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full">
              {unresolvedClaims.length} unresolved
            </span>
          )}
          <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full">
            {verifiedCount} verified
          </span>
          {resolvedCount > 0 && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
              {resolvedCount} resolved
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleReVerify}
            disabled={reVerifying}
            className="px-2 py-1 text-[10px] font-medium bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition disabled:opacity-50"
          >
            {reVerifying ? 'Re-verifying...' : '🔄 Re-verify Outstanding'}
          </button>
          {unverifiableUnresolved > 0 && (
            <button
              onClick={handleDismissAllUnverifiable}
              disabled={dismissingAll}
              className="px-2 py-1 text-[10px] font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition disabled:opacity-50"
            >
              {dismissingAll ? 'Dismissing...' : `🚫 Dismiss All Unverifiable (${unverifiableUnresolved})`}
            </button>
          )}
        </div>
      </div>

      {/* Claims list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activeClaims.map((claim) => {
          const colors = CLAIM_STATUS_COLORS[claim.status] || CLAIM_STATUS_COLORS.pending;
          const isExpanded = expanded.has(claim.id);
          const isResolved = !!claim.resolution_status;
          const isUnresolved = ['disputed', 'unverifiable', 'pending'].includes(claim.status) && !claim.resolution_status;
          const isClaimResolving = resolving.has(claim.id);
          const resBadge = claim.resolution_status ? RESOLUTION_BADGES[claim.resolution_status] : null;

          return (
            <div
              key={claim.id}
              className={`border rounded-lg p-3 cursor-pointer transition ${
                isUnresolved
                  ? 'border-amber-200 bg-amber-50/30 hover:border-amber-300'
                  : isResolved
                  ? 'border-gray-100 bg-gray-50/50 hover:border-gray-200'
                  : 'border-gray-100 hover:border-gray-200'
              }`}
              onClick={() => {
                const next = new Set(expanded);
                if (isExpanded) next.delete(claim.id); else next.add(claim.id);
                setExpanded(next);
              }}
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                  <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${colors.bg} ${colors.text} capitalize`}>
                    {claim.status}
                  </span>
                  {resBadge && (
                    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${resBadge.bg} ${resBadge.text}`}>
                      {resBadge.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-800 flex-1 line-clamp-2">{claim.claim_text}</p>
              </div>
              {/* Confidence bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (claim.confidence ?? 0) >= 0.7 ? 'bg-green-500' :
                      (claim.confidence ?? 0) >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.round((claim.confidence ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 tabular-nums">{Math.round((claim.confidence ?? 0) * 100)}%</span>
              </div>
              {/* Expanded content */}
              {isExpanded && (
                <div className="mt-2 space-y-2">
                  {claim.verification_notes && (
                    <div className="p-2 bg-gray-50 rounded-md text-xs text-gray-600">
                      {claim.verification_notes}
                    </div>
                  )}
                  {claim.suggested_revision && (
                    <div className="p-2 bg-blue-50 rounded-md text-xs text-blue-700">
                      <span className="font-medium">Suggested: </span>{claim.suggested_revision}
                    </div>
                  )}
                </div>
              )}
              {/* Action buttons for unresolved claims */}
              {isUnresolved && editingClaim !== claim.id && (
                <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      setEditingClaim(claim.id);
                      setEditText(claim.suggested_revision || claim.claim_text);
                      // Also expand the claim to show context
                      setExpanded(prev => new Set(prev).add(claim.id));
                    }}
                    disabled={isClaimResolving}
                    className="px-2 py-1 text-[10px] font-medium bg-amber-50 text-amber-700 rounded-md hover:bg-amber-100 transition disabled:opacity-50"
                  >
                    ✏️ Edit & Correct
                  </button>
                  <button
                    onClick={() => handleResolve(claim.id, 'corrected')}
                    disabled={isClaimResolving}
                    className="px-2 py-1 text-[10px] font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition disabled:opacity-50"
                  >
                    {isClaimResolving ? '...' : '✅ Corrected'}
                  </button>
                  <button
                    onClick={() => handleResolve(claim.id, 'dismissed')}
                    disabled={isClaimResolving}
                    className="px-2 py-1 text-[10px] font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition disabled:opacity-50"
                  >
                    {isClaimResolving ? '...' : '🚫 Dismiss'}
                  </button>
                  <button
                    onClick={() => handleResolve(claim.id, 'verified_override')}
                    disabled={isClaimResolving}
                    className="px-2 py-1 text-[10px] font-medium bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition disabled:opacity-50"
                  >
                    {isClaimResolving ? '...' : '✓ Override'}
                  </button>
                </div>
              )}
              {/* Inline edit form for correcting claims */}
              {editingClaim === claim.id && (
                <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[10px] font-medium text-amber-700">✏️ Edit the corrected claim text:</div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full text-xs border border-amber-200 rounded-md p-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 resize-y"
                    placeholder="Enter the corrected claim text..."
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleResolve(claim.id, 'corrected', editText)}
                      disabled={isClaimResolving || !editText.trim()}
                      className="px-3 py-1.5 text-[10px] font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50"
                    >
                      {isClaimResolving ? 'Saving...' : '✅ Save & Correct Article'}
                    </button>
                    <button
                      onClick={() => { setEditingClaim(null); setEditText(''); }}
                      className="px-3 py-1.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Revisions Tab
// ============================================================

function RevisionsTab({ revisions }: { revisions: Revision[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (revisions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-gray-400">No revisions yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-0">
      {revisions.map((rev, i) => {
        const isLast = i === revisions.length - 1;
        const isExpanded = expanded.has(rev.id);
        const isHuman = rev.changed_by === 'human';
        return (
          <div key={rev.id} className="flex gap-3">
            {/* Timeline */}
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs flex-shrink-0">
                {isHuman ? '👤' : '🤖'}
              </div>
              {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
            </div>
            {/* Content */}
            <div
              className={`flex-1 pb-4 cursor-pointer`}
              onClick={() => {
                const next = new Set(expanded);
                if (isExpanded) next.delete(rev.id); else next.add(rev.id);
                setExpanded(next);
              }}
            >
              <p className="text-xs font-medium text-gray-900">
                {rev.diff_summary || rev.change_type}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {rev.changed_by} · #{rev.revision_number} · {formatDatetime(rev.created_at)}
              </p>
              {/* Concerns */}
              {rev.concerns && (
                <div className="mt-1 px-2 py-1 bg-amber-50 text-amber-700 text-[10px] rounded">
                  ⚠ {rev.concerns}
                </div>
              )}
              {/* Expanded */}
              {isExpanded && rev.agent_notes && (
                <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs text-gray-600 whitespace-pre-wrap">
                  {rev.agent_notes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Meta Tab
// ============================================================

function MetaTab({ content }: { content: Content }) {
  const platforms = parseJSON<Record<string, any>>(content.platforms);

  const fields = [
    { label: 'Meta Description', value: content.meta_description },
    { label: 'Meta Keywords', value: content.meta_keywords },
    { label: 'OG Image Prompt', value: content.og_image_prompt },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {fields.map((f) => (
        <div key={f.label}>
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{f.label}</label>
          <p className="text-xs text-gray-700 mt-0.5">{f.value || <span className="text-gray-300">Not set</span>}</p>
        </div>
      ))}

      {platforms && Object.keys(platforms).length > 0 && (
        <div>
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2 block">Platform Previews</label>
          <div className="space-y-3">
            {Object.entries(platforms).map(([platform, platformContent]) => (
              <div key={platform} className="border border-gray-100 rounded-lg p-3">
                <h4 className="text-xs font-medium text-gray-900 capitalize mb-1">{platform}</h4>
                <pre className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
                  {typeof platformContent === 'string' ? platformContent : JSON.stringify(platformContent, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
