const mods = [];


function render() {
    document.querySelector('.directory').innerHTML = mods.map(x => `
        <div class="mod" data-id="${x.id}">
            <header>
                <a download class="install name" href="${x.releases[0].url}">${x.name}</a>
                <div class="tag installed-only installed">installed</div>
                <div class="filler"></div>
                <div class="meta" title="Community Stars">${x.stars} ⭐</div>
                <div class="meta">${x.releases[0].version}</div>
                <div class="meta">Updated: ${x.releases[0].published.toLocaleDateString()}</div>
            </header>
            <main>
                <section class="left">
                    <a download class="install" href="${x.releases[0].url}">
                        <img class="mod-logo" src="${x.logoURL}"/>
                    </a>
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
                url: x.trustedAsset.url,
                name: x.name,
                notes: x.body,
                version: x.tag_name,
                published: new Date(x.published_at),
                size: x.trustedAsset.size,
            };
        }),
    };
}


async function probeLocalSauceMods() {
    const urls = [
        'http://localhost:1080/api/mods/v1',
        'http://127.0.0.1:1080/api/mods/v1',
    ];
    return await Promise.race(urls.map(async url => {
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                throw new Error('nope');
            }
            return (await resp.json()).filter(x => x.enabled);
        } catch(e) {
            return new Promise(() => void 0); // hang
        }
    }));
}


async function main() {
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
    probeLocalSauceMods().then(installed => {
        console.debug({installed});
        for (const x of installed) {
            const el = document.querySelector(`.mod[data-id="${x.id}"]`);
            if (el) {
                el.classList.add('installed');
            }
        }
    });
}

main();
