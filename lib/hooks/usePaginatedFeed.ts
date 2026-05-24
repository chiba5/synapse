'use client';

import useSWRInfinite from 'swr/infinite';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function usePaginatedFeed<T>(
  apiPath: string,
  initialData: T[],
  initialNextCursor: string | null
) {
  const getKey = (index: number, prev: { data: T[]; nextCursor: string | null } | null) => {
    if (prev && !prev.nextCursor) return null;
    if (index === 0) return `${apiPath}?limit=20`;
    return `${apiPath}?cursor=${encodeURIComponent(prev!.nextCursor!)}&limit=20`;
  };

  const { data: pages, size, setSize, mutate, isValidating } = useSWRInfinite(
    getKey,
    fetcher,
    {
      fallbackData: [{ data: initialData, nextCursor: initialNextCursor }],
      refreshInterval: 30_000,
      revalidateOnFocus: false,
      revalidateFirstPage: false,
    }
  );

  const items = pages?.flatMap((p: { data: T[] }) => p.data) ?? initialData;
  const hasMore = pages ? !!pages[pages.length - 1]?.nextCursor : !!initialNextCursor;
  const isLoadingMore = isValidating && size > (pages?.length ?? 0);

  return {
    items,
    hasMore,
    isLoadingMore,
    loadMore: () => setSize(s => s + 1),
    mutate,
  };
}
