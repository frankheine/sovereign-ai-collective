export default {
  async fetch(request: Request, env: any) {
    const ALLOWED_ORIGIN = 'https://sovereign-ai-collective.vercel.app';
    const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };

    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);

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

    // Root health check
    if (!objectKey || objectKey === '') {
      return new Response("🛡️ Sovereign R2 Vault is Online and Air-Gapped.", {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    let object;
    try {
      object = await env.MODELS.get(objectKey, {
        range: request.headers,
        onlyIf: request.headers,
      });
    } catch (e) {
      return new Response("Error accessing Sovereign Vault", {
        status: 500,
        headers: corsHeaders
      });
    }

    if (object === null) {
      return new Response(`File not found in Sovereign Vault: ${objectKey}`, {
        status: 404,
        headers: corsHeaders
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    const status = object.body ? (request.headers.get('range') !== null ? 206 : 200) : 304;

    return new Response(object.body, {
      status,
      headers
    });
  }
};