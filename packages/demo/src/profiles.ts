import { getSkill, type CompanyCategory, type RoleId } from '@jobradar/core';

/**
 * ⚠ SYNTHETIC DATA GENERATION ONLY.
 *
 * These tables are the *assumptions used to fabricate demo job descriptions*.
 * They are not market statistics and must never be shown as such. The app's
 * statistics are computed from the generated descriptions by the real
 * extractor + aggregation code, so the demo exercises the same pipeline the
 * production data will.
 */

type P = [required: number, preferred: number];

/** Base probabilities for a full-stack role sample. */
const FULLSTACK: Record<string, P> = {
  javascript: [0.55, 0.05], typescript: [0.6, 0.1], python: [0.18, 0.12], java: [0.2, 0.08], go: [0.04, 0.08], csharp: [0.06, 0.02],
  kotlin: [0.01, 0.02], php: [0.03, 0.02], ruby: [0.02, 0.01], rust: [0, 0.03], bash: [0.03, 0.05],
  react: [0.62, 0.08], nextjs: [0.12, 0.18], 'react-native': [0.02, 0.1], vue: [0.07, 0.08], angular: [0.1, 0.05], redux: [0.2, 0.15],
  'html-css': [0.5, 0.05], tailwind: [0.1, 0.15], 'web-accessibility': [0.03, 0.1], 'build-tooling': [0.04, 0.06], 'responsive-design': [0.12, 0.05],
  nodejs: [0.58, 0.08], express: [0.2, 0.1], nestjs: [0.1, 0.1], 'spring-boot': [0.12, 0.06], django: [0.04, 0.04], fastapi: [0.03, 0.05], dotnet: [0.06, 0.02], orm: [0.1, 0.1],
  sql: [0.4, 0.06], postgresql: [0.32, 0.1], mysql: [0.22, 0.08], mongodb: [0.3, 0.1], redis: [0.1, 0.2], dynamodb: [0.03, 0.06], nosql: [0.07, 0.05], elasticsearch: [0.03, 0.1],
  rest: [0.62, 0.04], graphql: [0.1, 0.22], grpc: [0.03, 0.06], websockets: [0.04, 0.08], openapi: [0.04, 0.08], kafka: [0.04, 0.1], rabbitmq: [0.02, 0.05], 'message-queues': [0.04, 0.06],
  aws: [0.28, 0.22], gcp: [0.05, 0.1], azure: [0.12, 0.1], serverless: [0.04, 0.1],
  docker: [0.3, 0.28], kubernetes: [0.08, 0.3], cicd: [0.22, 0.25], 'github-actions': [0.04, 0.1], jenkins: [0.05, 0.08], terraform: [0.02, 0.08], iac: [0.02, 0.04], linux: [0.1, 0.1],
  'unit-testing': [0.35, 0.15], 'integration-testing': [0.12, 0.1], 'e2e-testing': [0.07, 0.1], tdd: [0.05, 0.1], jest: [0.12, 0.12], cypress: [0.04, 0.1], playwright: [0.03, 0.08],
  junit: [0.08, 0.06], 'testing-library': [0.07, 0.1],
  oauth: [0.1, 0.12], jwt: [0.1, 0.08], 'authn-authz': [0.22, 0.1], 'secure-coding': [0.12, 0.12],
  'system-design': [0.28, 0.14], microservices: [0.12, 0.18], 'design-patterns': [0.22, 0.1], dsa: [0.3, 0.05], 'distributed-systems': [0.06, 0.1], 'event-driven': [0.03, 0.07], ddd: [0.02, 0.05],
  llm: [0.04, 0.12], rag: [0.02, 0.06], ml: [0.02, 0.06], 'data-pipelines': [0.03, 0.05],
  monitoring: [0.1, 0.2], datadog: [0.02, 0.06], prometheus: [0.03, 0.07], opentelemetry: [0.01, 0.04], performance: [0.14, 0.18],
  git: [0.58, 0.08], jira: [0.04, 0.1], postman: [0.03, 0.06], figma: [0.02, 0.06],
  agile: [0.22, 0.1], 'code-review': [0.2, 0.1], mentoring: [0.1, 0.2], collaboration: [0.3, 0.1], 'tech-leadership': [0.08, 0.1], communication: [0.3, 0.05], documentation: [0.1, 0.1],
};

type Mult = Record<string, number>;

const ROLE_CATEGORY_MULT: Record<RoleId, Mult> = {
  fullstack: {},
  frontend: { frontend: 1.5, backend: 0.2, database: 0.25, api: 0.6, cloud: 0.4, devops: 0.4, testing: 1.3, security: 0.5, architecture: 0.7, data_ai: 0.5, observability: 0.8 },
  backend: { frontend: 0.08, backend: 1.4, database: 1.5, api: 1.5, cloud: 1.3, devops: 1.3, testing: 1.1, security: 1.5, architecture: 1.6, data_ai: 1.2, observability: 1.6 },
  software: { frontend: 0.55, backend: 0.9, architecture: 1.3 },
};

