One file per shipped fix. Each `*.mjs` exports a default array of guards:

```js
export default [{
  id: "short-kebab-id",
  why: "One line: what regressed if this fails.",
  run: async ({ read, walk, sources }) => ({ ok: true, detail: [] }),
}];
```

`scripts/guardrails.mjs` loads them all after its built-in guards.

## Reading a migration's functions, triggers and grants

A guard over SQL reads the migrations the way Postgres does, with the readers
`phase-7-launch-locks.mjs` exports: `latestDefinition(ctx, fn)` (the latest
CREATE in any case, with any dollar-quote tag, the whole statement, and the
SECURITY a later ALTER FUNCTION gives it), `triggerProblems(ctx, {...})` (the
latest CREATE TRIGGER on its own table, FOR EACH ROW with no WHEN, or exactly
the WHEN it names as `when`, and no later
DROP, DISABLE or ENABLE REPLICA / ALWAYS) and `grantsToBrowser(ctx, fn)` (a
grant to anon, authenticated or PUBLIC, with or without `public.`, ON ROUTINE,
or ON ALL FUNCTIONS). A regex that finds a body only between `$$` quotes
missed every weakening the sixth security review tried. A lock on a function
or trigger also belongs in `scripts/launch_locks_behaviour.pglite.test.mjs`,
which applies every migration and checks what the database does.

## Realtime channels on the staff shell

`cockpit-live-applicants.mjs` keeps the staff applicant screens live: one
listener, `src/cockpit/hooks/useEmployerLiveSync.ts`, mounted once in each staff
layout (`AppLayout.tsx`: the owner branch and `TeamMemberLayout`). It also fails
on any static channel topic in a hook the cockpit shell mounts. realtime-js
returns the SAME channel object for a repeated topic, so two mounts of a hook
with a fixed topic break each other. If you add a shell-level hook that opens a
channel, give its topic a `useId()` value (see `useMessages.ts`) and add the
file to `SHELL_REALTIME_FILES` in that guard.
