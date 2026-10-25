import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";

// Not `ReturnType<typeof createClient>`: createClient is overloaded, and
// ReturnType of an overloaded function type resolves against its LAST
// signature — which, on the current @2 (floating) resolution, has stricter
// generic defaults than the plain 2-argument call below actually returns.
// SupabaseClient's own declared defaults (Database = any, ...) already
// match what that call really produces — this is that, spelled out with no
// generics instead of writing its defaults out explicitly as literal `any`.
type AdminClient = SupabaseClient;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const deleteOperations = [
  { table: 'push_subscriptions', columns: ['user_id'] },
  { table: 'notifications', columns: ['user_id'] },
  { table: 'messages', columns: ['sender_id', 'receiver_id'] },
  { table: 'document_audit_logs', columns: ['user_id'] },
  { table: 'blueprint_purchases', columns: ['user_id'] },
  { table: 'voice_credits', columns: ['user_id'] },
  { table: 'subscription_usage', columns: ['user_id'] },
  { table: 'subscriptions', columns: ['user_id'] },
  { table: 'document_templates', columns: ['employer_id'] },
  { table: 'team_invitations', columns: ['inviter_id'] },
  { table: 'team_members', columns: ['user_id', 'employer_id'] },
  { table: 'document_packages', columns: ['employer_id', 'candidate_id'] },
  { table: 'document_requests', columns: ['candidate_id', 'employer_id', 'reviewed_by'] },
  { table: 'documents', columns: ['sender_id', 'recipient_id'] },
  { table: 'applications', columns: ['candidate_id'] },
  { table: 'jobs', columns: ['employer_id'] },
  { table: 'profiles', columns: ['user_id'] },
  { table: 'user_roles', columns: ['user_id'] },
] as const;

const storageBuckets = [
  'avatars',
  'resumes',
  'portfolios',
  'videos',
  'message-attachments',
  'documents',
  'requested-documents',
] as const;

const STORAGE_REMOVE_BATCH_SIZE = 100;

// Supabase answers at most 1,000 rows a read, so every list is read a page at
// a time, and a long list of ids goes in 200 at a time (the Phase 7 security
// review, round 3: past 1,000 applications the rest were never handed over
// or deleted). `strict` throws on a failed read instead of carrying on with
// what was read: the hand-over must never quietly hand over too little.
const PAGE = 1000;

async function fetchIds(
  supabaseAdmin: AdminClient,
  table: string,
  column: string,
  value: string,
  strict = false,
) {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq(column, value)
      .order('id')
      .range(from, from + PAGE - 1);

    if (error) {
      if (strict) throw new Error(`Could not load ids from ${table}.${column}: ${error.message}`);
      console.log(`Note: Could not load ids from ${table}.${column}:`, error.message);
      return ids;
    }
    ids.push(...(data ?? [])
      .map((row: { id?: string | null }) => row.id)
      .filter((id: string | null | undefined): id is string => Boolean(id)));
    if (!data || data.length < PAGE) return ids;
  }
}

async function fetchIdsIn(
  supabaseAdmin: AdminClient,
  table: string,
  column: string,
  values: string[],
  strict = false,
) {
  const ids: string[] = [];
  for (let i = 0; i < values.length; i += 200) {
    const chunk = values.slice(i, i + 200);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('id')
        .in(column, chunk)
        .order('id')
        .range(from, from + PAGE - 1);

      if (error) {
        if (strict) throw new Error(`Could not load ids from ${table}.${column}[]: ${error.message}`);
        console.log(`Note: Could not load ids from ${table}.${column}[]:`, error.message);
        return ids;
      }
      ids.push(...(data ?? [])
        .map((row: { id?: string | null }) => row.id)
        .filter((id: string | null | undefined): id is string => Boolean(id)));
      if (!data || data.length < PAGE) break;
    }
  }
  return ids;
}

async function deleteRowsByIds(
  supabaseAdmin: AdminClient,
  table: string,
  column: string,
  ids: string[],
) {
  if (!ids.length) return [];

  const uniqueIds = [...new Set(ids)];
  const failures: string[] = [];

  for (let index = 0; index < uniqueIds.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = uniqueIds.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .in(column, batch);

    if (error) {
      // Report and keep going. This used to log a note and `break`, which
      // abandoned every remaining batch — so one transient error silently left
      // most of a deleted user's rows in place.
      failures.push(`${table}.${column}[] (batch ${index / STORAGE_REMOVE_BATCH_SIZE}): ${error.message}`);
    }
  }

  return failures;
}

