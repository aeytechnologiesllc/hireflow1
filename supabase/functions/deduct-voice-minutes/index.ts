import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[deduct-voice-minutes] User ${user.id} requesting deduction`);

    // Parse request body
    const { sessionDurationMinutes } = await req.json();
    
    if (typeof sessionDurationMinutes !== 'number' || sessionDurationMinutes <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid session duration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[deduct-voice-minutes] Deducting ${sessionDurationMinutes} minutes for user ${user.id}`);

    // Use admin client for database operations
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch active voice credits ordered by expiration (FIFO - earliest expiring first)
    const { data: credits, error: creditsError } = await supabaseAdmin
      .from('voice_credits')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('minutes_remaining', 0)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true });

    if (creditsError) {
      console.error('Error fetching credits:', creditsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch voice credits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!credits || credits.length === 0) {
      console.log(`[deduct-voice-minutes] No active voice credits for user ${user.id}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          minutesDeducted: 0, 
          remainingBalance: 0,
          message: 'No active voice credits to deduct from'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct minutes using FIFO approach
    let remainingToDeduct = sessionDurationMinutes;
    let totalDeducted = 0;
    const updates: Array<{ id: string; minutes_remaining: number; status: string }> = [];

    for (const credit of credits) {
      if (remainingToDeduct <= 0) break;

      const deductFromThis = Math.min(credit.minutes_remaining, remainingToDeduct);
      const newRemaining = credit.minutes_remaining - deductFromThis;
      const newStatus = newRemaining <= 0 ? 'exhausted' : 'active';

      updates.push({
        id: credit.id,
        minutes_remaining: Math.max(0, newRemaining),
        status: newStatus
      });

      remainingToDeduct -= deductFromThis;
      totalDeducted += deductFromThis;

      console.log(`[deduct-voice-minutes] Credit ${credit.id}: deducted ${deductFromThis}, remaining ${newRemaining}, status ${newStatus}`);
    }

    // Apply updates to database
    for (const update of updates) {
      const { error: updateError } = await supabaseAdmin
        .from('voice_credits')
        .update({
          minutes_remaining: update.minutes_remaining,
          status: update.status
        })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Error updating credit ${update.id}:`, updateError);
      }
    }

    // Calculate total remaining balance
    const { data: updatedCredits } = await supabaseAdmin
      .from('voice_credits')
      .select('minutes_remaining')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());

    const remainingBalance = updatedCredits?.reduce((sum, c) => sum + c.minutes_remaining, 0) || 0;

    console.log(`[deduct-voice-minutes] Completed: deducted ${totalDeducted} minutes, remaining balance ${remainingBalance}`);

    return new Response(
      JSON.stringify({
        success: true,
        minutesDeducted: totalDeducted,
        remainingBalance,
        creditsUpdated: updates.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Deduct voice minutes error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
