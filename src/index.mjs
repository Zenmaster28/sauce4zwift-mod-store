import * as net from './net.mjs';
import {marked} from './marked.mjs';

let directory;
const installs = new Map();
const ranks = new Map();
let installed;

const upArrowP = fetch('images/up-arrow.svg').then(x => x.text());
const downArrowP = fetch('images/down-arrow.svg').then(x => x.text());
const heartP = fetch('images/pixel-heart.svg').then(x => x.text());

async function minWait(ms, promise) {
    await new Promise(r => setTimeout(r, ms));
    return await promise;
}


function md2html(raw) {
    try {
        return raw ? marked.parse(raw, {breaks: true}) : '';
    } catch(e) {
        console.error('markdown error:', e);
        return '';
    }
}


function setHTMLMaybe(el, html) {
    if (el._prevHTML !== html) {
        el._prevHTML = html;
        el.innerHTML = html;
    }
}


function setTextMaybe(el, text) {
    if (el._prevText !== text) {
        el._prevText = text;
        el.textContent = text;
    }
}


async function render() {
    setHTMLMaybe(document.querySelector('.directory'), (await Promise.all(directory.map(async x => {
        const newestRel = x.releases.sort((a, b) => b.updated - a.updated)[0];
        return `
            <div class="mod" data-id="${x.id}">
                <header>
                    <div class="name">${x.name}</div>

                    <div class="filler"></div>

                    <div class="meta flex">
                        <a class="install-remove if-has-connection" href="javascript:void(0);">
                            <div class="tag if-no-restart-required if-not-installed install">install</div>
                            <div class="tag if-no-restart-required if-installed remove">remove</div>
                            <div class="tag if-restart-required restart">restart required</div>
                        </a>
                        <div class="if-init disconnected">
                            <div class="tag">Looking for Sauce...</div>
                        </div>
                        <div class="if-not-init if-no-connection disconnected">
                            <div class="tag">disconnected</div>
                        </div>
                    </div>

                    <div class="meta flex" title="Community Ranking">
                        <div class="if-no-restart-required if-installed vote">
                            <a data-vote="up" title="Give an up vote">${await upArrowP}</a>
                            <a data-vote="down" title="Give a down vote">${await downArrowP}</a>
                        </div>
                        <div class="rank-badge">
                            <div class="rank-value">${ranks.get(x.id)?.rank ?? '0'}</div>
                            <div class="rank-icon">${await heartP}</div>
                        </div>
                    </div>
                    <div class="meta">${newestRel.version}</div>
                    ${newestRel.size ?
                        `<div class="meta">${Math.round(newestRel.size / 1024)} KB</div>` :
                        ''}
                    <div class="meta">Updated: ${new Date(newestRel.updated).toLocaleDateString()}</div>
                </header>
                <main>
                    <section class="left">
                        <img class="mod-logo" src="${x.logoURL || '/images/missing-mod-logo.webp'}"/>
                    </section>
                    <section class="right">
                        <div class="mod-description markdown">${md2html(x.description)}</div>
                        ${newestRel.notes ? `
                            <div class="release-info">
                                <header>RELEASE NOTES:</header>
                                <div class="notes markdown">${md2html(newestRel.notes)}</div>
                            </div>
                        ` : ''}
                    </section>
                </main>
                <footer>
                    <div class="author">
                        ${x.authorAvatarURL ?
                            `<a class="author-avatar" external target="_blank" href="${x.authorURL || ''}"><img src="${x.authorAvatarURL}"/></a>` :
                            ''}
                        <div>
                            <small>Author:</small><br/>
                            <a class="author-name" external target="_blank" href="${x.authorURL || ''}">${x.authorName}</a>
                        </div>
                    </div>
                    <div class="tags">${(x.tags || []).map(t => `<div class="tag">${t}</div>`).join('')}</div>
                    ${x.homeURL ?
                        `<div class="meta"><a external target="_blank" href="${x.homeURL}">Website</a></div>` :
                        ''
                    }
                    <div class="meta"><span class="installs-value">${installs.get(x.id) ?? '-'}</span> installs</div>
                    <div class="meta">Created: ${new Date(x.created).toLocaleDateString()}</div>
                </footer>
            </div>
        `;
    }))).join('\n'));
    updateInstalledMods();
}


