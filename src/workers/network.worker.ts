// src/workers/network.worker.ts
import * as Comlink from 'comlink';

class NetworkWorker {
    private searxngInstances = [
        'https://searx.be',
        'https://search.mdosch.de',
        'https://searx.tiekoetter.com',
        'https://paulgo.io',
        'https://searx.work',
        'https://searx.ro',
        'https://search.bus-hit.me',
        'https://searx.nixnet.services'
    ];

async search(query: string): Promise<string[]> {
        const controller = new AbortController();
        // Retaining your excellent 30-second timeout architecture
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Shuffle instances to distribute load and prevent rate-limiting
        const instances = this.searxngInstances.sort(() => 0.5 - Math.random());

        for (const instance of instances) {
            try {
// CRITICAL FIX: Wrap the SearXNG request in a public CORS proxy to bypass browser blocks
                const targetUrl = `${instance}/search?q=${encodeURIComponent(query)}&format=json&safesearch=1`;
                const proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

                const response = await fetch(proxiedUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    credentials: 'omit', 
                    signal: controller.signal
                });

                if (!response.ok) {
                    console.warn(`[Network Worker] Node ${instance} returned ${response.status}, rotating...`);
                    continue;
                }

                const data = await response.json();
                clearTimeout(timeoutId);

                if (data && data.results && data.results.length > 0) {
                    const chunks: string[] = [];

                    // Extract clean text directly from the JSON payload
                    for (const result of data.results.slice(0, 5)) {
                        const cleanText = (result.content || result.snippet || '').trim();
                        if (cleanText) chunks.push(cleanText);
                    }

                    return chunks;
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    console.error("[Network Worker] Search timed out.");
                    return [];
                }
                // If a node fails due to CORS or downtime, silently catch and try the next
                console.warn(`[Network Worker] Node ${instance} failed, rotating...`);
                continue;
            }
        }

        clearTimeout(timeoutId);
        console.error("[Network Worker] All search nodes failed or timed out.");
        return [];
    }
}

Comlink.expose(new NetworkWorker());