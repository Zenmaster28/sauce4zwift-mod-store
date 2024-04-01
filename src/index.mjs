import * as net from './net.mjs';
import * as github from './github.mjs';
import * as selfhosted from './selfhosted.mjs';

const mods = [];
const ranks = new Map();


async function minWait(ms, promise) {
    await new Promise(r => setTimeout(r, ms));
    return await promise;
}

const greyPixelURL = 'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IA' +
    'rs4c6QAAAA1JREFUGFdjaG9v/w8ABcMClRAD5ZYAAAAASUVORK5CYII=';


function render() {
    document.querySelector('.directory').innerHTML = mods.map(x => {
        const newestRel = x.releases.sort((a, b) => a.updated - b.updated)[0];
        return `
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
                    <div class="meta" title="Community Ranking">
                        <div class="no-restart-required-only installed-only vote">
                            <a data-vote="up" title="Up vote">🠹</a>
                            <a data-vote="down" title="Down vote">🠻</a>
                        </div>
                        <span class="rank-value">${ranks.get(x.id)?.rank ?? '-'}</span> ⭐
                    </div>
                    <div class="meta">${newestRel.version}</div>
                    <div class="meta">Updated: ${new Date(newestRel.updated).toLocaleDateString()}</div>
                </header>
                <main>
                    <section class="left">
                        <img class="mod-logo" src="${x.logoURL}"/>
                    </section>
                    <section class="right">
                        <div class="mod-description">${x.description}</div>
                        ${newestRel.notes ? `
                            <div class="release-info">
                                <b>Release notes:</b><br/>
                                <div class="notes">${newestRel.notes}</div>
                            </div>
                        ` : ''}
                    </section>
                </main>
                <footer>
                    <div class="author">
                        <a class="author-avatar" href="${x.authorURL || ''}"><img src="${x.authorAvatarURL || greyPixelURL}"/></a>
                        <div>
                            <small>Author:</small><br/>
                            <a class="author-name" href="${x.authorURL || ''}">${x.authorName}</a>
                        </div>
                    </div>
                    <div class="tags">${(x.tags || []).map(t => `<div class="tag">${t}</div>`).join('')}</div>
                    <div class="meta"><span class="installs-value">${ranks.get(x.id)?.installs ?? '-'}</span> installs</div>
                    <div class="meta">Created: ${new Date(x.created).toLocaleDateString()}</div>
                </footer>
            </div>
        `;
    }).join('\n');
}


async function loadRankInfo(dir) {
    await Promise.all(dir.map(async x => {
        const [installs, rank] = await Promise.all([net.getInstalls(x.id), net.getRank(x.id)]);
        ranks.set(x.id, {installs, rank});
        const modEl = document.querySelector(`.directory .mod[data-id="${x.id}"]`);
        if (modEl) {
            modEl.querySelector('.installs-value').textContent = installs.toLocaleString();
            modEl.querySelector('.rank-value').textContent = rank.toLocaleString();
        }
    }));
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
        dir.unshift(JSON.parse(q.get('preview')));
    }
    loadRankInfo(dir);
    for (const entry of dir) {
        try {
            let parsedMod;
            if (entry.type === 'github') {
                parsedMod = await github.parseGithubRelease(entry);
            } else if (entry.type === 'selfhosted') {
                parsedMod = await selfhosted.parseSelfHostedRelease(entry);
            } else {
                console.error("Unsupported source:", entry.type);
            }
            if (parsedMod) {
                mods.push(parsedMod);
            }
        } catch(e) {
            console.warn("Ignoring release parse error:", e);
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
                await minWait(4000, net.basicRPC('installPackedMod', modId));
            } catch(e) {
                alert(e.stack);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        } else if ((btn = ev.target.closest('a.install-remove .remove'))) {
            btn.classList.add('busy');
            try {
                await minWait(4000, net.basicRPC('removePackedMod', modId));
            } catch(e) {
                alert(e.stack);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        } else if ((btn = ev.target.closest('a.install-remove .restart'))) {
            btn.classList.add('busy');
            try {
                await minWait(4000, net.basicRPC('restart'));
            } catch(e) {
                alert(e.stack);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        } else if ((btn = ev.target.closest('a[data-vote]'))) {
            btn.classList.add('busy');
            try {
                let rank;
                if (btn.dataset.vote === 'up') {
                    rank = await net.upVote(modId);
                } else if (btn.dataset.vote === 'down') {
                    rank = await net.downVote(modId);
                }
                ranks.get(modId).rank = rank;
            } finally {
                btn.classList.remove('busy');
            }
            render();
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
