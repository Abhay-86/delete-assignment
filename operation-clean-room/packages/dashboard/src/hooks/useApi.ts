import {
  useQuery,
  type UseQueryOptions,
  type QueryKey,
} from '@tanstack/react-query';

/**
 * Generic data-fetching hook backed by TanStack Query.
 *
 * Wraps `useQuery` with sensible defaults and a streamlined return shape
 * so feature components don't need to import anything from react-query directly.
 *
 * @example
 * ```ts
 * const { data, isLoading, error } = useApi(
 *   ['metrics', 'arr'],
 *   () => getARR({ date: '2024-03-01' }),
 * );
 * ```
 */
export function useApi<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  options?: Omit<
    UseQueryOptions<T, Error, T, QueryKey>,
    'queryKey' | 'queryFn'
  >,
) {
  const query = useQuery<T, Error, T, QueryKey>({
    queryKey: key,
    queryFn: fetcher,
    ...options,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    isError: query.isError,
    isSuccess: query.isSuccess,
  };
}
