export interface Site {
  id: string;
  name: string;
  domain: string;
  description: string;
  pipeline_config: string;
  settings: string;
  active: number;
}

export interface Topic {
  id: string;
  site_id: string;
  pillar_id: string | null;
  title: string;
  description: string;
  angle: string;
  target_keywords: string;
  content_type: string;
  status: string;
  priority: number;
  scheduled_at: string | null;
  source_hints: string;
  tone?: string;
  style?: string;
  target_length?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Pillar {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  description: string;
  keywords: string;
  priority: number;
  active: number;
}

export interface Voice {
  id: string;
  site_id: string;
  name: string;
  description: string;
  voice_guide: string;
  active: number;
}

export interface Content {
  id: string;
  site_id: string;
  topic_id: string | null;
  voice_profile_id: string | null;
  stage: string;
  run_id: string | null;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  summary: string | null;
  draft_md: string | null;
  final_md: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image_prompt: string | null;
  category: string | null;
  tags: string | null;
  word_count: number | null;
  reading_time: number | null;
  quality_score: number | null;
  platforms: string | null;
  requires_review: number;
  scheduled_publish_at: string | null;
  published_at: string | null;
  published_urls: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Claim {
  id: string;
  content_id: string;
  claim_text: string;
  context: string | null;
  status: 'pending' | 'verified' | 'disputed' | 'unverifiable';
  confidence: number | null;
  verification_notes: string | null;
}

export interface Source {
  id: string;
  content_id: string;
  claim_id: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  published_date: string | null;
  snippet: string | null;
  source_type: string | null;
  reliability: 'high' | 'medium' | 'low';
}

export interface Trace {
  id: string;
  run_id: string;
  content_id: string | null;
  stage: string;
  provider: string;
  model: string;
  system_prompt_hash: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  estimated_cost_usd: number | null;
  created_at?: string;
}

export type Stage = 'research' | 'draft' | 'verify' | 'format' | 'edit' | 'review' | 'scheduled' | 'published' | 'failed';

export interface Revision {
  id: string;
  content_id: string;
  revision_number: number;
  changed_by: string;
  change_type: string;
  previous_md: string | null;
  updated_md: string | null;
  diff_summary: string | null;
  feedback: string | null;
  agent_notes: string | null;
  concerns: string | null;
  fields_changed: string;
  created_at?: string;
}

export interface ReviewMessage {
  id: string;
  content_id: string;
  role: 'human' | 'agent';
  message: string;
  actions_taken: string;
  stage_triggered: string | null;
  revision_id: string | null;
  created_at?: string;
}

export interface SourceSuggestion {
  url: string;
  title: string;
  snippet: string;
  relevance: string;
}
