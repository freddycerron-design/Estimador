import type { Provenance, VersionedEntityStatus, LearningProposalStatus, ConversationStatus } from "@estimador/shared-types";

/**
 * Espejo manual (TS) del schema SQL en `db/sql/*.sql`. No hay ORM/generación automática:
 * @insforge/sdk devuelve `{data, error}` sin tipar fuerte, así que estos tipos existen
 * para tipar las respuestas en el resto del backend. Mantener sincronizado a mano con el SQL.
 */

export interface SystemSettingRow {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
}

export interface PhaseRow {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface CostRateRow {
  id: string;
  role_id: string;
  currency: string;
  rate_per_hour: string; // numeric vuelve como string desde PostgREST
  effective_from: string;
  effective_to: string | null;
  version: number;
  is_active: boolean;
}

export interface SimilarityWeightProfileRow {
  id: string;
  name: string;
  version: number;
  weights: Record<string, number>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface UserRow {
  id: string; // id de usuario InsForge Auth (ej. "usr_abc123")
  email: string;
  name: string | null;
  app_role: "admin" | "estimator" | "viewer";
  created_at: string;
}

export interface SkillRow {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
}

export interface SkillVersionRow {
  id: string;
  skill_id: string;
  version: number;
  definition: Record<string, unknown>;
  status: VersionedEntityStatus;
  created_by: string | null;
  approved_by: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  status: ConversationStatus;
  context: Record<string, unknown>;
  requirement_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequirementRow {
  id: string;
  number: number;
  title: string;
  description: string;
  project_type: string | null;
  industry: string | null;
  technologies: string[];
  modules: string[];
  integrations: string[];
  num_users: number | null;
  num_interfaces: number | null;
  complexity: "low" | "medium" | "high" | "very_high" | null;
  status: "new" | "in_estimation" | "estimated";
  estimate_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls: unknown | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  project_type: string;
  industry: string | null;
  technologies: string[];
  team_size: number | null;
  duration_weeks: string | null;
  actual_cost: string | null;
  status: "historical_reference" | "active_estimate" | "completed";
  embedding: number[] | null;
  source: "synthetic" | "imported" | "real";
  created_at: string;
  updated_at: string;
}

export interface ProjectFeatureRow {
  id: string;
  project_id: string;
  category: "functional" | "technical" | "integration" | "non_functional";
  feature_key: string;
  feature_value: unknown;
  extracted_by: "manual" | "agent";
  confidence: number | null;
  provenance: Provenance;
}

export interface ProjectEstimateRow {
  id: string;
  project_id: string | null;
  conversation_id: string | null;
  template_used: string | null;
  status: "draft" | "final" | "superseded";
  duration_weeks_optimistic: string | null;
  duration_weeks_probable: string | null;
  duration_weeks_pessimistic: string | null;
  cost_optimistic: string | null;
  cost_probable: string | null;
  cost_pessimistic: string | null;
  currency: string;
  confidence_score: string | null;
  confidence_factors: Record<string, unknown> | null;
  similarity_threshold_met: boolean;
  skill_versions_used: Record<string, string> | null;
  risks: string[] | null;
  recommendations: string[] | null;
  created_at: string;
}

export interface EstimateLineItemRow {
  id: string;
  estimate_id: string;
  phase_id: string;
  role_id: string;
  hours: string;
  provenance: Provenance;
  source_note: string | null;
}

export interface ReferenceProjectRow {
  id: string;
  estimate_id: string;
  reference_project_id: string;
  similarity_score: string;
  similarity_breakdown: Record<string, number>;
  weight_applied: string;
  differences_note: string | null;
  is_outlier: boolean;
  outlier_reason: string | null;
}

export interface SimilarityResultRow {
  id: string;
  conversation_id: string | null;
  candidate_project_id: string;
  total_similarity: string;
  dimension_scores: Record<string, number>;
  weight_profile_id: string | null;
  computed_at: string;
}

export interface ProjectActualRow {
  id: string;
  project_id: string;
  estimate_id: string | null;
  actual_effort_hours: Record<string, Record<string, number>>;
  actual_duration_weeks: string | null;
  actual_cost: string | null;
  effort_variance_pct: string | null;
  duration_variance_pct: string | null;
  cost_variance_pct: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  estimate_id: string;
  user_id: string;
  rating: number | null;
  comments: string | null;
  categories: string[] | null;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  scope: "global" | "skill" | "project_type";
  key: string;
  value: unknown;
  embedding: number[] | null;
  created_by: "learning_agent" | "human";
  created_at: string;
}

export interface ExperienceRow {
  id: string;
  project_id: string | null;
  estimate_id: string | null;
  summary: string;
  lesson: string;
  tags: string[] | null;
  embedding: number[] | null;
  created_at: string;
}

export interface LearningEventRow {
  id: string;
  type: "variance_detected" | "feedback_received" | "pattern_detected";
  source_estimate_id: string | null;
  payload: Record<string, unknown>;
  detected_at: string;
  processed: boolean;
}

export interface EstimationRuleRow {
  id: string;
  name: string;
  rule_type: string;
  definition: Record<string, unknown>;
  version: number;
  status: VersionedEntityStatus;
  created_by: string | null;
  approved_by: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface EvaluationCaseRow {
  id: string;
  name: string;
  description: string | null;
  input: Record<string, unknown>;
  expected_output: Record<string, unknown>;
  category: string | null;
}

export interface EvaluationResultRow {
  id: string;
  evaluation_case_id: string;
  skill_version_id: string | null;
  estimation_rule_id: string | null;
  passed: boolean;
  actual_output: Record<string, unknown>;
  score: string | null;
  run_at: string;
}

export interface LearningProposalRow {
  id: string;
  type: "new_rule" | "rule_update" | "skill_update";
  title: string;
  description: string | null;
  rationale: string | null;
  diff: Record<string, unknown>;
  status: LearningProposalStatus;
  related_learning_event_ids: string[] | null;
  target_estimation_rule_id: string | null;
  target_skill_id: string | null;
  evaluation_summary: Record<string, unknown> | null;
  created_at: string;
  submitted_for_approval_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  activated_at: string | null;
}

/** Filas devueltas por las funciones RPC de similitud vectorial (db/sql/0004_rpc_functions.sql). */
export interface MatchProjectsRow {
  id: string;
  semantic_similarity: number;
}

export interface MatchExperiencesRow {
  id: string;
  summary: string;
  lesson: string;
  similarity: number;
}

export interface MatchMemoriesRow {
  id: string;
  scope: string;
  key: string;
  value: unknown;
  similarity: number;
}
