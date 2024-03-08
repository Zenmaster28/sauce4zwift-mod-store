const mods = [];


function render() {
    document.querySelector('.directory').innerHTML = mods.map(x => `
        <div class="download">
            <a download href="${x.browser_download_url}">${x.name}</a>
            <div class="meta"> - ${x.download_count} downloads, ${Math.round(x.size / 1024)}KB</div>
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


async function main() {
    const dir = await fetchJSON('/directory.json');
    for (const x of dir) {
        try {
            const rel = await fetchJSON(`https://api.github.com/repos/${x.owner}/${x.repo}/releases/assets/${x.assetId}`);
            for (const x of rel.assets) {
                mods.push(x);
            }
        } catch(e) {
            console.warn("Ignoring release fetch error:", e);
        }
    }
    render();
}

main();
