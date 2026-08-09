const origin = request.headers.get('Origin');
const allowedOrigin = (origin && origin.endsWith('.vercel.app')) 
  ? origin 
  : 'https://sovereign-ai-collective.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
};

export default {
  async fetch(request) Request, env: any}: Promise<Response> {
    const ALLOWED_ORIGIN = 'https://sovereign-ai-collective.vercel.app';
    const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };

    const url = new URL(request.url);
    let objectKey = url.pathname.slice(1);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Origin',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Strict Environment Binding Validation
    if (!env.MODELS) {
      return new Response(
        JSON.stringify({
          error: "Sovereign Proxy Configuration Error",
          details: "R2 bucket binding 'MODELS' is undefined. Ensure your Wrangler configuration or Cloudflare Dashboard settings bind 'sovereign-models' to Variable Name 'MODELS'."
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Root health check
    if (!objectKey || objectKey === '') {
      return new Response("🛡️ Sovereign R2 Vault is Online and Air-Gapped.", {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // Path Translations
    // Strip "/models/" prefix if it exists
    if (objectKey.startsWith('models/')) {
      objectKey = objectKey.substring(7);
    }
    // Strip Hugging Face "resolve/main/" prefix appended by Transformers.js
    objectKey = objectKey.replace(/resolve\/main\//g, '');

    let object;
    try {
      object = await env.MODELS.get(objectKey, {
        range: request.headers,
        onlyIf: request.headers,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: "Sovereign Proxy Edge Exception",
          message: err.message || String(err),
          trace: err.stack || ""
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Safe Fallback to Prevent 503 Crash on Missing Keys
    if (object === null) {
      return new Response(
        JSON.stringify({
          error: "Asset Not Found in Sovereign Vault",
          queriedKey: objectKey,
          originalPath: url.pathname,
          reconciliation: "Ensure you uploaded the file to R2 inside the directory: " + objectKey.substring(0, objectKey.lastIndexOf('/'))
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    headers.set('Cache-Control', 'public, max-age=31536000');

    const status = object.body ? (request.headers.get('range') !== null ? 206 : 200) : 304;

    return new Response(object.body, {
      status,
      headers
    });
  }
};