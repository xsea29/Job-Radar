-- Offsets are UTF-16 code-unit offsets, i.e. what JavaScript's String.slice() uses
-- (the extractor, the app and the API are all JS). They are NOT Postgres substr()
-- code-point offsets, which differ once text contains characters outside the BMP
-- (emoji etc.). Verify with verifyEvidenceOffsets(), not with SQL substr().
COMMENT ON COLUMN skill_evidence.sent_start IS 'UTF-16 code-unit offset of the sentence start in job_description_snapshots.description';
COMMENT ON COLUMN skill_evidence.sent_end IS 'UTF-16 code-unit offset of the sentence end (exclusive)';
COMMENT ON COLUMN skill_evidence.match_start IS 'UTF-16 code-unit offset of the matched wording start';
COMMENT ON COLUMN skill_evidence.match_end IS 'UTF-16 code-unit offset of the matched wording end (exclusive)';
