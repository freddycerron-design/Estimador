import { getValidAccessToken } from "./token-manager";
import type { EstimationParameters } from "./estimation-parameters";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Pide el token vigente en CADA llamada (refresca solo si está por expirar) — nunca un
  // valor capturado en un closure de React que puede haber quedado obsoleto.
  const accessToken = await getValidAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      // Solo declarar JSON cuando de verdad hay body — Fastify rechaza con 400
      // ("Body cannot be empty when content-type is set to 'application/json'") un POST/DELETE
      // sin cuerpo si igual le decimos que es JSON (afectaba correr ciclo de aprendizaje,
      // aprobar/activar propuestas, y eliminar proyectos — todos POST/DELETE sin body).
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string; message?: string }).error ?? (body as { message?: string }).message ?? `Error ${res.status}`);
  }
  return body as T;
}

// --- Conversaciones ---
export interface ConversationDTO {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  parameters?: EstimationParameters | null;
  included_role_ids?: string[] | null;
}

/**
 * `parameters`: los parámetros de estimación marcados/editados en el panel previo al chat (spec
 * pedido por usuario) — opcional, si se omite se usa el default global de siempre.
 * `includedRoleIds`: roles a incluir en el desglose de esfuerzo — opcional, si se omite o llega
 * vacío no se filtra (todos los roles, comportamiento actual).
 */
export function createConversation(title?: string, requirementId?: string, parameters?: EstimationParameters, includedRoleIds?: string[]) {
  return apiFetch<ConversationDTO>("/conversations", { method: "POST", body: JSON.stringify({ title, requirementId, parameters, includedRoleIds }) });
}

// --- Usuario actual (para saber si mostrar la sección de Administración) ---
export interface MeDTO {
  id: string;
  email: string;
  name: string | null;
  app_role: "admin" | "estimator" | "viewer";
}

export function getMe() {
  return apiFetch<MeDTO>("/me");
}

export interface MessageDTO {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  created_at: string;
}

export function getConversation(id: string) {
  return apiFetch<{ conversation: ConversationDTO; messages: MessageDTO[]; estimateIds: string[] }>(`/conversations/${id}`);
}

export interface SendMessageResponseDTO {
  conversationId: string;
  status: string;
  assistantText: string;
  estimateId?: string;
}

export function sendMessage(conversationId: string, text: string) {
  return apiFetch<SendMessageResponseDTO>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// --- Estimaciones ---
export function getEstimate(id: string) {
  return apiFetch<{
    estimate: Record<string, unknown>;
    lineItems: { phaseName: string; roleName: string; hours: number; provenance: string }[];
    referenceProjects: { projectName: string; similarity_score: string; is_outlier: boolean }[];
  }>(`/estimates/${id}`);
}

export async function downloadEstimateExport(estimateId: string, format: "excel" | "pptx"): Promise<void> {
  const accessToken = await getValidAccessToken();
  const res = await fetch(`${API_BASE_URL}/estimates/${estimateId}/export/${format}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!res.ok) throw new Error(`No se pudo generar el archivo (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `estimacion-${estimateId.slice(0, 8)}.${format === "excel" ? "xlsx" : "pptx"}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function sendFeedback(estimateId: string, rating: number, comments: string) {
  return apiFetch(`/estimates/${estimateId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ rating, comments }),
  });
}

export interface EstimateSummaryDTO {
  id: string;
  status: string;
  template_used: string | null;
  currency: string;
  cost_probable: string | null;
  duration_weeks_probable: string | null;
  confidence_score: string | null;
  created_at: string;
  projectName: string | null;
}

export function listEstimates() {
  return apiFetch<EstimateSummaryDTO[]>(`/estimates`);
}

// --- Proyectos / actuals ---
export interface ProjectDTO {
  id: string;
  name: string;
  status: string;
  project_type: string;
  duration_weeks: string | null;
  actual_cost: string | null;
}

export function listProjects(status?: string) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<ProjectDTO[]>(`/projects${qs}`);
}

export interface ProjectFeatureDTO {
  category: string;
  feature_key: string;
  feature_value: unknown;
}

export interface ProjectDetailDTO extends ProjectDTO {
  description: string;
  industry: string | null;
  technologies: string[];
  team_size: number | null;
  features: ProjectFeatureDTO[];
}

