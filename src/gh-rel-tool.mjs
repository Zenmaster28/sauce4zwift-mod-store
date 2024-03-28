import * as net from './net.mjs';
import * as github from './github.mjs';

let relUrlInput;


const _cleanValueEl = document.createElement('div');
function cleanValue(value) {
    if (value == null) {
        return `<i>&lt;${value}&gt;</i>`;
    }
    _cleanValueEl.textContent = value;
    try {
        return _cleanValueEl.innerHTML;
    } finally {
        _cleanValueEl.innerHTML = '';
    }
}


async function refreshUrl() {
    output.classList.remove('error');
    output.innerHTML = '';
    try {
        const [_na, org, repo, tag] = relUrlInput.value.match(/github\.com\/(.*?)\/(.*?)\/releases\/tag\/(.*)/);
        const rel = await github.getGithubReleaseByTag(org, repo, tag);
        output.innerHTML = 'Validating files...';
        await net.probeLocalSauce();
        for (const x of rel.assets) {
            Object.assign(x, await net.basicRPC('validatePackedMod', x.browser_download_url));
        }
        const _ = cleanValue;
        output.innerHTML = `
            <k>Release ID:</k><v>${rel.id}</v><br/>
            <k>Release Name:</k><v>${rel.name}</v><br/>
            <k>Assets...</k><br/>
            ${rel.assets.map(x => `
                <div class="box">
                    <k>ID:</k><v>${_(x.id)}</v><br/>
                    <k>File hash:</k><v>${_(x.hash)}</v><br/>
                    <k>Name:</k><v>${_(x.name)}</v><br/>
                    <k>Size:</k><v>${Math.round(x.size / 1024).toLocaleString()} KB</v><br/>

                    <k>Manifest...</k>
                    <div class="box">
                        <k>ID:</k><v>${_(x.manifest.id)}</v><br/>
                        <k>Author:</k><v>${_(x.manifest.author)}</v><br/>
                        <k>Name:</k><v>${_(x.manifest.name)}</v><br/>
                        <k>Description:</k><v>${_(x.manifest.description)}</v><br/>
                        <k>Website URL:</k><v>${_(x.manifest.website_url)}</v><br/>

                        <k>Version:</k><v>${_(x.manifest.version)}
                            ${x.manifest.version === tag ?
                                '<span class="good">(matches release)</span>' :
                                `<span class="bad">(does not match release: ${tag})</span>`}
                        </v><br/>
                    </div>

                    <k>Example <code>directory.json</code> entry...</k>
                    <pre class="box">${JSON.stringify({
                        type: 'github',
                        org,
                        id: '<...UUID4 (random) for your Mod (never changes)...>',
                        id: '<...UUID4 (random) value for your mod, never changes...>',
                        
                    })</pre>
    

                    <a href="/index.html?preview=${org},${repo},${rel.id},${x.id}">Preview Page</a>
                </div>
            `).join('')}
        `;
        console.log('release resp:', rel);
    } catch(e) {
        output.classList.add('error');
        output.textContent = e.stack;
    }
}

async function main() {
    relUrlInput = document.querySelector('input[name="relurl"]');
    let to;
    relUrlInput.addEventListener('input', ev => {
        clearTimeout(to);
        to = setTimeout(refreshUrl, 2000);
    });
    relUrlInput.value = 'https://github.com/mayfield/s4z-wolf3d-mod/releases/tag/v0.1.0';
    refreshUrl();
}


main();
