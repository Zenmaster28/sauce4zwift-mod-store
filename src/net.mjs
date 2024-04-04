
const modRankUrl = 'https://mod-rank.sauce.llc';
let localSauceURL;
let localSauceElectron;


export async function fetchJSON(url, options={}) {
    const resp = await fetch(url, options).catch(e => {
        if (options.silent) {
            return {ok: false};
        } else {
            throw e;
        }
    });
    if (resp.ok) {
        return await resp.json();
    } else if (!options.silent) {
        console.error('Fetch error:', resp.status, await resp.text());
        throw new Error('Fetch Error: ' + resp.status);
    }
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
    } else {
        console.warn("No Sauce connection available");
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
    } else if (localSauceURL) {
        return;
    }
    const urls = [
        'http://127.0.0.1:1080',
        'http://localhost:1080',
    ];
    for (const url of urls) {
        try {
            const resp = await fetch(`${url}/api/mods/v1`);
            if (!resp.ok) {
                throw new Error('nope');
            }
            await resp.json();
            if (!localSauceURL) {
                localSauceURL = url;
                break;
            }
        } catch(e) {}
    }
}


export async function getInstalls(id) {
    return (await fetchJSON(`https://mod-rank.sauce.llc/${id}-onlyinstalls.json`, {silent: true})) || 0;
}


export async function getRank(id) {
    return (await fetchJSON(`https://mod-rank.sauce.llc/${id}-onlyrank.json`, {silent: true})) || 0;
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