export function getProject(id: string) {
  return apiFetch<ProjectDetailDTO>(`/projects/${id}`);
}

export interface ProjectFormInput {
  name: string;
  description: string;
  projectType: string;
  industry?: string | null;
  technologies: string[];
  modules: string[];
  integrations: string[];
  teamSize?: number | null;
  numUsers?: number | null;
  numInterfaces?: number | null;
  complexity?: "low" | "medium" | "high" | "very_high" | null;
  durationWeeks?: number | null;
  actualCost?: number | null;
  totalHours?: number | null;
  risks: string[];
  lessonsLearned?: string | null;
}

export function createProject(body: ProjectFormInput) {
  return apiFetch<{ id: string }>(`/projects`, { method: "POST", body: JSON.stringify(body) });
}

export function updateProject(id: string, body: ProjectFormInput) {
  return apiFetch<{ id: string; updated: boolean }>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteProject(id: string) {
  return apiFetch<{ deleted: boolean }>(`/projects/${id}`, { method: "DELETE" });
}

export function registerActuals(
  projectId: string,
  body: { actualEffortHours: Record<string, Record<string, number>>; actualDurationWeeks?: number; actualCost?: number; notes?: string }
) {
  return apiFetch(`/projects/${projectId}/actuals`, { method: "POST", body: JSON.stringify(body) });
}

// --- Importación Excel/CSV ---
export interface ImportResultDTO {
  totalRows: number;
  imported: number;
  skipped: number;
  results: { row: number; name: string; status: "imported" | "skipped"; projectId?: string; error?: string }[];
}

export async function importProjectsFile(file: File): Promise<ImportResultDTO> {
  const accessToken = await getValidAccessToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/projects/import`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  return body as ImportResultDTO;
}

export async function downloadImportTemplate(): Promise<void> {
  const accessToken = await getValidAccessToken();
  const res = await fetch(`${API_BASE_URL}/projects/import/template`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-proyectos-historicos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// --- Learning Agent ---
export interface LearningProposalDTO {
  id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  status: string;
  diff: Record<string, unknown>;
  evaluation_summary: Record<string, unknown> | null;
  created_at: string;
}

export function listProposals(status?: string) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<LearningProposalDTO[]>(`/learning/proposals${qs}`);
}

export function runLearningCycle() {
  return apiFetch(`/learning/run`, { method: "POST" });
}

export function approveProposal(id: string) {
  return apiFetch<LearningProposalDTO>(`/learning/proposals/${id}/approve`, { method: "POST" });
}

export function activateProposal(id: string) {
  return apiFetch(`/learning/proposals/${id}/activate`, { method: "POST" });
}

// --- Requerimientos ---
export interface RequirementDTO {
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
  created_at: string;
}

export interface RequirementFormInput {
  title: string;
  description: string;
  projectType?: string | null;
  industry?: string | null;
  technologies: string[];
  modules: string[];
  integrations: string[];
  numUsers?: number | null;
  numInterfaces?: number | null;
  complexity?: "low" | "medium" | "high" | "very_high" | null;
}

export function listRequirements(q?: string, status?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const qs = params.toString();
  return apiFetch<RequirementDTO[]>(`/requirements${qs ? `?${qs}` : ""}`);
}

export function getRequirement(id: string) {
  return apiFetch<RequirementDTO>(`/requirements/${id}`);
}

export function getRequirementByNumber(number: string) {
  return apiFetch<RequirementDTO>(`/requirements/by-number/${number}`);
}

export function createRequirement(body: RequirementFormInput) {
  return apiFetch<RequirementDTO>(`/requirements`, { method: "POST", body: JSON.stringify(body) });
}

export function updateRequirement(id: string, body: RequirementFormInput) {
  return apiFetch<RequirementDTO>(`/requirements/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteRequirement(id: string) {
  return apiFetch<{ deleted: boolean }>(`/requirements/${id}`, { method: "DELETE" });
}

export async function importRequirementsFile(file: File): Promise<ImportResultDTO> {
  const accessToken = await getValidAccessToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/requirements/import`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  return body as ImportResultDTO;
}

export async function downloadRequirementsImportTemplate(): Promise<void> {
  const accessToken = await getValidAccessToken();
  const res = await fetch(`${API_BASE_URL}/requirements/import/template`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-requerimientos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Texto natural que se envía como primer mensaje del chat al estimar a partir de un requerimiento cargado. */
export function formatRequirementAsMessage(r: RequirementDTO): string {
  const parts = [r.description];
  const details: string[] = [];
  if (r.project_type) details.push(`Tipo de proyecto: ${r.project_type}`);
  if (r.industry) details.push(`Industria: ${r.industry}`);
  if (r.technologies.length) details.push(`Tecnologías: ${r.technologies.join(", ")}`);
  if (r.modules.length) details.push(`Módulos: ${r.modules.join(", ")}`);
  if (r.integrations.length) details.push(`Integraciones: ${r.integrations.join(", ")}`);
  if (r.num_users !== null && r.num_users !== undefined) details.push(`Usuarios: ${r.num_users}`);
  if (r.num_interfaces !== null && r.num_interfaces !== undefined) details.push(`Interfaces: ${r.num_interfaces}`);
  if (r.complexity) details.push(`Complejidad: ${r.complexity}`);
  if (details.length) parts.push(details.join(". "));
  return parts.join("\n\n");
}

// --- Administración de parámetros ---
export interface SystemSettingDTO {
  key: string;
  value: unknown;
  updated_at: string;
}

export function listSystemSettings() {
  return apiFetch<SystemSettingDTO[]>(`/admin/config/system-settings`);
}

export function updateSystemSetting(key: string, value: unknown) {
  return apiFetch<SystemSettingDTO>(`/admin/config/system-settings`, { method: "PUT", body: JSON.stringify({ key, value }) });
}

export interface SimilarityWeightProfileDTO {
  id: string;
  name: string;
  version: number;
  weights: Record<string, number>;
  is_active: boolean;
  created_at: string;
}

export function listSimilarityWeights() {
  return apiFetch<SimilarityWeightProfileDTO[]>(`/admin/config/similarity-weights`);
}

export function updateSimilarityWeights(weights: Record<string, number>, name = "custom") {
  return apiFetch<SimilarityWeightProfileDTO>(`/admin/config/similarity-weights`, { method: "PUT", body: JSON.stringify({ weights, name }) });
}

export interface CostRateDTO {
  id: string;
  role_id: string;
  currency: string;
  rate_per_hour: string;
  is_active: boolean;
}

export function listCostRates() {
  return apiFetch<CostRateDTO[]>(`/admin/config/cost-rates`);
}

export function updateCostRate(roleId: string, ratePerHour: number, currency = "USD") {
  return apiFetch<CostRateDTO>(`/admin/config/cost-rates`, { method: "PUT", body: JSON.stringify({ roleId, ratePerHour, currency }) });
}

export interface RoleDTO {
  id: string;
  name: string;
  category: string | null;
}

export function listRoles() {
  return apiFetch<RoleDTO[]>(`/admin/config/roles`);
}

// --- Administración de Skills ---
export interface SkillVersionDTO {
  id: string;
  skill_id: string;
  version: number;
  definition: Record<string, unknown>;
  status: string;
  created_by: string | null;
  approved_by: string | null;
  activated_at: string | null;
  created_at: string;
  note: string | null;
}

export interface SkillConfigParamDTO {
  key: string;
  description: string;
  default: unknown;
}

export interface SkillDTO {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  versionCount: number;
  activeVersion: SkillVersionDTO | null;
  /** Parámetros que la skill realmente lee de su config (metadata, ver skills/config-registry.ts en el backend). */
  configSchema: SkillConfigParamDTO[];
}

export function listSkills() {
  return apiFetch<SkillDTO[]>(`/admin/skills`);
}

export function listSkillVersions(skillKey: string) {
  return apiFetch<{ skill: Omit<SkillDTO, "versionCount" | "activeVersion">; versions: SkillVersionDTO[] }>(`/admin/skills/${skillKey}/versions`);
}

export function createSkillVersion(skillKey: string, config: Record<string, unknown>, note?: string) {
  return apiFetch<SkillVersionDTO>(`/admin/skills/${skillKey}/versions`, { method: "POST", body: JSON.stringify({ config, note }) });
}
