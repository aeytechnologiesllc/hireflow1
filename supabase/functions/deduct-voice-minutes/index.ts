import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOW_BALANCE_THRESHOLD = 15; // minutes

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

    // Get balance before deduction for comparison
    const balanceBefore = credits.reduce((sum, c) => sum + c.minutes_remaining, 0);

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

    // Check if we need to send email notifications
    await checkAndSendNotifications(
      supabaseAdmin,
      user.id,
      balanceBefore,
      remainingBalance
    );

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

/**
 * Check if we need to send low balance or exhausted notifications
 */
async function checkAndSendNotifications(
  supabaseAdmin: any,
  userId: string,
  balanceBefore: number,
  balanceAfter: number
): Promise<void> {
  try {
    // Get subscription to check last notification time
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('voice_low_balance_notified_at')
      .eq('user_id', userId)
      .single() as { data: { voice_low_balance_notified_at: string | null } | null };

    // Get active jobs count for context in email
    const { count: activeJobsCount } = await supabaseAdmin
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('employer_id', userId)
      .eq('status', 'published');

    const jobsCount = activeJobsCount || 0;

    // Check if balance just hit zero (was > 0 before, now 0)
    if (balanceBefore > 0 && balanceAfter === 0) {
      console.log(`[deduct-voice-minutes] Sending exhausted notification to ${userId}`);
      await sendVoiceNotification(supabaseAdmin, userId, 'voice_minutes_exhausted', 0, jobsCount);
      
      // Update the notification timestamp
      await supabaseAdmin
        .from('subscriptions')
        .update({ voice_low_balance_notified_at: new Date().toISOString() })
        .eq('user_id', userId);
      
      return;
    }

    // Check if balance just crossed the low threshold
    if (balanceBefore > LOW_BALANCE_THRESHOLD && balanceAfter <= LOW_BALANCE_THRESHOLD && balanceAfter > 0) {
      // Check if we already sent a low balance notification recently (within 24 hours)
      const lastNotified = subscription?.voice_low_balance_notified_at;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      if (!lastNotified || lastNotified < oneDayAgo) {
        console.log(`[deduct-voice-minutes] Sending low balance notification to ${userId}`);
        await sendVoiceNotification(supabaseAdmin, userId, 'voice_minutes_low', balanceAfter, jobsCount);
        
        // Update the notification timestamp
        await supabaseAdmin
          .from('subscriptions')
          .update({ voice_low_balance_notified_at: new Date().toISOString() })
          .eq('user_id', userId);
      } else {
        console.log(`[deduct-voice-minutes] Skipping low balance notification - already sent within 24 hours`);
      }
    }
  } catch (error) {
    console.error('[deduct-voice-minutes] Error checking/sending notifications:', error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Send voice minutes notification email via send-notification-email function
 */
async function sendVoiceNotification(
  supabaseAdmin: any,
  userId: string,
  type: 'voice_minutes_low' | 'voice_minutes_exhausted',
  minutesRemaining: number,
  activeJobsCount: number
): Promise<void> {
  try {
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    // Get user's profile for email
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, email_notifications_enabled, email_voice_minutes')
      .eq('user_id', userId)
      .single() as { data: { email: string; email_notifications_enabled: boolean | null; email_voice_minutes: boolean | null } | null };

    if (!profile) {
      console.log(`[deduct-voice-minutes] No profile found for user ${userId}`);
      return;
    }

    if (!profile.email_notifications_enabled || profile.email_voice_minutes === false) {
      console.log(`[deduct-voice-minutes] Voice minute emails disabled for ${profile.email}`);
      return;
    }

    const baseUrl = Deno.env.get("APP_BASE_URL") || "https://hireflownow.com";

    let subject: string;
    let html: string;

    if (type === 'voice_minutes_exhausted') {
      subject = 'Action Required: Voice Minutes Exhausted';
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #111; margin-bottom: 20px;">Voice Minutes Exhausted</h2>
          <p style="color: #dc2626;"><strong>Your voice minutes have been depleted.</strong></p>
          ${activeJobsCount > 0 ? `<p>Candidates applying to your <strong>${activeJobsCount} active job${activeJobsCount > 1 ? 's' : ''}</strong> cannot complete AI voice interviews until you purchase more minutes.</p>` : '<p>Candidates cannot complete AI voice interviews until you purchase more minutes.</p>'}
          <p style="color: #666;">Purchase more voice minutes immediately to restore AI voice interview functionality.</p>
          <p style="margin-top: 24px;">
            <a href="${baseUrl}/settings?tab=subscription" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">Purchase Voice Minutes Now</a>
          </p>
          <p style="color: #666; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
            — The HireFlow Team
          </p>
        </div>
      `;
    } else {
      subject = `Low Voice Minutes: Only ${minutesRemaining} minutes remaining`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #111; margin-bottom: 20px;">Voice Minutes Running Low</h2>
          <p>Your voice minutes are running low. You have <strong>${minutesRemaining} minutes</strong> remaining.</p>
          ${activeJobsCount > 0 ? `<p style="color: #666;">You have <strong>${activeJobsCount} active job${activeJobsCount > 1 ? 's' : ''}</strong> that may be affected if you run out of minutes.</p>` : ''}
          <p style="color: #666;">Purchase more voice minutes to ensure uninterrupted AI voice interviews for your candidates.</p>
          <p style="margin-top: 24px;">
            <a href="${baseUrl}/settings?tab=subscription" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">Purchase Voice Minutes</a>
          </p>
          <p style="color: #666; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
            — The HireFlow Team
          </p>
        </div>
      `;
    }

    const emailResponse = await resend.emails.send({
      from: "HireFlow <notifications@hireflownow.com>",
      to: [profile.email],
      subject,
      html,
    });

    console.log(`[deduct-voice-minutes] Email sent to ${profile.email}:`, emailResponse);
  } catch (error) {
    console.error('[deduct-voice-minutes] Error sending notification email:', error);
    // Don't throw - email is non-critical
  }
}
