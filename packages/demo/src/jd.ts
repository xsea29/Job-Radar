import { getSkill, type CompanyCategory, type RoleId, type SkillCategoryId, type SkillDef } from '@jobradar/core';
import { chance, int, pick, shuffle, type Rng } from './rng';

/**
 * Synthetic job-description composer (DEMO ONLY).
 *
 * Builds plausible JD text from sentence frames so the real extractor has
 * something to chew on. Nothing here is scraped or copied from a real posting.
 */

export type Slot = 'required' | 'preferred' | 'mention';
export interface JdSkill {
  skillId: string;
  slot: Slot;
}

export interface JdSpec {
  company: string;
  companyCategory: CompanyCategory;
  industry: string;
  hq: string;
  employees: number;
  countries?: number;
  title: string;
  roleId: RoleId;
  expMin: number;
  expMax: number;
  skills: JdSkill[];
  /** Groups rendered as an "X, Y or Z" alternatives bullet. */
  alternatives: { group: string; ids: string[] }[];
}

// -- surface forms ------------------------------------------------------------

const BLACKLIST = new Set(['JS', 'ES6', 'Mongo', 'Mongo DB', 'RTK', 'Next js', 'Node js', 'Postgre SQL', 'Vue 3', 'T-SQL', 'OOD', 'JWTs', 'Lambda', 'SQS', 'OIDC', 'ELK stack', 'a11y', 'Pulumi', 'CloudFormation', 'Dockerfile', 'sprints', 'RFCs', 'Confluence']);

const FORM_OVERRIDE: Record<string, string[]> = {
  'event-driven': ['event-driven architecture', 'event driven systems'],
  'authn-authz': ['authentication and authorization', 'authentication', 'role-based access control'],
  'secure-coding': ['secure coding practices', 'OWASP best practices', 'application security'],
  dsa: ['data structures and algorithms', 'data structures'],
  monitoring: ['monitoring and alerting', 'observability', 'logging and monitoring'],
  'design-patterns': ['design patterns', 'object-oriented design', 'clean architecture'],
  'system-design': ['system design', 'scalable systems', 'software architecture'],
  performance: ['performance optimization', 'web performance', 'performance tuning'],
  llm: ['LLMs', 'generative AI', 'prompt engineering', 'large language models'],
  rag: ['RAG pipelines', 'vector databases', 'embeddings'],
  'message-queues': ['message queues', 'message brokers'],
  'web-accessibility': ['web accessibility (WCAG)', 'accessibility'],
  'responsive-design': ['responsive design', 'responsive layouts'],
  'html-css': ['HTML5 and CSS3', 'HTML and CSS', 'CSS'],
  rest: ['RESTful APIs', 'REST APIs', 'REST API design'],
  cicd: ['CI/CD', 'CI/CD pipelines', 'continuous integration and delivery'],
  git: ['Git', 'version control (Git)'],
  jest: ['Jest'],
  'build-tooling': ['Webpack', 'Vite'],
  orm: ['ORMs', 'Prisma', 'Hibernate'],
  iac: ['Infrastructure as Code', 'IaC'],
  'unit-testing': ['unit testing', 'automated testing', 'unit tests'],
  junit: ['JUnit', 'pytest'],
  serverless: ['serverless architectures', 'Cloud Functions'],
  datadog: ['Datadog'],
  prometheus: ['Prometheus', 'Grafana'],
  'data-pipelines': ['data pipelines', 'ETL'],
  ml: ['machine learning'],
  tdd: ['test-driven development', 'TDD'],
  microservices: ['microservices', 'microservice architecture'],
  'distributed-systems': ['distributed systems', 'high-availability systems'],
  'integration-testing': ['integration testing', 'integration tests'],
  'e2e-testing': ['end-to-end testing', 'E2E tests'],
  'testing-library': ['React Testing Library'],
  documentation: ['technical documentation'],
  kubernetes: ['Kubernetes', 'Kubernetes', 'K8s'],
  postgresql: ['PostgreSQL', 'PostgreSQL', 'Postgres'],
  react: ['React', 'React', 'ReactJS', 'React.js'],
  nodejs: ['Node.js', 'Node.js', 'NodeJS', 'Node'],
  nextjs: ['Next.js', 'Next.js', 'NextJS'],
  linux: ['Linux'],
  websockets: ['WebSockets', 'real-time communication'],
  graphql: ['GraphQL'],
  oauth: ['OAuth 2.0', 'OAuth2', 'OpenID Connect'],
  jwt: ['JWT', 'JSON Web Tokens'],
  openapi: ['OpenAPI', 'Swagger'],
  grpc: ['gRPC'],
  figma: ['Figma'],
  postman: ['Postman'],
};

