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
    const { ip } = await req.json();
    
    if (!ip) {
      // Try to get IP from request headers
      const forwardedFor = req.headers.get('x-forwarded-for');
      const realIp = req.headers.get('x-real-ip');
      const clientIp = forwardedFor?.split(',')[0] || realIp || 'unknown';
      
      // Use ip-api.com (free, no API key required, 45 requests/minute limit)
      const response = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,message,city,regionName,country,countryCode`);
      const data = await response.json();
      
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
    }

    // If IP is provided, look it up
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,city,regionName,country,countryCode`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return new Response(JSON.stringify({
        success: true,
        ip: ip,
        city: data.city || 'Unknown',
        region: data.regionName || 'Unknown',
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        ip: ip,
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
