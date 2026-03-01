// src/api.ts — fetch wrappers for the Express backend

const BASE = '/api';

export interface JobStartResponse {
  jobId: string;
  status: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: 'running' | 'done' | 'error';
  log: string[];
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number;
}

export interface LegRecord {
  id: string;
  site: string;
  player: string;
  team: string | null;
  stat: string;
  line: number;
  league: string;
  book: string;
  trueProb: number;
  edge: number;
  legEv: number;
  startTime: string | null;
  isNonStandardOdds?: boolean;
  [key: string]: unknown;
}

export interface CardLeg {
  pick: LegRecord;
  side: string;
}

export interface CardRecord {
  site: string;
  flexType: string;
  cardEv: number;
  winProbCash: number;
  winProbAny: number;
  avgProb: number;
  avgEdgePct: number;
  legs?: CardLeg[];
  legIds?: string[];
  [key: string]: unknown;
}

export interface CardsResponse {
  count: number;
  cards: CardRecord[];
}

export interface LegsResponse {
  count: number;
  legs: LegRecord[];
}

export async function runOptimizer(site: 'pp' | 'ud' | 'both'): Promise<JobStartResponse> {
  const res = await fetch(`${BASE}/run/${site}`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<JobStartResponse>;
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${BASE}/status/${jobId}`);
  if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
  return res.json() as Promise<JobStatusResponse>;
}

export async function getCards(params?: {
  site?: string;
  minEv?: number;
  slip?: string;
}): Promise<CardsResponse> {
  const qs = new URLSearchParams();
  if (params?.site) qs.set('site', params.site);
  if (params?.minEv) qs.set('minEv', String(params.minEv));
  if (params?.slip) qs.set('slip', params.slip);
  const res = await fetch(`${BASE}/cards?${qs}`);
  if (!res.ok) throw new Error(`Cards fetch failed: ${res.statusText}`);
  return res.json() as Promise<CardsResponse>;
}

export async function getLegs(params?: {
  site?: string;
  minEdge?: number;
  league?: string;
}): Promise<LegsResponse> {
  const qs = new URLSearchParams();
  if (params?.site) qs.set('site', params.site);
  if (params?.minEdge) qs.set('minEdge', String(params.minEdge));
  if (params?.league) qs.set('league', params.league);
  const res = await fetch(`${BASE}/legs?${qs}`);
  if (!res.ok) throw new Error(`Legs fetch failed: ${res.statusText}`);
  return res.json() as Promise<LegsResponse>;
}
