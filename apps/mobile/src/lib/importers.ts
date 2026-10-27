import { findSkillMentions } from '@jobradar/core';

export interface SkillSuggestion {
  skillId: string;
  /** Mentions in the text, or repositories on GitHub. */
  count: number;
}

/** Deterministic: reuse the same alias matcher that reads job descriptions. */
export function skillsFromText(text: string): SkillSuggestion[] {
  const counts = new Map<string, number>();
  for (const m of findSkillMentions(text)) counts.set(m.skill.id, (counts.get(m.skill.id) ?? 0) + 1);
  return [...counts].map(([skillId, count]) => ({ skillId, count })).sort((a, b) => b.count - a.count);
}

const LANGUAGE_MAP: Record<string, string> = {
  JavaScript: 'javascript', TypeScript: 'typescript', Python: 'python', Java: 'java', Go: 'go', 'C#': 'csharp', 'C++': 'cpp', Rust: 'rust', Kotlin: 'kotlin',
  Swift: 'swift', PHP: 'php', Ruby: 'ruby', Scala: 'scala', Shell: 'bash', HTML: 'html-css', CSS: 'html-css', SCSS: 'html-css', Vue: 'vue', Svelte: 'svelte',
  Dockerfile: 'docker', HCL: 'terraform',
};

export interface GithubResult {
  repoCount: number;
  suggestions: SkillSuggestion[];
}

export class ImportError extends Error {}

/**
 * Reads PUBLIC repository metadata (languages + topics) from the GitHub REST
 * API, unauthenticated, straight from the device. Nothing is sent to JobRadar.
 */
export async function skillsFromGithub(username: string, signal?: AbortSignal): Promise<GithubResult> {
  const u = username.trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(u)) throw new ImportError('That doesn’t look like a GitHub username.');
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/users/${encodeURIComponent(u)}/repos?per_page=100&sort=pushed`, { headers: { Accept: 'application/vnd.github+json' }, signal });
  } catch {
    throw new ImportError('Couldn’t reach GitHub. Check your connection and try again.');
  }
  if (res.status === 404) throw new ImportError(`No GitHub user named “${u}”.`);
  if (res.status === 403 || res.status === 429) throw new ImportError('GitHub’s anonymous rate limit was hit. Try again later, or paste your skills instead.');
  if (!res.ok) throw new ImportError(`GitHub returned an error (${res.status}).`);
  const repos = (await res.json()) as { language?: string | null; topics?: string[]; fork?: boolean }[];
  const own = repos.filter((r) => !r.fork);
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const r of own) {
    const ids = new Set<string>();
    const lang = r.language ? LANGUAGE_MAP[r.language] : undefined;
    if (lang) ids.add(lang);
    for (const t of r.topics ?? []) {
      const words = t.replace(/-/g, ' ');
      const variants = [words, words.replace(/\b\w/g, (c) => c.toUpperCase()), words.toUpperCase()];
      for (const v of variants) for (const m of findSkillMentions(v)) ids.add(m.skill.id);
    }
    ids.forEach(bump);
  }
  return { repoCount: own.length, suggestions: [...counts].map(([skillId, count]) => ({ skillId, count })).sort((a, b) => b.count - a.count) };
}
