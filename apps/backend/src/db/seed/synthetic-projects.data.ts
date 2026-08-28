import { COST_RATES } from "./reference-data.js";

export interface SyntheticProjectFeature {
  category: "functional" | "technical" | "integration" | "non_functional";
  key: string;
  value: unknown;
}

/** hours[phaseName][roleName] = horas reales invertidas (spec §4: "horas/esfuerzo real"). */
export type EffortHours = Record<string, Record<string, number>>;

export interface SyntheticProject {
  name: string;
  description: string;
  projectType: string;
  industry: string;
  technologies: string[];
  teamSize: number;
  durationWeeks: number;
  numUsers: number;
  numInterfaces: number;
  complexity: "low" | "medium" | "high" | "very_high";
  modules: string[];
  integrations: string[];
  effortHours: EffortHours;
  risks: string[];
  issuesEncountered: string[];
  outcome: string;
  lessonsLearned: string[];
}

function totalHours(effort: EffortHours): number {
  let total = 0;
  for (const roles of Object.values(effort)) {
    for (const h of Object.values(roles)) total += h;
  }
  return total;
}

/** Costo real aproximado: horas × tarifa por rol, sumado (spec §4: "costo real"). */
export function actualCostOf(project: SyntheticProject): number {
  let cost = 0;
  for (const [, roles] of Object.entries(project.effortHours)) {
    for (const [role, hours] of Object.entries(roles)) {
      cost += hours * (COST_RATES[role] ?? 40);
    }
  }
  return Math.round(cost);
}

export function totalHoursOf(project: SyntheticProject): number {
  return totalHours(project.effortHours);
}

/** Texto usado para generar el embedding — descripción + características clave. */
export function embeddingTextOf(project: SyntheticProject): string {
  return [
    project.name,
    project.description,
    `Tipo: ${project.projectType}`,
    `Industria: ${project.industry}`,
    `Tecnologías: ${project.technologies.join(", ")}`,
    `Módulos: ${project.modules.join(", ")}`,
    `Integraciones: ${project.integrations.join(", ")}`,
    `Complejidad: ${project.complexity}`,
    `${project.numUsers} usuarios, ${project.numInterfaces} interfaces`,
  ].join("\n");
}

