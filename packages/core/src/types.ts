/**
 * Shared domain types for JobRadar.
 *
 * These types are used by the mobile app today and will be reused by the
 * backend (Stage 2) so that the extraction, aggregation, trend, matching and
 * gap-analysis rules are implemented exactly once.
 */

export type CompanyCategory = 'startup' | 'mid' | 'large';
/** `unclassified` = company size could not be determined from available data. */
export type CompanyCategoryOrUnclassified = CompanyCategory | 'unclassified';

export type RoleId = 'frontend' | 'backend' | 'fullstack' | 'software';
export type WorkArrangement = 'remote' | 'hybrid' | 'onsite';
export type Requirement = 'required' | 'preferred' | 'mentioned';
export type SectionKind = 'requirements' | 'preferred' | 'responsibilities' | 'about' | 'benefits' | 'intro';

export type SkillCategoryId =
  | 'language'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'api'
  | 'cloud'
  | 'devops'
  | 'testing'
  | 'security'
  | 'architecture'
  | 'data_ai'
  | 'observability'
  | 'tooling'
  | 'practices';

export interface SkillDef {
  id: string;
  name: string;
  category: SkillCategoryId;
  /** Case-insensitive aliases. */
  aliases: string[];
  /** Aliases that must match case exactly (e.g. "React", "SQL", "AWS"). */
  caseSensitiveAliases?: string[];
  /** Contextual regexes. If the regex has capture group 1, that group is the matched span. */
  patterns?: RegExp[];
  /** Reject an alias hit when the text right after it matches this regex. */
  negativeLookahead?: RegExp;
  /** Skills in the same group are partially substitutable (e.g. AWS ↔ GCP ↔ Azure). */
  group?: string;
  /** A skill that is a thin layer on other skills (Next.js builds on React). */
  buildsOn?: string[];
  /** Specific tools that imply competence in this concept (Jest ⇒ unit testing, PostgreSQL ⇒ SQL). */
  impliedBy?: string[];
  /** Transferable concept rather than a tool. */
  foundational?: boolean;
}

export type SkillLabel =
  | 'foundational'
  | 'established'
  | 'growing'
  | 'emerging'
  | 'specialized'
  | 'declining'
  | 'uncertain';

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export interface SkillEvidence {
  /** The sentence / bullet that contains the mention. */
  sentence: string;
  /** Offsets of `sentence` inside the full description text. */
  start: number;
  end: number;
  /** The exact wording that was matched, e.g. "ReactJS". */
  matchedText: string;
  /** Offsets of the matched wording inside the full description text. */
  matchStart: number;
  matchEnd: number;
  section: SectionKind;
  requirement: Requirement;
  confidence: number;
}

export interface ExtractedSkill {
  skillId: string;
  canonicalName: string;
  requirement: Requirement;
  confidence: number;
  /** Wording of the strongest mention. */
  originalWording: string;
  /** True when the skill appeared as one of several "X or Y" alternatives. */
  isAlternative: boolean;
  evidence: SkillEvidence[];
  method: 'rules-v1' | 'ai-assisted';
  taxonomyVersion: string;
}

export interface ExperienceRequirement {
  min?: number;
  max?: number;
  raw: string;
}

// ---------------------------------------------------------------------------
// Companies & jobs
// ---------------------------------------------------------------------------

export type Provenance = 'demo' | 'live';

export interface CompanyClassification {
  category: CompanyCategoryOrUnclassified;
  basis: 'employee_count' | 'funding_stage' | 'multinational_listed' | 'manual' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface SalaryRange {
  min?: number;
  max?: number;
  currency: string;
  period: 'year' | 'month';
}

export type JobStatus = 'active' | 'expired' | 'changed' | 'unverified';

/** Minimal shape needed by the aggregation engine. */
export interface DemandJob {
  id: string;
  companyId: string;
  companyCategory: CompanyCategoryOrUnclassified;
  roleId: RoleId;
  industry?: string;
  city?: string;
  experience?: { min?: number; max?: number };
  skills: Pick<ExtractedSkill, 'skillId' | 'requirement'>[];
}

// ---------------------------------------------------------------------------
// Profile (the parts the engines need)
// ---------------------------------------------------------------------------

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface ProfileSkill {
  skillId: string;
  level: SkillLevel;
}

export interface MatchProfile {
  yearsExperience: number;
  targetRoleId: RoleId;
  skills: ProfileSkill[];
  /** Cities the user is open to (lower-case compare). */
  cities: string[];
  /** Countries the user is open to. */
  countries: string[];
  acceptsRemote: boolean;
  workArrangements: WorkArrangement[];
  expectedSalary?: { min?: number; max?: number; currency: string; period: 'year' };
}

export interface MatchJob {
  id: string;
  roleId: RoleId;
  city?: string;
  country?: string;
  workArrangement?: WorkArrangement;
  experience?: { min?: number; max?: number };
  salary?: SalaryRange;
  skills: Pick<ExtractedSkill, 'skillId' | 'requirement' | 'confidence' | 'isAlternative'>[];
}
