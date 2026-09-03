"use client";

import { useQuery } from "@tanstack/react-query";

import { getSession } from "@/lib/api";
import { type Session } from "@/lib/domain";

/**
 * Who is signed in, asked once and shared by everything that needs it.
 *
 * It is the first request the application makes, and it is made whether or not
 * anybody has signed in: the answer carries the CSRF token that every mutating
 * request afterwards has to send, so a run started before this had come back
 * would be refused for a reason the person could do nothing about.
 */
export function useSession(): {
  readonly session: Session | undefined;
  readonly pending: boolean;
} {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => getSession({ signal }),
    staleTime: 60_000,
  });
  return { session: query.data, pending: query.isPending };
}
