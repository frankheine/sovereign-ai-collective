export default {
  async fetch(request: Request, env: any): Promise<Response> {
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
    } catch (e: any) {
      return new Response(`Sovereign Proxy Exception: ${e.message}`, {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    if (object === null) {
      return new Response(`Asset Not Found in Sovereign Vault: ${objectKey}`, {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
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