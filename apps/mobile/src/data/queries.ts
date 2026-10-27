import { useQuery } from '@tanstack/react-query';
import { analyze, type Analysis } from './analyze';
import { evidenceSource } from './source';
import { useProfile } from '../state/profile';
import { useSettings } from '../state/settings';

/** Everything the screens show, derived from evidence + profile by the core engines. */
export function useAnalysis() {
  const { profile } = useProfile();
  const { settings } = useSettings();
  const roleId = profile.targetRoleId;
  return useQuery<Analysis | null>({
    queryKey: ['analysis', settings.scenario, roleId, JSON.stringify(profile.skills), profile.yearsExperience, JSON.stringify(profile.locations), JSON.stringify(profile.salary), profile.weeklyLearningHours, JSON.stringify(settings.matchWeights)],
    queryFn: async () => {
      const evidence = await evidenceSource.load({ roleId, scenario: settings.scenario });
      if (!evidence) return null;
      return analyze(evidence, profile, settings.matchWeights);
    },
    retry: false,
    staleTime: Infinity,
  });
}
