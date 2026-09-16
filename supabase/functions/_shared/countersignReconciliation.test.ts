import {
  parseCandidateSignatureData,
  reconcileCandidateSignatureChain,
} from "./countersignReconciliation.ts";
import { computeV2Hash, signatureHashInput } from "./documentHashChain.ts";

// Mirrors exactly what index.ts's sign() handler writes to
// documents.candidate_signature_data.
function candidateSignatureDataJson(opts: { method: string; value: string; signerEmail: string; signerName?: string }): string {
  return JSON.stringify({
    signatures: { recipient: opts.value },
    method: opts.method,
    signerName: opts.signerName ?? "Cand X",
    signerEmail: opts.signerEmail,
  });
}

const V1_AT_SIGN = "v1-hash-as-it-was-at-sign-time";
const CANDIDATE_EMAIL = "candx@example.com";
const CANDIDATE_SIGNED_AT = "2026-09-15T10:00:00.000Z";
const TYPED_SIGNATURE = { method: "typed", value: "Cand X" };

async function realV2Hash(v1Hash: string): Promise<string> {
  const signatureValue = await signatureHashInput(TYPED_SIGNATURE);
  return computeV2Hash({
    v1Hash,
    signatureValue,
    candidateEmail: CANDIDATE_EMAIL,
    timestampUtc: CANDIDATE_SIGNED_AT,
  });
}

Deno.test("reconcileCandidateSignatureChain: accepts an untampered chain — v2_hash matches what v1_hash-at-sign + the stored signature actually produce", async () => {
  const storedV2Hash = await realV2Hash(V1_AT_SIGN);
  const result = await reconcileCandidateSignatureChain({
    v1HashAtSign: V1_AT_SIGN,
    candidateSignatureDataRaw: candidateSignatureDataJson({ ...TYPED_SIGNATURE, signerEmail: CANDIDATE_EMAIL }),
    candidateSignedAt: CANDIDATE_SIGNED_AT,
    storedV2Hash,
  });
  if (!result.ok) throw new Error(`expected ok, got refused: ${JSON.stringify(result)}`);
  if (result.recomputedV2Hash !== storedV2Hash) {
    throw new Error("recomputedV2Hash does not equal the stored v2_hash on a genuinely untampered chain");
  }
});

// This is the actual blocker scenario: v1_hash changes out from under an
// already-computed v2_hash (an employer raw-UPDATE of documents.v1_hash
// between candidate sign and employer countersign, or any other cause of
// the two going out of sync). The stored v2_hash was computed from the
// ORIGINAL v1_hash; reconciliation must recompute from the v1_hash actually
// used at sign time (the audit log's immutable value) and refuse when that
// no longer matches.
Deno.test("reconcileCandidateSignatureChain: refuses countersign when v1_hash was tampered with after the candidate signed", async () => {
  const storedV2Hash = await realV2Hash(V1_AT_SIGN); // computed from the ORIGINAL v1_hash
  const tamperedV1AtSign = "v1-hash-that-does-not-match-what-v2-was-actually-computed-from";

  const result = await reconcileCandidateSignatureChain({
    v1HashAtSign: tamperedV1AtSign,
    candidateSignatureDataRaw: candidateSignatureDataJson({ ...TYPED_SIGNATURE, signerEmail: CANDIDATE_EMAIL }),
    candidateSignedAt: CANDIDATE_SIGNED_AT,
    storedV2Hash,
  });

  if (result.ok) throw new Error("expected the reconciliation to refuse a tampered chain, but it accepted it");
  if (result.reason !== "hash_mismatch") {
    throw new Error(`expected reason 'hash_mismatch', got '${result.reason}'`);
  }
  if (result.recomputedV2Hash === storedV2Hash) {
    throw new Error("recomputedV2Hash should differ from the stored v2_hash in the mismatch case");
  }
});

Deno.test("reconcileCandidateSignatureChain: refuses when the audit log's pre_signature_hash is missing", async () => {
  const result = await reconcileCandidateSignatureChain({
    v1HashAtSign: null,
    candidateSignatureDataRaw: candidateSignatureDataJson({ ...TYPED_SIGNATURE, signerEmail: CANDIDATE_EMAIL }),
    candidateSignedAt: CANDIDATE_SIGNED_AT,
    storedV2Hash: "some-v2-hash",
  });
  if (result.ok) throw new Error("expected refusal with no pre_signature_hash on record");
  if (result.reason !== "missing_pre_signature_hash") {
    throw new Error(`expected reason 'missing_pre_signature_hash', got '${result.reason}'`);
  }
});

Deno.test("reconcileCandidateSignatureChain: refuses when candidate_signature_data is missing or unparseable", async () => {
  const missing = await reconcileCandidateSignatureChain({
    v1HashAtSign: V1_AT_SIGN,
    candidateSignatureDataRaw: null,
    candidateSignedAt: CANDIDATE_SIGNED_AT,
    storedV2Hash: "some-v2-hash",
  });
  if (missing.ok || missing.reason !== "missing_candidate_signature") {
    throw new Error(`expected refusal with reason 'missing_candidate_signature', got ${JSON.stringify(missing)}`);
  }

  const malformed = await reconcileCandidateSignatureChain({
    v1HashAtSign: V1_AT_SIGN,
    candidateSignatureDataRaw: "not json at all",
    candidateSignedAt: CANDIDATE_SIGNED_AT,
    storedV2Hash: "some-v2-hash",
  });
  if (malformed.ok || malformed.reason !== "missing_candidate_signature") {
    throw new Error(`expected refusal on unparseable JSON, got ${JSON.stringify(malformed)}`);
  }
});

Deno.test("reconcileCandidateSignatureChain: refuses when candidate_signed_at or the stored v2_hash are missing", async () => {
  const noSignedAt = await reconcileCandidateSignatureChain({
    v1HashAtSign: V1_AT_SIGN,
    candidateSignatureDataRaw: candidateSignatureDataJson({ ...TYPED_SIGNATURE, signerEmail: CANDIDATE_EMAIL }),
    candidateSignedAt: null,
    storedV2Hash: "some-v2-hash",
  });
  if (noSignedAt.ok || noSignedAt.reason !== "missing_candidate_signed_at") {
    throw new Error(`expected 'missing_candidate_signed_at', got ${JSON.stringify(noSignedAt)}`);
  }

  const noV2 = await reconcileCandidateSignatureChain({
    v1HashAtSign: V1_AT_SIGN,
    candidateSignatureDataRaw: candidateSignatureDataJson({ ...TYPED_SIGNATURE, signerEmail: CANDIDATE_EMAIL }),
    candidateSignedAt: CANDIDATE_SIGNED_AT,
    storedV2Hash: null,
  });
  if (noV2.ok || noV2.reason !== "missing_v2_hash") {
    throw new Error(`expected 'missing_v2_hash', got ${JSON.stringify(noV2)}`);
  }
});

Deno.test("parseCandidateSignatureData: round-trips the exact JSON shape sign() writes, including a drawn signature's data URL", () => {
  const raw = candidateSignatureDataJson({
    method: "drawn",
    value: "data:image/png;base64,abc123",
    signerEmail: "candx@example.com",
    signerName: "Cand X",
  });
  const parsed = parseCandidateSignatureData(raw);
  if (!parsed) throw new Error("expected a parsed record, got null");
  if (parsed.method !== "drawn" || parsed.value !== "data:image/png;base64,abc123" || parsed.signerEmail !== "candx@example.com") {
    throw new Error(`unexpected parse result: ${JSON.stringify(parsed)}`);
  }
});