async function loadRankInfo() {
    await Promise.all(directory.map(async x => {
        const value = await net.getRank(x.id);
        ranks.set(x.id, value);
        const modEl = document.querySelector(`.directory .mod[data-id="${x.id}"]`);
        if (modEl) {
            setTextMaybe(modEl.querySelector('.rank-value'), value.toLocaleString());
        }
    }));
}


async function loadInstallInfo() {
    await Promise.all(directory.map(async x => {
        const count = await net.getInstalls(x.id);
        installs.set(x.id, count);
        const modEl = document.querySelector(`.directory .mod[data-id="${x.id}"]`);
        if (modEl) {
            setTextMaybe(modEl.querySelector('.installs-value'), count.toLocaleString());
        }
    }));
}


async function main() {
    if (window.electron?.context) {
        document.documentElement.classList.add('electron');
    }
    try {
        CSS.registerProperty({
            name: "--progress",
            syntax: "<number>",
            inherits: true,
            initialValue: 0,
        });
    } catch(e) {/*no-pragma*/}
    const q = new URLSearchParams(location.search);
    if (q.has('preview')) {
        directory = [];
        document.documentElement.classList.add('preview-mode');
        addEventListener('message', ev => {
            directory.length = 0;
            const entry = JSON.parse(ev.data);
            if (entry && entry.releases && entry.name) {
                directory.push(JSON.parse(ev.data));
            }
            render();
        });
    } else {
        directory = await net.fetchJSON('/directory.json');
    }
    preloadImages();
    document.documentElement.addEventListener('click', async ev => {
        const modIdEl = ev.target.closest('.mod[data-id]');
        if (!modIdEl) {
            return;
        }
        const modId = modIdEl.dataset.id;
        let btn;
        if ((btn = ev.target.closest('a.install-remove .install'))) {
            const entry = directory.find(x => x.id === modId);
            btn.classList.add('busy');
            try {
                await minWait(4000, net.basicRPC('installPackedMod', modId));
            } catch(e) {
                console.error(e);
                alert(e.message);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        } else if ((btn = ev.target.closest('a.install-remove .remove'))) {
            btn.classList.add('busy');
            try {
                await minWait(4000, net.basicRPC('removePackedMod', modId));
            } catch(e) {
                console.error(e);
                alert(e.message);
            } finally {
                btn.classList.remove('busy');
            }
            await updateModStatus();
        } else if ((btn = ev.target.closest('a.install-remove .restart'))) {
            btn.classList.add('busy');
            try {
                await minWait(4000, net.basicRPC('restart'));
            } catch(e) {
                console.error(e);
                alert(e.message);
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
                ranks.set(modId, rank);
            } finally {
                btn.classList.remove('busy');
            }
            await render();
        }
    });
    await loadInstallInfo();
    directory.sort((a, b) => a.preview ? -1 : b.preview ? 1 : (installs.get(b.id) || 0) - (installs.get(a.id) || 0));
    await render();
    loadRankInfo();  // bg okay
    setTimeout(() => document.documentElement.classList.remove('init'), 2000);
    await updateModStatus();
    setInterval(updateModStatus, 5000);
}


function preloadImages() {
    const urls = [];
    for (const x of directory) {
        for (const key of ['logoURL', 'authorAvatarURL']) {
            if (x[key]) {
                urls.push(x[key]);
            }
        }
    }
    document.head.append(...urls.map(x => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = x;
        link.as = 'image';
        return link;
    }));
}


async function updateModStatus() {
    if (document.querySelector('.busy')) {
        return;
    }
    await net.probeLocalSauce();
    try {
        installed = await net.basicRPC('getAvailableModsV1');
    } catch(e) {
        installed = undefined;
    }
    document.documentElement.classList.remove('init');
    if (installed) {
        document.documentElement.classList.add('has-connection');
    } else {
        document.documentElement.classList.remove('has-connection');
    }
    updateInstalledMods();
}


function updateInstalledMods() {
    for (const el of document.querySelectorAll(`.mod[data-id]`)) {
        el.classList.remove('restart-required', 'installed');
    }
    if (!installed) {
        return;
    }
    for (const x of installed) {
        if (!x.packed) {
            continue;
        }
        const el = document.querySelector(`.mod[data-id="${x.id}"]`);
        if (el) {
            if (x.restartRequired) {
                el.classList.add('restart-required');
            } else if (x.enabled) {
                el.classList.add('installed');
            }
        }
    }
}


main();
