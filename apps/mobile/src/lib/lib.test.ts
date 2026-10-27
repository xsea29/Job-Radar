import { describe, expect, it } from 'vitest';
import { dateRange, dateTime, lpa, lpaRange, plural } from './format';
import { skillsFromText } from './importers';

describe('format', () => {
  it('formats times in IST', () => {
    expect(dateTime('2026-10-27T00:30:00Z')).toBe('27 Oct, 06:00');
    expect(dateRange('2026-10-19T00:00:00Z', '2026-10-25T00:00:00Z')).toBe('19 to 25 Oct');
  });
  it('formats money and plurals', () => {
    expect(lpa(2_800_000)).toBe('₹28 LPA');
    expect(lpaRange(2_800_000, 3_500_000)).toBe('₹28–35 LPA');
    expect(plural(1, 'job')).toBe('1 job');
    expect(plural(2, 'company', 'companies')).toBe('2 companies');
  });
});

describe('resume import', () => {
  it('suggests canonical skills without merging distinct technologies', () => {
    const ids = skillsFromText('React Native and React, PostgreSQL, SQL, Java and JavaScript').map((s) => s.skillId).sort();
    expect(ids).toEqual(['java', 'javascript', 'postgresql', 'react', 'react-native', 'sql']);
  });
});
