import type { Site, Topic, Pillar, Voice, Content, Claim, Source, Trace } from './types';

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
}): Promise<{ id: string; success: boolean }> {
  return apiFetch(`/api/sites/${siteId}/topics`, {
    method: 'POST',
    body: JSON.stringify(topic),
  });
}
