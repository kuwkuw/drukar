import { useQuery } from '@tanstack/react-query';
import { isTerminalStatus } from '@drukar/shared';
import { fetchJob } from '../api/client';

const POLL_MS = 2000;

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) =>
      query.state.data && isTerminalStatus(query.state.data.status) ? false : POLL_MS,
  });
}
