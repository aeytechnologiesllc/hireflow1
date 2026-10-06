#!/usr/bin/env node
/**
 * The staff applicant screens update themselves as applicants act.
 *
 * On 2026-10-05 the owner watched his own test applicant from the staff tab
 * and saw "Nobody has applied yet." for the whole run, then reloaded to follow
 * every step: nothing on the staff side listened for changes to
 * public.applications, and the list sat on a 5-minute cache. These checks run
 * the real src/cockpit/hooks/useEmployerLiveSync.ts against a fake realtime
 * client and a real TanStack QueryClient, and prove that:
 *
 *  - each mounted instance opens its OWN channel (realtime-js hands back the
 *    same channel for a repeated topic), with the applications binding added
 *    before subscribe();
 *  - a burst of row changes becomes one refetch round, and a change that
 *    lands mid-round gets exactly one more round after it, never two at once;
 *  - every SUBSCRIBED (first join and each rejoin after a dropped socket)
 *    runs a catch-up round that does not cancel a fetch already under way;
 *  - an UPDATE is merged into the cached row at once without losing the
 *    joined job / profile, and a stale, truncated or unknown payload is
 *    ignored; DELETE drops the row; INSERT waits for the refetch;
 *  - cleanup removes the channel and nothing fires afterwards;
 *  - wave 2: the test record (assessment_sessions) has its OWN per-instance
 *    channel, so a missing or failing table can never stall the applicant
 *    list; an attempt's UPDATE lands in every cached session list at once
 *    (without widening a narrow list), and refetches only that attempt's
 *    events; its SUBSCRIBED catch-up refetches every events query on screen;
 *  - wave 4: one applicant's own attempts (the open profile's) refetch only
 *    for THEIR attempts, never for another applicant's heartbeat; booked
 *    interviews have a third per-instance channel that refreshes ["interviews"].
 *
 * The hook file imports "@/..." aliases, so it is bundled with esbuild (a Vite
 * dependency) with those three modules stubbed; nothing else is mocked.
 *
 * Run with: node scripts/employer_live_sync.test.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STUBS = {
  "@/integrations/supabase/client": "export const supabase = {};",
  "@/hooks/useAuth": "export const useAuth = () => ({ user: null, role: null });",
  "@/hooks/useSchemaMode": "export const useSchemaMode = () => ({ data: undefined });",
  "@/hooks/useApplications": "export {};",
};

const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/cockpit/hooks/useEmployerLiveSync.ts";\n' +
      'export { QueryClient, QueryObserver } from "@tanstack/react-query";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
  plugins: [
    {
      name: "stub-aliases",
      setup(b) {
        b.onResolve({ filter: /^@\// }, (args) => {
          if (!(args.path in STUBS)) throw new Error(`no stub for ${args.path}`);
          return { path: args.path, namespace: "stub" };
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    },
  ],
});
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const {
  QueryClient,
  QueryObserver,
  LIVE_SYNC_QUERY_KEYS,
  LIVE_SYNC_SESSION_KEYS,
  LIVE_SYNC_COALESCE_MS,
  applyApplicationChange,
  applySessionChange,
  createLiveSyncCoalescer,
  startEmployerLiveSync,
} = mod;

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok    ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

/** Settles every pending promise callback. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Manual timers, so nothing depends on wall-clock time. */
function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) {
      seq += 1;
      pending.set(seq, { fn, ms });
      return seq;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    get count() {
      return pending.size;
    },
    delays() {
      return [...pending.values()].map((t) => t.ms);
    },
    async fire() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, t] of due) t.fn();
      await settle();
    },
  };
}

/** A realtime client that records what callers do to it, like realtime-js 2.87.1. */
function fakeClient() {
  const channels = new Map();
  const log = [];
  const removed = [];
  return {
    log,
    removed,
    channels,
    channel(topic) {
      if (channels.has(topic)) return channels.get(topic); // realtime-js reuses a topic
      const chan = {
        topic,
        bindings: [],
        subscribed: false,
        subscribeCallback: null,
        on(type, filter, callback) {
          log.push(`on:${topic}`);
          if (chan.subscribed) chan.boundAfterSubscribe = true;
          chan.bindings.push({ type, filter, callback });
          return chan;
        },
        subscribe(callback) {
          log.push(`subscribe:${topic}`);
          chan.subscribed = true;
          chan.subscribeCallback = callback;
          return chan;
        },
        emit(payload) {
          for (const b of chan.bindings) b.callback(payload);
        },
        status(s) {
          chan.subscribeCallback?.(s);
        },
      };
      channels.set(topic, chan);
      return chan;
    },
    async removeChannel(chan) {
      removed.push(chan.topic);
      channels.delete(chan.topic);
      return "ok";
    },
  };
}

