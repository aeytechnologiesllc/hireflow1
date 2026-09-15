import { isPartyToDocument } from "./documentParties.ts";

const noApplicationLookup = async () => {
  throw new Error("fetchApplicationParties should not be called");
};

Deno.test("sender is a party without ever consulting the application", async () => {
  const ok = await isPartyToDocument(
    { sender_id: "sender-1", recipient_id: null, application_id: "app-1" },
    "sender-1",
    noApplicationLookup,
  );
  if (!ok) throw new Error("sender_id match should short-circuit to true");
});

Deno.test("recipient is a party without ever consulting the application", async () => {
  const ok = await isPartyToDocument(
    { sender_id: null, recipient_id: "recipient-1", application_id: "app-1" },
    "recipient-1",
    noApplicationLookup,
  );
  if (!ok) throw new Error("recipient_id match should short-circuit to true");
});

Deno.test("a document with no application_id is not a party match for anyone but sender/recipient", async () => {
  const ok = await isPartyToDocument(
    { sender_id: "sender-1", recipient_id: "recipient-1", application_id: null },
    "some-stranger",
    noApplicationLookup,
  );
  if (ok) throw new Error("a stranger must not be treated as a party");
});

Deno.test("the application's candidate is a party", async () => {
  const ok = await isPartyToDocument(
    { sender_id: "employer-1", recipient_id: null, application_id: "app-1" },
    "candidate-1",
    async (applicationId) => {
      if (applicationId !== "app-1") throw new Error("wrong application id passed through");
      return { candidateId: "candidate-1", employerId: "employer-1" };
    },
  );
  if (!ok) throw new Error("the application's candidate_id should count as a party");
});

Deno.test("the application's job owner (employer) is a party", async () => {
  const ok = await isPartyToDocument(
    { sender_id: "team-member-1", recipient_id: null, application_id: "app-1" },
    "employer-1",
    async () => ({ candidateId: "candidate-1", employerId: "employer-1" }),
  );
  if (!ok) throw new Error("the application's job owner should count as a party");
});

Deno.test("a random authenticated user is never a party", async () => {
  const ok = await isPartyToDocument(
    { sender_id: "employer-1", recipient_id: "candidate-1", application_id: "app-1" },
    "random-signed-in-user",
    async () => ({ candidateId: "candidate-1", employerId: "employer-1" }),
  );
  if (ok) throw new Error("verify-document must not leak signer names to an unrelated signed-in user");
});

Deno.test("a missing/deleted application fails closed, not open", async () => {
  const ok = await isPartyToDocument(
    { sender_id: "employer-1", recipient_id: null, application_id: "app-deleted" },
    "anyone",
    async () => null,
  );
  if (ok) throw new Error("a lookup miss must fail closed (not a party), never open");
});
