export interface Site {
  id: number;
  name: string;
  domain: string;
  description: string;
  pipeline_config: string;
  settings: string;
  active: boolean;
}

export interface Topic {
  id: number;
  site_id: number;
  pillar_id: number | null;
  title: string;
  description: string;
  angle: string;
  target_keywords: string;
  content_type: string;
  status: string;
  priority: number;
  scheduled_at: string | null;
  source_hints: string;
  created_at?: string;
}

export interface Pillar {
  id: number;
  site_id: number;
  name: string;
  description: string;
}

export interface Voice {
  id: number;
  site_id: number;
  name: string;
  description: string;
}

export interface Content {
  id: number;
  site_id: number;
  topic_id: number | null;
  voice_profile_id: number | null;
  stage: string;
  run_id: string | null;
  title: string;
  slug: string;
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
  requires_review: boolean;
  scheduled_publish_at: string | null;
  published_at: string | null;
  published_urls: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Claim {
  id: number;
  content_id: number;
  claim_text: string;
  context: string | null;
  status: 'pending' | 'verified' | 'disputed' | 'unverifiable';
  confidence: number;
  verification_notes: string | null;
}

export interface Source {
  id: number;
  content_id: number;
  claim_id: number | null;
  url: string;
  title: string;
  author: string | null;
  published_date: string | null;
  snippet: string | null;
  source_type: string | null;
  reliability: 'high' | 'medium' | 'low';
}

export interface Trace {
  id: number;
  run_id: string;
  content_id: number;
  stage: string;
  provider: string;
  model: string;
  system_prompt_hash: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status: string;
  error_message: string | null;
  estimated_cost_usd: number | null;
  created_at?: string;
}

export type Stage = 'research' | 'draft' | 'verify' | 'format' | 'review' | 'scheduled' | 'published' | 'failed';
