import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: "always",
      retry: (attempt, error) =>
        error.status >= 400 && error.status < 500 ? false : attempt < 2,
    },
    mutations: { retry: false },
  },
});
