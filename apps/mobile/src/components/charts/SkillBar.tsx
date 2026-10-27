/**
 * Stacked horizontal bar: required (dark) · preferred (mid) · mentioned (light).
 * Segment widths are shares of the FULL sample (n), so total bar length equals
 * the skill's prevalence and bars are comparable across rows.
 */
export function SkillBar({ n, required, preferred, mentioned = 0, height = 10, showMentioned = false }: { n: number; required: number; preferred: number; mentioned?: number; height?: number; showMentioned?: boolean }) {
  const w = (x: number) => (n > 0 ? (x / n) * 100 : 0);
  const segs = [
    { k: 'req', v: required, c: 'var(--req)' },
    { k: 'pref', v: preferred, c: 'var(--pref)' },
    ...(showMentioned ? [{ k: 'ment', v: mentioned, c: 'var(--ment)' }] : []),
  ].filter((s) => s.v > 0);
  const total = segs.reduce((s, x) => s + x.v, 0);
  return (
    <div className="jr-skillbar" style={{ height }} role="img" aria-label={`${required} required, ${preferred} preferred${showMentioned ? `, ${mentioned} mentioned` : ''} out of ${n} jobs`}>
      <div className="jr-skillbar__track" />
      <div className="jr-skillbar__fill" style={{ width: `${w(total)}%` }}>
        {segs.map((s, i) => (
          <span key={s.k} style={{ flexGrow: s.v, background: s.c, borderTopLeftRadius: i === 0 ? 5 : 0, borderBottomLeftRadius: i === 0 ? 5 : 0, borderTopRightRadius: i === segs.length - 1 ? 5 : 0, borderBottomRightRadius: i === segs.length - 1 ? 5 : 0 }} />
        ))}
      </div>
    </div>
  );
}
