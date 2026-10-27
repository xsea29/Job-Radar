import { useNavigate } from 'react-router-dom';
import type { JobView } from '../../data/analyze';
import { jobLocation, STATUS_LABEL } from '../../lib/labels';
import { relativeDays } from '../../lib/format';
import { CategoryMark, ScoreRing } from '../ui/Markers';
import { Badge, Row } from '../ui/Primitives';

export function JobRow({ view, showDate = false }: { view: JobView; showDate?: boolean }) {
  const nav = useNavigate();
  const { job, match } = view;
  return (
    <Row
      leading={<ScoreRing value={match.overall} />}
      title={job.title}
      subtitle={
        <>
          <span className="jr-cat">
            <CategoryMark category={job.companyCategory} />
            {job.companyName}
          </span>
          <br />
          {jobLocation(job.city, job.workArrangement)}
          {showDate && ` · ${relativeDays(job.firstSeenAt)}`}
          {job.status !== 'active' && (
            <>
              {' '}
              <Badge tone={job.status === 'expired' ? 'danger' : 'warning'}>{STATUS_LABEL[job.status]}</Badge>
            </>
          )}
        </>
      }
      onClick={() => nav(`/job/${job.id}`)}
    />
  );
}
