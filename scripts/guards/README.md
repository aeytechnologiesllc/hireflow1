One file per shipped fix. Each `*.mjs` exports a default array of guards:

```js
export default [{
  id: "short-kebab-id",
  why: "One line: what regressed if this fails.",
  run: async ({ read, walk, sources }) => ({ ok: true, detail: [] }),
}];
```

`scripts/guardrails.mjs` loads them all after its built-in guards.

## Realtime channels on the staff shell

`cockpit-live-applicants.mjs` keeps the staff applicant screens live: one
listener, `src/cockpit/hooks/useEmployerLiveSync.ts`, mounted once in each staff
layout (`AppLayout.tsx`: the owner branch and `TeamMemberLayout`). It also fails
on any static channel topic in a hook the cockpit shell mounts. realtime-js
returns the SAME channel object for a repeated topic, so two mounts of a hook
with a fixed topic break each other. If you add a shell-level hook that opens a
channel, give its topic a `useId()` value (see `useMessages.ts`) and add the
file to `SHELL_REALTIME_FILES` in that guard.
