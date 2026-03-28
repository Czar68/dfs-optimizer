import { useState, useEffect } from 'react';

interface DashboardData {
  status: any;
  pp: any;
  ud: any;
  merge: any;
}

interface DashboardDataState extends DashboardData {
  loading: boolean;
  error: string | null;
}

export const useDashboardData = (): DashboardDataState => {
  const [state, setState] = useState<DashboardDataState>({
    status: null,
    pp: null,
    ud: null,
    merge: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));

        const urls = [
          '/live-data/latest_run_status.json',
          '/live-data/pp_cards.json',
          '/live-data/ud_cards.json',
          '/live-data/merge_summary.json',
        ];

        const responses = await Promise.allSettled(
          urls.map(url => fetch(url))
        );

        const results = await Promise.allSettled(
          responses.map(async (response, index) => {
            if (response.status === 'fulfilled') {
              const fetchResponse = response.value;
              if (!fetchResponse.ok) {
                throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`);
              }
              return await fetchResponse.json();
            } else {
              throw new Error(`Fetch failed: ${response.reason}`);
            }
          })
        );

        const newState: Partial<DashboardData> = {};
        const errors: string[] = [];

        results.forEach((result, index) => {
          const key = ['status', 'pp', 'ud', 'merge'][index] as keyof DashboardData;
          if (result.status === 'fulfilled') {
            newState[key] = result.value;
          } else {
            errors.push(`${urls[index]}: ${result.reason}`);
          }
        });

        setState(prev => ({
          ...prev,
          ...newState,
          loading: false,
          error: errors.length > 0 ? errors.join('; ') : null,
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error occurred',
        }));
      }
    };

    fetchDashboardData();
  }, []);

  return state;
};