function formsFor(def: SkillDef): string[] {
  if (FORM_OVERRIDE[def.id]) return FORM_OVERRIDE[def.id]!;
  const all = [...def.aliases, ...(def.caseSensitiveAliases ?? [])].filter((a) => !BLACKLIST.has(a) && a.length > 2);
  if (all.length) return all;
  return [def.name];
}

export function surfaceForm(def: SkillDef, r: Rng): string {
  const forms = formsFor(def);
  return chance(r, 0.65) ? forms[0]! : pick(r, forms);
}

// -- sentence frames ----------------------------------------------------------

const CONCEPT_CATEGORIES = new Set<SkillCategoryId>(['architecture', 'security', 'testing', 'observability', 'data_ai']);
const CONCEPT_IDS = new Set(['dsa', 'rest', 'cicd', 'iac', 'git', 'html-css', 'responsive-design', 'web-accessibility', 'sql', 'performance', 'monitoring']);
const NOT_CONCEPT = new Set(['jest', 'cypress', 'playwright', 'junit', 'selenium', 'vitest', 'mocha', 'datadog', 'prometheus', 'opentelemetry', 'testing-library', 'llm']);

function isConcept(def: SkillDef): boolean {
  if (NOT_CONCEPT.has(def.id)) return false;
  return CONCEPT_IDS.has(def.id) || CONCEPT_CATEGORIES.has(def.category);
}

const REQ_TECH = [
  'Strong proficiency in {X}',
  '{N}+ years of hands-on experience with {X}',
  'Solid experience building production systems with {X}',
  'Proven experience with {X}',
  'Experience with {X}',
  'Expertise in {X}',
  'Hands-on experience with {X}',
  'Working knowledge of {X}',
];
const REQ_CONCEPT = ['Solid understanding of {X}', 'Experience applying {X}', 'Strong grasp of {X}', 'Hands-on experience with {X}', 'Working knowledge of {X}'];
const PREF_FRAMES = ['Experience with {X} is a plus', 'Familiarity with {X}', 'Exposure to {X}', '{X} experience preferred', 'Knowledge of {X} would be an advantage', 'Experience with {X}', '{X}', 'Bonus: {X}'];
const MENTION_TECH = ['Build and ship features using {X}', 'Maintain and extend services built with {X}', 'Work across our {X} stack to deliver customer-facing features', 'Debug and improve production systems running on {X}'];
const MENTION_CONCEPT = ['Contribute to {X} discussions across the team', 'Apply {X} when shaping new work'];

/** Complete-sentence frames for soft practices. */
const PRACTICES: Record<string, { req: string[]; pref: string[]; mention: string[] }> = {
  agile: { req: ['Experience working in Agile teams', 'Comfortable with Scrum ceremonies and iterative delivery'], pref: ['Experience in Agile environments'], mention: ['Work in two-week sprints with a small, autonomous team'] },
  'code-review': { req: ['A thoughtful approach to giving and receiving code reviews'], pref: ['Experience leading code reviews'], mention: ['Participate in code reviews and share what you learn'] },
  mentoring: { req: ['Experience mentoring junior engineers'], pref: ['Interest in mentoring junior engineers'], mention: ['Mentor junior engineers through pairing and feedback'] },
  collaboration: { req: ['Comfortable working with product managers, designers and other stakeholders'], pref: ['Experience in cross-functional teams'], mention: ['Collaborate with product managers and designers to scope features'] },
  'tech-leadership': { req: ['Track record of technical leadership on a product area'], pref: ['Experience as a tech lead'], mention: ['Drive technical decisions for the areas you own'] },
  communication: { req: ['Excellent communication skills, written and verbal', 'Strong communication skills'], pref: ['Strong written communication'], mention: ['Communicate clearly with distributed teammates'] },
  documentation: { req: ['A habit of writing clear technical documentation'], pref: ['Experience writing design documents'], mention: ['Write clear technical documentation for the systems you own'] },
};

