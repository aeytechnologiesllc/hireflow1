export default [
  {
    id: "every-candidate-phase-route-is-gated",
    why:
      "A candidate could open any screening step early just by typing its web address — only " +
      "VoiceInterviewPhase ever checked whether they'd actually reached it. The other eight " +
      "phase routes (application, typing test, quiz, video intro, chat simulation, chat " +
      "interview, sales simulation, portfolio) rendered immediately and started their side " +
      "effects — a quiz's timer, a live session — before anything checked the candidate's real " +
      "application.phase. CandidateStepGate is the one place that check happens now; if a phase " +
      "route's element isn't wrapped in it, that route is unguarded again.",
    async run({ read }) {
      const app = await read("src/App.tsx");
      if (app == null) return { ok: false, detail: ["src/App.tsx is missing"] };

      const routeRe = /<Route\s+path="(\/applications\/:id\/[^"]+\/:stepId)"\s+element=\{([^}]*)\}\s*\/>/g;
      const bad = [];
      let found = 0;
      for (const m of app.matchAll(routeRe)) {
        found += 1;
        const [, routePath, elementSrc] = m;
        if (!elementSrc.includes("CandidateStepGate")) {
          bad.push(`${routePath} → element is not wrapped in <CandidateStepGate>: ${elementSrc.trim()}`);
        }
      }

      if (found === 0) {
        return {
          ok: false,
          detail: ["No /applications/:id/<phase>/:stepId routes matched — the routing pattern in App.tsx changed; update this guard's regex."],
        };
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
