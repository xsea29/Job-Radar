import { SKILLS, TAXONOMY_VERSION } from './taxonomy';
import type {
  ExperienceRequirement,
  ExtractedSkill,
  Requirement,
  SectionKind,
  SkillDef,
  SkillEvidence,
} from './types';

/**
 * Deterministic, rules-based skill extraction (`rules-v1`).
 *
 * Pipeline:  text → lines → sections → units (bullets/sentences)
 *            → alias matches (longest-first, no overlaps)
 *            → requirement classification (section + inline cues)
 *            → per-skill aggregation with evidence.
 *
 * Design rules:
 *  - A technology is NOT "required" merely because it appears. Only mentions
 *    in a requirements-like section, or with an explicit requirement cue, are
 *    required. Mentions in responsibilities / company blurbs are `mentioned`.
 *  - Every classification keeps the sentence it came from.
 *  - Benefit / perks sections are ignored.
 */

// ---------------------------------------------------------------------------
// Section detection
// ---------------------------------------------------------------------------

const HEADING_RULES: { kind: SectionKind; re: RegExp }[] = [
  { kind: 'preferred', re: /nice[- ]to[- ]have|preferred|bonus|good to have|desirable|extra credit|great to have|a plus\b/i },
  { kind: 'benefits', re: /benefits|perks|what we offer|compensation|why join|why you['’]ll love|how we work|our process|interview process/i },
  {
    kind: 'requirements',
    re: /requirements?|what you['’]ll bring|what you bring|qualifications?|must[- ]have|who you are|what we['’]re looking for|what we are looking for|you have|skills (?:&|and) experience|what you need|about you|your profile|minimum/i,
  },
  { kind: 'responsibilities', re: /responsibilit|what you['’]ll do|what you will do|your role|day[- ]to[- ]day|in this role|you will|the role|key duties|what you['’]ll work on/i },
  { kind: 'about', re: /about (?:us|the company|the team)|who we are|our (?:mission|story|team|stack|product)|company overview|overview/i },
];

const BULLET_RE = /^\s*(?:[-*•–·▪]|\d+[.)])\s+/;

function detectHeading(line: string): SectionKind | null {
  const t = line.trim();
  if (!t || t.length > 70 || BULLET_RE.test(line)) return null;
  const stripped = t.replace(/^#{1,4}\s*/, '').replace(/[:：]\s*$/, '');
  const looksLikeHeading = /^#{1,4}\s/.test(t) || /[:：]\s*$/.test(t) || (!/[.!?]$/.test(t) && stripped.split(/\s+/).length <= 8);
  if (!looksLikeHeading) return null;
  for (const r of HEADING_RULES) if (r.re.test(stripped)) return r.kind;
  return null;
}

// ---------------------------------------------------------------------------
// Units (bullets / sentences) with offsets
// ---------------------------------------------------------------------------

interface Unit {
  text: string;
  start: number;
  end: number;
  section: SectionKind;
  isBullet: boolean;
}

function splitUnits(text: string): Unit[] {
  const units: Unit[] = [];
  let section: SectionKind = 'intro';
  let offset = 0;
  for (const rawLine of text.split('\n')) {
    const lineStart = offset;
    offset += rawLine.length + 1;
    if (!rawLine.trim()) continue;
    const heading = detectHeading(rawLine);
    if (heading) {
      section = heading;
      continue;
    }
    const bullet = BULLET_RE.exec(rawLine);
    const bodyStart = lineStart + (bullet ? bullet[0].length : rawLine.length - rawLine.trimStart().length);
    const body = rawLine.slice(bodyStart - lineStart).trimEnd();
    if (bullet) {
      units.push({ text: body, start: bodyStart, end: bodyStart + body.length, section, isBullet: true });
      continue;
    }
    // paragraph → sentences
    const sentRe = /(?:[^.!?]|[.!?](?!\s|$))+[.!?]*/g;
    let m: RegExpExecArray | null;
    while ((m = sentRe.exec(body)) !== null) {
      const raw = m[0];
      const lead = raw.length - raw.trimStart().length;
      const s = raw.trim();
      if (!s) continue;
      const st = bodyStart + m.index + lead;
      units.push({ text: s, start: st, end: st + s.length, section, isBullet: false });
    }
  }
  return units;
}

// ---------------------------------------------------------------------------
// Alias matching
// ---------------------------------------------------------------------------

interface Matcher {
  skill: SkillDef;
  re: RegExp;
  /** true if capture group 1 delimits the span */
  grouped: boolean;
}

const BEFORE = String.raw`(?<![A-Za-z0-9_])`;
const AFTER = String.raw`(?![A-Za-z0-9_])`;
const AFTER_SYMBOL = String.raw`(?![A-Za-z0-9_+#])`;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function aliasRegex(alias: string, caseInsensitive: boolean): RegExp {
  const flags = caseInsensitive ? 'gi' : 'g';
  // Allow flexible whitespace/hyphen between words of multi-word aliases.
  const body = alias
    .split(/\s+/)
    .map(escapeRe)
    .join(String.raw`[\s-]+`);
  const after = /[+#]$/.test(alias) ? AFTER_SYMBOL : AFTER;
  return new RegExp(`${BEFORE}${body}${after}`, flags);
}

let MATCHERS: Matcher[] | null = null;

function matchers(): Matcher[] {
  if (MATCHERS) return MATCHERS;
  const out: Matcher[] = [];
  for (const skill of SKILLS) {
    for (const a of skill.aliases) out.push({ skill, re: aliasRegex(a, true), grouped: false });
    for (const a of skill.caseSensitiveAliases ?? []) out.push({ skill, re: aliasRegex(a, false), grouped: false });
    for (const p of skill.patterns ?? []) {
      const flags = p.flags.includes('g') ? p.flags : p.flags + 'g';
      out.push({ skill, re: new RegExp(p.source, flags.includes('d') ? flags : flags + 'd'), grouped: true });
    }
  }
  MATCHERS = out;
  return out;
}

interface RawMatch {
  skill: SkillDef;
  start: number;
  end: number;
  text: string;
}

/** Find every skill mention in `text`; the longest match wins on overlap. */
export function findSkillMentions(text: string): RawMatch[] {
  const all: RawMatch[] = [];
  for (const mt of matchers()) {
    mt.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = mt.re.exec(text)) !== null) {
      if (m[0].length === 0) {
        mt.re.lastIndex++;
        continue;
      }
      let start = m.index;
      let end = m.index + m[0].length;
      let txt = m[0];
      if (mt.grouped) {
        const idx = (m as RegExpExecArray & { indices?: [number, number][] }).indices?.[1];
        if (!idx) continue;
        [start, end] = idx;
        txt = text.slice(start, end);
      }
      const neg = mt.skill.negativeLookahead;
      if (neg && neg.test(text.slice(end, end + 24))) continue;
      all.push({ skill: mt.skill, start, end, text: txt });
    }
  }
  // Longest first, then earliest; drop overlaps.
  all.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken: RawMatch[] = [];
  for (const c of all) {
    if (taken.some((t) => c.start < t.end && t.start < c.end)) continue;
    taken.push(c);
  }
  return taken.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const PREFERRED_CUE = /\b(nice[- ]to[- ]have|is a plus|are a plus|a plus|bonus|preferred|preferably|good to have|desirable|advantage|an added advantage|ideally|would be great|is a bonus)\b/i;
const SOFT_CUE = /\b(familiarity with|familiar with|exposure to|working knowledge|awareness of|basic understanding)\b/i;
const REQUIRED_CUE = /\b(must|required|mandatory|strong (?:experience|proficiency|knowledge|command|background)|proven|\d+\+?\s*(?:-\s*\d+\s*)?years?|expert(?:ise)?|proficien(?:t|cy)|hands-on|solid (?:experience|understanding))\b/i;

function classifyMention(unit: Unit): { requirement: Requirement; confidence: number } {
  const { section, text } = unit;
  const preferredCue = PREFERRED_CUE.test(text);
  const requiredCue = REQUIRED_CUE.test(text);
  const softCue = SOFT_CUE.test(text);

  if (section === 'benefits') return { requirement: 'mentioned', confidence: 0 };
  if (preferredCue) return { requirement: 'preferred', confidence: section === 'preferred' ? 0.95 : 0.85 };
  if (section === 'preferred') return { requirement: 'preferred', confidence: 0.92 };
  if (section === 'requirements') {
    if (softCue) return { requirement: 'required', confidence: 0.65 };
    return { requirement: 'required', confidence: requiredCue ? 0.95 : unit.isBullet ? 0.88 : 0.8 };
  }
  if (section === 'responsibilities') {
    if (requiredCue) return { requirement: 'required', confidence: 0.7 };
    return { requirement: 'mentioned', confidence: 0.6 };
  }
  // about / intro: tech-stack blurbs. Explicit cues still count.
  if (requiredCue) return { requirement: 'required', confidence: 0.6 };
  return { requirement: 'mentioned', confidence: 0.5 };
}

const RANK: Record<Requirement, number> = { required: 3, preferred: 2, mentioned: 1 };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  maxEvidencePerSkill?: number;
}

export function extractSkills(text: string, opts: ExtractOptions = {}): ExtractedSkill[] {
  const maxEv = opts.maxEvidencePerSkill ?? 4;
  const units = splitUnits(text);
  const bySkill = new Map<string, { def: SkillDef; evidence: SkillEvidence[]; alt: boolean }>();

  for (const unit of units) {
    if (unit.section === 'benefits') continue;
    const mentions = findSkillMentions(unit.text);
    for (const m of mentions) {
      const { requirement, confidence } = classifyMention(unit);
      const ev: SkillEvidence = {
        sentence: unit.text,
        start: unit.start,
        end: unit.end,
        matchedText: m.text,
        matchStart: unit.start + m.start,
        matchEnd: unit.start + m.end,
        section: unit.section,
        requirement,
        confidence,
      };
      const entry = bySkill.get(m.skill.id) ?? { def: m.skill, evidence: [], alt: false };
      entry.evidence.push(ev);
      // "X, Y or Z" alternatives within the same group.
      if (m.skill.group && /\b(or|\/)\b|\//i.test(unit.text)) {
        const sameGroup = mentions.filter((o) => o.skill.id !== m.skill.id && o.skill.group === m.skill.group);
        if (sameGroup.length > 0) {
          const between = unit.text.slice(Math.min(m.start, ...sameGroup.map((o) => o.start)), Math.max(m.end, ...sameGroup.map((o) => o.end)));
          if (/\bor\b|\//i.test(between)) entry.alt = true;
        }
      }
      bySkill.set(m.skill.id, entry);
    }
  }

  const out: ExtractedSkill[] = [];
  for (const { def, evidence, alt } of bySkill.values()) {
    const best = [...evidence].sort((a, b) => RANK[b.requirement] - RANK[a.requirement] || b.confidence - a.confidence)[0]!;
    const sameClass = evidence.filter((e) => e.requirement === best.requirement).length;
    let confidence = Math.min(0.98, best.confidence + 0.03 * (sameClass - 1));
    if (alt && best.requirement === 'required') confidence = Math.min(confidence, 0.75);
    out.push({
      skillId: def.id,
      canonicalName: def.name,
      requirement: best.requirement,
      confidence: Math.round(confidence * 100) / 100,
      originalWording: best.matchedText,
      isAlternative: alt,
      evidence: evidence.slice(0, maxEv),
      method: 'rules-v1',
      taxonomyVersion: TAXONOMY_VERSION,
    });
  }
  return out.sort((a, b) => RANK[b.requirement] - RANK[a.requirement] || b.confidence - a.confidence || a.skillId.localeCompare(b.skillId));
}

/** Pull "N years" / "N-M years" statements from a description. */
export function extractExperience(text: string): ExperienceRequirement | undefined {
  const range = /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\+?\s*years?/i.exec(text);
  if (range) return { min: Number(range[1]), max: Number(range[2]), raw: range[0] };
  const plus = /(\d{1,2})\s*\+\s*years?/i.exec(text) ?? /(?:at least|minimum of|minimum)\s+(\d{1,2})\s*years?/i.exec(text);
  if (plus) return { min: Number(plus[1]), raw: plus[0] };
  return undefined;
}

export interface SectionSummary {
  responsibilities: string[];
  qualifications: string[];
}

/** Extractive (not generative) summary: the first few bullets of each section. */
export function summarizeSections(text: string, perSection = 3): SectionSummary {
  const units = splitUnits(text);
  const pick = (kinds: SectionKind[]) =>
    units
      .filter((u) => kinds.includes(u.section) && u.text.length > 12)
      .slice(0, perSection)
      .map((u) => u.text);
  return { responsibilities: pick(['responsibilities']), qualifications: pick(['requirements']) };
}

/**
 * Evidence check used in tests and by the backend: every stored evidence span
 * must be recoverable from the original description.
 */
export function evidenceMatchesSource(text: string, skill: ExtractedSkill): boolean {
  return skill.evidence.every(
    (e) => text.slice(e.start, e.end) === e.sentence && text.slice(e.matchStart, e.matchEnd) === e.matchedText,
  );
}