export const SYNTHETIC_PROJECTS: SyntheticProject[] = [
  {
    name: "Portal de Solicitudes de Compra",
    description:
      "Aplicación web para gestionar solicitudes de compra internas, con flujo de aprobación por niveles, integrada con el ERP SAP para sincronizar órdenes de compra y proveedores. Aproximadamente 5 tipos de usuario (solicitante, aprobador nivel 1, aprobador nivel 2, compras, administrador).",
    projectType: "internal_business_app",
    industry: "manufactura",
    technologies: ["React", "Node.js", "PostgreSQL", "SAP RFC/BAPI"],
    teamSize: 6,
    durationWeeks: 16,
    numUsers: 150,
    numInterfaces: 3,
    complexity: "medium",
    modules: ["Solicitudes", "Aprobaciones", "Catálogo de proveedores", "Reportes"],
    integrations: ["SAP ERP (órdenes de compra)", "SSO corporativo (SAML)", "Notificaciones por email"],
    effortHours: {
      "Análisis": { "Analista funcional": 100, "Project Manager": 30 },
      "Diseño": { "UX/UI": 80, "Arquitecto de solución": 40 },
      "Arquitectura": { "Arquitecto de solución": 60 },
      "Desarrollo": { Desarrollador: 680 },
      "Integración": { Desarrollador: 120, "Arquitecto de solución": 20 },
      "Pruebas": { "Analista de Calidad (QA)": 160 },
      "QA": { "Analista de Calidad (QA)": 80 },
      "Despliegue": { Integrador: 60 },
      "Gestión de Proyecto": { "Project Manager": 140 },
      "Capacitación": { "Analista funcional": 24 },
    },
    risks: ["Disponibilidad del equipo SAP para pruebas de integración", "Cambios de alcance en flujo de aprobación"],
    issuesEncountered: ["Retraso de 2 semanas por acceso tardío al ambiente SAP QA"],
    outcome: "Entregado con 2 semanas de retraso, alcance cumplido al 100%.",
    lessonsLearned: [
      "Confirmar acceso a ambientes SAP QA/DEV antes de iniciar desarrollo de integración, no durante la fase de integración.",
      "Los flujos de aprobación con niveles configurables requieren más horas de BA de lo estimado inicialmente (~20%).",
    ],
  },
  {
    name: "App Móvil de Pedidos B2C",
    description:
      "Aplicación móvil (iOS/Android) para que clientes finales realicen pedidos de productos, con pago en línea, seguimiento de entrega y notificaciones push.",
    projectType: "mobile_app",
    industry: "retail",
    technologies: ["React Native", "Node.js", "PostgreSQL", "Stripe"],
    teamSize: 7,
    durationWeeks: 20,
    numUsers: 25000,
    numInterfaces: 4,
    complexity: "high",
    modules: ["Catálogo", "Carrito", "Checkout", "Seguimiento de pedido", "Notificaciones"],
    integrations: ["Stripe (pagos)", "Firebase Cloud Messaging", "API de logística de entrega", "Google Maps"],
    effortHours: {
      "Análisis": { "Analista funcional": 80, "Project Manager": 30 },
      "Diseño": { "UX/UI": 160, "Arquitecto de solución": 40 },
      "Arquitectura": { "Arquitecto de solución": 70 },
      "Desarrollo": { Desarrollador: 960 },
      "Integración": { Desarrollador: 180 },
      "Pruebas": { "Analista de Calidad (QA)": 220 },
      "QA": { "Analista de Calidad (QA)": 100 },
      "Seguridad": { "Analista de Seguridad": 50 },
      "Despliegue": { Integrador: 90 },
      "Gestión de Proyecto": { "Project Manager": 170 },
    },
    risks: ["Aprobación en app stores puede tomar tiempo variable", "Integración de pagos requiere certificación PCI básica"],
    issuesEncountered: ["Rechazo inicial en App Store por política de privacidad incompleta, +1 semana"],
    outcome: "Entregado a tiempo, con una iteración adicional post-lanzamiento por feedback de UX.",
    lessonsLearned: [
      "Reservar tiempo de buffer para el ciclo de revisión de app stores, especialmente Apple.",
      "El diseño UX para apps de e-commerce B2C consume más horas que en proyectos internos (~2x).",
    ],
  },
  {
    name: "E-commerce Multicanal",
    description:
      "Plataforma de e-commerce sobre Shopify Plus con frontend headless a medida, integrando canales de venta en marketplace y tienda física (POS).",
    projectType: "ecommerce",
    industry: "retail",
    technologies: ["Next.js", "Shopify Plus", "GraphQL", "Node.js"],
    teamSize: 8,
    durationWeeks: 24,
    numUsers: 80000,
    numInterfaces: 5,
    complexity: "high",
    modules: ["Catálogo headless", "Checkout", "Gestión de inventario", "Sincronización POS", "Marketplace feed"],
    integrations: ["Shopify Admin API", "Sistema POS en tienda", "Marketplace (Mercado Libre)", "Pasarela de pago local"],
    effortHours: {
      "Análisis": { "Analista funcional": 120, "Project Manager": 40 },
      "Diseño": { "UX/UI": 180, "Arquitecto de solución": 50 },
      "Arquitectura": { "Arquitecto de solución": 90 },
      "Desarrollo": { Desarrollador: 1200 },
      "Integración": { Desarrollador: 260, "Arquitecto de solución": 30 },
      "Pruebas": { "Analista de Calidad (QA)": 260 },
      "QA": { "Analista de Calidad (QA)": 120 },
      "Despliegue": { Integrador: 110 },
      "Gestión de Proyecto": { "Project Manager": 200 },
    },
    risks: ["Sincronización de inventario en tiempo real entre POS y online", "Picos de tráfico en campañas"],
    issuesEncountered: ["Duplicidad de stock por race condition en sincronización POS, requirió refactor"],
    outcome: "Entregado con 3 semanas de retraso por el refactor de sincronización de inventario.",
    lessonsLearned: [
      "La sincronización de inventario multicanal en tiempo real es sistemáticamente subestimada; añadir 25% de contingencia técnica.",
    ],
  },
  {
    name: "Plataforma de Analítica de Ventas",
    description:
      "Plataforma de datos para consolidar ventas de múltiples fuentes (ERP, e-commerce, POS) en un data warehouse y exponer dashboards ejecutivos.",
    projectType: "data_platform",
    industry: "retail",
    technologies: ["Python", "Airflow", "Snowflake", "dbt", "Looker"],
    teamSize: 5,
    durationWeeks: 18,
    numUsers: 40,
    numInterfaces: 4,
    complexity: "medium",
    modules: ["Pipelines ETL", "Modelo dimensional", "Dashboards ejecutivos"],
    integrations: ["ERP (extracción batch)", "E-commerce API", "POS (archivos CSV diarios)"],
    effortHours: {
      "Análisis": { "Analista funcional": 90, Desarrollador: 40 },
      "Arquitectura": { "Arquitecto de solución": 60, Desarrollador: 40 },
      "Desarrollo": { Desarrollador: 680 },
      "Integración": { Desarrollador: 160 },
      "Pruebas": { "Analista de Calidad (QA)": 100, Desarrollador: 60 },
      "Despliegue": { Integrador: 50 },
      "Gestión de Proyecto": { "Project Manager": 110 },
    },
    risks: ["Calidad de datos inconsistente entre fuentes", "Cambios de esquema en el ERP de origen"],
    issuesEncountered: ["Se descubrieron duplicados históricos en datos de ventas, +80 horas de limpieza no planificadas"],
    outcome: "Entregado con 2 semanas de retraso por trabajo de calidad de datos no previsto.",
    lessonsLearned: [
      "Siempre incluir una fase de perfilado/auditoría de calidad de datos antes de comprometer fechas en proyectos de datos.",
    ],
  },
  {
    name: "Modernización de Sistema de Facturación Legado",
    description:
      "Migración de un sistema de facturación monolítico en Java/COBOL a una arquitectura de microservicios (Spring Boot) con mensajería asíncrona, manteniendo continuidad operativa.",
    projectType: "legacy_modernization",
    industry: "banca",
    technologies: ["Java", "Spring Boot", "Kafka", "Oracle DB", "Kubernetes"],
    teamSize: 12,
    durationWeeks: 32,
    numUsers: 300,
    numInterfaces: 8,
    complexity: "very_high",
    modules: ["Motor de facturación", "Conciliación", "Reportería regulatoria", "Gateway de mensajería"],
    integrations: ["Core bancario", "Sistema de conciliación contable", "Bureau de crédito", "Reguladores (reportes)"],
    effortHours: {
      "Análisis": { "Analista funcional": 220, "Project Manager": 60 },
      "Diseño": { "Arquitecto de solución": 140 },
      "Arquitectura": { "Arquitecto de solución": 180 },
      "Desarrollo": { Desarrollador: 2400 },
      "Integración": { Desarrollador: 480, "Arquitecto de solución": 60 },
      "Pruebas": { "Analista de Calidad (QA)": 520 },
      "QA": { "Analista de Calidad (QA)": 180 },
      "Seguridad": { "Analista de Seguridad": 160 },
      "Despliegue": { Integrador: 220 },
      "Gestión de Proyecto": { "Project Manager": 380 },
      "Soporte/Hypercare": { Desarrollador: 160, "Analista de Calidad (QA)": 80 },
    },
    risks: ["Continuidad operativa durante el corte (cutover)", "Divergencia de reglas de negocio no documentadas en el legado"],
    issuesEncountered: [
      "Reglas de negocio críticas no documentadas descubiertas durante desarrollo, +6 semanas de análisis adicional",
      "Rollback parcial en el primer intento de cutover",
    ],
    outcome: "Entregado con 8 semanas de retraso sobre el plan original y 22% sobre el presupuesto inicial.",
    lessonsLearned: [
      "En modernizaciones de legado sin documentación confiable, presupuestar ingeniería inversa como fase explícita, no como parte de 'Análisis'.",
      "Planificar al menos dos ensayos de cutover en ambiente productivo-espejo antes del corte real.",
    ],
  },
  {
    name: "Integración CRM Salesforce con ERP",
    description:
      "Integración bidireccional entre Salesforce Sales Cloud y el ERP corporativo usando MuleSoft, para sincronizar cuentas, oportunidades y órdenes.",
    projectType: "integration",
    industry: "servicios profesionales",
    technologies: ["Salesforce", "MuleSoft", "Apex"],
    teamSize: 4,
    durationWeeks: 12,
    numUsers: 200,
    numInterfaces: 2,
    complexity: "medium",
    modules: ["Sincronización de cuentas", "Sincronización de oportunidades", "Sincronización de órdenes"],
    integrations: ["ERP corporativo", "Salesforce Sales Cloud"],
    effortHours: {
      "Análisis": { "Analista funcional": 60, "Arquitecto de solución": 30 },
      "Arquitectura": { "Arquitecto de solución": 50 },
      "Desarrollo": { Desarrollador: 420 },
      "Integración": { Desarrollador: 140, "Arquitecto de solución": 20 },
      "Pruebas": { "Analista de Calidad (QA)": 100 },
      "Despliegue": { Integrador: 30 },
      "Gestión de Proyecto": { "Project Manager": 70 },
    },
    risks: ["Límites de API de Salesforce (rate limits)", "Conflictos de datos maestros entre sistemas"],
    issuesEncountered: [],
    outcome: "Entregado a tiempo y dentro de presupuesto.",
    lessonsLearned: ["Definir reglas claras de 'sistema maestro' por entidad antes de construir la sincronización, no durante."],
  },
  {
    name: "Panel Administrativo Interno de RRHH",
    description:
      "Panel interno CRUD para gestión de empleados, ausencias y evaluaciones de desempeño, uso exclusivo del equipo de RRHH.",
    projectType: "internal_tool",
    industry: "servicios profesionales",
    technologies: ["React", "Node.js", "PostgreSQL"],
    teamSize: 3,
    durationWeeks: 8,
    numUsers: 12,
    numInterfaces: 1,
    complexity: "low",
    modules: ["Gestión de empleados", "Ausencias", "Evaluaciones"],
    integrations: ["Directorio corporativo (LDAP)"],
    effortHours: {
      "Análisis": { "Analista funcional": 30 },
      "Diseño": { "UX/UI": 30 },
      "Desarrollo": { Desarrollador: 280 },
      "Pruebas": { "Analista de Calidad (QA)": 60 },
      "Despliegue": { Integrador: 16 },
      "Gestión de Proyecto": { "Project Manager": 40 },
    },
    risks: ["Bajo — proyecto de alcance acotado y usuarios internos"],
    issuesEncountered: [],
    outcome: "Entregado a tiempo y dentro de presupuesto, sin observaciones relevantes.",
    lessonsLearned: ["Herramientas internas de alcance acotado y stakeholder único se benefician de ciclos de feedback semanales cortos."],
  },
  {
    name: "Panel Administrativo de Inventario de Bodega",
    description:
      "Panel interno CRUD para control de inventario de bodega, recepción de mercancía y ajustes de stock, uso del equipo de logística interna.",
    projectType: "internal_tool",
    industry: "logística",
    technologies: ["React", "Node.js", "PostgreSQL"],
    teamSize: 3,
    durationWeeks: 9,
    numUsers: 20,
    numInterfaces: 1,
    complexity: "low",
    modules: ["Recepción de mercancía", "Ajustes de stock", "Reportes de inventario"],
    integrations: ["Lector de código de barras (local)"],
    effortHours: {
      "Análisis": { "Analista funcional": 35 },
      "Diseño": { "UX/UI": 25 },
      "Desarrollo": { Desarrollador: 300 },
      "Pruebas": { "Analista de Calidad (QA)": 65 },
      "Despliegue": { Integrador: 18 },
      "Gestión de Proyecto": { "Project Manager": 42 },
    },
    risks: ["Bajo — proyecto de alcance acotado"],
    issuesEncountered: [],
    outcome: "Entregado a tiempo, dentro de presupuesto.",
    lessonsLearned: ["Consistente con otros paneles internos CRUD de alcance similar (~450-500 horas totales)."],
  },
  {
    name: "Motor de Recomendaciones de Productos",
    description:
      "Motor de recomendación de productos basado en comportamiento de usuario (collaborative filtering + reglas de negocio), integrado al catálogo de e-commerce existente.",
    projectType: "ml_feature",
    industry: "retail",
    technologies: ["Python", "scikit-learn", "TensorFlow", "Redis", "FastAPI"],
    teamSize: 5,
    durationWeeks: 20,
    numUsers: 80000,
    numInterfaces: 2,
    complexity: "high",
    modules: ["Feature store", "Modelo de recomendación", "API de scoring en tiempo real"],
    integrations: ["Catálogo de e-commerce", "Event tracking (analytics)"],
    effortHours: {
      "Análisis": { "Analista funcional": 50, Desarrollador: 40 },
      "Arquitectura": { "Arquitecto de solución": 60, Desarrollador: 40 },
      "Desarrollo": { Desarrollador: 920 },
      "Integración": { Desarrollador: 120 },
      "Pruebas": { "Analista de Calidad (QA)": 140, Desarrollador: 60 },
      "Despliegue": { Integrador: 80 },
      "Gestión de Proyecto": { "Project Manager": 130 },
    },
    risks: ["Calidad insuficiente de datos de comportamiento histórico", "Riesgo de sesgo/relevancia baja del modelo inicial"],
    issuesEncountered: ["El primer modelo tuvo relevancia insuficiente en pruebas A/B, requirió una segunda iteración de features"],
    outcome: "Entregado con 3 semanas de retraso por la segunda iteración del modelo.",
    lessonsLearned: ["Presupuestar explícitamente al menos 2 iteraciones de modelo en proyectos de ML orientados a producto, no 1."],
  },
  {
    name: "Portal de Pacientes",
    description:
      "Portal web para que pacientes agenden citas, consulten resultados de laboratorio y se comuniquen con su médico, cumpliendo normativa de protección de datos de salud.",
    projectType: "healthcare_portal",
    industry: "salud",
    technologies: ["React", "Node.js", "PostgreSQL", "HL7 FHIR"],
    teamSize: 9,
    durationWeeks: 28,
    numUsers: 15000,
    numInterfaces: 4,
    complexity: "very_high",
    modules: ["Agendamiento de citas", "Resultados de laboratorio", "Mensajería paciente-médico", "Consentimientos"],
    integrations: ["Sistema hospitalario (HL7 FHIR)", "Laboratorio clínico", "Pasarela de notificaciones SMS"],
    effortHours: {
      "Análisis": { "Analista funcional": 160, "Project Manager": 50 },
      "Diseño": { "UX/UI": 140, "Arquitecto de solución": 70 },
      "Arquitectura": { "Arquitecto de solución": 120 },
      "Desarrollo": { Desarrollador: 1600 },
      "Integración": { Desarrollador: 320, "Arquitecto de solución": 40 },
      "Pruebas": { "Analista de Calidad (QA)": 320 },
      "QA": { "Analista de Calidad (QA)": 140 },
      "Seguridad": { "Analista de Seguridad": 220 },
      "Despliegue": { Integrador: 130 },
      "Gestión de Proyecto": { "Project Manager": 260 },
      "Capacitación": { "Analista funcional": 40 },
    },
    risks: ["Cumplimiento normativo de datos de salud (privacidad)", "Integración HL7 FHIR con sistema hospitalario legado"],
    issuesEncountered: ["Auditoría de seguridad externa encontró hallazgos que retrasaron el go-live 3 semanas"],
    outcome: "Entregado con 5 semanas de retraso, presupuesto de seguridad ampliado 30% sobre lo inicial.",
    lessonsLearned: [
      "En proyectos de salud/datos sensibles, presupuestar una auditoría de seguridad externa como hito explícito antes del go-live, con buffer de al menos 3 semanas para remediación.",
    ],
  },
  {
    name: "Plataforma de Pagos Fintech",
    description:
      "Plataforma de procesamiento de pagos para comercios afiliados, con onboarding de merchants, liquidación y cumplimiento PCI-DSS.",
    projectType: "fintech_payments",
    industry: "fintech",
    technologies: ["Node.js", "PostgreSQL", "Kubernetes", "Vault"],
    teamSize: 11,
    durationWeeks: 30,
    numUsers: 500,
    numInterfaces: 5,
    complexity: "very_high",
    modules: ["Onboarding de merchants", "Procesamiento de transacciones", "Liquidación", "Panel de disputas"],
    integrations: ["Redes de pago (Visa/Mastercard)", "Banco liquidador", "Motor antifraude", "Buró de crédito"],
    effortHours: {
      "Análisis": { "Analista funcional": 180, "Project Manager": 60 },
      "Diseño": { "Arquitecto de solución": 130 },
      "Arquitectura": { "Arquitecto de solución": 160 },
      "Desarrollo": { Desarrollador: 2100 },
      "Integración": { Desarrollador: 400, "Arquitecto de solución": 60 },
      "Pruebas": { "Analista de Calidad (QA)": 400 },
      "QA": { "Analista de Calidad (QA)": 160 },
      "Seguridad": { "Analista de Seguridad": 280 },
      "Despliegue": { Integrador: 200 },
      "Gestión de Proyecto": { "Project Manager": 340 },
    },
    risks: ["Certificación PCI-DSS puede bloquear el lanzamiento", "Dependencia de terceros (redes de pago) para pruebas end-to-end"],
    issuesEncountered: ["Certificación PCI-DSS tomó 4 semanas más de lo previsto por hallazgos de la auditoría inicial"],
    outcome: "Entregado con 6 semanas de retraso, principalmente por el ciclo de certificación PCI-DSS.",
    lessonsLearned: [
      "La certificación PCI-DSS debe iniciarse en paralelo al desarrollo, no después — es sistemáticamente subestimada en duración.",
    ],
  },
  {
    name: "Integración ERP-WMS para Logística",
    description:
      "Middleware de integración entre el ERP corporativo y el sistema de gestión de bodegas (WMS) de un operador logístico, sincronizando inventario y órdenes de despacho.",
    projectType: "integration",
    industry: "logística",
    technologies: ["Node.js", "RabbitMQ", "SAP RFC/BAPI"],
    teamSize: 4,
    durationWeeks: 14,
    numUsers: 60,
    numInterfaces: 2,
    complexity: "medium",
    modules: ["Sincronización de inventario", "Órdenes de despacho"],
    integrations: ["SAP ERP", "WMS"],
    effortHours: {
      "Análisis": { "Analista funcional": 70, "Arquitecto de solución": 30 },
      "Arquitectura": { "Arquitecto de solución": 50 },
      "Desarrollo": { Desarrollador: 480 },
      "Integración": { Desarrollador: 160, "Arquitecto de solución": 20 },
      "Pruebas": { "Analista de Calidad (QA)": 110 },
      "Despliegue": { Integrador: 40 },
      "Gestión de Proyecto": { "Project Manager": 80 },
    },
    risks: ["Ventanas de mantenimiento limitadas del WMS para pruebas"],
    issuesEncountered: [],
    outcome: "Entregado a tiempo, dentro de presupuesto.",
    lessonsLearned: ["Las integraciones SAP RFC/BAPI con volúmenes moderados siguen un patrón de esfuerzo predecible (~750-850 horas totales)."],
  },
  {
    name: "API Gateway Público para Partners",
    description:
      "Plataforma de API pública para que partners externos consuman servicios del negocio, con gestión de API keys, rate limiting, documentación y portal de desarrolladores.",
    projectType: "api_platform",
    industry: "servicios profesionales",
    technologies: ["Node.js", "Kong", "PostgreSQL", "OpenAPI"],
    teamSize: 6,
    durationWeeks: 16,
    numUsers: 300,
    numInterfaces: 6,
    complexity: "medium",
    modules: ["Gestión de API keys", "Rate limiting", "Portal de desarrolladores", "Analítica de uso"],
    integrations: ["Servicios internos existentes (6 APIs)", "Sistema de facturación por consumo"],
    effortHours: {
      "Análisis": { "Analista funcional": 70, "Arquitecto de solución": 30 },
      "Diseño": { "UX/UI": 60 },
      "Arquitectura": { "Arquitecto de solución": 90 },
      "Desarrollo": { Desarrollador: 680 },
      "Integración": { Desarrollador: 200 },
      "Pruebas": { "Analista de Calidad (QA)": 150 },
      "Seguridad": { "Analista de Seguridad": 70 },
      "Despliegue": { Integrador: 90 },
      "Gestión de Proyecto": { "Project Manager": 110 },
    },
    risks: ["Coordinación con 6 equipos dueños de las APIs internas a exponer"],
    issuesEncountered: ["Dos equipos internos entregaron sus APIs con 2 semanas de retraso sobre el plan"],
    outcome: "Entregado con 2 semanas de retraso por dependencias de equipos internos.",
    lessonsLearned: ["En plataformas que agregan APIs de múltiples equipos, tratar cada dependencia interna como un riesgo de cronograma explícito."],
  },
  {
    name: "Migración de Infraestructura a la Nube",
    description:
      "Migración de aplicaciones on-premise a AWS (EC2, RDS, S3), con infraestructura como código y pipeline de CI/CD, sin cambios funcionales en las aplicaciones migradas.",
    projectType: "cloud_migration",
    industry: "servicios profesionales",
    technologies: ["AWS", "Terraform", "Docker", "GitHub Actions"],
    teamSize: 5,
    durationWeeks: 12,
    numUsers: 0,
    numInterfaces: 0,
    complexity: "medium",
    modules: ["Infraestructura como código", "Pipelines CI/CD", "Migración de datos"],
    integrations: ["AWS (EC2, RDS, S3, CloudWatch)"],
    effortHours: {
      "Análisis": { "Arquitecto de solución": 60 },
      "Arquitectura": { "Arquitecto de solución": 100 },
      "Desarrollo": { Integrador: 520 },
      "Pruebas": { "Analista de Calidad (QA)": 80, Integrador: 60 },
      "Seguridad": { "Analista de Seguridad": 60 },
      "Despliegue": { Integrador: 140 },
      "Gestión de Proyecto": { "Project Manager": 90 },
    },
    risks: ["Downtime durante el corte de migración de datos", "Diferencias de configuración entre on-premise y cloud"],
    issuesEncountered: [],
    outcome: "Entregado a tiempo, dentro de presupuesto.",
    lessonsLearned: ["Migraciones de infraestructura sin cambios funcionales son predecibles cuando hay inventario previo completo de la infraestructura on-premise."],
  },
  {
    name: "Portal de Servicios Ciudadanos",
    description:
      "Portal gubernamental para que ciudadanos soliciten trámites y certificados en línea, con altos requisitos de accesibilidad y seguridad, integrado a bases de datos de identidad nacional.",
    projectType: "government_portal",
    industry: "gobierno",
    technologies: ["ASP.NET Core", "SQL Server", "Azure"],
    teamSize: 10,
    durationWeeks: 26,
    numUsers: 500000,
    numInterfaces: 5,
    complexity: "very_high",
    modules: ["Solicitud de trámites", "Seguimiento de expedientes", "Pagos de aranceles", "Notificaciones"],
    integrations: ["Registro civil / identidad nacional", "Pasarela de pagos de gobierno", "Firma electrónica"],
    effortHours: {
      "Análisis": { "Analista funcional": 200, "Project Manager": 60 },
      "Diseño": { "UX/UI": 160, "Arquitecto de solución": 90 },
      "Arquitectura": { "Arquitecto de solución": 140 },
      "Desarrollo": { Desarrollador: 1900 },
      "Integración": { Desarrollador: 380, "Arquitecto de solución": 50 },
      "Pruebas": { "Analista de Calidad (QA)": 360 },
      "QA": { "Analista de Calidad (QA)": 160 },
      "Seguridad": { "Analista de Seguridad": 240 },
      "Despliegue": { Integrador: 160 },
      "Gestión de Proyecto": { "Project Manager": 320 },
      "Capacitación": { "Analista funcional": 50 },
    },
    risks: ["Requisitos de accesibilidad (WCAG) auditados externamente", "Integración con identidad nacional sujeta a procesos burocráticos lentos"],
    issuesEncountered: ["Aprobación de integración con identidad nacional tomó 5 semanas adicionales por trámites administrativos"],
    outcome: "Entregado con 7 semanas de retraso, mayormente por trámites de aprobación externos fuera de control del equipo.",
    lessonsLearned: ["En proyectos de gobierno, los tiempos de aprobación/integración con entidades externas deben presupuestarse con buffers grandes (4-6 semanas) e independientes del cronograma de desarrollo."],
  },
  {
    name: "Plataforma LMS Educativa",
    description:
      "Plataforma de aprendizaje en línea (LMS) con cursos en video, evaluaciones y certificados, para una institución educativa con múltiples sedes.",
    projectType: "education_platform",
    industry: "educación",
    technologies: ["React", "Node.js", "PostgreSQL", "AWS S3", "Video streaming (Mux)"],
    teamSize: 6,
    durationWeeks: 22,
    numUsers: 12000,
    numInterfaces: 3,
    complexity: "medium",
    modules: ["Catálogo de cursos", "Reproductor de video", "Evaluaciones", "Certificados"],
    integrations: ["Proveedor de video streaming (Mux)", "Pasarela de pagos", "Sistema académico existente"],
    effortHours: {
      "Análisis": { "Analista funcional": 90, "Project Manager": 30 },
      "Diseño": { "UX/UI": 120, "Arquitecto de solución": 40 },
      "Arquitectura": { "Arquitecto de solución": 70 },
      "Desarrollo": { Desarrollador: 900 },
      "Integración": { Desarrollador: 180 },
      "Pruebas": { "Analista de Calidad (QA)": 190 },
      "QA": { "Analista de Calidad (QA)": 90 },
      "Despliegue": { Integrador: 80 },
      "Gestión de Proyecto": { "Project Manager": 150 },
    },
    risks: ["Costos variables de streaming de video a escala", "Sincronización con sistema académico legado"],
    issuesEncountered: [],
    outcome: "Entregado a tiempo, dentro de presupuesto.",
    lessonsLearned: ["Plataformas LMS con proveedor de streaming externo (vs. hosting propio de video) reducen significativamente las horas de Integrador."],
  },
  {
    name: "Sistema de Rastreo Logístico IoT",
    description:
      "Sistema de rastreo en tiempo real de flota de camiones mediante dispositivos GPS/IoT instalados en los vehículos, con dashboard de monitoreo y alertas de desviación de ruta.",
    projectType: "iot_tracking",
    industry: "logística",
    technologies: ["React", "Node.js", "MQTT", "TimescaleDB", "Dispositivos GPS/IoT"],
    teamSize: 7,
    durationWeeks: 30,
    numUsers: 80,
    numInterfaces: 3,
    complexity: "very_high",
    modules: ["Ingesta de telemetría", "Dashboard de monitoreo", "Alertas de desviación", "Historial de rutas"],
    integrations: ["Dispositivos GPS/IoT de flota", "Proveedor de mapas", "Sistema de gestión de flota existente"],
    effortHours: {
      "Análisis": { "Analista funcional": 90, "Project Manager": 40 },
      "Diseño": { "UX/UI": 70, "Arquitecto de solución": 60 },
      "Arquitectura": { "Arquitecto de solución": 130 },
      "Desarrollo": { Desarrollador: 3680 },
      "Integración": { Desarrollador: 620, "Arquitecto de solución": 80 },
      "Pruebas": { "Analista de Calidad (QA)": 340 },
      "QA": { "Analista de Calidad (QA)": 140 },
      "Despliegue": { Integrador: 160 },
      "Gestión de Proyecto": { "Project Manager": 260 },
    },
    risks: ["Confiabilidad de conectividad de dispositivos IoT en zonas rurales", "Variabilidad de firmware entre lotes de dispositivos GPS"],
    issuesEncountered: [
      "Incompatibilidad de firmware entre dos lotes de dispositivos GPS del proveedor, requirió reescribir la capa de ingesta dos veces",
      "Cambios de alcance mayores a mitad de proyecto (se agregó módulo de alertas no planificado originalmente)",
      "Rotación de dos desarrolladores clave durante el proyecto",
    ],
    outcome:
      "Caso atípico: entregado con 10 semanas de retraso y 85% sobre el presupuesto inicial, debido a problemas de hardware de terceros, cambios de alcance mayores y rotación de personal. No representativo del esfuerzo típico para este tipo de proyecto — excluir o ponderar a la baja como referencia salvo que el nuevo requerimiento comparta explícitamente estos riesgos (integración de hardware propio, proveedor de dispositivos nuevo).",
    lessonsLearned: [
      "Proyectos con integración de hardware IoT de terceros deben tratar la variabilidad de firmware/hardware como riesgo técnico de alta probabilidad, no como caso extremo.",
      "Este proyecto es un outlier estadístico frente a proyectos comparables — no debe usarse como única referencia para estimar esfuerzo típico de este tipo de proyecto.",
    ],
  },
];