// listV2 is a real, working Storage API method (checked for at runtime
// below via `typeof storageApi.listV2 !== 'function'`) that this pinned
// supabase-js version's own StorageFileApi type doesn't declare yet.
interface StorageListV2Result {
  objects?: Array<{ key?: string }>;
  hasNext?: boolean;
  nextCursor?: string;
}

interface StorageApiWithListV2 {
  listV2?: (opts: {
    prefix: string;
    limit: number;
    cursor?: string;
  }) => Promise<{ data: StorageListV2Result | null; error: { message: string } | null }>;
  remove: (paths: string[]) => Promise<{ data: unknown; error: { message: string } | null }>;
}

async function cleanupUserStorage(
  supabaseAdmin: AdminClient,
  userId: string,
  /** Buckets whose files belong to a business, kept (a team member's uploads). */
  keep: readonly string[] = [],
) {
  for (const bucket of storageBuckets) {
    if (keep.includes(bucket)) continue;
    try {
      const storageApi = supabaseAdmin.storage.from(bucket) as unknown as StorageApiWithListV2;

      if (typeof storageApi.listV2 !== 'function') {
        console.log(`Skipping storage cleanup for ${bucket}: listV2 is unavailable`);
        continue;
      }

      const keys: string[] = [];
      let cursor: string | undefined;

      do {
        const { data, error } = await storageApi.listV2({
          prefix: `${userId}/`,
          limit: 1000,
          cursor,
        });

        if (error) {
          console.log(`Note: Could not list storage objects for ${bucket}:`, error.message);
          break;
        }

        const objects = data?.objects ?? [];
        keys.push(
          ...objects
            .map((object: { key?: string }) => object.key)
            .filter((key: string | undefined): key is string => Boolean(key)),
        );

        cursor = data?.hasNext ? data?.nextCursor : undefined;
      } while (cursor);

      for (let index = 0; index < keys.length; index += STORAGE_REMOVE_BATCH_SIZE) {
        const batch = keys.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
        const { error } = await storageApi.remove(batch);

        if (error) {
          console.log(`Note: Could not delete storage objects from ${bucket}:`, error.message);
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Note: Unexpected storage cleanup error for ${bucket}:`, message);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the user's JWT from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing bearer token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a client with the user's token to verify identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deleting an account is permanent, so a session alone is not enough: the
    // person types their password again and Supabase Auth checks it here. A
    // session someone else got hold of (a shared computer, a stolen token)
    // cannot delete the account behind it (docs/LAUNCH-PLAN.md, Phase 1, task 7).
    const body = await req.json().catch(() => ({})) as { password?: unknown };
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password || !user.email) {
      return new Response(
        JSON.stringify({ error: 'Enter your password to delete your account.', code: 'password_required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { error: passwordError } = await supabaseUser.auth.signInWithPassword({ email: user.email, password });
    if (passwordError) {
      return new Response(
        JSON.stringify({ error: 'That password is not right.', code: 'wrong_password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting account for user:', user.id);

    // Create admin client with service role to delete the user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Someone on a business's team (not a business themselves): their work
    // belongs to that business. Their chats with applicants and the documents
    // they sent go to the owner first, so leaving never takes the business's
    // records with it (messages are deleted with an account).
    const { data: roleRows } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id);
    const isBusiness = (roleRows ?? []).some((r: { role?: string }) => r.role === 'employer');
    const { data: teamRows } = isBusiness
      ? { data: [] as { employer_id: string }[] }
      : await supabaseAdmin.from('team_members').select('employer_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
    const teamOwner = (teamRows ?? [])[0]?.employer_id as string | undefined;
    if (teamOwner) {
      // Only what belongs to that business: the chats and documents on its own
      // jobs' applications. Every message of the account went before, so a
      // person who had left a team (a revoked row is the newest too) handed
      // their other chats to the business they left (the Phase 7 security
      // review, round 2).
      let ownerApplicationIds: string[];
      try {
        ownerApplicationIds = await fetchIdsIn(supabaseAdmin, 'applications', 'job_id', await fetchIds(supabaseAdmin, 'jobs', 'employer_id', teamOwner, true), true);
      } catch (readError) {
        console.error('Handover before deleting a team member could not read the business (nothing deleted):', (readError as Error).message);
        return new Response(
          JSON.stringify({ error: 'Failed to delete account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const handover = [];
      for (let i = 0; i < ownerApplicationIds.length; i += 200) {
        const chunk = ownerApplicationIds.slice(i, i + 200);
        handover.push(
          supabaseAdmin.from('messages').update({ sender_id: teamOwner }).eq('sender_id', user.id).in('application_id', chunk),
          supabaseAdmin.from('messages').update({ receiver_id: teamOwner }).eq('receiver_id', user.id).in('application_id', chunk),
          supabaseAdmin.from('documents').update({ sender_id: teamOwner }).eq('sender_id', user.id).in('application_id', chunk),
        );
      }
      for (const step of handover) {
        const { error } = await step;
        if (error) {
          console.error('Handover before deleting a team member failed (nothing deleted):', error.message);
          return new Response(
            JSON.stringify({ error: 'Failed to delete account' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const ownedJobIds = await fetchIds(supabaseAdmin, 'jobs', 'employer_id', user.id);
    const candidateApplicationIds = await fetchIds(supabaseAdmin, 'applications', 'candidate_id', user.id);
    const employerApplicationIds = await fetchIdsIn(supabaseAdmin, 'applications', 'job_id', ownedJobIds);
    const relatedApplicationIds = [...new Set([...candidateApplicationIds, ...employerApplicationIds])];

    // ---------------------------------------------------------------------
    // Order matters. This used to purge profiles/user_roles/etc FIRST and call
    // deleteUser() LAST, so a failure on that last call left a signed-in auth
    // user with no profile and no role: a zombie account its owner could still
    // log into but could do nothing with, and which no longer had a company
    // name, so any job it published was silently dropped from the feed.
    //
    // Foreign keys to auth.users cascade or clear themselves (documents' sender
    // and recipient since 20261011194000; before that they refused the
    // deletion outright for anyone who had sent or received one). Deleting the
    // auth user FIRST makes the failure mode
    // non-destructive: if it fails we return before touching a single row and
    // the account is left whole, so the user can simply try again.
    // ---------------------------------------------------------------------
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting auth user (no data was removed):', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The account is now gone from the user's point of view. Everything below
    // is residue cleanup: it can no longer strand them, but a silent failure
    // here means we kept personal data after a deletion request, so each one is
    // collected and reported rather than swallowed into a console.log.
    const residue: string[] = [];

    // PostgrestFilterBuilder is thenable but not a real Promise (no catch/finally),
    // so this takes PromiseLike rather than Promise.
    const purge = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await run();
      if (error) {
        residue.push(`${label}: ${error.message}`);
      }
    };

    for (const table of ['blueprint_purchases', 'interviews', 'document_packages'] as const) {
      residue.push(...(await deleteRowsByIds(supabaseAdmin, table, 'application_id', relatedApplicationIds)));
    }

    // What a team member did for the business stays with it: documents they
    // reviewed and the audit trail (already handed over above).
    const keptForTheBusiness = new Set(teamOwner ? ['document_requests.reviewed_by', 'document_audit_logs.user_id'] : []);
    for (const operation of deleteOperations) {
      for (const column of operation.columns) {
        if (keptForTheBusiness.has(`${operation.table}.${column}`)) continue;
        await purge(`${operation.table}.${column}`, () =>
          supabaseAdmin.from(operation.table).delete().eq(column, user.id)
        );
      }
    }

    await cleanupUserStorage(supabaseAdmin, user.id, teamOwner ? ['documents', 'message-attachments'] : []);

    if (residue.length > 0) {
      // Loud on purpose: the account is deleted, but rows survived it. This is a
      // data-retention problem that needs a human, not a note in the noise.
      console.error(
        `delete-account: user ${user.id} was deleted but ${residue.length} table(s) still hold their data:`,
        residue.join(' | ')
      );
    } else {
      console.log('Successfully deleted user and all associated data:', user.id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
