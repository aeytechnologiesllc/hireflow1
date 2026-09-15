One file per shipped fix. Each `*.mjs` exports a default array of guards:

```js
export default [{
  id: "short-kebab-id",
  why: "One line: what regressed if this fails.",
  run: async ({ read, walk, sources }) => ({ ok: true, detail: [] }),
}];
```

`scripts/guardrails.mjs` loads them all after its built-in guards.
