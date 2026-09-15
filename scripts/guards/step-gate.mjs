// Maps each gated route's URL phase segment to the step `type` that route's
// CandidateStepGate must pass as its `phase` prop. Kept here (not derived
// from App.tsx) so a route quietly losing its expected type — not just
// losing the gate wrapper entirely — still fails this guard.
const EXPECTED_PHASE_BY_SEGMENT = {
  application: "application",
  "typing-test": "typing_test",
  quiz: "quiz",
  "video-intro": "video_intro",
  "chat-simulation": "chat_simulation",
  "chat-interview": "chat_interview",
  "sales-simulation": "sales_simulation",
  "voice-interview": "voice_interview",
  portfolio: "portfolio_upload",
};

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
      "route's element isn't wrapped in it, or is wrapped without the `phase` prop naming this " +
      "route's own step type (or with the wrong one), that route is unguarded again — a real " +
      "stepId from a DIFFERENT phase, or any unrecognized stepId, would otherwise sail through.",
    async run({ read }) {
      const app = await read("src/App.tsx");
      if (app == null) return { ok: false, detail: ["src/App.tsx is missing"] };

      const routeRe = /<Route\s+path="(\/applications\/:id\/([^"/]+)\/:stepId)"\s+element=\{([^}]*)\}\s*\/>/g;
      const bad = [];
      let found = 0;
      for (const m of app.matchAll(routeRe)) {
        found += 1;
        const [, routePath, segment, elementSrc] = m;

        if (!elementSrc.includes("CandidateStepGate")) {
          bad.push(`${routePath} → element is not wrapped in <CandidateStepGate>: ${elementSrc.trim()}`);
          continue;
        }

        const expectedPhase = EXPECTED_PHASE_BY_SEGMENT[segment];
        if (!expectedPhase) {
          bad.push(
            `${routePath} → unknown route segment "${segment}"; add it to EXPECTED_PHASE_BY_SEGMENT in this guard.`,
          );
          continue;
        }

        const phaseMatch = elementSrc.match(/<CandidateStepGate\s+phase="([^"]*)"/);
        if (!phaseMatch) {
          bad.push(
            `${routePath} → <CandidateStepGate> is missing its required phase="${expectedPhase}" prop: ${elementSrc.trim()}`,
          );
        } else if (phaseMatch[1] !== expectedPhase) {
          bad.push(
            `${routePath} → <CandidateStepGate phase="${phaseMatch[1]}"> does not match this route's own step type ` +
              `phase="${expectedPhase}"; a real stepId from that other phase would then be accepted here.`,
          );
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
