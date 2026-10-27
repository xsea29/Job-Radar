/**
 * FORMAT FIXTURES — hand-written to follow the public API documentation of each
 * ATS. They are NOT real postings and prove nothing about live data; they only
 * let us test parsing, error handling and the downstream pipeline offline.
 * Replace/augment with recorded real responses once the network allows it.
 */
export const GH_DESC_HTML = `<h3>About the role</h3><p>We build payments tooling in Bengaluru.</p><h3>Requirements</h3><ul><li>3+ years with <strong>TypeScript</strong> &amp; Node.js</li><li>Strong proficiency in PostgreSQL</li></ul><h3>Nice to have</h3><ul><li>Experience with Kubernetes is a plus</li></ul>`;
// Greenhouse returns the HTML entity-escaped:
export const GH_DESC_ESCAPED = GH_DESC_HTML.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const ghResponse = {
  jobs: [
    { id: 4001, title: 'Senior Full Stack Engineer', absolute_url: 'https://example.invalid/gh/4001', updated_at: '2026-10-20T10:00:00Z', first_published: '2026-10-01T10:00:00Z', location: { name: 'Bangalore, India' }, offices: [{ name: 'Bengaluru', location: 'Bengaluru, Karnataka, India' }], departments: [{ name: 'Engineering' }], content: GH_DESC_ESCAPED, pay_input_ranges: [{ min_cents: 3_000_000_00, max_cents: 4_500_000_00, currency_type: 'INR' }] },
    { id: 4002, title: 'Recruiter', absolute_url: 'https://example.invalid/gh/4002', location: { name: 'Remote' }, content: '' },
    { id: 4003, title: '', absolute_url: 'https://example.invalid/gh/4003', content: 'x' },
  ],
  meta: { total: 3 },
};

export const leverResponse = [
  {
    id: 'aaaa-1111', text: 'Backend Engineer', hostedUrl: 'https://example.invalid/lever/aaaa-1111', applyUrl: 'https://example.invalid/lever/aaaa-1111/apply', createdAt: 1_760_000_000_000,
    workplaceType: 'hybrid', categories: { commitment: 'Full-time', team: 'Platform', location: 'Pune', allLocations: ['Pune', 'Hyderabad'] },
    descriptionPlain: 'Join the platform team to build services.',
    lists: [
      { text: "What you'll do", content: '<li>Design and build REST APIs</li><li>Own services in production</li>' },
      { text: 'Requirements', content: '<li>4+ years of Java or Go</li><li>Hands-on experience with Docker</li>' },
      { text: 'Nice to have', content: '<li>Kafka</li>' },
    ],
    additionalPlain: 'We are an equal opportunity employer.', salaryRange: { currency: 'INR', interval: 'per-year-salary', min: 2_800_000, max: 4_000_000 },
  },
  { id: 'bbbb-2222', text: 'Designer', hostedUrl: 'https://example.invalid/lever/bbbb-2222', categories: { location: 'Remote' } },
];

export const ashbyResponse = {
  jobs: [
    { id: 'ash-1', title: 'Frontend Engineer', department: 'Engineering', team: 'Web', employmentType: 'FullTime', location: 'Mumbai, India', secondaryLocations: [{ location: 'Remote - India' }], isRemote: false, isListed: true, workplaceType: 'Hybrid', publishedAt: '2026-10-10T09:00:00Z', jobUrl: 'https://example.invalid/ashby/ash-1', applyUrl: 'https://example.invalid/ashby/ash-1/apply', descriptionHtml: '<p>Build the web app.</p><h2>Requirements</h2><ul><li>3-6 years of React and TypeScript</li></ul>', compensation: { summaryComponents: [{ compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'INR', minValue: 2_400_000, maxValue: 3_600_000 }] } },
    { id: 'ash-2', title: 'Hidden role', isListed: false, jobUrl: 'https://example.invalid/ashby/ash-2', descriptionHtml: '<p>x</p>' },
  ],
};
