import type { WorkArrangement } from '@jobradar/core';

export interface ParsedLocation {
  text: string;
  city?: string;
  country?: string;
  remote: boolean;
}

/** Canonical city for the common spellings seen on Indian postings. */
const IN_CITIES: [RegExp, string][] = [
  [/\b(bengaluru|bangalore|blr)\b/i, 'Bengaluru'],
  [/\bhyderabad\b/i, 'Hyderabad'],
  [/\bpune\b/i, 'Pune'],
  [/\bmumbai|bombay|navi mumbai\b/i, 'Mumbai'],
  [/\b(gurugram|gurgaon)\b/i, 'Gurugram'],
  [/\bnoida\b/i, 'Noida'],
  [/\b(new delhi|delhi|ncr)\b/i, 'Delhi NCR'],
  [/\bchennai\b/i, 'Chennai'],
  [/\bkolkata\b/i, 'Kolkata'],
  [/\bahmedabad\b/i, 'Ahmedabad'],
  [/\bkochi|cochin\b/i, 'Kochi'],
  [/\bjaipur\b/i, 'Jaipur'],
  [/\bchandigarh|mohali\b/i, 'Chandigarh'],
  [/\bcoimbatore\b/i, 'Coimbatore'],
  [/\bindore\b/i, 'Indore'],
];

const COUNTRY_HINTS: [RegExp, string][] = [
  [/\bindia\b|,\s*in\b|\bIN\b$/i, 'India'],
  [/\b(united states|usa|u\.s\.a?\.?)\b|,\s*us\b/i, 'United States'],
  [/\b(united kingdom|uk|england)\b/i, 'United Kingdom'],
  [/\bsingapore\b/i, 'Singapore'],
  [/\bgermany\b/i, 'Germany'],
  [/\bcanada\b/i, 'Canada'],
];

export function parseLocation(text: string): ParsedLocation {
  const remote = /\bremote|work from home|\bwfh\b|anywhere\b/i.test(text);
  let city: string | undefined;
  for (const [re, name] of IN_CITIES) {
    if (re.test(text)) {
      city = name;
      break;
    }
  }
  let country: string | undefined;
  for (const [re, name] of COUNTRY_HINTS) {
    if (re.test(text)) {
      country = name;
      break;
    }
  }
  if (city && !country) country = 'India';
  return { text, city, country, remote };
}

/** Prefer an Indian location when a posting lists several. */
export function bestLocation(texts: string[]): ParsedLocation | undefined {
  const parsed = texts.filter((t) => t && t.trim()).map(parseLocation);
  return parsed.find((p) => p.country === 'India' && p.city) ?? parsed.find((p) => p.country === 'India') ?? parsed[0];
}

export function normalizeWorkplace(v: string | undefined | null): WorkArrangement | undefined {
  if (!v) return undefined;
  const s = v.toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'remote') return 'remote';
  if (s === 'hybrid') return 'hybrid';
  if (s === 'onsite' || s === 'inoffice' || s === 'office') return 'onsite';
  return undefined;
}

export function normalizeEmployment(v: string | undefined | null): 'full-time' | 'contract' | 'part-time' | 'intern' | 'other' | 'unknown' {
  if (!v) return 'unknown';
  const s = v.toLowerCase().replace(/[^a-z]/g, '');
  if (/fulltime|permanent|regular/.test(s)) return 'full-time';
  if (/contract|contractor|freelance|temporary|temp/.test(s)) return 'contract';
  if (/parttime/.test(s)) return 'part-time';
  if (/intern|trainee|apprentice/.test(s)) return 'intern';
  return 'other';
}
