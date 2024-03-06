const mods = [];


function render() {
    document.querySelector('.directory').innerHTML = mods.map(x => `
        <div class="download">
            <a download href="${x.browser_download_url}">${x.name}</a>
            <div class="meta"> - ${x.download_count} downloads, ${Math.round(x.size / 1024)}KB</div>
        </div>
    `).join('\n');
}


async function main() {
    const r = await fetch('https://api.github.com/repos/SauceLLC/sauce4zwift-mod-store/releases');
    const data = await r.json();
    for (const xMod of data) {
        for (const x of xMod.assets) {
            mods.push(x);
        }
    }
    render();
}

main();
