import type { Site, Topic, Pillar, Voice, Content, Claim, Source, Trace, Revision, ReviewMessage, SourceSuggestion, WatchTopic, Idea, IdeaScanRun } from './types';

const BASE_URL = 'https://content-pipeline.roccobot.workers.dev';

function getToken(): string | null {
  return localStorage.getItem('pipeline_token');
}

export function setToken(token: string) {
  localStorage.setItem('pipeline_token', token);
}

export function clearToken() {
  localStorage.removeItem('pipeline_token');
}

export function hasToken(): boolean {
  return !!getToken();
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('No auth token');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

// Sites
export async function fetchSites(): Promise<Site[]> {
  const data = await apiFetch<{ sites: Site[] }>('/api/sites');
  return data.sites;
}

// Topics
export async function fetchTopics(siteId: string): Promise<Topic[]> {
  const data = await apiFetch<{ topics: Topic[] }>(`/api/sites/${siteId}/topics`);
  return data.topics;
}

// Pillars
export async function fetchPillars(siteId: string): Promise<Pillar[]> {
  const data = await apiFetch<{ pillars: Pillar[] }>(`/api/sites/${siteId}/pillars`);
  return data.pillars;
}

// Voices
export async function fetchVoices(siteId: string): Promise<Voice[]> {
  const data = await apiFetch<{ voices: Voice[] }>(`/api/sites/${siteId}/voices`);
  return data.voices;
}

// Content
export async function fetchContent(siteId?: string, stage?: string, limit = 50): Promise<Content[]> {
  const params = new URLSearchParams();
  if (siteId) params.set('site_id', siteId);
  if (stage) params.set('stage', stage);
  params.set('limit', String(limit));
  const data = await apiFetch<{ content: Content[] }>(`/api/content?${params}`);
  return data.content;
}

export async function fetchContentDetail(id: string): Promise<{ content: Content; claims: Claim[]; sources: Source[] }> {
  return apiFetch(`/api/content/${id}`);
}

// Traces
export async function fetchTraces(runId: string): Promise<Trace[]> {
  const data = await apiFetch<{ traces: Trace[] }>(`/api/traces?run_id=${runId}`);
  return data.traces;
}

// Pipeline status
export async function fetchPipelineStatus(runId: string): Promise<{ content: Content; traces: Trace[] }> {
  return apiFetch(`/api/pipeline/status/${runId}`);
}

// Pipeline
export async function runPipeline(topicId: string, siteId: string): Promise<{ run_id: string; content_id: string; status: string }> {
  return apiFetch('/api/pipeline/run', {
    method: 'POST',
    body: JSON.stringify({ topic_id: topicId, site_id: siteId }),
  });
}

// Create topic
export async function createTopic(siteId: string, topic: {
  title: string;
  description?: string;
  angle?: string;
  pillar_id?: string;
  content_type: string;
  status?: string;
  priority?: number;
  source_hints?: string;
  tone?: string;
  style?: string;
  target_length?: number;
}): Promise<{ id: string; success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/topics`, {
    method: 'POST',
    body: JSON.stringify(topic),
  });
}

// Review chat
export async function sendReviewChat(contentId: string, message: string): Promise<{
  message: string;
  actions_taken: Array<{ action: string; details: string }>;
  revision: Revision | null;
  updated_content: Content | null;
  concerns: string[];
}> {
  return apiFetch(`/api/content/${contentId}/review/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

// Review messages
export async function fetchReviewMessages(contentId: string): Promise<ReviewMessage[]> {
  const data = await apiFetch<{ messages: ReviewMessage[] }>(`/api/content/${contentId}/review/messages`);
  return data.messages;
}

// Revisions
export async function createRevision(contentId: string, updatedMd: string, fieldsChanged?: string[]): Promise<{ revision: Revision; concerns: string[] }> {
  return apiFetch(`/api/content/${contentId}/revisions`, {
    method: 'POST',
    body: JSON.stringify({ updated_md: updatedMd, fields_changed: fieldsChanged }),
  });
}

export async function fetchRevisions(contentId: string): Promise<Revision[]> {
  const data = await apiFetch<{ revisions: Revision[] }>(`/api/content/${contentId}/revisions`);
  return data.revisions;
}

// Approve/Reject
export async function approveContent(contentId: string, targetStage?: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/content/${contentId}/review/approve`, {
    method: 'POST',
    body: JSON.stringify({ target_stage: targetStage || 'scheduled' }),
  });
}

export async function rejectContent(contentId: string, targetStage: string, feedback: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/content/${contentId}/review/reject`, {
    method: 'POST',
    body: JSON.stringify({ target_stage: targetStage, feedback }),
  });
}

// Source suggestions
export async function suggestSources(siteId: string, title: string, description: string): Promise<SourceSuggestion[]> {
  const data = await apiFetch<{ sources: SourceSuggestion[] }>(`/api/sites/${siteId}/topics/suggest-sources`, {
    method: 'POST',
    body: JSON.stringify({ title, description }),
  });
  return data.sources;
}

// Create pillar
export async function createPillar(siteId: string, pillar: { name: string; description?: string }): Promise<{ id: string; success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/pillars`, {
    method: 'POST',
    body: JSON.stringify({ ...pillar, slug: pillar.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }),
  });
}

// Watch Topics
export async function fetchWatchTopics(siteId: string, includeInactive = false): Promise<WatchTopic[]> {
  const params = includeInactive ? '?active=false' : '';
  const data = await apiFetch<{ watch_topics: WatchTopic[] }>(`/api/sites/${siteId}/watch-topics${params}`);
  return data.watch_topics;
}

export async function createWatchTopic(siteId: string, topic: {
  name: string;
  description?: string;
  keywords?: string;
  source_types?: string;
  scan_interval_hours?: number;
  max_ideas_per_scan?: number;
  pillar_id?: string;
}): Promise<{ id: string; success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/watch-topics`, {
    method: 'POST',
    body: JSON.stringify(topic),
  });
}