/** A real QueryClient whose invalidateQueries calls are recorded and can be held open. */
function spyClient({ hold = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls = [];
  const gates = [];
  const real = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = (filters, options) => {
    calls.push({ key: JSON.stringify(filters.queryKey), cancelRefetch: options?.cancelRefetch });
    const done = real(filters, options);
    if (!hold) return done;
    return new Promise((resolve) => gates.push(() => done.then(resolve)));
  };
  return {
    queryClient,
    calls,
    openGates() {
      gates.splice(0).forEach((g) => g());
    },
  };
}

const USER = "e32a8a14-0000-4000-8000-000000000001";
const job = { id: "02f91311-a3a4-461c-a52d-5893cef7a9f3", title: "Customer Support Chat Agent", employer_id: USER };
const row = (id, extra = {}) => ({
  id,
  job_id: job.id,
  candidate_id: `cand-${id}`,
  status: "reviewing",
  phase: "quiz",
  notes: { applicationAnswers: { q1: "yes" } },
  updated_at: "2026-10-05T15:46:31.000+00:00",
  jobs: job,
  profiles: { user_id: `cand-${id}`, full_name: `Applicant ${id}` },
  ...extra,
});
const update = (next, extra = {}) => ({
  eventType: "UPDATE",
  schema: "public",
  table: "applications",
  commit_timestamp: "2026-10-05T15:48:18Z",
  errors: null,
  new: next,
  old: { id: next.id },
  ...extra,
});

console.log("one channel per mounted instance, bound before subscribe");
{
  const client = fakeClient();
  const { queryClient } = spyClient();
  const timers = fakeTimers();
  const stopA = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const stopB = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r7:", timers });
  const all = [...client.channels.keys()];
  const topics = all.filter((t) => t.startsWith(`employer-live-${USER}-`));
  const sessionTopics = all.filter((t) => t.startsWith(`employer-sessions-${USER}-`));
  const interviewTopics = all.filter((t) => t.startsWith(`employer-interviews-${USER}-`));
  assert(topics.length === 2, `two mounts open two applications channels (got ${topics.length}: ${topics.join(", ")})`);
  assert(sessionTopics.length === 2, `…two test-record channels of their own (got ${all.join(", ")})`);
  assert(interviewTopics.length === 2 && all.length === 6, `…and two interview channels of their own (got ${all.join(", ")})`);
  assert(
    [...topics, ...sessionTopics, ...interviewTopics].every((t) => t.endsWith(":r1:") || t.endsWith(":r7:")),
    "every topic carries its instance id",
  );
  const ia = client.channels.get(interviewTopics[0]);
  const iff = ia.bindings[0]?.filter ?? {};
  assert(
    !ia.boundAfterSubscribe && ia.bindings.length === 1 && ia.bindings[0].type === "postgres_changes" && iff.event === "*" && iff.schema === "public" && iff.table === "interviews" && iff.filter === undefined,
    "the interview channel listens to every change on public.interviews, bound before subscribe() (RLS scopes delivery)",
  );
  const [a, b] = topics.map((t) => client.channels.get(t));
  const [sa, sb] = sessionTopics.map((t) => client.channels.get(t));
  assert(!sa.boundAfterSubscribe && !sb.boundAfterSubscribe, "no test-record binding is added after subscribe()");
  const sf = sa.bindings[0]?.filter ?? {};
  assert(
    sa.bindings.length === 1 && sa.bindings[0].type === "postgres_changes" && sf.event === "*" && sf.schema === "public" &&
      sf.table === "assessment_sessions" && sf.filter === undefined,
    "the test-record channel listens to every change on public.assessment_sessions (RLS scopes delivery)",
  );
  assert(!a.boundAfterSubscribe && !b.boundAfterSubscribe, "no binding is added after subscribe()");
  assert(
    client.log.indexOf(`on:${a.topic}`) < client.log.indexOf(`subscribe:${a.topic}`),
    "the applications binding comes before subscribe()",
  );
  const f = a.bindings[0]?.filter ?? {};
  assert(
    a.bindings.length === 1 && a.bindings[0].type === "postgres_changes" && f.event === "*" &&
      f.schema === "public" && f.table === "applications" && f.filter === undefined,
    "listens to every change on public.applications, unfiltered (RLS scopes delivery)",
  );
  stopA();
  stopB();
  await settle();
  assert(client.removed.length === 6 && client.channels.size === 0, "cleanup removes all six channels");
}

console.log("\nSUBSCRIBED runs a catch-up round that never cancels a fetch in flight");
{
  const client = fakeClient();
  const { queryClient, calls } = spyClient();
  const timers = fakeTimers();
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const chan = [...client.channels.values()][0];
  chan.status("SUBSCRIBED");
  assert(timers.count === 1 && timers.delays()[0] === LIVE_SYNC_COALESCE_MS, `one round is armed for ${LIVE_SYNC_COALESCE_MS} ms`);
  await timers.fire();
  const keys = calls.map((c) => c.key);
  assert(
    LIVE_SYNC_QUERY_KEYS.every((k) => keys.includes(JSON.stringify(k))) && calls.length === LIVE_SYNC_QUERY_KEYS.length,
    `invalidates every staff key once: ${keys.join(" ")}`,
  );
  for (const want of ['["applications"]', '["activity-feed"]', '["jobs","employer"]', '["advanced-analytics"]', '["careers-traffic"]', '["new-applicants-count"]']) {
    assert(keys.includes(want), `catch-up covers ${want}`);
  }
  assert(calls.every((c) => c.cancelRefetch === false), "a catch-up round uses cancelRefetch:false");

  calls.length = 0;
  chan.status("CLOSED");
  chan.status("CHANNEL_ERROR");
  await timers.fire();
  assert(calls.length === 0, "CLOSED / CHANNEL_ERROR do not refetch");
  chan.status("SUBSCRIBED"); // realtime-js fires this again after every rejoin
  await timers.fire();
  assert(calls.length === LIVE_SYNC_QUERY_KEYS.length, "a rejoin after a dropped socket runs another catch-up round");
  stop();
}

console.log("\na burst of changes is one round; a change mid-round gets exactly one more");
{
  const client = fakeClient();
  const { queryClient, calls, openGates } = spyClient({ hold: true });
  const timers = fakeTimers();
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const chan = [...client.channels.values()][0];
  for (let i = 0; i < 5; i += 1) chan.emit(update({ id: "a1", phase: "step_typing" }));
  assert(timers.count === 1, "five events inside the window arm one timer");
  await timers.fire();
  assert(calls.length === LIVE_SYNC_QUERY_KEYS.length, "...and run one round");
  assert(calls.every((c) => c.cancelRefetch === true), "a real change uses cancelRefetch:true (the new row must win)");

  // The round is still in flight (gates closed). Two more changes arrive.
  calls.length = 0;
  chan.emit(update({ id: "a1", phase: "step_chat" }));
  chan.emit(update({ id: "a1", phase: "step_interview" }));
  assert(timers.count === 0, "no second round starts while one is in flight");
  openGates();
  await settle();
  assert(timers.count === 1, "when the round finishes, exactly one more is armed");
  await timers.fire();
  assert(calls.length === LIVE_SYNC_QUERY_KEYS.length, "...and it runs once for both late changes");
  openGates();
  await settle();
  assert(timers.count === 0, "then it goes quiet");
  stop();
}

console.log("\nan UPDATE lands in the cached list at once");
{
  const client = fakeClient();
  const { queryClient } = spyClient();
  const timers = fakeTimers();
  const listKey = ["applications", "employer", USER];
  const before = [row("a1"), row("a2")];
  queryClient.setQueryData(listKey, before);
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const chan = [...client.channels.values()][0];

  // The candidate's typing result lands: the payload is the full row, without the joins.
  const { jobs: _j, profiles: _p, ...columns } = row("a1");
  chan.emit(update({ ...columns, phase: "step_chat", updated_at: "2026-10-05T15:51:46.000+00:00" }));
  const after = queryClient.getQueryData(listKey);
  assert(after !== before, "the list is replaced, so every reader re-renders");
  assert(after[0].phase === "step_chat", "the changed column shows before any refetch");
  assert(after[0].jobs === job && after[0].profiles?.full_name === "Applicant a1", "the joined job and profile are kept");
  assert(after[1] === before[1], "other rows keep their identity");
  stop();
}

console.log("\napplyApplicationChange refuses anything that could roll the list back");
{
  const rows = [row("a1"), row("a2")];
  const same = (r, msg) => assert(r === rows, msg);
  same(applyApplicationChange(rows, update({ id: "a1", phase: "quiz", updated_at: "2026-10-05T15:40:00Z" })), "an UPDATE older than the cached row is ignored");
  same(applyApplicationChange(rows, update({ id: "a1", phase: "x" }, { errors: ["Error 413: Payload Too Large"] })), "a payload the server truncated is ignored");
  same(applyApplicationChange(rows, update({ id: "zz", phase: "x" })), "an UPDATE for a row not in the list waits for the refetch");
  same(applyApplicationChange(rows, { ...update({ id: "a3" }), eventType: "INSERT", new: row("a3") }), "an INSERT waits for the refetch (it needs the job and profile)");
  same(applyApplicationChange(rows, { ...update({ id: "a1" }), eventType: "DELETE", new: {}, old: { id: "zz" } }), "a DELETE of a row not in the list changes nothing");
  assert(applyApplicationChange(undefined, update({ id: "a1" })) === undefined, "nothing cached yet: nothing written");
  const dropped = applyApplicationChange(rows, { ...update({ id: "a1" }), eventType: "DELETE", new: {}, old: { id: "a1" } });
  assert(dropped.length === 1 && dropped[0].id === "a2", "a DELETE drops the row");
  const partial = applyApplicationChange(rows, update({ id: "a2", status: "pending", notes: undefined }));
  assert(partial[1].status === "pending" && partial[1].notes?.applicationAnswers?.q1 === "yes", "a column the payload does not carry keeps its cached value");
}

console.log("\ncleanup stops everything");
{
  const client = fakeClient();
  const { queryClient, calls } = spyClient();
  const timers = fakeTimers();
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const chan = [...client.channels.values()][0];
  chan.emit(update({ id: "a1" }));
  assert(timers.count === 1, "a change arms a round");
  stop();
  assert(timers.count === 0, "cleanup clears the armed round");
  chan.emit(update({ id: "a1" }));
  chan.status("SUBSCRIBED");
  await timers.fire();
  assert(calls.length === 0, "nothing refetches after cleanup");
  assert(client.removed.length === 3, "all three channels are removed");
}

console.log("\nthe test record: an attempt's change lands at once and refetches only its own events");
{
  const client = fakeClient();
  const { queryClient, calls } = spyClient();
  const timers = fakeTimers();
  const appKey = ["assessment-sessions", "application", "app-1"];
  const jobsKey = ["assessment-sessions", "jobs", job.id];
  const wide = { id: "s1", application_id: "app-1", step_id: "quiz", status: "active", progress: { current_index: 1 }, grading: null, updated_at: "2026-10-06T15:50:00Z" };
  const narrow = { id: "s1", application_id: "app-1", step_id: "quiz", status: "active", progress: { current_index: 1 }, updated_at: "2026-10-06T15:50:00Z" };
  const other = { id: "s2", application_id: "app-2", step_id: "step_chat", status: "active", progress: {}, updated_at: "2026-10-06T15:40:00Z" };
  queryClient.setQueryData(appKey, [wide]);
  queryClient.setQueryData(jobsKey, [narrow, other]);
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const sessions = [...client.channels.values()].find((c) => c.topic.startsWith("employer-sessions-"));
  const apps = [...client.channels.values()].find((c) => c.topic.startsWith("employer-live-"));

  const next = { ...wide, progress: { current_index: 2 }, grading: { secret: true }, last_activity_at: "2026-10-06T15:51:00Z", updated_at: "2026-10-06T15:51:00Z" };
  sessions.emit({ eventType: "UPDATE", schema: "public", table: "assessment_sessions", errors: null, new: next, old: { id: "s1" } });
  const a1 = queryClient.getQueryData(appKey);
  const j1 = queryClient.getQueryData(jobsKey);
  assert(a1[0].progress.current_index === 2 && j1[0].progress.current_index === 2, "the new question shows in every cached list before any refetch");
  assert(!("grading" in j1[0]) && !("last_activity_at" in j1[0]), "a narrow list is not widened with columns it never selected");
  assert(j1[1] === other, "other attempts keep their identity");
  assert(timers.count === 1, "one round is armed");
  await timers.fire();
  const keys = calls.map((c) => c.key);
  assert(keys.includes('["assessment-sessions"]'), "the session lists refetch");
  assert(keys.includes('["assessment-events","s1"]') && keys.includes('["assessment-events","integrity","app-1"]'), "only that attempt's events (and its applicant's integrity list) refetch");
  assert(!keys.includes('["assessment-events"]') && !keys.some((k) => k.startsWith('["applications"')), "nothing broader refetches for one attempt");
  assert(calls.every((c) => c.cancelRefetch === true), "a real change uses cancelRefetch:true");

  calls.length = 0;
  const stale = { ...wide, progress: { current_index: 0 }, updated_at: "2026-10-06T15:30:00Z" };
  sessions.emit({ eventType: "UPDATE", schema: "public", table: "assessment_sessions", errors: null, new: stale, old: { id: "s1" } });
  assert(queryClient.getQueryData(appKey)[0].progress.current_index === 2, "an older update never rolls the list back");
  await timers.fire();

  calls.length = 0;
  sessions.status("SUBSCRIBED");
  await timers.fire();
  const catchUp = calls.map((c) => c.key);
  assert(catchUp.includes('["assessment-sessions"]') && catchUp.includes('["assessment-events"]'), "a (re)join catches up every session list and every open timeline");
  assert(calls.every((c) => c.cancelRefetch === false), "the catch-up never cancels a fetch in flight");

  calls.length = 0;
  sessions.status("CHANNEL_ERROR");
  apps.emit(update({ id: "a1", phase: "step_chat" }));
  await timers.fire();
  assert(calls.length === LIVE_SYNC_QUERY_KEYS.length, "a failing test-record channel never stalls the applicant list");
  stop();
  sessions.emit({ eventType: "UPDATE", schema: "public", table: "assessment_sessions", errors: null, new: next, old: { id: "s1" } });
  assert(timers.count === 0, "nothing is armed after cleanup");
}

console.log("\nan open profile refetches its attempts only for its own applicant");
{
  const client = fakeClient();
  const { queryClient, calls } = spyClient();
  const timers = fakeTimers();
  // A real observer on the profile's key, counting how often it downloads.
  let fetches = 0;
  const profileKey = ["assessment-sessions", "application", "app-mine"];
  const mine = { id: "s-mine", application_id: "app-mine", step_id: "quiz", status: "active", progress: {}, context: { big: true }, updated_at: "2026-10-06T15:50:00Z" };
  queryClient.setQueryData(profileKey, [mine]);
  const observer = new QueryObserver(queryClient, {
    queryKey: profileKey,
    queryFn: async () => {
      fetches += 1;
      return queryClient.getQueryData(profileKey);
    },
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const sessions = [...client.channels.values()].find((c) => c.topic.startsWith("employer-sessions-"));
  const heartbeat = (id, appId, minute) => ({
    eventType: "UPDATE",
    schema: "public",
    table: "assessment_sessions",
    errors: null,
    new: { id, application_id: appId, step_id: "quiz", status: "active", last_activity_at: `2026-10-06T15:5${minute}:00Z`, updated_at: `2026-10-06T15:5${minute}:00Z` },
    old: { id },
  });
  for (let i = 1; i <= 5; i += 1) {
    sessions.emit(heartbeat("s-other", "app-other", i));
    await timers.fire();
    await settle();
  }
  const before = fetches;
  assert(fetches === 0, `five rounds of another applicant's heartbeats download the open profile ${fetches} times (want 0)`);
  sessions.emit(heartbeat("s-mine", "app-mine", 6));
  await timers.fire();
  await settle();
  assert(fetches === before + 1, "one of THEIR attempts refetches it once");
  assert(queryClient.getQueryData(profileKey)[0].updated_at === "2026-10-06T15:56:00Z", "…and the change is in it at once (merged before the refetch)");
  sessions.emit({ eventType: "DELETE", schema: "public", table: "assessment_sessions", errors: null, new: {}, old: { id: "s-nobody" } });
  await timers.fire();
  await settle();
  assert(fetches === before + 1, "a DELETE of an attempt nobody on screen holds refetches nothing");
  sessions.emit({ eventType: "DELETE", schema: "public", table: "assessment_sessions", errors: null, new: {}, old: { id: "s-mine" } });
  await timers.fire();
  await settle();
  assert(queryClient.getQueryData(profileKey).length === 0 && (fetches === before + 2), "a DELETE of one of theirs drops it and refetches the profile");
  calls.length = 0;
  sessions.status("SUBSCRIBED");
  await timers.fire();
  assert(calls.some((c) => c.key === '["assessment-sessions"]'), "the catch-up still refreshes every session list, the profile's included");
  stop();
  unsubscribe();
}

console.log("\nbooked interviews stay live");
{
  const client = fakeClient();
  const { queryClient, calls } = spyClient();
  const timers = fakeTimers();
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const interviews = [...client.channels.values()].find((c) => c.topic.startsWith("employer-interviews-"));
  for (let i = 0; i < 3; i += 1) {
    interviews.emit({ eventType: "UPDATE", schema: "public", table: "interviews", errors: null, new: { id: "i1", application_id: "a1", scheduled_at: "2026-10-08T15:00:00Z" }, old: { id: "i1" } });
  }
  await timers.fire();
  const keys = calls.map((c) => c.key);
  assert(keys.length === 1 && keys[0] === '["interviews"]', `a burst of interview changes refreshes ["interviews"] once (got ${keys.join(" ")})`);
  assert(calls[0].cancelRefetch === true, "…as a real change");
  calls.length = 0;
  interviews.status("SUBSCRIBED");
  await timers.fire();
  assert(calls.length === 1 && calls[0].key === '["interviews"]' && calls[0].cancelRefetch === false, "a (re)join catches up the interviews");
  calls.length = 0;
  interviews.status("CHANNEL_ERROR");
  const apps = [...client.channels.values()].find((c) => c.topic.startsWith("employer-live-"));
  apps.emit(update({ id: "a1", phase: "step_chat" }));
  await timers.fire();
  assert(calls.length === LIVE_SYNC_QUERY_KEYS.length && !calls.some((c) => c.key === '["interviews"]'), "a failing interview channel never stalls the applicant list");
  stop();
}

console.log("\napplySessionChange");
{
  const rows = [{ id: "s1", status: "active", updated_at: "2026-10-06T15:50:00Z" }];
  const ev = (eventType, n, o = {}) => ({ eventType, errors: null, new: n, old: o });
  assert(applySessionChange(rows, ev("INSERT", { id: "s9" })) === rows, "an INSERT waits for the refetch (it decides which list it belongs to)");
  assert(applySessionChange(rows, ev("UPDATE", { id: "zz", status: "completed" })) === rows, "an UPDATE for an attempt not in the list changes nothing");
  assert(applySessionChange(rows, { ...ev("UPDATE", { id: "s1", status: "completed" }), errors: ["too large"] }) === rows, "a truncated payload is ignored");
  assert(applySessionChange(rows, ev("DELETE", {}, { id: "s1" })).length === 0, "a DELETE drops the attempt");
  assert(applySessionChange(undefined, ev("UPDATE", { id: "s1" })) === undefined, "nothing cached: nothing written");
  assert(LIVE_SYNC_SESSION_KEYS.some((k) => JSON.stringify(k) === '["assessment-sessions"]'), "the session keys are exported for the hooks to share");
}

console.log("\nthe coalescer on its own");
{
  const timers = fakeTimers();
  const runs = [];
  const c = createLiveSyncCoalescer((force) => runs.push(force), 250, timers);
  c.schedule(false);
  c.schedule(true);
  c.schedule(false);
  await timers.fire();
  assert(runs.length === 1 && runs[0] === true, "one run per window; force if any caller was a real change");
  c.schedule(false);
  await timers.fire();
  assert(runs.length === 2 && runs[1] === false, "a window with only catch-ups does not force");
  const failing = createLiveSyncCoalescer(() => { throw new Error("network"); }, 250, timers);
  failing.schedule(true);
  await timers.fire();
  failing.schedule(true);
  assert(timers.count === 1, "a failed round does not wedge the next one");
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
