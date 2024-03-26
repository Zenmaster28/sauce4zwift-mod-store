
let localSauceURL;
let localSauceElectron;

export async function fetchJSON(...args) {
    const resp = await fetch(...args);
    if (resp.ok) {
        return await resp.json();
    } else {
        console.error('Fetch error:', resp.status, await resp.text());
        throw new Error('Fetch Error: ' + resp.status);
    }
}


const _ghCache = new Map();
export function fetchProxy(ns, fallback, urn) {
    if (!_ghCache.has(urn)) {
        _ghCache.set(urn, (async () => {
            // The SW just provides more caching to avoid rate limits. It's optional.
            let swReg;
            try {
                swReg = await navigator.serviceWorker.getRegistration();
            } catch (e) {/*no-pragma*/}
            const url = swReg ? `/swproxy/${ns}/${urn}` : `${fallback}/${urn}`;
            return await fetchJSON(url);
        })());
    }
    return _ghCache.get(urn);
}


export async function basicRPC(cmd, ...args) {
    let env;
    if (localSauceElectron) {
        env = JSON.parse(await electron.ipcInvoke('rpc', cmd, ...args));
    } else if (localSauceURL) {
        const resp = await fetch(`${localSauceURL}/api/rpc/v1/${cmd}`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(args)
        });
        if (!resp.ok) {
            throw new Error('rpc error: ' + await resp.text());
        }
        env = await resp.json();
    }
    if (env) {
        if (!env.success) {
            console.error('rpc error:', env.error.stack);
            throw new Error(env.error.message);
        }
        return env.value;
    }
}


export async function probeLocalSauce() {
    if (self.isElectron && self.electron && electron.ipcInvoke) {
        localSauceElectron = true;
        return;
    }
    const urls = [
        'http://localhost:1080',
        'http://127.0.0.1:1080',
    ];
    let noConnTimeout = setTimeout(() => {
        document.documentElement.classList.remove('has-connection');
    }, 2000);
    await Promise.race(urls.map(async url => {
        try {
            const resp = await fetch(`${url}/api/mods/v1`);
            if (!resp.ok) {
                throw new Error('nope');
            }
            await resp.json();
            if (!localSauceURL) {
                localSauceURL = url;
            }
        } catch(e) {
            return new Promise(() => void 0); // hang
        }
    }));
    clearTimeout(noConnTimeout);
}


navigator.serviceWorker.register('/sw.mjs', {scope: './'});
