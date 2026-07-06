/**
 * joinClient — thin fetch wrapper for the JOIN.com v2 API (Deno edge functions).
 *
 * Facts encoded here (verified against docs.join.com 2026-07-04):
 *  - Base URL https://api.join.com/v2
 *  - Auth: the RAW token in the Authorization header (NOT "Bearer <token>")
 *  - Error shape: { error: { type, message } }
 *  - Rate limits via x-ratelimit-* headers; 429 → wait and retry once
 *  - Jobs multipost when ONLINE; use PATCH /jobs/{id}/changeStatus (activate/archive are deprecated)
 */

export const JOIN_BASE_URL = "https://api.join.com/v2";

export class JoinApiError extends Error {
  status: number;
  type?: string;
  constructor(status: number, message: string, type?: string) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

async function parseError(res: Response): Promise<JoinApiError> {
  let message = `JOIN API error (HTTP ${res.status})`;
  let type: string | undefined;
  try {
    const body = await res.json();
    if (body?.error?.message) message = body.error.message;
    if (body?.error?.type) type = body.error.type;
  } catch { /* non-JSON error body */ }
  return new JoinApiError(res.status, message, type);
}

export async function joinFetch<T = unknown>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const doFetch = () =>
    fetch(`${JOIN_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: token, // raw token — JOIN does not use the Bearer prefix
        "Content-Type": "application/json",
      },
      body: init.body != null ? JSON.stringify(init.body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 429) {
    // One polite retry after the advertised reset window (cap at 20s).
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? "2");
    await new Promise((r) => setTimeout(r, Math.min(Math.max(reset, 1), 20) * 1000));
    res = await doFetch();
  }
  if (!res.ok) throw await parseError(res);
  // Some PATCH endpoints return bodies like { id }; all JOIN success bodies are JSON.
  return (await res.json()) as T;
}

// ── Typed helpers for the endpoints we use ──────────────────────────────────

export interface JoinRef { id: number; slug?: string; name?: string }
export interface JoinCategoryRef extends JoinRef { subCategories?: JoinRef[] }
export interface JoinOffice {
  id: number;
  name?: string;
  countryIso?: string;
  city?: string;
  isDefault?: boolean;
}

export function getCategories(token: string): Promise<JoinCategoryRef[]> {
  return joinFetch<JoinCategoryRef[]>(token, "/categories?language=en");
}

export function getEmploymentTypes(token: string): Promise<JoinRef[]> {
  return joinFetch<JoinRef[]>(token, "/employmentTypes?language=en");
}

export function getOffices(token: string, params: { countryCode?: string; cityNameLike?: string } = {}): Promise<JoinOffice[]> {
  const q = new URLSearchParams({ pageSize: "50" });
  if (params.countryCode) q.set("countryCode", params.countryCode);
  if (params.cityNameLike) q.set("cityNameLike", params.cityNameLike);
  return joinFetch<JoinOffice[]>(token, `/offices?${q.toString()}`);
}

export function createOffice(token: string, office: { countryIso: string; city: string; name?: string }): Promise<{ id: number }> {
  return joinFetch<{ id: number }>(token, "/offices", { method: "POST", body: office });
}

export function createJob(token: string, payload: Record<string, unknown>): Promise<{ id: number }> {
  return joinFetch<{ id: number }>(token, "/jobs", { method: "POST", body: payload });
}

export function changeJobStatus(token: string, joinJobId: number | string, status: "ONLINE" | "OFFLINE" | "ARCHIVED"): Promise<{ id: number }> {
  return joinFetch<{ id: number }>(token, `/jobs/${joinJobId}/changeStatus`, { method: "PATCH", body: { status } });
}

export function getApplications(
  token: string,
  params: { jobExternalId?: string; updatedAtGte?: string; page?: number; pageSize?: number },
): Promise<unknown[]> {
  const q = new URLSearchParams({
    pageSize: String(params.pageSize ?? 50),
    page: String(params.page ?? 1),
  });
  if (params.jobExternalId) q.set("jobExternalId", params.jobExternalId);
  if (params.updatedAtGte) q.set("updatedAtGte", params.updatedAtGte);
  return joinFetch<unknown[]>(token, `/applications?${q.toString()}`);
}
