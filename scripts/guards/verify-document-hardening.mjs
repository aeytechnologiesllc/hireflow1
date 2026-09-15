/**
 * C3: supabase/functions/verify-document (verify_jwt = false, service-role
 * client) let anyone resolve any document by its document_code — including
 * signer names, timestamps, hash and status — with:
 *
 *   (a) a low-entropy code: 'DOC-' || UPPER(SUBSTRING(md5(random()::text), 1, 6))
 *       — 6 hex chars, ~16.7M possibilities, brute-forceable.
 *   (b) no rate limit at all, so brute-forcing (a) had no cost.
 *   (c) signer names/roles handed to every caller regardless of who they
 *       are, not just a party to that document.
 *
 * Fixed by:
 *   - supabase/migrations/20260915123000_high_entropy_document_codes.sql
 *     (new codes only — existing codes keep working, nothing is rotated)
 *   - supabase/functions/verify-document/index.ts: guardPublicAiCall keyed
 *     by IP, and signers only returned to a caller whose Authorization
 *     header resolves to a real party per
 *     supabase/functions/_shared/documentParties.ts (sender/recipient, or
 *     the application's candidate/job-owner) — proven directly with
 *     Deno.test in documentParties.test.ts (run: deno test
 *     supabase/functions/_shared/documentParties.test.ts).
 *
 * These are static text checks over the source — cheap, no server or DB
 * needed — not a substitute for actually calling the deployed function.
 */

const MIGRATION = "supabase/migrations/20260915123000_high_entropy_document_codes.sql";
const FUNCTION = "supabase/functions/verify-document/index.ts";
const PARTIES = "supabase/functions/_shared/documentParties.ts";
const PARTIES_TEST = "supabase/functions/_shared/documentParties.test.ts";
const PAGE = "src/pages/VerifyDocument.tsx";

