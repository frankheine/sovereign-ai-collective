export default {
  async fetch(req: Request, env: any): Promise<Response> {
    const url = new URL(req.url);
    
    // 1. Enforce CORS Preflights
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // 2. Strict Environment Binding Validation
    if (!env.MODELS) {
      return new Response(
        JSON.stringify({
          error: "Sovereign Proxy Configuration Error",
          details: "R2 bucket binding 'MODELS' is undefined. Ensure your Wrangler configuration or Cloudflare Dashboard settings bind 'sovereign-models' to Variable Name 'MODELS'."
        }),
        {
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          }
        }
      );
    }

    let key = url.pathname.slice(1); // Strip leading slash

    // 3. Perform Path Translations
    if (key.startsWith('models/')) {
      key = key.substring(7);
    }
    // Strip Hugging Face "resolve/main/" prefix appended by Transformers.js
    key = key.replace(/resolve\/main\//g, '');

    try {
      const options: any = {};
      const rangeHeader = req.headers.get('range');
      if (rangeHeader) {
        options.range = rangeHeader;
      }

      // Query the R2 bucket
      const object = await env.MODELS.get(key, options);

      // 4. Safe Fallback to Prevent 503 Crash on Missing Keys
      if (!object) {
        return new Response(
          JSON.stringify({
            error: "Asset Not Found in Sovereign Vault",
            queriedKey: key,
            originalPath: url.pathname,
            reconciliation: "Ensure you uploaded the file to R2 inside the directory: " + key.substring(0, key.lastIndexOf('/'))
          }),
          {
            status: 404,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            }
          }
        );
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Expose-Headers', '*');
      headers.set('Cache-Control', 'public, max-age=31536000');

      // 5. Handle Range Requests for wllama chunked downloads
      const isRange = req.headers.has('range') && object.size !== undefined;
      const status = isRange ? 206 : 200;

      return new Response(object.body, {
        status,
        headers
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
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          }
        }
      );
    }
  }
};