function sentenceFor(def: SkillDef, slot: Slot, r: Rng): string {
  const practice = PRACTICES[def.id];
  if (practice) {
    const list = slot === 'required' ? practice.req : slot === 'preferred' ? practice.pref : practice.mention;
    return pick(r, list);
  }
  const x = surfaceForm(def, r);
  const concept = isConcept(def);
  const frames = slot === 'required' ? (concept ? REQ_CONCEPT : REQ_TECH) : slot === 'preferred' ? PREF_FRAMES : concept ? MENTION_CONCEPT : MENTION_TECH;
  return pick(r, frames).replace('{X}', x).replace('{N}', String(int(r, 2, 5)));
}

// -- sections -------------------------------------------------------------------

const H_RESP = ["What you'll do", 'Responsibilities', 'Your role', 'In this role, you will:'];
const H_REQ = ["What you'll bring", 'Requirements', 'Qualifications', 'Must-haves', 'Who you are'];
const H_PREF = ['Nice to have', 'Bonus points', 'Good to have', 'Preferred qualifications'];
const H_ABOUT = ['About us', 'Who we are', 'About the company'];
const H_BEN = ['Benefits', 'Perks and benefits', 'What we offer'];

const MISSIONS: Record<string, string[]> = {
  Fintech: ['payments and lending infrastructure', 'tools that make money simple for small businesses'],
  Banking: ['digital banking platforms', 'customer-facing banking applications'],
  'E-commerce': ['online shopping experiences', 'commerce tooling for merchants'],
  Healthtech: ['software that helps clinicians spend more time with patients', 'digital care journeys'],
  Logistics: ['software that keeps goods moving', 'route and fleet optimisation tools'],
  Edtech: ['learning products for students', 'tools for teachers and schools'],
  SaaS: ['workflow software for growing teams', 'a collaboration platform for operations teams'],
  'AI / Data': ['AI-powered analytics products', 'data tooling for product teams'],
  'Developer tools': ['tools that make engineers faster', 'infrastructure for building and shipping software'],
  Mobility: ['mobility and ride-sharing platforms', 'urban transport software'],
  Media: ['streaming and publishing products', 'audience platforms'],
  Insurance: ['modern insurance journeys', 'policy and claims platforms'],
  Telecom: ['connectivity and network software', 'customer platforms for subscribers'],
  Energy: ['software for a cleaner energy grid', 'energy monitoring products'],
  Travel: ['travel booking and hospitality tech', 'trip planning products'],
  Gaming: ['multiplayer game services', 'casual games for mobile'],
  Agritech: ['software for farmers and agri-supply chains'],
  Retail: ['omnichannel retail platforms', 'store and e-commerce systems'],
  Automotive: ['in-vehicle and connected-car software'],
  Aerospace: ['mission planning and operations software'],
  'Enterprise IT': ['enterprise software and digital transformation for global clients', 'platform engineering for large enterprises'],
};

const RESP_COMMON = [
  'Design, build and maintain customer-facing features end to end',
  'Turn product requirements into well-scoped, shippable increments',
  'Own the quality of what you ship, from first commit to production',
  'Investigate and resolve production issues with the team',
  'Improve the reliability and developer experience of our codebase',
];
const RESP_ROLE: Record<RoleId, string[]> = {
  fullstack: ['Build user interfaces and the services behind them', 'Design APIs and data models that the front end can rely on', 'Break down ambiguous problems and ship them across the stack'],
  frontend: ['Build fast, accessible user interfaces that delight customers', 'Turn designs into reusable components', 'Improve how the front end is built, tested and delivered'],
  backend: ['Design, build and scale backend services', 'Model data and design reliable APIs', 'Make our services resilient under growing load'],
  software: ['Work on whichever part of the product matters most this quarter', 'Pick up problems across services and applications', 'Contribute to the architecture of what we are building'],
};

