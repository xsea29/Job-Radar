import { classifyCompany, type Company } from '@jobradar/core';

/**
 * FICTIONAL companies for demo mode. Any resemblance to real organisations is
 * coincidental. Sizes are chosen so the demo corpus lands on 35/30/35 and a
 * few sit near a size boundary to exercise "ambiguous classification".
 */
type Row = [name: string, industry: string, hq: string, employees: number, stage: string, jobs: number, countries?: number];

const STARTUPS: Row[] = [
  ['Kiteflow', 'SaaS', 'Bengaluru', 45, 'seed', 2],
  ['Pebblepay', 'Fintech', 'Bengaluru', 70, 'series-a', 2],
  ['Tessera Labs', 'AI / Data', 'Bengaluru', 32, 'seed', 2],
  ['Orbitly', 'SaaS', 'Pune', 95, 'series-a', 1],
  ['Quillbase', 'Developer tools', 'Bengaluru', 28, 'seed', 2],
  ['Nimbusly', 'SaaS', 'Hyderabad', 120, 'series-b', 1],
  ['Fernhill AI', 'AI / Data', 'Bengaluru', 40, 'seed', 2],
  ['Cartwheel', 'E-commerce', 'Mumbai', 160, 'series-b', 1],
  ['Brightwell Health', 'Healthtech', 'Bengaluru', 85, 'series-a', 1],
  ['Loomstack', 'Developer tools', 'Pune', 22, 'pre-seed', 2],
  ['Hopscotch Commerce', 'E-commerce', 'Delhi NCR', 110, 'series-a', 1],
  ['Zenroute', 'Logistics', 'Bengaluru', 140, 'series-b', 2],
  ['Marlowe Systems', 'SaaS', 'Chennai', 58, 'series-a', 1],
  ['Parcelwise', 'Logistics', 'Hyderabad', 75, 'series-a', 1],
  ['Tidewater Data', 'AI / Data', 'Bengaluru', 36, 'seed', 1],
  ['Sproutly', 'Edtech', 'Bengaluru', 130, 'series-b', 1],
  ['Vantage Grid', 'Energy', 'Pune', 52, 'seed', 1],
  ['Copperleaf', 'Fintech', 'Mumbai', 90, 'series-a', 2],
  ['Mintbox', 'Fintech', 'Bengaluru', 195, 'series-b', 1],
  ['Driftwood Labs', 'Developer tools', 'Remote', 18, 'pre-seed', 1],
  ['Skylark Edtech', 'Edtech', 'Delhi NCR', 105, 'series-a', 1],
  ['Ploughshare', 'Agritech', 'Hyderabad', 64, 'series-a', 1],
  ['Beacon Rides', 'Mobility', 'Bengaluru', 150, 'series-b', 1],
  ['Quasar Pay', 'Fintech', 'Bengaluru', 82, 'series-a', 2],
  ['Wrenly', 'SaaS', 'Remote', 26, 'seed', 1],
  ['Fieldnote', 'Healthtech', 'Chennai', 48, 'seed', 1],
];

const MID: Row[] = [
  ['Ledgerline Financial', 'Fintech', 'Bengaluru', 820, 'series-d', 2],
  ['Kestrel Mobility', 'Mobility', 'Bengaluru', 1400, 'series-d', 2],
  ['Harborview Software', 'SaaS', 'Pune', 640, 'profitable', 2],
  ['Redwood Logistics Tech', 'Logistics', 'Hyderabad', 930, 'series-c', 1],
  ['Saffron Retail Systems', 'E-commerce', 'Mumbai', 1750, 'series-d', 1],
  ['Northgate Insurance Tech', 'Insurance', 'Pune', 560, 'profitable', 2],
  ['Blueharbor Analytics', 'AI / Data', 'Bengaluru', 380, 'series-c', 1],
  ['Meridian HealthTech', 'Healthtech', 'Hyderabad', 710, 'series-c', 2],
  ['Cobalt Commerce', 'E-commerce', 'Delhi NCR', 1150, 'series-d', 1],
  ['Evergreen EdTech', 'Edtech', 'Bengaluru', 480, 'series-c', 1],
  ['Lumen Travel', 'Travel', 'Delhi NCR', 900, 'series-d', 1],
  ['Ironbark Payments', 'Fintech', 'Mumbai', 1320, 'series-d', 2],
  ['Aster Media', 'Media', 'Mumbai', 610, 'profitable', 1],
  ['Pinecrest Software', 'SaaS', 'Chennai', 270, 'series-c', 2],
  ['Tandem Mobility', 'Mobility', 'Pune', 1900, 'series-d', 1],
  ['Willow Energy Tech', 'Energy', 'Hyderabad', 440, 'profitable', 1],
  ['Granite Cloud', 'SaaS', 'Bengaluru', 1050, 'series-d', 2],
  ['Summit Retail Labs', 'E-commerce', 'Bengaluru', 2200, 'series-d', 1],
  ['Opal Telecom Software', 'Telecom', 'Pune', 780, 'profitable', 1],
  ['Sterling Freight Tech', 'Logistics', 'Chennai', 2750, 'profitable', 1],
  ['Juniper Hospitality Tech', 'Travel', 'Remote', 210, 'series-c', 1],
  ['Crestline Games', 'Gaming', 'Hyderabad', 330, 'series-c', 1],
];

