/**
 * Chainable stub for the `@/lib/supabase` client.
 *
 * The mocking boundary for this codebase is the supabase client, not the
 * functions that call it (docs/ROADMAP.md §5: "mock at the `supabase` client
 * boundary, not per-function"). Two reasons it has to live here rather than in
 * each test:
 *
 *  1. `@/lib/supabase` transitively imports react-native, which vitest cannot
 *     parse. Every suite that touches a lib module doing I/O must `vi.mock` it,
 *     and hand-rolling a builder per suite guarantees they drift.
 *  2. The real builder is a thenable that returns itself from every filter
 *     method, so the shape under test is the *chain* — `.select().eq().order()
 *     .order().range()` — not any single call. Getting that wrong produces
 *     tests that pass against a stub the production code could never use.
 *
 * Usage:
 *
 *   const sb = createSupabaseMock();
 *   vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
 *   sb.queueData([{ id: "1" }]);
 *   // ... exercise code under test
 *   expect(sb.queries[0].chain.map((c) => c.method))
 *     .toEqual(["select", "eq", "order", "order", "range"]);
 */
import { vi } from "vitest";

export interface QueryError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface QueryResult<T = unknown> {
  data: T | null;
  error: QueryError | null;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface RecordedQuery {
  table: string;
  chain: RecordedCall[];
}

/**
 * Every builder method the app chains onto a query. All of them return the
 * builder; only awaiting it produces a result. Extend this list rather than
 * reaching for a Proxy — an explicit list makes an unexpected method a loud
 * TypeError instead of a silently-passing chain.
 */
const BUILDER_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "not",
  "or",
  "filter",
  "match",
  "order",
  "range",
  "limit",
  "single",
  "maybeSingle",
  "returns",
  "abortSignal",
] as const;

const DEFAULT_PUBLIC_URL_BASE = "https://test.supabase.co/storage/v1/object/public";

export interface SupabaseMock {
  /** Drop-in replacement for the `supabase` export. */
  client: Record<string, unknown>;
  /** Every query built since the last `reset()`, in construction order. */
  queries: RecordedQuery[];
  /** Queue a successful result. Consumed FIFO, one per awaited query. */
  queueData<T>(data: T): void;
  /** Queue a failed result. `data` is null, matching PostgREST. */
  queueError(error: QueryError | string): void;
  /** Result handed out once the queue is empty. Defaults to `{ data: [], error: null }`. */
  setDefaultResult(result: QueryResult): void;
  /** Public-URL prefix used by the storage stub. */
  publicUrlBase: string;
  storage: {
    getPublicUrl: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    /** Bucket names passed to `storage.from()`, in call order. */
    buckets: string[];
  };
  /** Clear queued results, recorded queries and storage call history. */
  reset(): void;
}

export function createSupabaseMock(): SupabaseMock {
  const queue: QueryResult[] = [];
  const queries: RecordedQuery[] = [];
  let defaultResult: QueryResult = { data: [], error: null };

  function nextResult(): QueryResult {
    return queue.length > 0 ? queue.shift()! : defaultResult;
  }

  function makeBuilder(table: string) {
    const record: RecordedQuery = { table, chain: [] };
    queries.push(record);

    const builder: Record<string, unknown> = {
      // Resolved lazily, at await time, so the FIFO order of queued results
      // matches the order the code under test actually awaits its queries.
      then(
        onFulfilled?: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        return Promise.resolve(nextResult()).then(onFulfilled, onRejected);
      },
    };

    for (const method of BUILDER_METHODS) {
      builder[method] = (...args: unknown[]) => {
        record.chain.push({ method, args });
        return builder;
      };
    }

    return builder;
  }

  const storageBuckets: string[] = [];
  const getPublicUrl = vi.fn((path: string, ...rest: unknown[]) => {
    // The real client accepts a second `{ transform }` argument that returns a
    // /render/image/ URL. That endpoint is a paid feature and 403s on this
    // project (CLAUDE.md), so the stub deliberately ignores it — a test can
    // assert `getPublicUrl.mock.calls.every(c => c.length === 1)` to prove the
    // production code never asks for one.
    void rest;
    const bucket = storageBuckets[storageBuckets.length - 1] ?? "moment-photos";
    return { data: { publicUrl: `${mock.publicUrlBase}/${bucket}/${path}` } };
  });
  const upload = vi.fn(async () => ({ data: { path: "uploaded" }, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));

  const mock: SupabaseMock = {
    client: {
      from: vi.fn((table: string) => makeBuilder(table)),
      rpc: vi.fn(() => makeBuilder("__rpc__")),
      storage: {
        from: vi.fn((bucket: string) => {
          storageBuckets.push(bucket);
          return { getPublicUrl, upload, remove };
        }),
      },
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    },
    queries,
    queueData(data) {
      queue.push({ data, error: null });
    },
    queueError(error) {
      queue.push({
        data: null,
        error: typeof error === "string" ? { message: error } : error,
      });
    },
    setDefaultResult(result) {
      defaultResult = result;
    },
    publicUrlBase: DEFAULT_PUBLIC_URL_BASE,
    storage: { getPublicUrl, upload, remove, buckets: storageBuckets },
    reset() {
      queue.length = 0;
      queries.length = 0;
      storageBuckets.length = 0;
      defaultResult = { data: [], error: null };
      getPublicUrl.mockClear();
      upload.mockClear();
      remove.mockClear();
      (mock.client.from as ReturnType<typeof vi.fn>).mockClear();
      (
        (mock.client.storage as { from: ReturnType<typeof vi.fn> }).from
      ).mockClear();
    },
  };

  return mock;
}
