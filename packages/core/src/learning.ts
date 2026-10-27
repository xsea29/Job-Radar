import { getSkill } from './taxonomy';
import type { SkillCategoryId } from './types';

/**
 * Curated learning guidance. This is *how* to learn and demonstrate a skill;
 * *whether* to learn it always comes from the evidence in the gap analysis.
 * Deliberately not a course catalogue: each guide is a next step, a portfolio
 * project, and checkable milestones.
 */
export interface LearningGuide {
  nextStep: string;
  project: string;
  milestones: string[];
  hours: number;
}

const G: Record<string, LearningGuide> = {
  typescript: {
    nextStep: 'Migrate one existing JavaScript service to strict TypeScript, starting with shared types at the API boundary.',
    project: 'Convert a small REST API to TypeScript with `strict: true`, runtime validation (zod) and shared client types.',
    milestones: ['Enable strict mode on a real codebase', 'Model API payloads with discriminated unions', 'Add generics to a reusable data-fetching helper', 'Replace every `any` with a type or `unknown`'],
    hours: 24,
  },
  react: {
    nextStep: 'Deepen: custom hooks, rendering performance and server-state patterns on a real feature.',
    project: 'Ship a dashboard with optimistic updates, suspense boundaries and measured render performance.',
    milestones: ['Profile and fix one unnecessary re-render chain', 'Extract a reusable data hook', 'Add error and loading boundaries'],
    hours: 16,
  },
  nextjs: {
    nextStep: 'Build on your React knowledge: routing, server components and data fetching in the App Router.',
    project: 'Rebuild an existing React SPA as a Next.js app with SSR for public pages and auth-protected routes.',
    milestones: ['Server and client components used deliberately', 'One route with streaming/suspense', 'Deploy with preview environments'],
    hours: 18,
  },
  nodejs: {
    nextStep: 'Go beyond Express handlers: the event loop, streams, worker threads, graceful shutdown.',
    project: 'Build a job-queue worker with retries, idempotency keys and structured logging.',
    milestones: ['Explain event loop phases with a failing example', 'Stream a large file without buffering', 'Graceful shutdown with in-flight requests'],
    hours: 20,
  },
  postgresql: {
    nextStep: 'Learn indexes, query plans and transactions on a realistic dataset.',
    project: 'Model a multi-tenant app in PostgreSQL, then use EXPLAIN ANALYZE to fix two slow queries.',
    milestones: ['Design a normalised schema with constraints', 'Add an index and show the plan change', 'Write a migration that is safe to run online', 'Use a transaction with the right isolation level'],
    hours: 22,
  },
  sql: {
    nextStep: 'Practise joins, window functions and aggregation until you can write them without a reference.',
    project: 'Answer 15 analytics questions on a public dataset using only SQL, then optimise the slowest.',
    milestones: ['Window functions (rank, lag)', 'CTEs for readable multi-step queries', 'Explain a query plan'],
    hours: 14,
  },
  docker: {
    nextStep: 'Containerise an app you already run, with a multi-stage build and a compose file for its dependencies.',
    project: 'Dockerise a full-stack app (API + DB + cache) with a small final image and a health check.',
    milestones: ['Multi-stage Dockerfile under 150 MB', 'docker compose with a database and volume', 'Non-root user and health check'],
    hours: 12,
  },
  kubernetes: {
    nextStep: 'Run your containerised app on a local cluster; learn Deployments, Services and config before anything advanced.',
    project: 'Deploy an API + database to a local kind/minikube cluster with probes, resource limits and a rolling update.',
    milestones: ['Deployment + Service + Ingress', 'ConfigMaps and Secrets', 'Rolling update and rollback', 'Readiness and liveness probes'],
    hours: 30,
  },
  aws: {
    nextStep: 'Pick one deployable path (compute + database + storage) and learn IAM before anything else.',
    project: 'Deploy an API to AWS with a managed database, least-privilege IAM and a cost alarm.',
    milestones: ['IAM roles with least privilege', 'Deploy behind a load balancer or API gateway', 'Set a billing alarm', 'Store secrets in a secrets manager'],
    hours: 28,
  },
  cicd: {
    nextStep: 'Automate test → build → deploy for a repo you own, with a gate on failing tests.',
    project: 'Pipeline that runs tests, builds a container, and deploys to a preview environment per pull request.',
    milestones: ['Tests gate every merge', 'Build cached for speed', 'Automated deploy to staging', 'Rollback documented'],
    hours: 14,
  },
  'github-actions': {
    nextStep: 'Write a workflow for lint, test and build with caching and a matrix.',
    project: 'Reusable workflow that tests a Node app on two versions and publishes a container image.',
    milestones: ['Matrix build', 'Dependency caching', 'Reusable workflow'],
    hours: 8,
  },
  graphql: {
    nextStep: 'Build a schema-first API with resolvers and fix the N+1 problem with batching.',
    project: 'GraphQL layer over an existing REST API with DataLoader batching and query-depth limits.',
    milestones: ['Schema with queries and mutations', 'DataLoader removes N+1', 'Auth in the context', 'Query complexity limit'],
    hours: 20,
  },
  redis: {
    nextStep: 'Add a cache-aside layer with expiry to a slow endpoint, then measure it.',
    project: 'Rate limiter and response cache for an API with invalidation on write.',
    milestones: ['Cache-aside with TTL', 'Sliding-window rate limit', 'Cache invalidation strategy documented'],
    hours: 10,
  },
  'system-design': {
    nextStep: 'Practise one design per week: requirements → capacity estimate → components → trade-offs.',
    project: 'Write a design doc for a URL shortener or notification service, then review it with a peer.',
    milestones: ['Capacity estimate with stated assumptions', 'Identify the bottleneck and a mitigation', 'Explain two trade-offs you rejected', 'Present to a peer'],
    hours: 30,
  },
  microservices: {
    nextStep: 'Split one module out of a monolith and handle the failure modes this creates.',
    project: 'Two services communicating over HTTP and a queue, with retries, timeouts and tracing.',
    milestones: ['Define the service boundary', 'Timeouts and retries with backoff', 'Correlation id across services'],
    hours: 26,
  },
  'unit-testing': {
    nextStep: 'Raise a real module to meaningful coverage; test behaviour, not implementation.',
    project: 'Add a test suite to an untested service, including mocks only at the boundaries.',
    milestones: ['Arrange-act-assert discipline', 'Test doubles only at edges', 'One flaky test diagnosed and fixed'],
    hours: 12,
  },
  jest: {
    nextStep: 'Write tests with mocks, fake timers and snapshot restraint on a real component or module.',
    project: 'Test suite for an API client with retries, covering success, failure and timeout paths.',
    milestones: ['Mock a module boundary', 'Fake timers for retry logic', 'Coverage report reviewed'],
    hours: 8,
  },
  playwright: {
    nextStep: 'Automate your app’s critical user flow end to end with stable locators.',
    project: 'E2E suite for sign-up → core task → logout, running in CI with traces on failure.',
    milestones: ['Role-based locators', 'Auth state reuse', 'CI run with trace upload'],
    hours: 10,
  },
  cypress: {
    nextStep: 'Automate one critical flow and run it in CI.',
    project: 'Cypress suite for checkout or onboarding with network stubbing.',
    milestones: ['Stable selectors', 'Network stubbing', 'CI integration'],
    hours: 10,
  },
  oauth: {
    nextStep: 'Implement the authorisation-code flow with PKCE against a real provider.',
    project: 'Add “Sign in with Google/GitHub” to an app using PKCE and secure session cookies.',
    milestones: ['Authorisation-code + PKCE', 'Token storage trade-offs explained', 'Refresh and logout handled'],
    hours: 14,
  },
  'authn-authz': {
    nextStep: 'Separate authentication from authorisation and implement role-based checks server-side.',
    project: 'RBAC for an API: roles, permission checks in middleware and tests for forbidden paths.',
    milestones: ['Session vs token trade-offs explained', 'Server-side permission checks', 'Tests for forbidden access'],
    hours: 12,
  },
  rest: {
    nextStep: 'Design an API with consistent resources, pagination, error shape and idempotency.',
    project: 'Specify an API in OpenAPI, then implement it with validation and contract tests.',
    milestones: ['Consistent error format', 'Cursor pagination', 'Idempotent POST with a key'],
    hours: 10,
  },
  terraform: {
    nextStep: 'Describe one small cloud environment as code and apply it from scratch.',
    project: 'Terraform module for a VPC + container service, with remote state and a destroy script.',
    milestones: ['Remote state', 'Reusable module', 'Plan reviewed in a pull request'],
    hours: 18,
  },
  kafka: {
    nextStep: 'Learn topics, partitions and consumer groups by building a producer and a consumer.',
    project: 'Event pipeline with at-least-once consumers, idempotent handling and a dead-letter topic.',
    milestones: ['Partition key chosen deliberately', 'Idempotent consumer', 'Dead-letter handling'],
    hours: 22,
  },
  llm: {
    nextStep: 'Add one LLM-backed feature with structured output, validation and a fallback path.',
    project: 'Summariser that returns schema-validated JSON, with retries, cost logging and evals on 20 examples.',
    milestones: ['Schema-validated output', 'Retry and timeout handling', 'A small eval set'],
    hours: 16,
  },
  rag: {
    nextStep: 'Build retrieval over your own documents and measure answer quality before adding complexity.',
    project: 'Q&A over a docs folder with chunking, embeddings, citations and a recall check.',
    milestones: ['Chunking strategy compared', 'Citations returned', 'Recall measured on a test set'],
    hours: 20,
  },
  python: {
    nextStep: 'Build a small typed service with FastAPI or Flask and tests.',
    project: 'A typed REST service with pytest coverage and packaging.',
    milestones: ['Type hints + mypy', 'pytest fixtures', 'Packaged and runnable'],
    hours: 24,
  },
  java: {
    nextStep: 'Learn modern Java (records, streams) and the collections framework through a small service.',
    project: 'CRUD service in Java with unit and integration tests.',
    milestones: ['Collections and streams', 'JUnit tests', 'Build with Maven/Gradle'],
    hours: 40,
  },
  'spring-boot': {
    nextStep: 'Build a REST service with layered architecture, validation and a database.',
    project: 'Spring Boot API with JPA, validation, exception handling and integration tests.',
    milestones: ['Controller–service–repository', 'Validation and error handling', 'Testcontainers integration test'],
    hours: 30,
  },
  mongodb: {
    nextStep: 'Model documents around access patterns and add the indexes they need.',
    project: 'Event log with aggregation pipeline queries and a compound index justified by explain().',
    milestones: ['Schema around queries', 'Aggregation pipeline', 'Index chosen from explain output'],
    hours: 12,
  },
  performance: {
    nextStep: 'Measure first: profile one slow page or endpoint and fix the top bottleneck.',
    project: 'Improve a page’s Core Web Vitals or an endpoint’s p95 latency with before/after evidence.',
    milestones: ['Baseline measured', 'One bottleneck fixed', 'Before/after documented'],
    hours: 14,
  },
  monitoring: {
    nextStep: 'Add structured logs, a metric and an alert to a service you run.',
    project: 'Dashboard with request rate, error rate and latency, plus one actionable alert.',
    milestones: ['Structured logging', 'RED metrics', 'Alert with a runbook'],
    hours: 10,
  },
  'design-patterns': {
    nextStep: 'Refactor a real module using two patterns you can justify.',
    project: 'Refactor a feature to remove duplication with strategy/adapter and explain the trade-offs in a PR.',
    milestones: ['Identify a smell', 'Refactor with tests green', 'Document the trade-off'],
    hours: 14,
  },
  dsa: {
    nextStep: 'Short, regular practice on core patterns; explain your reasoning aloud.',
    project: 'Solve and write up 30 problems across arrays, hashing, trees and graphs with complexity analysis.',
    milestones: ['Two-pointer and sliding window', 'Trees and BFS/DFS', 'Dynamic programming basics'],
    hours: 36,
  },
  git: {
    nextStep: 'Practise rebasing, bisecting and resolving conflicts on a throwaway repo.',
    project: 'Contribute a documented pull request to an open-source project.',
    milestones: ['Interactive rebase', 'git bisect a bug', 'Clean PR with a clear description'],
    hours: 6,
  },
  nestjs: {
    nextStep: 'Build a modular API with dependency injection, DTO validation and guards.',
    project: 'NestJS service with auth guard, validation pipes and e2e tests.',
    milestones: ['Modules and providers', 'DTO validation', 'Guards and interceptors'],
    hours: 18,
  },
  express: {
    nextStep: 'Build a production-shaped Express API: middleware, validation and error handling.',
    project: 'Express API with centralised error handling, request validation and structured logging.',
    milestones: ['Middleware chain', 'Request validation', 'Central error handler'],
    hours: 10,
  },
  'web-accessibility': {
    nextStep: 'Audit one of your pages with a screen reader and keyboard only.',
    project: 'Fix the top five accessibility issues in an app and document before/after.',
    milestones: ['Keyboard navigation', 'Landmarks and labels', 'Colour contrast fixed'],
    hours: 10,
  },
  'secure-coding': {
    nextStep: 'Work through the OWASP Top 10 against an app you wrote.',
    project: 'Threat-model a small app and fix input validation, auth and dependency issues you find.',
    milestones: ['Input validation', 'Dependency audit', 'Secrets out of the repo'],
    hours: 14,
  },
  vue: {
    nextStep: 'Port a small React feature to Vue to see which of your skills transfer.',
    project: 'Small Vue 3 app with Pinia and a router.',
    milestones: ['Composition API', 'State with Pinia', 'Routing'],
    hours: 18,
  },
  angular: {
    nextStep: 'Port a small feature to Angular to see which skills transfer.',
    project: 'Angular app with services, routing and reactive forms.',
    milestones: ['Components and services', 'RxJS basics', 'Reactive forms'],
    hours: 24,
  },
};

