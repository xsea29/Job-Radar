import { describe, expect, it } from 'vitest';
import { evidenceMatchesSource, extractExperience, extractSkills, findSkillMentions, summarizeSections } from '../src/extract';

const JD = `About us
We are a Series A fintech. Our stack is React and Node.js on AWS.

What you'll do
- Build REST APIs in TypeScript and ship features end to end
- Own CI/CD pipelines with GitHub Actions

Requirements
- 3+ years of professional experience with ReactJS
- Strong proficiency in TypeScript and PostgreSQL
- Experience with React, Vue, or Angular
- Hands-on experience with Docker

Nice to have
- Kubernetes
- Experience with GraphQL is a plus
- React Native

Benefits
- Free Kubernetes snacks and a Python book club
`;

describe('extractSkills', () => {
  const skills = extractSkills(JD);
  const get = (id: string) => skills.find((s) => s.skillId === id);

  it('classifies requirements by section and cues', () => {
    expect(get('typescript')?.requirement).toBe('required');
    expect(get('postgresql')?.requirement).toBe('required');
    expect(get('docker')?.requirement).toBe('required');
    expect(get('react')?.requirement).toBe('required');
  });

  it('classifies preferred skills', () => {
    expect(get('kubernetes')?.requirement).toBe('preferred');
    expect(get('graphql')?.requirement).toBe('preferred');
    expect(get('react-native')?.requirement).toBe('preferred');
  });

  it('does not mark responsibility-only or blurb-only mentions as required', () => {
    expect(get('rest')?.requirement).toBe('mentioned');
    expect(get('github-actions')?.requirement).toBe('mentioned');
    expect(get('aws')?.requirement).toBe('mentioned');
    expect(get('nodejs')?.requirement).toBe('mentioned');
  });

  it('ignores benefit sections', () => {
    expect(get('python')).toBeUndefined();
  });

  it('keeps React, React Native and Next.js distinct', () => {
    const m = findSkillMentions('We use React Native and React, plus Next.js.').map((x) => x.skill.id);
    expect(m).toEqual(['react-native', 'react', 'nextjs']);
  });

  it('does not merge PostgreSQL / SQL / NoSQL / Java / JavaScript', () => {
    const ids = findSkillMentions('PostgreSQL, SQL, NoSQL, Java and JavaScript.').map((x) => x.skill.id);
    expect(ids).toEqual(['postgresql', 'sql', 'nosql', 'java', 'javascript']);
  });

  it('avoids common false positives', () => {
    const ids = findSkillMentions('You will react to incidents and go to market. The rest of the team will express interest.').map((x) => x.skill.id);
    expect(ids).toEqual([]);
  });

  it('handles Go only in a language context', () => {
    expect(findSkillMentions('Experience in Go and Python').map((x) => x.skill.id)).toContain('go');
    expect(findSkillMentions('Go beyond expectations').map((x) => x.skill.id)).not.toContain('go');
  });

  it('keeps original wording and verifiable evidence offsets', () => {
    const react = get('react')!;
    expect(react.originalWording).toBe('ReactJS');
    expect(evidenceMatchesSource(JD, react)).toBe(true);
    for (const s of skills) expect(evidenceMatchesSource(JD, s)).toBe(true);
  });

  it('flags "X, Y or Z" alternatives', () => {
    expect(get('vue')?.isAlternative).toBe(true);
    expect(get('angular')?.requirement).toBe('required');
    expect(get('angular')!.confidence).toBeLessThanOrEqual(0.75);
  });

  it('records extraction method and taxonomy version', () => {
    expect(get('typescript')?.method).toBe('rules-v1');
    expect(get('typescript')?.taxonomyVersion).toMatch(/^\d{4}\.\d+/);
  });

  it('handles C++ / C# / .NET tokens', () => {
    const ids = findSkillMentions('C++, C#, ASP.NET and .NET experience').map((x) => x.skill.id);
    expect(ids).toEqual(['cpp', 'csharp', 'dotnet', 'dotnet']);
  });
});

describe('extractExperience', () => {
  it('parses ranges and minimums', () => {
    expect(extractExperience('We want 3-6 years of experience')).toMatchObject({ min: 3, max: 6 });
    expect(extractExperience('5+ years building web apps')).toMatchObject({ min: 5 });
    expect(extractExperience('No years given')).toBeUndefined();
  });
});

describe('summarizeSections', () => {
  it('is extractive', () => {
    const s = summarizeSections(JD);
    expect(s.responsibilities[0]).toContain('REST APIs');
    expect(s.qualifications[0]).toContain('ReactJS');
  });
});
