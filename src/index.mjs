const mods = [];
let localSauceURL;
let localSauceElectron;


function render() {
    document.querySelector('.directory').innerHTML = mods.map(x => `
        <div class="mod" data-id="${x.id}">
            <header>
                <div class="name">
                    ${x.name}
                    <a class="install-remove has-connection-only" href="javascript:void(0);">
                        <div class="tag not-installed-only install">install</div>
                        <div class="tag installed-only remove">remove</div>
                    </a>
                </div>
                <div class="filler"></div>
                <div class="meta" title="Community Stars">${x.stars} ⭐</div>
                <div class="meta">${x.releases[0].version}</div>
                <div class="meta">Updated: ${x.releases[0].published.toLocaleDateString()}</div>
            </header>
            <main>
                <section class="left">
                    <img class="mod-logo" src="${x.logoURL}"/>
                </section>
                <section class="right">
                    <div class="desc">${x.description}</div>
                    <div class="release">
                        <b>Release notes:</b><br/>
                        <div class="notes">${x.releases[0].notes}</div>
                    </div>
                </section>
            </main>
            <footer>
                <div class="author">
                    <a class="author-avatar" href="${x.authorURL}"><img src="${x.authorAvatarURL}"/></a>
                    <div>
                        <small>Author:</small><br/>
                        <a class="author-name" href="${x.authorURL}">${x.authorName}</a>
                    </div>
                </div>
                <div class="tags">${x.tags.map(t => `<div class="tag">${t}</div>`).join('')}</div>
                <div class="meta">${Math.round(x.releases[0].size / 1024)}KB</div>
                <div class="meta">${x.installCount} installs</div>
                <div class="meta">Created: ${x.created.toLocaleDateString()}</div>
            </footer>
        </div>
    `).join('\n');
}


async function fetchJSON(...args) {
    const resp = await fetch(...args);
    if (resp.ok) {
        return await resp.json();
    } else {
        console.error('Fetch error:', resp.status, await resp.text());
        throw new Error('Fetch Error: ' + resp.status);
    }
}


async function fetchGH(urn) {
    return await fetchJSON(`/swproxy/gh/${urn.replace(/^\//, '')}`);
}


const githubUsers = new Map();
async function getGithubUser(id) {
    if (!githubUsers.has(id)) {
        githubUsers.set(id, fetchGH(`/users/${id}`));
    }
    return await githubUsers.get(id);
}


const githubRepos = new Map();
async function getGithubRepo(org, repo) {
    const key = `${org}/${repo}`;
    if (!githubRepos.has(key)) {
        githubRepos.set(key, fetchGH(`repos/${key}`));
    }
    return await githubRepos.get(key);
}


async function parseGithubRelease(entry) {
    const [repo, author, releases] = await Promise.all([
        getGithubRepo(entry.org, entry.repo),
        getGithubUser(entry.org),
        Promise.all(entry.releases.map(async x => {
            const rel = await fetchGH(`/repos/${entry.org}/${entry.repo}/releases/${x.id}`);
            const trustedAsset = rel.assets.find(xx => xx.id === x.assetId);
            if (!trustedAsset) {
                console.warn("Trusted asset not found:", x, entry);
            } else {
                return {...rel, trustedAsset};
            }
        })).then(x => x.filter(xx => xx)),
    ]);
    console.log({repo, author, releases});
    if (repo.disabled || repo.archived || !releases.length) {
        return;
    }
    return {
        id: entry.id,
        name: repo.name,
        description: repo.description,
        homeURL: repo.homepage || repo.html_url,
        logoURL: entry.logoURL,
        stars: repo.stargazers_count,
        tags: repo.topics,
        created: new Date(repo.created_at),
        authorName: author.name,
        authorURL: author.html_url,
        authorAvatarURL: author.avatar_url,
        installCount: releases.reduce((agg, x) => agg + x.trustedAsset.download_count, 0),
        releases: releases.map(x => {
            console.log(x);
            return {
                url: x.trustedAsset.browser_download_url,
                name: x.name,
                notes: x.body,
                version: x.tag_name,
                published: new Date(x.published_at),
                size: x.trustedAsset.size,
            };
        }),
    };
}


async function probeLocalSauce() {
    if (self.isElectron && self.electron && electron.ipcInvoke) {
        localSauceElectron = true;
        return;
    }
    const urls = [
        'http://localhost:1080',
        'http://127.0.0.1:1080',
    ];
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
}


async function basicRPC(cmd, ...args) {
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


async function main() {
    const localProbe = probeLocalSauce();
    const reg = await navigator.serviceWorker.register('/sw.mjs', {scope: './'});
    const dir = await fetchJSON('/directory.json');
    for (const entry of dir) {
        if (entry.type === 'github') {
            try {
                const m = await parseGithubRelease(entry);
                if (m) {
                    console.warn(m);
                    mods.push(m);
                }
            } catch(e) {
                console.warn("Ignoring release fetch error:", e);
            }
        } else {
            console.error("Unsupported source:", entry.type);
        }
    }
    render();
    document.documentElement.addEventListener('click', async ev => {
        const modIdEl = ev.target.closest('.mod[data-id]');
        if (!modIdEl) {
            return;
        }
        const modId = modIdEl.dataset.id;
        if (ev.target.closest('a.install-remove .install')) {
            const entry = dir.find(x => x.id === modId);
            await basicRPC('installPackedMod', modId);
            alert("did it");
        } else if (ev.target.closest('a.install-remove .remove')) {
            await basicRPC('removePackedMod', modId);
            alert("did it");
        }
    });
    await probeLocalSauce;
    const installed = await basicRPC('getAvailableMods');
    if (installed) {
        updateInstalledMods(installed);
    }
}


function updateInstalledMods(installed) {
    document.documentElement.classList.add('has-connection');
    console.debug({installed});
    for (const x of installed) {
        if (!x.enabled) {
            console.warn("Mod installed but disabled:", x.id);
            continue;
        }
        const el = document.querySelector(`.mod[data-id="${x.id}"]`);
        if (el) {
            el.classList.add('installed');
            //el.querySelector('a.install').href = 'javascript:void(0);';
        }
    }
}


main();
