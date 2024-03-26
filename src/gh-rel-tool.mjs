import * as net from './net.mjs';
import * as github from './github.mjs';

let relUrlInput;

async function refreshUrl() {
    output.classList.remove('error');
    output.innerHTML = '';
    try {
        const [_, org, repo, tag] = relUrlInput.value.match(/github\.com\/(.*?)\/(.*?)\/releases\/tag\/(.*)/);
        const rel = await github.getGithubReleaseByTag(org, repo, tag);
        output.innerHTML = `
            <k>Release ID:</k><v>${rel.id}</v><br/>
            <k>Release Name:</k><v>${rel.name}</v><br/>
            <k>Assets...</k><br/>
            ${rel.assets.map(x => `
                <div class="box">
                    <k>ID</k>:<v>${x.id}</v><br/>
                    <k>Name</k>:<v>${x.name}</v><br/>
                    <k>Size</k>:<v>${x.size}</v><br/>
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
}


main();