const ROLE_SKILL_MULT: Record<RoleId, Mult> = {
  fullstack: {},
  frontend: { nodejs: 0.5, typescript: 1.3, java: 0.1, python: 0.1, sql: 0.15, rest: 0.9, figma: 3, 'web-accessibility': 3, performance: 1.3, 'build-tooling': 3, 'responsive-design': 3, tailwind: 1.5, react: 1.2, graphql: 1.2, jest: 1.4, 'testing-library': 2, cypress: 1.5, playwright: 1.5 },
  backend: { 'html-css': 0.1, react: 0.05, nextjs: 0.05, redux: 0.03, tailwind: 0.02, java: 2.2, python: 1.8, go: 3, kotlin: 3, typescript: 0.8, javascript: 0.5, nodejs: 1, 'spring-boot': 2, django: 2, fastapi: 2.5, kafka: 2, redis: 1.8, postgresql: 1.4, grpc: 2.5, microservices: 1.5, rabbitmq: 2, terraform: 1.8, kubernetes: 1.6, 'distributed-systems': 2.5, jest: 0.4, junit: 2 },
  software: { java: 1.6, python: 1.4, csharp: 1.5, dsa: 1.3, 'design-patterns': 1.2 },
};

const CATEGORY_SKILL_MULT: Record<CompanyCategory, Mult> = {
  startup: {
    nextjs: 1.8, typescript: 1.2, nodejs: 1.2, llm: 3, rag: 3, serverless: 1.5, graphql: 1.4, tailwind: 1.8, java: 0.4, 'spring-boot': 0.4, dotnet: 0.3, csharp: 0.4, jenkins: 0.3,
    agile: 0.6, 'design-patterns': 0.7, 'system-design': 0.9, mentoring: 0.6, kubernetes: 0.8, docker: 1.1, 'secure-coding': 0.6, documentation: 0.6, jira: 0.5, angular: 0.4, junit: 0.3, tdd: 0.7,
  },
  mid: { agile: 1.1, postgresql: 1.2, microservices: 1.2, kubernetes: 1.2, mentoring: 1.1, cicd: 1.15, aws: 1.1 },
  large: {
    java: 2.2, 'spring-boot': 2.5, dotnet: 2.5, csharp: 2.4, angular: 2.2, jenkins: 3, azure: 2, agile: 1.9, 'design-patterns': 1.6, dsa: 1.3, 'secure-coding': 1.8, tdd: 1.6, 'unit-testing': 1.3,
    junit: 2.5, microservices: 1.5, 'distributed-systems': 1.5, documentation: 1.6, jira: 3, nextjs: 0.5, tailwind: 0.4, graphql: 0.6, mentoring: 1.5, 'tech-leadership': 1.4, communication: 1.3,
    collaboration: 1.2, cicd: 1.3, sql: 1.2, mysql: 1.2, 'react-native': 0.6, serverless: 0.7,
  },
};

const INDUSTRY_SKILL_MULT: Record<string, Mult> = {
  Fintech: { 'secure-coding': 2.6, oauth: 2, kafka: 2.4, jwt: 1.4, java: 1.5, microservices: 1.4, 'distributed-systems': 1.5, 'authn-authz': 1.6, redis: 1.3 },
  Banking: { 'secure-coding': 3, oauth: 2, java: 2, 'spring-boot': 2, kafka: 2, 'authn-authz': 1.8, microservices: 1.4, jenkins: 1.5 },
  Healthtech: { 'secure-coding': 2, documentation: 1.4, python: 1.4, 'authn-authz': 1.3, ml: 2 },
  Logistics: { kafka: 2, websockets: 1.6, 'event-driven': 2, 'distributed-systems': 1.5, redis: 1.4 },
  'E-commerce': { redis: 1.8, elasticsearch: 3, performance: 1.6, nextjs: 1.5, microservices: 1.3, 'responsive-design': 1.5 },
  'AI / Data': { llm: 6, rag: 6, python: 2.5, ml: 5, 'data-pipelines': 3, fastapi: 4, nextjs: 1.5 },
  'Developer tools': { typescript: 1.3, go: 2.5, rust: 4, kubernetes: 1.5, docker: 1.4, graphql: 1.3, nodejs: 1.2, opentelemetry: 3 },
  Media: { performance: 1.5, 'web-accessibility': 2, websockets: 1.5 },
  Gaming: { websockets: 3, performance: 2 },
  Mobility: { websockets: 2.5, kafka: 1.6, 'react-native': 4, go: 1.6, 'distributed-systems': 1.6 },
  Edtech: { 'react-native': 2, 'web-accessibility': 2 },
  Telecom: { java: 2, kafka: 1.5, 'spring-boot': 1.8 },
  Automotive: { python: 1.5, java: 1.4 },
  Insurance: { java: 1.5, 'secure-coding': 1.5, jenkins: 1.5 },
  'Enterprise IT': { java: 1.8, dotnet: 1.8, angular: 1.5, jenkins: 1.6, agile: 1.3, 'spring-boot': 1.8 },
};

const CAP = 0.95;
/** Real postings list a focused handful of skills; shrink the long tail, keep the head. */
const SHARPEN = 1.45;
const sharpen = (p: number) => (p <= 0 ? 0 : Math.pow(p, SHARPEN));

export function skillProbabilities(roleId: RoleId, category: CompanyCategory, industry: string): Record<string, P> {
  const out: Record<string, P> = {};
  for (const [id, [req, pref]] of Object.entries(FULLSTACK)) {
    const def = getSkill(id);
    if (!def) continue;
    let m = (ROLE_CATEGORY_MULT[roleId][def.category] ?? 1) * (ROLE_SKILL_MULT[roleId][id] ?? 1) * (CATEGORY_SKILL_MULT[category][id] ?? 1) * (INDUSTRY_SKILL_MULT[industry]?.[id] ?? 1);
    if (!Number.isFinite(m)) m = 1;
    out[id] = [Math.min(CAP, sharpen(req) * m), Math.min(CAP, sharpen(pref) * m)];
  }
  return out;
}

export const ALL_DEMO_SKILL_IDS = Object.keys(FULLSTACK);
