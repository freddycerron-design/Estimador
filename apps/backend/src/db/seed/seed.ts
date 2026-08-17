import { db, unwrap } from "../insforge-client.js";
import { createEmbeddingProvider } from "../../llm/provider-factory.js";
import {
  PHASES,
  ROLES,
  COST_RATES,
  DEFAULT_SIMILARITY_WEIGHTS,
  DEFAULT_SYSTEM_SETTINGS,
  SKILLS_CATALOG,
} from "./reference-data.js";
import {
  SYNTHETIC_PROJECTS,
  actualCostOf,
  totalHoursOf,
  embeddingTextOf,
  type SyntheticProject,
} from "./synthetic-projects.data.js";
import type { PhaseRow, RoleRow, ProjectRow } from "../types.js";

async function seedSystemSettings() {
  const rows = Object.entries(DEFAULT_SYSTEM_SETTINGS).map(([key, value]) => ({
    key,
    value,
    updated_by: null,
  }));
  await unwrap("insert:system_settings", db.from("system_settings").insert(rows).select());
  console.log(`✓ system_settings (${rows.length})`);
}

async function seedPhases(): Promise<Map<string, string>> {
  const rows = PHASES.map((p) => ({ name: p.name, sort_order: p.sortOrder, is_active: true }));
  const inserted = await unwrap<PhaseRow[]>("insert:phases", db.from("phases").insert(rows).select());
  console.log(`✓ phases (${inserted.length})`);
  return new Map(inserted.map((p) => [p.name, p.id]));
}

async function seedRoles(): Promise<Map<string, string>> {
  const rows = ROLES.map((r) => ({ name: r.name, category: r.category, is_active: true }));
  const inserted = await unwrap<RoleRow[]>("insert:roles", db.from("roles").insert(rows).select());
  console.log(`✓ roles (${inserted.length})`);
  return new Map(inserted.map((r) => [r.name, r.id]));
}

async function seedCostRates(roleIdByName: Map<string, string>) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = Object.entries(COST_RATES).map(([roleName, rate]) => {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) throw new Error(`Rol desconocido en COST_RATES: ${roleName}`);
    return {
      role_id: roleId,
      currency: "USD",
      rate_per_hour: rate,
      effective_from: today,
      version: 1,
      is_active: true,
    };
  });
  await unwrap("insert:cost_rates", db.from("cost_rates").insert(rows).select());
  console.log(`✓ cost_rates (${rows.length})`);
}

async function seedSimilarityWeightProfile() {
  await unwrap(
    "insert:similarity_weight_profiles",
    db
      .from("similarity_weight_profiles")
      .insert([{ name: "default", version: 1, weights: DEFAULT_SIMILARITY_WEIGHTS, is_active: true, created_by: null }])
      .select()
  );
  console.log("✓ similarity_weight_profiles (1, activo)");
}

async function seedSkills() {
  const skillRows = SKILLS_CATALOG.map((s) => ({ key: s.key, display_name: s.displayName, description: s.description }));
  const insertedSkills = await unwrap<{ id: string; key: string }[]>(
    "insert:skills",
    db.from("skills").insert(skillRows).select()
  );

  const versionRows = insertedSkills.map((s) => ({
    skill_id: s.id,
    version: 1,
    definition: {}, // configuración inicial vacía; cada skill aplica sus propios defaults si definition está vacío
    status: "active",
    created_by: null,
    approved_by: null,
    activated_at: new Date().toISOString(),
  }));
  await unwrap("insert:skill_versions", db.from("skill_versions").insert(versionRows).select());
  console.log(`✓ skills + skill_versions activas (${insertedSkills.length})`);
}

