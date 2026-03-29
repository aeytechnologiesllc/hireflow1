import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function fetchIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string,
) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq(column, value);

  if (error) {
    console.log(`Note: Could not load ids from ${table}.${column}:`, error.message);
    return [];
  }

  return (data ?? [])
    .map((row: { id?: string | null }) => row.id)
    .filter((id: string | null | undefined): id is string => Boolean(id));
}

async function fetchIdsIn(
  supabaseAdmin: ReturnType<typeof createClient>,
  table: string,
  column: string,
  values: string[],
) {
  if (!values.length) return [];

  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .in(column, values);

  if (error) {
    console.log(`Note: Could not load ids from ${table}.${column}[]:`, error.message);
    return [];
  }

  return (data ?? [])
    .map((row: { id?: string | null }) => row.id)
    .filter((id: string | null | undefined): id is string => Boolean(id));
}

async function deleteRowsByIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  table: string,
  column: string,
  ids: string[],
) {
  if (!ids.length) return;

  const uniqueIds = [...new Set(ids)];

  for (let index = 0; index < uniqueIds.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = uniqueIds.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .in(column, batch);

    if (error) {
      console.log(`Note: Could not delete from ${table}.${column}[]:`, error.message);
      break;
    }
  }
}

async function cleanupUserStorage(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
) {
  for (const bucket of storageBuckets) {
    try {
      const storageApi = supabaseAdmin.storage.from(bucket) as any;

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

    console.log('Deleting account for user:', user.id);

    // Create admin client with service role to delete the user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const ownedJobIds = await fetchIds(supabaseAdmin, 'jobs', 'employer_id', user.id);
    const candidateApplicationIds = await fetchIds(supabaseAdmin, 'applications', 'candidate_id', user.id);
    const employerApplicationIds = await fetchIdsIn(supabaseAdmin, 'applications', 'job_id', ownedJobIds);
    const relatedApplicationIds = [...new Set([...candidateApplicationIds, ...employerApplicationIds])];

    await deleteRowsByIds(supabaseAdmin, 'blueprint_purchases', 'application_id', relatedApplicationIds);
    await deleteRowsByIds(supabaseAdmin, 'interviews', 'application_id', relatedApplicationIds);
    await deleteRowsByIds(supabaseAdmin, 'document_packages', 'application_id', relatedApplicationIds);

    for (const operation of deleteOperations) {
      for (const column of operation.columns) {
        const { error } = await supabaseAdmin
          .from(operation.table)
          .delete()
          .eq(column, user.id);

        if (error) {
          console.log(`Note: Could not delete from ${operation.table}.${column}:`, error.message);
        }
      }
    }

    await cleanupUserStorage(supabaseAdmin, user.id);

    // Delete the auth user (this is the key step - removes from auth.users)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully deleted user:', user.id);

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
