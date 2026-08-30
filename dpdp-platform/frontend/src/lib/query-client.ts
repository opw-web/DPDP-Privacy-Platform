import { QueryClient } from "@tanstack/react-query";

/**
 * One QueryClient shared by both route trees. This is safe: TanStack Query
 * cache keys are just data (e.g. `["organization"]`, `["me", "profile"]`),
 * scoped by the query keys each page chooses, not by any shared auth
 * state -- it holds no token and makes no request on its own, so it is not
 * a channel either token store could leak through.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});
