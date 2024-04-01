import * as net from './net.mjs';
import * as selfhosted from './selfhosted.mjs';

let relUrlInput;
const mod = {
    type: 'selfhosted',
    releases: [{}],
};


function formToModObject() {
    console.warn("form to obj", mod);
    const form = document.querySelector('form');
    const obj = mod;
    for (const input of form.querySelectorAll('input,textarea')) {
        let o = obj;
        const key = input.name;
        if (input.classList.contains('release')) {
            o = obj.releases[0];
        }
        let value = input.value === '' ? undefined : input.value;
        if (input.type === 'number') {
            value = Number(value);
        } else if (input.type === 'date') {
            value = new Date(value).getTime();
        } else if (input.name === 'tags') {
            value = value ? value.split(',') : undefined;
        }
        o[key] = value;
    }
}


async function refreshUrl() {
    output.classList.remove('error');
    output.innerHTML = '';
    try {
        output.innerHTML = 'Validating files...';
        await net.probeLocalSauce();
        const {hash, manifest} = await net.basicRPC('validatePackedMod', relUrlInput.value);
        document.querySelector(`input[name="created"]`).value = new Date(1).toLocaleDateString('sv-SE');
        document.querySelector(`input[name="updated"]`).value = new Date().toISOString().slice(0, -8);
        mod.created = 1;
        mod.updated = Date.now();
        mod.releases[0].hash = hash;
        mod.releases[0].url = relUrlInput.value;
        console.log(manifest);
        for (const [key, value] of Object.entries(manifest)) {
            const input = document.querySelector(`[name="${key}"],[data-mod-key="${key}"]`);
            if (!input) {
                console.warn(key);
                continue;
            }
            if (input.type === 'datetime' || input.type === 'date') {
                input.value = new Date(value).toISOString();
            } else {
                console.log(key, value);
                input.value = value;
            }
        }
        formToModObject();
        renderOutput();
    } catch(e) {
        console.error(e);
        output.classList.add('error');
        output.textContent = e.stack;
    }
}


function renderOutput() {
    output.innerHTML = `
        <k>Example <code>directory.json</code> entry...</k>
        <pre class="box" style="font-size: 10px; overflow: auto;">${JSON.stringify(mod, null, 4)}</pre>
        <a href="/index.html?preview=${encodeURIComponent(JSON.stringify(mod))}">Preview Page</a>
    `;
}


async function main() {
    relUrlInput = document.querySelector('input.release[name="url"]');
    let to;
    relUrlInput.addEventListener('input', ev => {
        clearTimeout(to);
        to = setTimeout(refreshUrl, 2000);
    });
    document.querySelector('form').addEventListener('input', ev => {
        formToModObject();
        renderOutput();
    });
    //relUrlInput.value = 'https://github.com/mayfield/s4z-wolf3d-mod/releases/download/v0.1.0/s4z-wolf3d-mod-main.1.zip';
    //refreshUrl();
}


main();
