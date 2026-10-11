import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useResource(path, { freshOnMount = false } = {}) {
  const query = useQuery({
    queryKey: ["api", path],
    queryFn: ({ signal }) => api(path, { signal }),
  });
  const refresh = useCallback(
    async () => (await query.refetch()).data,
    [query.refetch],
  );
  return {
    data: query.data,
    error: query.error?.message,
    loading: query.isPending || (freshOnMount && !query.isFetchedAfterMount),
    refresh,
  };
}
