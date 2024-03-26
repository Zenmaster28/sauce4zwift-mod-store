import * as net from './net.mjs';
import * as github from './github.mjs';

const mods = [];


async function minWait(ms, promise) {
    await new Promise(r => setTimeout(r, ms));
    return await promise;
}


function render() {
    document.querySelector('.directory').innerHTML = mods.map(x => `
        <div class="mod" data-id="${x.id}">
            <header>
                <div class="name">
                    ${x.name}
                    <a class="install-remove has-connection-only" href="javascript:void(0);">
                        <div class="tag no-restart-required-only not-installed-only install">install</div>
                        <div class="tag no-restart-required-only installed-only remove">remove</div>
                        <div class="tag restart-required-only restart">restart required</div>
                    </a>
                    <div class="no-connection-only disconnected">
                        <div class="tag">disconnected</div>
                    </div>
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



async function main() {
    try {
        navigator.serviceWorker.register('/sw.mjs', {scope: './'});
        CSS.registerProperty({
            name: "--progress",
            syntax: "<number>",
            inherits: true,
            initialValue: 0,
        });
    } catch(e) {/*no-pragma*/}
    const localProbe = net.probeLocalSauce();
    const dir = await net.fetchJSON('/directory.json');
    const q = new URLSearchParams(location.search);
    if (q.get('preview')) {
        let [org, repo, relId, assetId] = q.get('preview').split(',');
        relId = Number(relId);
        assetId = Number(assetId);
        dir.unshift({
            type: 'github',
            org,
            repo,
            releases: [{
                id: relId,
                assetId,
            }]
        });
    }
    for (const entry of dir) {
        if (entry.type === 'github') {
            try {
                const m = await github.parseGithubRelease(entry);
                if (m) {
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
        let btn;
        if ((btn = ev.target.closest('a.install-remove .install'))) {
            const entry = dir.find(x => x.id === modId);
            btn.classList.add('busy');
            try {
                await minWait(5000, net.basicRPC('installPackedMod', modId));
            } catch(e) {
                alert(e.stack);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        } else if ((btn = ev.target.closest('a.install-remove .remove'))) {
            btn.classList.add('busy');
            try {
                await minWait(5000, net.basicRPC('removePackedMod', modId));
            } catch(e) {
                alert(e.stack);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        } else if ((btn = ev.target.closest('a.install-remove .restart'))) {
            btn.classList.add('busy');
            try {
                await minWait(5000, net.basicRPC('restart'));
            } catch(e) {
                alert(e.stack);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        }
    });
    await net.probeLocalSauce;
    await updateModStatus();
    setInterval(updateModStatus, 15000);
}


async function updateModStatus() {
    if (document.querySelector('.busy')) {
        return;
    }
    const installed = await net.basicRPC('getAvailableMods');
    if (installed) {
        document.documentElement.classList.add('has-connection');
    }
    updateInstalledMods(installed || []);
}


function updateInstalledMods(installed) {
    for (const el of document.querySelectorAll(`.mod[data-id]`)) {
        el.classList.remove('restart-required', 'installed');
    }
    for (const x of installed) {
        if (x.unpacked) {
            continue;
        }
        if (!x.enabled) {
            console.warn("Mod installed but disabled:", x.id);
            continue;
        }
        const el = document.querySelector(`.mod[data-id="${x.id}"]`);
        if (el) {
            if (x.restartRequired) {
                el.classList.add('restart-required');
            } else {
                el.classList.add('installed');
            }
        }
    }
}


main();
