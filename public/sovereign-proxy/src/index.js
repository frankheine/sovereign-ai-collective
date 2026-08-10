export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    
    // Dynamically allow Vercel preview URLs or fallback to production
    const allowedOrigin = (origin && origin.endsWith('.vercel.app')) 
      ? origin 
      : 'https://sovereign-ai-collective.vercel.app';

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': '*',
      'Access-Control-Max-Age': '86400',
    };

    // 1. Enforce CORS Preflights
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Strict Environment Binding Validation
    if (!env.MODELS) {
      return new Response(
        JSON.stringify({
          error: "Sovereign Proxy Configuration Error",
          details: "R2 bucket binding 'MODELS' is undefined."
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let key = url.pathname.slice(1);

    // 3. Perform Path Translations
    if (key.startsWith('models/')) {
      key = key.substring(7);
    }
    key = key.replace(/resolve\/main\//g, '');

    try {
      const options = {};
      const rangeHeader = req.headers.get('range');
      if (rangeHeader) {
        options.range = rangeHeader;
      }

      // Query the R2 bucket
      const object = await env.MODELS.get(key, options);

      // 4. Safe Fallback
      if (!object) {
        return new Response(
          JSON.stringify({
            error: "Asset Not Found in Sovereign Vault",
            queriedKey: key
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000');
      
      // Append CORS headers to the final response
      Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

      // 5. Handle Range Requests
      const isRange = req.headers.has('range') && object.size !== undefined;
      const status = isRange ? 206 : 200;

      return new Response(object.body, { status, headers });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Sovereign Proxy Edge Exception",
          message: err.message || String(err)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
};