const LARGE: Row[] = [
  ['Atlas Global Technologies', 'Enterprise IT', 'Bengaluru', 48000, 'public', 2, 24],
  ['Meridian Bank Digital', 'Banking', 'Mumbai', 15000, 'public', 2, 9],
  ['Vertex Consulting Services', 'Enterprise IT', 'Pune', 62000, 'public', 2, 31],
  ['Solstice Retail Group', 'Retail', 'Bengaluru', 22000, 'public', 1, 12],
  ['Nordwind Automotive Software', 'Automotive', 'Pune', 9500, 'public', 2, 14],
  ['Helix Pharma Digital', 'Healthtech', 'Hyderabad', 7200, 'public', 1, 17],
  ['Continental Insurance Digital', 'Insurance', 'Mumbai', 11000, 'public', 1, 8],
  ['Orion Telecom Networks', 'Telecom', 'Bengaluru', 26000, 'public', 2, 15],
  ['Pacific Rim Logistics', 'Logistics', 'Mumbai', 18500, 'public', 1, 19],
  ['Summit Capital Markets Tech', 'Fintech', 'Bengaluru', 6400, 'public', 2, 11],
  ['Aurora Cloud Services', 'SaaS', 'Hyderabad', 31000, 'public', 2, 22],
  ['Titan Enterprise Software', 'SaaS', 'Pune', 14500, 'public', 2, 16],
  ['Zenith Payments Network', 'Fintech', 'Bengaluru', 9800, 'public', 2, 13],
  ['Banyan IT Services', 'Enterprise IT', 'Chennai', 85000, 'public', 1, 38],
  ['Crown Healthcare Systems', 'Healthtech', 'Hyderabad', 12500, 'public', 1, 10],
  ['Polaris E-commerce', 'E-commerce', 'Bengaluru', 8800, 'public', 2, 7],
  ['Eastgate Energy', 'Energy', 'Delhi NCR', 5600, 'public', 1, 9],
  ['Sapphire Hospitality Group', 'Travel', 'Delhi NCR', 4300, 'public', 1, 12],
  ['Halcyon Aerospace Software', 'Aerospace', 'Bengaluru', 3400, 'public', 1, 6],
  ['Monarch Media Group', 'Media', 'Mumbai', 3100, 'public', 1, 5],
  ['Everstone Consulting', 'Enterprise IT', 'Gurugram', 41000, 'public', 1, 27],
  ['Quantum Retail Holdings', 'Retail', 'Mumbai', 19000, 'public', 2, 8],
  ['Lakeshore Financial Group', 'Banking', 'Pune', 7700, 'public', 1, 14],
  ['Granville Technologies', 'Enterprise IT', 'Chennai', 29500, 'public', 1, 20],
];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export interface DemoCompany extends Company {
  jobCount: number;
}

function toCompany(r: Row): DemoCompany {
  const [name, industry, hqCity, employees, fundingStage, jobCount, countries] = r;
  const listed = fundingStage === 'public';
  const classification = classifyCompany({ employees, fundingStage, listed, countries });
  return {
    id: `demo_co_${slug(name)}`,
    name,
    provenance: 'demo',
    category: classification.category,
    classification,
    industry,
    hqCity,
    employees,
    fundingStage,
    countries,
    jobCount,
  };
}

export const DEMO_COMPANIES: DemoCompany[] = [...STARTUPS, ...MID, ...LARGE].map(toCompany);
export const companySlug = slug;