export async function updateWatchTopic(siteId: string, id: string, updates: Partial<WatchTopic>): Promise<{ success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/watch-topics/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteWatchTopic(siteId: string, id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/watch-topics/${id}`, {
    method: 'DELETE',
  });
}

// Ideas
export async function fetchIdeas(siteId: string, filters?: { status?: string; watch_topic_id?: string; min_score?: string; limit?: number }): Promise<Idea[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.watch_topic_id) params.set('watch_topic_id', filters.watch_topic_id);
  if (filters?.min_score) params.set('min_score', filters.min_score);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const data = await apiFetch<{ ideas: Idea[] }>(`/api/sites/${siteId}/ideas${qs ? `?${qs}` : ''}`);
  return data.ideas;
}

export async function updateIdea(siteId: string, id: string, updates: Partial<Idea>): Promise<{ success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/ideas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function approveIdea(siteId: string, id: string): Promise<{ success: boolean; topic_id: string }> {
  return apiFetch(`/api/sites/${siteId}/ideas/${id}/approve`, {
    method: 'POST',
  });
}

export async function dismissIdea(siteId: string, id: string, reason?: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/ideas/${id}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// Idea Scans
export async function triggerIdeaScan(siteId?: string, watchTopicId?: string): Promise<{ scan_runs: number; total_ideas_found: number; total_ideas_stored: number; total_ideas_deduped: number }> {
  return apiFetch('/api/ideas/scan', {
    method: 'POST',
    body: JSON.stringify({ site_id: siteId, watch_topic_id: watchTopicId }),
  });
}

export async function fetchScanRuns(siteId?: string, watchTopicId?: string, limit?: number): Promise<IdeaScanRun[]> {
  const params = new URLSearchParams();
  if (siteId) params.set('site_id', siteId);
  if (watchTopicId) params.set('watch_topic_id', watchTopicId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const data = await apiFetch<{ scan_runs: IdeaScanRun[] }>(`/api/ideas/scan-runs${qs ? `?${qs}` : ''}`);
  return data.scan_runs;
}
