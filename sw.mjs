self.addEventListener('install', ev => {
    self.skipWaiting(); // Replace existing worker (if any) immediately.
});

addEventListener('activate', ev => {
    // Take over loading page (and any other tabs) immediately..
    ev.waitUntil(clients.claim());
});

addEventListener("fetch", ev => {
    const url = new URL(ev.request.url);
    if (url.pathname.startsWith('/swproxy/gh')) {
        ev.respondWith((async () => {
            const cache = await caches.open('v3');
            let resp = await cache.match(ev.request);
            if (resp) {
                const ts = +resp.headers.get('x-sw-cache-ts');
                if (!ts || Date.now() - ts < 3600_000) {
                    console.debug('ServiceWorker Proxy cache-hit', ev.request.url);
                    return resp;
                }
            }
            const url = new URL(ev.request.url);
            console.info('ServiceWorker Proxy fetch:', url.pathname);
            url.protocol = 'https';
            url.hostname = 'api.github.com';
            url.port = '';
            url.pathname = url.pathname.replace(/^\/swproxy\/gh/, '');
            resp = await fetch(url.toString());
            if (resp.ok) {
                const cacheResp = new Response(resp.clone().body);
                for (const [k, v] of resp.headers.entries()) {
                    cacheResp.headers.append(k, v);
                }
                cacheResp.headers.set('x-sw-cache-ts', Date.now());
                cache.put(ev.request, cacheResp);
            }
            return resp;
        })());
    }
});
