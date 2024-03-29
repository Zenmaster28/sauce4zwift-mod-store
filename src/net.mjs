
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
            const url = swReg?.active ? `/swproxy/${ns}/${urn}` : `${fallback}/${urn}`;
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


export async function getInstalls(id) {
    try {
        const installs = await fetchJSON(`https://mod-rank.sauce.llc/${id}-installs.json`);
        return installs.count;
    } catch(e) {
        console.warn("Probably no installs yet:", e.message);
        return 1;
    }
}


export async function getRank(id) {
    try {
        const installs = await fetchJSON(`https://mod-rank.sauce.llc/${id}-rank.json`);
        return installs.rank;
    } catch(e) {
        console.warn("Probably not ranked yet:", e.message);
        return 1;
    }
}


export async function upVote(id) {
    return await fetchJSON(`https://mod-rank.sauce.llc/edit/${id}/rank`, {
        method: 'POST',
        body: JSON.stringify(1),
        headers: {'content-type': 'application/json'}
    });
}


export async function downVote(id) {
    return await fetchJSON(`https://mod-rank.sauce.llc/edit/${id}/rank`, {
        method: 'POST',
        body: JSON.stringify(0),
        headers: {'content-type': 'application/json'}
    });
}


navigator.serviceWorker.register('/sw.mjs', {scope: './'});
