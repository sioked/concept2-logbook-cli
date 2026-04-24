import type { C2Result, C2ResultsResponse } from "./types.js";

const BASE_URL = "https://log.concept2.com/api";

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.c2logbook.v1+json",
    },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export interface ResultsFilter {
  type?: "rower" | "skierg" | "bikeerg";
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  limit?: number;
}

export async function fetchResults(token: string, filter: ResultsFilter = {}): Promise<C2Result[]> {
  const all: C2Result[] = [];
  let page = 1;
  const perPage = 100;
  const maxResults = filter.limit ?? Infinity;

  while (all.length < maxResults) {
    const params = new URLSearchParams({ page: String(page), number: String(perPage) });
    if (filter.type) params.set("type", filter.type);
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);

    const data = await apiFetch<C2ResultsResponse>(`/users/me/results?${params}`, token);

    all.push(...data.data);

    if (page >= data.meta.pagination.total_pages) break;
    page++;
  }

  return filter.limit ? all.slice(0, filter.limit) : all;
}
