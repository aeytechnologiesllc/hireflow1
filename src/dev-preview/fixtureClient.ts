/**
 * Dev-preview-only. A generic, offline stand-in for the Supabase JS client:
 * implements just enough of the `.from().select().eq()...` query-builder
 * surface, `.auth`, `.channel()`, `.storage` and `.rpc()` for the app's real
 * hooks (src/hooks/*, src/cockpit/hooks/useCockpitData.ts) to run unmodified
 * against in-memory fixture tables instead of the network.
 *
 * This file is never imported from a static, always-reachable path — see
 * src/dev-preview/install.ts and scripts/guards/dev-preview-dev-only.mjs.
 * It does not need to be a faithful PostgREST implementation, only faithful
 * enough that the real hooks resolve believable data without throwing.
 */

export type FixtureRow = Record<string, unknown>;
export type FixtureTables = Record<string, FixtureRow[]>;

export interface FixtureAuthUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `fixture-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

type FilterOp = "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte" | "is" | "like" | "ilike";

function matches(row: FixtureRow, col: string, op: FilterOp, val: unknown): boolean {
  const rowVal = row[col];
  switch (op) {
    case "eq":
      return rowVal === val;
    case "neq":
      return rowVal !== val;
    case "in":
      return Array.isArray(val) && (val as unknown[]).includes(rowVal);
    case "gt":
      return (rowVal as never) > (val as never);
    case "gte":
      return (rowVal as never) >= (val as never);
    case "lt":
      return (rowVal as never) < (val as never);
    case "lte":
      return (rowVal as never) <= (val as never);
    case "is":
      return rowVal === val || (val === null && rowVal == null);
    case "like":
    case "ilike": {
      if (typeof rowVal !== "string") return false;
      const pattern = String(val).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, op === "ilike" ? "i" : undefined).test(rowVal);
    }
    default:
      return true;
  }
}

interface PostgrestResult<T = unknown> {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

/** Thenable query builder — mirrors the chainable shape of
 *  `@supabase/postgrest-js`'s `PostgrestFilterBuilder` closely enough for
 *  every call site in this app, without reimplementing PostgREST. */
class FixtureQueryBuilder implements PromiseLike<PostgrestResult> {
  private filters: Array<{ col: string; op: FilterOp; val: unknown }> = [];
  private singleMode = false;
  private maybeMode = false;
  private countMode: "exact" | "planned" | "estimated" | null = null;
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private mutation: { type: "insert" | "update" | "upsert" | "delete"; payload?: unknown } | null = null;

  constructor(
    private readonly table: string,
    private readonly tables: FixtureTables,
  ) {
    if (!this.tables[table]) this.tables[table] = [];
  }

  select(_columns?: string, opts?: { count?: "exact" | "planned" | "estimated" }) {
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  eq(col: string, val: unknown) { this.filters.push({ col, op: "eq", val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ col, op: "neq", val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ col, op: "in", val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ col, op: "gt", val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ col, op: "gte", val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ col, op: "lt", val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ col, op: "lte", val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ col, op: "is", val }); return this; }
  like(col: string, val: unknown) { this.filters.push({ col, op: "like", val }); return this; }
  ilike(col: string, val: unknown) { this.filters.push({ col, op: "ilike", val }); return this; }
  /** Best-effort: real `.not(col, "is", null)` etc. — close enough for a
   *  read-only fixture to avoid over- or under-filtering visibly. */
  not(col: string, _op: string, val: unknown) { this.filters.push({ col, op: "neq", val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderCol = col; this.orderAsc = opts?.ascending ?? true; return this; }
  limit(n: number) { this.limitN = n; return this; }
  range() { return this; }
  maybeSingle() { this.maybeMode = true; return this; }
  single() { this.singleMode = true; return this; }

  insert(payload: unknown) { this.mutation = { type: "insert", payload }; return this; }
  update(payload: unknown) { this.mutation = { type: "update", payload }; return this; }
  upsert(payload: unknown) { this.mutation = { type: "upsert", payload }; return this; }
  delete() { this.mutation = { type: "delete" }; return this; }

  private applyFilters(rows: FixtureRow[]): FixtureRow[] {
    return rows.filter((row) => this.filters.every((f) => matches(row, f.col, f.op, f.val)));
  }

  private execute(): PostgrestResult {
    const store = this.tables[this.table];

    if (this.mutation) {
      const now = new Date().toISOString();
      if (this.mutation.type === "delete") {
        const removed = this.applyFilters(store);
        this.tables[this.table] = store.filter((r) => !removed.includes(r));
        return { data: removed, error: null };
      }
      const incoming = Array.isArray(this.mutation.payload) ? this.mutation.payload : [this.mutation.payload];
      const written: FixtureRow[] = [];
      for (const payload of incoming as FixtureRow[]) {
        if (this.mutation.type === "insert") {
          const row: FixtureRow = { id: randomId(), created_at: now, updated_at: now, ...payload };
          store.push(row);
          written.push(row);
          continue;
        }
        // update / upsert: merge onto whatever this call's filters already
        // matched (update), or match by id (upsert).
        const targets = this.mutation.type === "upsert"
          ? store.filter((r) => r.id != null && r.id === payload.id)
          : this.applyFilters(store);
        if (targets.length === 0 && this.mutation.type === "upsert") {
          const row: FixtureRow = { id: payload.id ?? randomId(), created_at: now, updated_at: now, ...payload };
          store.push(row);
          written.push(row);
        } else {
          for (const target of targets) {
            Object.assign(target, payload, { updated_at: now });
            written.push(target);
          }
        }
      }
      const data = this.singleMode || this.maybeMode ? written[0] ?? null : written;
      return { data, error: this.singleMode && !written[0] ? { message: "Row not found", code: "PGRST116" } : null };
    }

    let rows = this.applyFilters(store);
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const av = a[col] as never;
        const bv = b[col] as never;
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (this.orderAsc ? 1 : -1);
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);

    if (this.singleMode) {
      return rows[0]
        ? { data: rows[0], error: null, count: this.countMode ? rows.length : undefined }
        : { data: null, error: { message: "Row not found", code: "PGRST116" } };
    }
    if (this.maybeMode) {
      return { data: rows[0] ?? null, error: null, count: this.countMode ? rows.length : undefined };
    }
    return { data: rows, error: null, count: this.countMode ? rows.length : undefined };
  }

  then<TResult1 = PostgrestResult, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve().then(() => this.execute()).then(onfulfilled, onrejected);
  }
}

export interface FixtureClientOptions {
  user: FixtureAuthUser | null;
  tables: FixtureTables;
  rpc?: Record<string, (args: unknown) => unknown>;
}

function buildSession(user: FixtureAuthUser) {
  return {
    access_token: "preview-token",
    refresh_token: "preview-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: buildAuthUser(user),
  };
}

function buildAuthUser(user: FixtureAuthUser) {
  return {
    id: user.id,
    email: user.email,
    app_metadata: {},
    user_metadata: user.user_metadata,
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

/** A tiny inline placeholder image — no network fetch, ever. */
function placeholderDataUrl(label: string): string {
  const initials = label.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#e7e2d6"/><text x="80" y="92" font-family="sans-serif" font-size="56" fill="#6b6152" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function createFixtureSupabaseClient(opts: FixtureClientOptions) {
  let currentUser: FixtureAuthUser | null = opts.user;
  const authListeners: Array<(event: string, session: unknown) => void> = [];

  const auth = {
    async getSession() {
      return { data: { session: currentUser ? buildSession(currentUser) : null }, error: null };
    },
    async getUser() {
      return { data: { user: currentUser ? buildAuthUser(currentUser) : null }, error: null };
    },
    onAuthStateChange(callback: (event: string, session: unknown) => void) {
      authListeners.push(callback);
      queueMicrotask(() => callback(currentUser ? "INITIAL_SESSION" : "SIGNED_OUT", currentUser ? buildSession(currentUser) : null));
      return {
        data: {
          subscription: {
            unsubscribe() {
              const i = authListeners.indexOf(callback);
              if (i >= 0) authListeners.splice(i, 1);
            },
          },
        },
      };
    },
    async signOut() {
      currentUser = null;
      authListeners.forEach((cb) => cb("SIGNED_OUT", null));
      return { error: null };
    },
    async signInWithPassword() {
      return { data: { user: null, session: null }, error: { message: "Sign-in is disabled in the dev preview." } };
    },
    async signUp() {
      return { data: { user: null, session: null }, error: { message: "Sign-up is disabled in the dev preview." } };
    },
    async signInWithOAuth() {
      return { data: { provider: "google", url: null }, error: { message: "OAuth is disabled in the dev preview." } };
    },
  };

  const channel = () => {
    const chan = {
      on() { return chan; },
      subscribe(callback?: (status: string) => void) {
        queueMicrotask(() => callback?.("SUBSCRIBED"));
        return chan;
      },
      unsubscribe: async () => "ok" as const,
    };
    return chan;
  };

  return {
    auth,
    from(table: string) {
      return new FixtureQueryBuilder(table, opts.tables);
    },
    rpc(name: string, args?: unknown) {
      const handler = opts.rpc?.[name];
      const data = handler ? handler(args) : null;
      return Promise.resolve({ data, error: null }) as unknown as PromiseLike<PostgrestResult> & Promise<PostgrestResult>;
    },
    channel,
    removeChannel: async () => "ok" as const,
    getChannels: () => [],
    storage: {
      from(_bucket: string) {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: placeholderDataUrl(path) } };
          },
          async upload() {
            return { data: { path: "preview/upload" }, error: null };
          },
          async download() {
            return { data: null, error: { message: "Downloads are disabled in the dev preview." } };
          },
          async remove() {
            return { data: null, error: null };
          },
          async createSignedUrl() {
            return { data: { signedUrl: "#preview-signed-url" }, error: null };
          },
        };
      },
    },
    functions: {
      async invoke() {
        return { data: null, error: null };
      },
    },
  };
}
