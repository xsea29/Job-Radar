import type { SkillCategoryId, SkillDef } from './types';

/** Bump whenever aliases/ids change; stored with every extraction. */
export const TAXONOMY_VERSION = '2026.1';

export const SKILL_CATEGORIES: { id: SkillCategoryId; label: string }[] = [
  { id: 'language', label: 'Programming languages' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend frameworks & runtimes' },
  { id: 'database', label: 'Databases & data stores' },
  { id: 'api', label: 'APIs & integration' },
  { id: 'cloud', label: 'Cloud platforms' },
  { id: 'devops', label: 'DevOps & containers' },
  { id: 'testing', label: 'Testing & quality' },
  { id: 'security', label: 'Security & auth' },
  { id: 'architecture', label: 'Architecture & design' },
  { id: 'data_ai', label: 'Data & AI/ML' },
  { id: 'observability', label: 'Observability & performance' },
  { id: 'tooling', label: 'Developer tools' },
  { id: 'practices', label: 'Engineering practices' },
];

/**
 * Curated taxonomy. Distinct technologies are never merged:
 * React ≠ React Native, PostgreSQL ≠ SQL ≠ NoSQL, Java ≠ JavaScript.
 */
export const SKILLS: SkillDef[] = [
  // ---- Languages -----------------------------------------------------------
  { id: 'javascript', name: 'JavaScript', category: 'language', aliases: ['JavaScript', 'ECMAScript', 'ES6'], caseSensitiveAliases: ['JS'], impliedBy: ['typescript', 'react', 'nodejs', 'nextjs'] },
  { id: 'typescript', name: 'TypeScript', category: 'language', aliases: ['TypeScript'] },
  { id: 'python', name: 'Python', category: 'language', aliases: ['Python'], impliedBy: ['django', 'fastapi', 'flask'], group: 'backend-lang' },
  { id: 'java', name: 'Java', category: 'language', aliases: [], caseSensitiveAliases: ['Java'], impliedBy: ['spring-boot'], group: 'backend-lang' },
  { id: 'kotlin', name: 'Kotlin', category: 'language', aliases: ['Kotlin'], group: 'backend-lang' },
  {
    id: 'go',
    name: 'Go',
    category: 'language',
    aliases: ['Golang'],
    patterns: [/\b(?:in|with|using|of|and|or|,)\s+(Go)\b(?!\s+(?:to|beyond|above|live|ahead|further|through))/],
    group: 'backend-lang',
  },
  { id: 'csharp', name: 'C#', category: 'language', aliases: ['C#', 'C Sharp'], impliedBy: ['dotnet'], group: 'backend-lang' },
  { id: 'cpp', name: 'C++', category: 'language', aliases: ['C++'] },
  { id: 'rust', name: 'Rust', category: 'language', aliases: [], caseSensitiveAliases: ['Rust'] },
  { id: 'php', name: 'PHP', category: 'language', aliases: [], caseSensitiveAliases: ['PHP'], group: 'backend-lang' },
  { id: 'ruby', name: 'Ruby', category: 'language', aliases: [], caseSensitiveAliases: ['Ruby'], group: 'backend-lang' },
  { id: 'scala', name: 'Scala', category: 'language', aliases: [], caseSensitiveAliases: ['Scala'], group: 'backend-lang' },
  { id: 'swift', name: 'Swift', category: 'language', aliases: [], caseSensitiveAliases: ['Swift'] },
  { id: 'bash', name: 'Bash / shell scripting', category: 'language', aliases: ['Bash', 'shell scripting', 'shell scripts'] },

  // ---- Frontend ------------------------------------------------------------
  {
    id: 'react',
    name: 'React',
    category: 'frontend',
    aliases: ['React.js'],
    caseSensitiveAliases: ['React', 'ReactJS', 'React JS'],
    group: 'frontend-framework',
    negativeLookahead: /^\s+(?:to|quickly|fast|swiftly|positively|appropriately|calmly)\b/,
    buildsOn: ['javascript'],
    impliedBy: ['nextjs', 'react-native'],
  },
  { id: 'nextjs', name: 'Next.js', category: 'frontend', aliases: ['Next.js', 'NextJS', 'Next js'], buildsOn: ['react'] },
  { id: 'react-native', name: 'React Native', category: 'frontend', aliases: ['React Native'], buildsOn: ['react'] },
  { id: 'vue', name: 'Vue.js', category: 'frontend', aliases: ['Vue.js', 'VueJS', 'Vue 3'], caseSensitiveAliases: ['Vue'], group: 'frontend-framework' },
  { id: 'angular', name: 'Angular', category: 'frontend', aliases: [], caseSensitiveAliases: ['Angular'], group: 'frontend-framework' },
  { id: 'svelte', name: 'Svelte', category: 'frontend', aliases: ['Svelte', 'SvelteKit'], group: 'frontend-framework' },
  { id: 'redux', name: 'Redux', category: 'frontend', aliases: ['Redux', 'Redux Toolkit'], caseSensitiveAliases: ['RTK'], buildsOn: ['react'] },
  { id: 'html-css', name: 'HTML & CSS', category: 'frontend', aliases: ['HTML5', 'HTML', 'CSS3', 'SCSS', 'Sass'], caseSensitiveAliases: ['CSS'], foundational: true, impliedBy: ['tailwind'] },
  { id: 'tailwind', name: 'Tailwind CSS', category: 'frontend', aliases: ['Tailwind CSS', 'TailwindCSS', 'Tailwind'], buildsOn: ['html-css'] },
  { id: 'flutter', name: 'Flutter', category: 'frontend', aliases: ['Flutter'] },
  { id: 'web-accessibility', name: 'Web accessibility', category: 'frontend', aliases: ['accessibility', 'WCAG', 'a11y'], caseSensitiveAliases: ['ARIA'] },
  { id: 'build-tooling', name: 'Frontend build tooling', category: 'frontend', aliases: ['Webpack', 'Vite', 'Rollup', 'esbuild'] },
  { id: 'responsive-design', name: 'Responsive design', category: 'frontend', aliases: ['responsive design', 'responsive layouts', 'responsive web', 'mobile-first'] },

  // ---- Backend -------------------------------------------------------------
  { id: 'nodejs', name: 'Node.js', category: 'backend', aliases: ['Node.js', 'NodeJS', 'Node js'], caseSensitiveAliases: ['Node'], buildsOn: ['javascript'], impliedBy: ['express', 'nestjs'], group: 'backend-lang' },
  {
    id: 'express',
    name: 'Express',
    category: 'backend',
    aliases: ['Express.js', 'ExpressJS'],
    patterns: [/\bNode(?:\.js)?\s*\/\s*(Express)\b/, /\b(Express)(?=\s*(?:framework|,\s*Fastify|\)))/],
    buildsOn: ['nodejs'],
  },
  { id: 'nestjs', name: 'NestJS', category: 'backend', aliases: ['NestJS', 'Nest.js'], buildsOn: ['nodejs', 'typescript'] },
  { id: 'spring-boot', name: 'Spring Boot', category: 'backend', aliases: ['Spring Boot', 'Spring Framework', 'Spring MVC'], buildsOn: ['java'] },
  { id: 'django', name: 'Django', category: 'backend', aliases: ['Django'], group: 'python-web', buildsOn: ['python'] },
  { id: 'fastapi', name: 'FastAPI', category: 'backend', aliases: ['FastAPI'], group: 'python-web', buildsOn: ['python'] },
  { id: 'flask', name: 'Flask', category: 'backend', aliases: [], caseSensitiveAliases: ['Flask'], group: 'python-web', buildsOn: ['python'] },
  { id: 'dotnet', name: '.NET', category: 'backend', aliases: ['.NET', 'ASP.NET', 'dotnet'], buildsOn: ['csharp'] },
  { id: 'rails', name: 'Ruby on Rails', category: 'backend', aliases: ['Ruby on Rails'], caseSensitiveAliases: ['Rails'], buildsOn: ['ruby'] },
  { id: 'laravel', name: 'Laravel', category: 'backend', aliases: ['Laravel'], buildsOn: ['php'] },
  { id: 'orm', name: 'ORMs & data access', category: 'backend', aliases: ['Prisma', 'TypeORM', 'Sequelize', 'Hibernate', 'SQLAlchemy', 'Drizzle'], caseSensitiveAliases: ['ORM', 'ORMs'] },

  // ---- Databases -----------------------------------------------------------
  { id: 'sql', name: 'SQL', category: 'database', aliases: [], caseSensitiveAliases: ['SQL', 'T-SQL'], foundational: true, group: 'sql-db', impliedBy: ['postgresql', 'mysql'] },
  { id: 'postgresql', name: 'PostgreSQL', category: 'database', aliases: ['PostgreSQL', 'Postgres', 'Postgre SQL'], group: 'sql-db', buildsOn: ['sql'] },
  { id: 'mysql', name: 'MySQL', category: 'database', aliases: ['MySQL'], group: 'sql-db', buildsOn: ['sql'] },
  { id: 'mongodb', name: 'MongoDB', category: 'database', aliases: ['MongoDB', 'Mongo DB'], caseSensitiveAliases: ['Mongo'], group: 'nosql-db' },
  { id: 'dynamodb', name: 'DynamoDB', category: 'database', aliases: ['DynamoDB'], group: 'nosql-db' },
  { id: 'nosql', name: 'NoSQL (general)', category: 'database', aliases: ['NoSQL'], group: 'nosql-db', impliedBy: ['mongodb', 'dynamodb'] },
  { id: 'redis', name: 'Redis', category: 'database', aliases: ['Redis'] },
  { id: 'elasticsearch', name: 'Elasticsearch', category: 'database', aliases: ['Elasticsearch', 'Elastic Search', 'ELK stack'] },

  // ---- APIs & integration ----------------------------------------------------
  {
    id: 'rest',
    name: 'REST API design',
    category: 'api',
    aliases: ['RESTful', 'REST API', 'REST APIs', 'REST-based'],
    caseSensitiveAliases: ['REST'],
    foundational: true,
  },
  { id: 'graphql', name: 'GraphQL', category: 'api', aliases: ['GraphQL', 'Apollo Server', 'Apollo Client'] },
  { id: 'grpc', name: 'gRPC', category: 'api', aliases: ['gRPC', 'Protocol Buffers', 'protobuf'] },
  { id: 'websockets', name: 'WebSockets', category: 'api', aliases: ['WebSocket', 'WebSockets', 'Socket.IO', 'real-time communication'] },
  { id: 'openapi', name: 'OpenAPI / Swagger', category: 'api', aliases: ['OpenAPI', 'Swagger'] },
  { id: 'kafka', name: 'Kafka', category: 'api', aliases: ['Kafka', 'Apache Kafka'], group: 'message-queue' },
  { id: 'rabbitmq', name: 'RabbitMQ', category: 'api', aliases: ['RabbitMQ'], group: 'message-queue' },
  { id: 'message-queues', name: 'Message queues (general)', category: 'api', aliases: ['message queues', 'message queue', 'message brokers', 'SQS'], group: 'message-queue', impliedBy: ['kafka', 'rabbitmq'] },

  // ---- Cloud ---------------------------------------------------------------
  { id: 'aws', name: 'AWS', category: 'cloud', aliases: ['Amazon Web Services'], caseSensitiveAliases: ['AWS'], group: 'cloud-provider' },
  { id: 'gcp', name: 'Google Cloud', category: 'cloud', aliases: ['Google Cloud Platform', 'Google Cloud'], caseSensitiveAliases: ['GCP'], group: 'cloud-provider' },
  { id: 'azure', name: 'Azure', category: 'cloud', aliases: ['Microsoft Azure', 'Azure'], group: 'cloud-provider' },
  { id: 'serverless', name: 'Serverless', category: 'cloud', aliases: ['Serverless', 'Cloud Functions'], caseSensitiveAliases: ['Lambda'] },

  // ---- DevOps ----------------------------------------------------------------
  { id: 'docker', name: 'Docker', category: 'devops', aliases: ['Docker', 'Dockerfile', 'containerization', 'containerisation'], impliedBy: ['kubernetes'] },
  { id: 'kubernetes', name: 'Kubernetes', category: 'devops', aliases: ['Kubernetes', 'K8s'], buildsOn: ['docker'] },
  { id: 'cicd', name: 'CI/CD', category: 'devops', aliases: ['CI/CD', 'CI-CD', 'CICD', 'continuous integration', 'continuous delivery', 'continuous deployment', 'CI pipelines', 'build pipelines'], group: 'cicd-tool', impliedBy: ['github-actions', 'jenkins'] },
  { id: 'github-actions', name: 'GitHub Actions', category: 'devops', aliases: ['GitHub Actions'], group: 'cicd-tool', buildsOn: ['cicd'] },
  { id: 'jenkins', name: 'Jenkins', category: 'devops', aliases: ['Jenkins'], group: 'cicd-tool', buildsOn: ['cicd'] },
  { id: 'terraform', name: 'Terraform', category: 'devops', aliases: ['Terraform'], group: 'iac' },
  { id: 'iac', name: 'Infrastructure as Code', category: 'devops', aliases: ['Infrastructure as Code', 'infrastructure-as-code', 'Pulumi', 'CloudFormation'], caseSensitiveAliases: ['IaC'], group: 'iac', impliedBy: ['terraform'] },
  { id: 'linux', name: 'Linux', category: 'devops', aliases: ['Linux', 'Unix'] },

  // ---- Testing ---------------------------------------------------------------
  { id: 'unit-testing', name: 'Unit & automated testing', category: 'testing', aliases: ['unit testing', 'unit tests', 'unit-tests', 'automated testing', 'automated tests', 'test automation'], foundational: true, impliedBy: ['jest', 'vitest', 'mocha', 'junit', 'testing-library'] },
  { id: 'integration-testing', name: 'Integration testing', category: 'testing', aliases: ['integration testing', 'integration tests', 'contract testing'] },
  { id: 'e2e-testing', name: 'End-to-end testing', category: 'testing', aliases: ['E2E testing', 'E2E tests', 'end-to-end testing', 'end to end testing', 'end-to-end tests'], group: 'e2e', impliedBy: ['cypress', 'playwright', 'selenium'] },
  { id: 'tdd', name: 'Test-driven development', category: 'testing', aliases: ['test-driven development', 'test driven development'], caseSensitiveAliases: ['TDD'], foundational: true },
  { id: 'jest', name: 'Jest', category: 'testing', aliases: [], caseSensitiveAliases: ['Jest'], group: 'js-unit-test' },
  { id: 'vitest', name: 'Vitest', category: 'testing', aliases: ['Vitest'], group: 'js-unit-test' },
  { id: 'mocha', name: 'Mocha', category: 'testing', aliases: ['Mocha'], group: 'js-unit-test' },
  { id: 'cypress', name: 'Cypress', category: 'testing', aliases: ['Cypress'], group: 'e2e' },
  { id: 'selenium', name: 'Selenium', category: 'testing', aliases: ['Selenium'], group: 'e2e' },
  { id: 'playwright', name: 'Playwright', category: 'testing', aliases: ['Playwright'], group: 'e2e' },
  { id: 'junit', name: 'JUnit / pytest', category: 'testing', aliases: ['JUnit', 'pytest', 'xUnit'], group: 'unit-test-backend' },
  { id: 'testing-library', name: 'React Testing Library', category: 'testing', aliases: ['React Testing Library', 'Testing Library'], buildsOn: ['react'] },

  // ---- Security ----------------------------------------------------------------
  { id: 'oauth', name: 'OAuth 2.0 / OIDC', category: 'security', aliases: ['OAuth 2.0', 'OAuth2', 'OAuth', 'OpenID Connect'], caseSensitiveAliases: ['OIDC'] },
  { id: 'jwt', name: 'JWT', category: 'security', aliases: ['JSON Web Token', 'JSON Web Tokens'], caseSensitiveAliases: ['JWT', 'JWTs'] },
  { id: 'authn-authz', name: 'Authentication & authorization', category: 'security', aliases: ['authentication', 'authorization', 'authorisation', 'RBAC', 'role-based access control', 'access control'], impliedBy: ['oauth', 'jwt'] },
  { id: 'secure-coding', name: 'Secure coding', category: 'security', aliases: ['OWASP', 'secure coding', 'application security', 'security best practices', 'secure software'] },

  // ---- Architecture --------------------------------------------------------------
  { id: 'system-design', name: 'System design', category: 'architecture', aliases: ['system design', 'systems design', 'software architecture', 'architecture design', 'scalable systems', 'scalable architecture'], foundational: true, impliedBy: ['microservices', 'distributed-systems'] },
  { id: 'microservices', name: 'Microservices', category: 'architecture', aliases: ['microservices', 'microservice', 'service-oriented architecture'], buildsOn: ['system-design'] },
  { id: 'design-patterns', name: 'Design patterns & OOP', category: 'architecture', aliases: ['design patterns', 'object-oriented design', 'object oriented programming', 'object-oriented programming', 'clean architecture', 'clean code'], caseSensitiveAliases: ['SOLID', 'OOP', 'OOD'], foundational: true },
  { id: 'dsa', name: 'Data structures & algorithms', category: 'architecture', aliases: ['data structures', 'algorithms', 'problem solving'], caseSensitiveAliases: ['DSA'], foundational: true },
  { id: 'distributed-systems', name: 'Distributed systems', category: 'architecture', aliases: ['distributed systems', 'distributed architecture', 'high availability', 'eventual consistency'], buildsOn: ['system-design'] },
  { id: 'event-driven', name: 'Event-driven architecture', category: 'architecture', aliases: ['event-driven', 'event driven', 'event sourcing', 'CQRS'] },
  { id: 'ddd', name: 'Domain-driven design', category: 'architecture', aliases: ['domain-driven design', 'domain driven design'], caseSensitiveAliases: ['DDD'] },

  // ---- Data & AI -------------------------------------------------------------------
  { id: 'llm', name: 'LLM / GenAI integration', category: 'data_ai', aliases: ['LLM', 'LLMs', 'large language model', 'large language models', 'generative AI', 'GenAI', 'OpenAI API', 'prompt engineering', 'AI agents', 'Anthropic API'] },
  { id: 'rag', name: 'RAG & vector search', category: 'data_ai', aliases: ['RAG', 'retrieval-augmented generation', 'vector database', 'vector databases', 'vector search', 'embeddings', 'pgvector'], buildsOn: ['llm'] },
  { id: 'ml', name: 'Machine learning', category: 'data_ai', aliases: ['machine learning', 'ML models', 'MLOps', 'deep learning'] },
  { id: 'data-pipelines', name: 'Data pipelines (ETL)', category: 'data_ai', aliases: ['ETL', 'ELT', 'data pipelines', 'data pipeline'] },

  // ---- Observability & performance --------------------------------------------------
  { id: 'monitoring', name: 'Monitoring & logging', category: 'observability', aliases: ['monitoring', 'observability', 'logging', 'alerting', 'on-call', 'incident response'], group: 'observability', impliedBy: ['datadog', 'prometheus', 'opentelemetry'] },
  { id: 'datadog', name: 'Datadog', category: 'observability', aliases: ['Datadog'], group: 'observability' },
  { id: 'prometheus', name: 'Prometheus & Grafana', category: 'observability', aliases: ['Prometheus', 'Grafana'], group: 'observability' },
  { id: 'opentelemetry', name: 'OpenTelemetry', category: 'observability', aliases: ['OpenTelemetry', 'OTel', 'distributed tracing'], group: 'observability' },
  { id: 'performance', name: 'Performance optimisation', category: 'observability', aliases: ['performance optimization', 'performance optimisation', 'performance tuning', 'web performance', 'Core Web Vitals', 'profiling', 'low latency'] },

  // ---- Tools -----------------------------------------------------------------------
  { id: 'git', name: 'Git', category: 'tooling', aliases: ['version control'], caseSensitiveAliases: ['Git'], foundational: true },
  { id: 'jira', name: 'Jira', category: 'tooling', aliases: ['Jira'] },
  { id: 'postman', name: 'Postman', category: 'tooling', aliases: ['Postman'] },
  { id: 'figma', name: 'Figma', category: 'tooling', aliases: ['Figma'] },

  // ---- Practices -----------------------------------------------------------------
  { id: 'agile', name: 'Agile / Scrum', category: 'practices', aliases: ['Agile', 'Scrum', 'Kanban', 'sprint planning', 'sprints'] },
  { id: 'code-review', name: 'Code review', category: 'practices', aliases: ['code review', 'code reviews', 'peer review', 'pull request reviews'], foundational: true },
  { id: 'mentoring', name: 'Mentoring', category: 'practices', aliases: ['mentoring', 'mentorship', 'mentor junior', 'mentor engineers', 'coaching'] },
  { id: 'collaboration', name: 'Cross-functional collaboration', category: 'practices', aliases: ['cross-functional', 'collaborate with product', 'product managers', 'stakeholders', 'stakeholder management'] },
  { id: 'tech-leadership', name: 'Technical leadership', category: 'practices', aliases: ['technical leadership', 'tech lead', 'lead engineers', 'drive technical decisions', 'technical ownership'] },
  { id: 'communication', name: 'Communication skills', category: 'practices', aliases: ['communication skills', 'written communication', 'verbal communication', 'excellent communication'] },
  { id: 'documentation', name: 'Technical documentation', category: 'practices', aliases: ['technical documentation', 'design documents', 'RFCs', 'documentation'] },
];

const byId = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: string): SkillDef | undefined {
  return byId.get(id);
}

export function skillName(id: string): string {
  return byId.get(id)?.name ?? id;
}

export function skillsInGroup(group: string): SkillDef[] {
  return SKILLS.filter((s) => s.group === group);
}

export const ROLE_LABELS: Record<string, string> = {
  frontend: 'Frontend Engineer',
  backend: 'Backend Engineer',
  fullstack: 'Full-Stack Engineer',
  software: 'Software Engineer',
};

export const CATEGORY_LABELS: Record<string, string> = {
  startup: 'Startup',
  mid: 'Mid-sized',
  large: 'Large / MNC',
  unclassified: 'Unclassified',
};