async function seedProject(
  project: SyntheticProject,
  phaseIdByName: Map<string, string>,
  roleIdByName: Map<string, string>,
  embed: (text: string) => Promise<number[]>
) {
  const embedding = await embed(embeddingTextOf(project));

  const [inserted] = await unwrap<ProjectRow[]>(
    `insert:projects:${project.name}`,
    db
      .from("projects")
      .insert([
        {
          name: project.name,
          description: project.description,
          project_type: project.projectType,
          industry: project.industry,
          technologies: project.technologies,
          team_size: project.teamSize,
          duration_weeks: project.durationWeeks,
          actual_cost: actualCostOf(project),
          status: "completed",
          embedding,
          source: "synthetic",
        },
      ])
      .select()
  );
  if (!inserted) throw new Error(`No se pudo insertar el proyecto ${project.name}`);
  const projectId = inserted.id;

  // project_features: características estructuradas, todas FACTUAL porque provienen del dataset histórico.
  const featureRows = [
    { project_id: projectId, category: "functional", feature_key: "modules", feature_value: project.modules, extracted_by: "manual", provenance: "FACTUAL" },
    { project_id: projectId, category: "functional", feature_key: "num_users", feature_value: project.numUsers, extracted_by: "manual", provenance: "FACTUAL" },
    { project_id: projectId, category: "technical", feature_key: "technologies", feature_value: project.technologies, extracted_by: "manual", provenance: "FACTUAL" },
    { project_id: projectId, category: "technical", feature_key: "complexity", feature_value: project.complexity, extracted_by: "manual", provenance: "FACTUAL" },
    { project_id: projectId, category: "integration", feature_key: "integrations", feature_value: project.integrations, extracted_by: "manual", provenance: "FACTUAL" },
    { project_id: projectId, category: "integration", feature_key: "num_interfaces", feature_value: project.numInterfaces, extracted_by: "manual", provenance: "FACTUAL" },
    { project_id: projectId, category: "non_functional", feature_key: "risks", feature_value: project.risks, extracted_by: "manual", provenance: "FACTUAL" },
  ];
  await unwrap(`insert:project_features:${project.name}`, db.from("project_features").insert(featureRows).select());

  // project_actuals: esfuerzo real por fase/rol, usando ids reales de phases/roles.
  const actualEffortHours: Record<string, Record<string, number>> = {};
  for (const [phaseName, roles] of Object.entries(project.effortHours)) {
    const phaseId = phaseIdByName.get(phaseName);
    if (!phaseId) throw new Error(`Fase desconocida "${phaseName}" en proyecto ${project.name}`);
    const roleHours: Record<string, number> = {};
    for (const [roleName, hours] of Object.entries(roles)) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) throw new Error(`Rol desconocido "${roleName}" en proyecto ${project.name}`);
      roleHours[roleId] = hours;
    }
    actualEffortHours[phaseId] = roleHours;
  }
  await unwrap(
    `insert:project_actuals:${project.name}`,
    db
      .from("project_actuals")
      .insert([
        {
          project_id: projectId,
          actual_effort_hours: actualEffortHours,
          actual_duration_weeks: project.durationWeeks,
          actual_cost: actualCostOf(project),
          completed_at: new Date().toISOString().slice(0, 10),
          notes: `Issues: ${project.issuesEncountered.join("; ") || "ninguno"}. Resultado: ${project.outcome}`,
        },
      ])
      .select()
  );

  // experiences: lecciones aprendidas, con su propio embedding para recuperación semántica.
  if (project.lessonsLearned.length > 0) {
    const lessonText = project.lessonsLearned.join(" ");
    const lessonEmbedding = await embed(`${project.name}: ${lessonText}`);
    await unwrap(
      `insert:experiences:${project.name}`,
      db
        .from("experiences")
        .insert([
          {
            project_id: projectId,
            summary: project.outcome,
            lesson: lessonText,
            tags: [project.projectType, project.industry],
            embedding: lessonEmbedding,
          },
        ])
        .select()
    );
  }

  console.log(`✓ ${project.name} (${totalHoursOf(project)}h, $${actualCostOf(project).toLocaleString()})`);
}

async function main() {
  console.log("== Seed Estimador ==");
  await seedSystemSettings();
  const phaseIdByName = await seedPhases();
  const roleIdByName = await seedRoles();
  await seedCostRates(roleIdByName);
  await seedSimilarityWeightProfile();
  await seedSkills();

  const embedder = createEmbeddingProvider();
  const embed = (text: string) => embedder.embed(text);

  console.log(`\nSembrando ${SYNTHETIC_PROJECTS.length} proyectos históricos sintéticos...`);
  for (const project of SYNTHETIC_PROJECTS) {
    await seedProject(project, phaseIdByName, roleIdByName, embed);
  }

  console.log("\n== Seed completo ==");
}

main().catch((err) => {
  console.error("❌ Seed falló:", err);
  process.exit(1);
});
