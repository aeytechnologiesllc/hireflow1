import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Safely parse JSON body - handle empty body gracefully
    let requestedIp: string | null = null;
    try {
      const body = await req.text();
      if (body && body.trim()) {
        const parsed = JSON.parse(body);
        requestedIp = parsed?.ip || null;
      }
    } catch {
      // Body was empty or invalid JSON - proceed with header detection
      requestedIp = null;
    }

    // Get client IP from various headers (Cloudflare, proxies, etc.)
    const cfConnectingIp = req.headers.get('cf-connecting-ip');
    const xRealIp = req.headers.get('x-real-ip');
    const forwardedFor = req.headers.get('x-forwarded-for');
    const trueClientIp = req.headers.get('true-client-ip');
    
    // Priority: explicit request > Cloudflare > true-client-ip > x-real-ip > x-forwarded-for
    const clientIp = requestedIp || 
                     cfConnectingIp || 
                     trueClientIp || 
                     xRealIp || 
                     forwardedFor?.split(',')[0]?.trim() || 
                     null;

    console.log('IP detection:', { 
      requestedIp, 
      cfConnectingIp, 
      trueClientIp,
      xRealIp, 
      forwardedFor,
      resolvedIp: clientIp 
    });

    if (!clientIp) {
      console.log('No IP detected from any source');
      return new Response(JSON.stringify({
        success: true,
        ip: 'unknown',
        city: 'Unknown',
        region: 'Unknown',
        country: 'Unknown',
        countryCode: 'XX'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use ip-api.com (free, no API key required, 45 requests/minute limit)
    const response = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,message,city,regionName,country,countryCode`);
    const data = await response.json();
    
    console.log('ip-api.com response:', data);

    if (data.status === 'success') {
      return new Response(JSON.stringify({
        success: true,
        ip: clientIp,
        city: data.city || 'Unknown',
        region: data.regionName || 'Unknown',
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.log('ip-api.com failed:', data.message);
      return new Response(JSON.stringify({
        success: true,
        ip: clientIp,
        city: 'Unknown',
        region: 'Unknown',
        country: 'Unknown',
        countryCode: 'XX'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Geolocation error:', errorMessage);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      ip: 'unknown',
      city: 'Unknown',
      region: 'Unknown',
      country: 'Unknown',
      countryCode: 'XX'
    }), {
      status: 200, // Still return 200 so the signing flow doesn't break
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
