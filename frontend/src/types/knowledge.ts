export type DocumentType =
  | 'guidelines'
  | 'approved_claims'
  | 'terminology'
  | 'tone_messaging'
  | 'claims_policy'
  | 'source_document';

export type DocumentStatus = 'pending' | 'approved' | 'rejected' | 'deleted';

export interface KnowledgeDocument {
  id: string;
  title: string;
  doc_type: DocumentType;
  status: DocumentStatus;
  active_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocumentVersion {
  id: string;
  version: number;
  original_filename: string;
  content_type: string;
  checksum_sha256: string;
  size_bytes: number;
  page_count: number | null;
  extraction_status: 'extracted' | 'incomplete' | 'failed' | string;
  created_by: string;
  created_at: string;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  versions: KnowledgeDocumentVersion[];
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  version: number;
  section_ref: string;
  page_number: number | null;
  page_end: number | null;
  text: string;
  char_offset: number;
}

export type RuleCategory =
  | 'prohibited_term'
  | 'preferred_replacement'
  | 'restricted_phrase'
  | 'claim_requirement'
  | 'messaging_rule';

export type MatcherType = 'contains' | 'exact' | 'regex';

export interface BrandRule {
  id: string;
  category: RuleCategory;
  name: string;
  rule_text: string;
  matcher_type: MatcherType;
  pattern: string;
  replacement: string | null;
  enabled: boolean;
  version: number;
  source_document_id: string | null;
  source_section_ref: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBrandRuleInput {
  category: RuleCategory;
  name: string;
  rule_text: string;
  pattern: string;
  matcher_type?: MatcherType;
  replacement?: string;
  source_document_id?: string;
  source_section_ref?: string;
}

export interface ApprovedClaim {
  id: string;
  claim_text: string;
  status: 'active' | 'retired';
  source_document_id: string | null;
  source_section_ref: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateApprovedClaimInput {
  claim_text: string;
  source_document_id?: string;
  source_section_ref?: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  doc_type: string;
  version: number;
  section_ref: string;
  page_number: number | null;
  page_end: number | null;
  text: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: RetrievedChunk[];
  retrieval_method: string;
}

export interface UploadResult {
  document: KnowledgeDocument;
  version: KnowledgeDocumentVersion;
  chunk_count: number;
  created_new_version: boolean;
}