export default [
  {
    id: "document-code-generator-is-high-entropy",
    why:
      "generate_document_code() must draw from a CSPRNG with >=20 random characters of output for NEW " +
      "codes — the original 6-hex-char md5(random()) generator is brute-forceable once documents exist.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];

      const fnMatch = /create or replace function generate_document_code\(\)[\s\S]*?\$\$ language plpgsql/i.exec(sql);
      if (!fnMatch) {
        bad.push("generate_document_code() is not (re)defined verbatim in this migration");
      } else {
        const body = fnMatch[0];
        if (/md5\(random\(\)::text\)/.test(body)) {
          bad.push("the function body still builds the code from md5(random()) — it must be replaced, not left alongside the new one");
        }
        if (!/gen_random_bytes\(\s*1[6-9]\s*\)|gen_random_bytes\(\s*[2-9]\d\s*\)/.test(body)) {
          bad.push("no gen_random_bytes(N) call with N >= 16 found in the function body (16 bytes hex-encoded = 32 chars >= the 20-char floor)");
        }
      }
      if (!/pgcrypto/.test(sql)) {
        bad.push("no pgcrypto extension reference — gen_random_bytes needs it available");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "verify-document-is-rate-limited",
    why:
      "verify-document has no login requirement, so an open lookup with no rate limit is brute-forceable " +
      "regardless of code entropy going forward for any codes generated before the entropy fix. It must use " +
      "the shared Postgres-backed limiter, keyed by caller IP, the same way every other public function does.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];

      if (!/from ['"]\.\.\/_shared\/rateLimit\.ts['"]/.test(src)) {
        bad.push("does not import from ../_shared/rateLimit.ts");
      }
      if (!/guardPublicAiCall\(\s*req\s*,\s*['"]verify-document['"]/.test(src)) {
        bad.push("does not call guardPublicAiCall(req, \"verify-document\", ...)");
      }
      // The rate-limit guard must run before any database lookup, or a
      // limited caller still gets a free document read.
      const guardIdx = src.indexOf("guardPublicAiCall(");
      const lookupIdx = src.indexOf(".from('documents')");
      if (guardIdx === -1 || lookupIdx === -1 || guardIdx > lookupIdx) {
        bad.push("guardPublicAiCall must run before the documents table lookup");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "verify-document-gates-signers-on-party-check",
    why:
      "Signer names must never be attached to the response unconditionally — only after resolving the " +
      "caller's identity from their Authorization header and confirming (via the pure, unit-tested " +
      "isPartyToDocument) that they are an actual party to this document.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];

      if (!/from ['"]\.\.\/_shared\/documentParties\.ts['"]/.test(src)) {
        bad.push("does not import isPartyToDocument from ../_shared/documentParties.ts");
      }
      if (!/isPartyToDocument\(/.test(src)) {
        bad.push("no call to isPartyToDocument(...) found");
      }
      if (!/resolveAuthorizedUserId/.test(src)) {
        bad.push("no resolveAuthorizedUserId(...) helper reading the Authorization header found");
      }

      // response.signers must only be set inside the authorized branch, never
      // unconditionally on the base response object.
      const responseLit = /const response: VerificationResponse = \{([\s\S]*?)\};/.exec(src);
      if (responseLit && /\bsigners\s*:/.test(responseLit[1])) {
        bad.push("the base `response` object still sets `signers` unconditionally");
      }
      if (!/response\.signers\s*=\s*signers/.test(src)) {
        bad.push("signers are no longer assigned onto response only after the party check");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "document-parties-check-and-its-test-both-exist",
    why:
      "The party-check decision (sender/recipient, or the application's candidate/job-owner) must live in " +
      "a pure, injectable-lookup function with its own Deno.test coverage — not re-inlined into the edge " +
      "function where it can't be unit tested without a live Supabase client.",
    run: async ({ read }) => {
      const bad = [];

      const lib = await read(PARTIES);
      if (!lib) {
        bad.push(`${PARTIES} not found`);
      } else {
        if (!/export (async )?function isPartyToDocument/.test(lib)) {
          bad.push("isPartyToDocument is not exported from documentParties.ts");
        }
        if (!/sender_id\s*===\s*userId\s*\|\|\s*document\.recipient_id\s*===\s*userId/.test(lib)) {
          bad.push("party check no longer covers sender_id/recipient_id");
        }
        if (!/candidateId\s*===\s*userId/.test(lib)) {
          bad.push("party check no longer covers the application's candidateId");
        }
        if (!/employerId\s*===\s*userId/.test(lib)) {
          bad.push("party check no longer covers the application's employerId (job owner)");
        }
      }

      const test = await read(PARTIES_TEST);
      if (!test) {
        bad.push(`${PARTIES_TEST} not found`);
      } else {
        if (!/Deno\.test\(/.test(test)) bad.push("no Deno.test(...) cases found in documentParties.test.ts");
        if (!/random-signed-in-user/.test(test)) {
          bad.push("no test proving an unrelated signed-in user is refused party status");
        }
        if (!/fail closed/.test(test)) {
          bad.push("no test proving a missing/deleted application fails closed, not open");
        }
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "verify-document-public-response-is-minimal",
    why:
      "The wire response must drop documentCode (redundant echo) and signingOrder (internal workflow detail, " +
      "not something a certificate viewer needs) — a public verification page should return only what it " +
      "genuinely needs: name, status, completion date, hash, and verified.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];

      const ifaceMatch = /interface VerificationResponse \{([\s\S]*?)\}/.exec(src);
      if (!ifaceMatch) {
        bad.push("VerificationResponse interface not found");
      } else {
        const body = ifaceMatch[1];
        if (/documentCode\s*:/.test(body)) bad.push("VerificationResponse still declares documentCode");
        if (/signingOrder\s*:/.test(body)) bad.push("VerificationResponse still declares signingOrder");
        if (!/signers\?\s*:/.test(body)) bad.push("signers must be optional (`signers?:`) — it is conditionally attached");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "verify-document-page-matches-reduced-shape",
    why:
      "src/pages/VerifyDocument.tsx must not read documentCode/signingOrder off the API response (they no " +
      "longer exist there) and must not assume `signers` is always present, or the page breaks/crashes for " +
      "every anonymous visitor now that signers is conditional.",
    run: async ({ read }) => {
      const src = await read(PAGE);
      if (!src) return { ok: false, detail: [`${PAGE} not found`] };
      const bad = [];

      if (/data\.documentCode/.test(src)) {
        bad.push("still reads data.documentCode — the response no longer includes it, use the route param instead");
      }
      if (/data\.signingOrder/.test(src)) {
        bad.push("still reads data.signingOrder — the response no longer includes it");
      }
      // Every occurrence of `data.signers.length` must be preceded nearby by
      // a guard (`data.signers &&` or `!data.signers ||`) — otherwise it
      // throws for an anonymous visitor whose response omits `signers`.
      const lengthUses = [...src.matchAll(/data\.signers\.length/g)];
      if (lengthUses.length === 0) {
        bad.push("no `data.signers.length` reference found at all — expected at least the Signers-card gate");
      }
      for (const m of lengthUses) {
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        if (!/data\.signers\s*&&\s*$/.test(before) && !/!data\.signers\s*\|\|\s*$/.test(before)) {
          bad.push(`unguarded data.signers.length near offset ${m.index} — signers is optional and this throws for anonymous visitors`);
        }
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
];