const BENEFITS = [
  'Competitive salary and equity',
  'Health insurance for you and your family',
  'Flexible working hours',
  'A yearly learning budget',
  'Generous leave policy',
  'Home-office setup allowance',
];

function stageDescriptor(spec: JdSpec): string {
  switch (spec.companyCategory) {
    case 'startup':
      return `a fast-growing ${spec.industry.toLowerCase()} startup`;
    case 'mid':
      return `a growing ${spec.industry.toLowerCase()} company of about ${Math.round(spec.employees / 50) * 50} people`;
    default:
      return `a global ${spec.industry.toLowerCase()} business with teams in ${spec.countries ?? 10}+ countries`;
  }
}

export function composeDescription(spec: JdSpec, r: Rng): string {
  const lines: string[] = [];
  const stackMentions = spec.skills.filter((s) => s.slot === 'mention' && (getSkill(s.skillId)?.category !== 'practices'));
  const practiceMentions = spec.skills.filter((s) => s.slot === 'mention' && getSkill(s.skillId)?.category === 'practices');

  // About
  lines.push(pick(r, H_ABOUT));
  const mission = pick(r, MISSIONS[spec.industry] ?? MISSIONS['SaaS']!);
  lines.push(`${spec.company} is ${stageDescriptor(spec)} building ${mission}. We are based in ${spec.hq} and ship to customers every week.`);
  const aboutStack = stackMentions.filter(() => chance(r, 0.5)).slice(0, 3);
  if (aboutStack.length) {
    const names = aboutStack.map((s) => surfaceForm(getSkill(s.skillId)!, r));
    lines.push(`Our stack includes ${names.join(', ')}.`);
  }
  lines.push('');

  // Responsibilities
  lines.push(pick(r, H_RESP));
  const resp = [...shuffle(r, RESP_COMMON).slice(0, 2), ...shuffle(r, RESP_ROLE[spec.roleId]).slice(0, 2)];
  const respMentions = stackMentions.filter((s) => !aboutStack.includes(s)).slice(0, 2);
  for (const m of respMentions) resp.push(sentenceFor(getSkill(m.skillId)!, 'mention', r));
  for (const m of practiceMentions.slice(0, 2)) resp.push(sentenceFor(getSkill(m.skillId)!, 'mention', r));
  for (const b of shuffle(r, resp)) lines.push(`- ${b}`);
  lines.push('');

  // Requirements
  lines.push(pick(r, H_REQ));
  lines.push(
    chance(r, 0.5)
      ? `- ${spec.expMin}+ years of professional software engineering experience`
      : `- ${spec.expMin}-${spec.expMax} years of experience building and shipping web applications`,
  );
  const altIds = new Set(spec.alternatives.flatMap((a) => a.ids));
  const required = spec.skills.filter((s) => s.slot === 'required' && !altIds.has(s.skillId));
  for (const alt of spec.alternatives) {
    const names = alt.ids.map((id) => surfaceForm(getSkill(id)!, r));
    const joined = names.length > 2 ? `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}` : names.join(' or ');
    lines.push(`- ${pick(r, ['Experience with', 'Hands-on experience with', 'Proficiency in'])} ${joined}`);
  }
  for (const s of shuffle(r, required)) lines.push(`- ${sentenceFor(getSkill(s.skillId)!, 'required', r)}`);
  lines.push('');

  // Preferred
  const preferred = spec.skills.filter((s) => s.slot === 'preferred');
  if (preferred.length) {
    lines.push(pick(r, H_PREF));
    for (const s of shuffle(r, preferred)) lines.push(`- ${sentenceFor(getSkill(s.skillId)!, 'preferred', r)}`);
    lines.push('');
  }

  // Benefits
  lines.push(pick(r, H_BEN));
  for (const b of shuffle(r, BENEFITS).slice(0, 4)) lines.push(`- ${b}`);
  return lines.join('\n');
}
