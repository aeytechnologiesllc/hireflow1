/**
 * Who counts as a "party" to a signed document — used by verify-document to
 * decide whether an authenticated caller may see signer names on its public
 * certificate-verification response.
 *
 * A pure decision function: it takes the document's own party columns plus
 * an injected lookup for its application (so this stays testable with
 * Deno.test, no live Supabase client needed — see documentParties.test.ts).
 */

export interface DocumentPartyFields {
  sender_id: string | null;
  recipient_id: string | null;
  application_id: string | null;
}

export interface ApplicationParties {
  candidateId: string | null;
  employerId: string | null;
}

/**
 * Is `userId` a real party to `document` — its sender, its recipient, the
 * candidate on its application, or that application's job owner?
 */
export async function isPartyToDocument(
  document: DocumentPartyFields,
  userId: string,
  fetchApplicationParties: (applicationId: string) => Promise<ApplicationParties | null>,
): Promise<boolean> {
  if (document.sender_id === userId || document.recipient_id === userId) return true;
  if (!document.application_id) return false;

  const parties = await fetchApplicationParties(document.application_id);
  if (!parties) return false;
  return parties.candidateId === userId || parties.employerId === userId;
}
