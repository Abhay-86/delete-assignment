import { useState, useCallback, useMemo } from 'react';
import type { FilterState } from '@/types';

const DEFAULT_FILTERS: FilterState = {
  dateRange: {
    start: new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  },
  plan: null,
  region: null,
  segment: null,
};

/**
 * Manages the shared filter state that drives most dashboard queries.
 *
 * Provides granular setters so individual filter controls don't re-render
 * the entire filter bar on every keystroke.
 */
export function useFilters(initial?: Partial<FilterState>) {
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    ...initial,
  });

  const setDateRange = useCallback(
    (start: string, end: string) =>
      setFilters((prev) => ({ ...prev, dateRange: { start, end } })),
    [],
  );

  const setPlan = useCallback(
    (plan: string | null) => setFilters((prev) => ({ ...prev, plan })),
    [],
  );

  const setRegion = useCallback(
    (region: string | null) => setFilters((prev) => ({ ...prev, region })),
    [],
  );

  const setSegment = useCallback(
    (segment: string | null) => setFilters((prev) => ({ ...prev, segment })),
    [],
  );

  const reset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const hasActiveFilters = useMemo(
    () =>
      filters.plan !== null ||
      filters.region !== null ||
      filters.segment !== null,
    [filters.plan, filters.region, filters.segment],
  );

  return {
    filters,
    setDateRange,
    setPlan,
    setRegion,
    setSegment,
    reset,
    hasActiveFilters,
  } as const;
}