const FALLBACK: Record<SkillCategoryId, Omit<LearningGuide, 'hours'> & { hours: number }> = {
  language: { nextStep: 'Learn the idioms by porting a small project you already know.', project: 'Re-implement a small tool you have built before in this language, with tests.', milestones: ['Syntax and tooling', 'Idiomatic error handling', 'Tests and packaging'], hours: 30 },
  frontend: { nextStep: 'Rebuild one screen from a project you know using this tool.', project: 'Small app using the tool end to end, deployed.', milestones: ['Core concepts', 'State and data', 'Deployed demo'], hours: 16 },
  backend: { nextStep: 'Build a small API with this framework, including validation and tests.', project: 'CRUD API with auth, validation and integration tests.', milestones: ['Routing and handlers', 'Validation and errors', 'Integration tests'], hours: 20 },
  database: { nextStep: 'Model a small domain and write the queries it needs.', project: 'Schema + queries for a small app with an index justified by measurement.', milestones: ['Data modelling', 'Querying', 'Indexing'], hours: 14 },
  api: { nextStep: 'Implement a small producer/consumer or client/server pair.', project: 'Two services communicating through this technology.', milestones: ['Core concepts', 'Error handling', 'Tests'], hours: 16 },
  cloud: { nextStep: 'Deploy one small service and learn the identity and billing model first.', project: 'Deploy a service with a database and a cost alarm.', milestones: ['Identity and access', 'Deploy', 'Cost guardrail'], hours: 24 },
  devops: { nextStep: 'Apply it to a repository you own.', project: 'Automate build and deploy for one project.', milestones: ['Basics', 'Automated pipeline', 'Documented rollback'], hours: 14 },
  testing: { nextStep: 'Add tests with this tool to a real module.', project: 'Suite for a critical user flow running in CI.', milestones: ['First test', 'Stable in CI', 'Failure diagnosed'], hours: 10 },
  security: { nextStep: 'Implement it in a small app and write down the threats it addresses.', project: 'Add this mechanism to an app with tests for the failure paths.', milestones: ['Concept explained', 'Implemented', 'Failure paths tested'], hours: 12 },
  architecture: { nextStep: 'Apply it to a real design decision and write the trade-offs.', project: 'Design document reviewed by a peer.', milestones: ['Concept', 'Applied to a design', 'Peer review'], hours: 20 },
  data_ai: { nextStep: 'Build a small, measured prototype before going deeper.', project: 'Prototype with a measurable quality check.', milestones: ['Prototype', 'Evaluation', 'Write-up'], hours: 20 },
  observability: { nextStep: 'Instrument a service you run.', project: 'Dashboard and an actionable alert.', milestones: ['Instrument', 'Dashboard', 'Alert'], hours: 10 },
  tooling: { nextStep: 'Use it in your daily workflow for two weeks.', project: 'Document your workflow with it.', milestones: ['Setup', 'Daily use', 'Shortcuts mastered'], hours: 4 },
  practices: { nextStep: 'Practise it deliberately in your current team and collect examples.', project: 'Write up two concrete examples you can use in interviews.', milestones: ['Practise', 'Collect evidence', 'Write it up'], hours: 8 },
};

export function guideFor(skillId: string): LearningGuide {
  const curated = G[skillId];
  if (curated) return curated;
  const cat = getSkill(skillId)?.category ?? 'tooling';
  return FALLBACK[cat];
}

export function hasCuratedGuide(skillId: string): boolean {
  return skillId in G;
}
