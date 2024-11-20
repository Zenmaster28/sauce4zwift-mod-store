import * as net from './net.mjs';
import * as modsCore from 'https://cdn.jsdelivr.net/gh/SauceLLC/sauce4zwift@85f10fb675881d5bb34154b34d5540a71d5cc350/src/mods-core.mjs';
import * as fflate from 'https://cdn.skypack.dev/fflate@0.8.2';

let relUrlInput;
let fileInput;
let directory;
const mod = {
    releases: [{}],
};

const qs = document.querySelector.bind(document);


async function sha256(data) {
    const ab = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(ab)).map(x => x.toString(16).padStart(2, '0')).join('');
}


function formToModObject() {
    const form = qs('form');
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
            value = (new Date(value)).getTime() + ((new Date()).getTimezoneOffset() * 60000);
        } else if (input.type === 'datetime-local') {
            value = new Date(value).getTime();
        } else if (input.name === 'tags') {
            value = value ? value.split(',') : undefined;
        }
        o[key] = value;
    }
}


async function refreshFile() {
    editFields.classList.add('loading', 'disabled');
    output.classList.remove('error');
    output.innerHTML = '';
    try {
        const file = fileInput.files[0];
        if (!file) {
            form
            return;
        }
        const data = await file.arrayBuffer();
        const hash = await sha256(data);
        const zip = fflate.unzipSync(new Uint8Array(data), {filter: x => x.name.endsWith('/manifest.json')});
        let manifest;
        for (const [fqFile, data] of Object.entries(zip)) {
            if (fqFile.split('/').length > 2) {
                console.warn('Ignoring over nested manifest.json file', fqFile);
                continue
            }
            manifest = JSON.parse(new TextDecoder().decode(data));
            break;
        }
        if (!manifest) {
            throw new Error("manifest.json not found");
        }
        const {warnings} = modsCore.validateMod({manifest});
        if (warnings.length) {
            output.classList.add('error');
            output.textContent = `Blocking Mod issues:\n` + warnings.join('\n');
            return;
        }
        qs(`input[name="created"]`).value = new Date(0).toISOString().slice(0, 10);
        qs(`input[name="updated"]`).value = new Date().toISOString().slice(0, 16);
        mod.releases[0].hash = hash;
        mod.releases[0].url = '<TBD>';
        mod.releases[0].size = data.byteLength;
        console.log(manifest);
        for (const [key, value] of Object.entries(manifest)) {
            const input = qs(`[name="${key}"],[data-mod-key="${key}"]`);
            if (!input) {
                continue;
            }
            if (input.type === 'datetime-local') {
                input.value = new Date(value).toISOString().slice(0, -8);
            } else if (input.type === 'date') {
                input.value = new Date(value).toLocaleDateString('sv-SE');
            } else {
                input.value = value;
            }
        }
        formToModObject();
        renderOutput();
        editFields.classList.remove('disabled');
    } catch(e) {
        console.error(e);
        output.classList.add('error');
        output.textContent = e.stack;
    } finally {
        editFields.classList.remove('loading');
    }
}


function renderOutput() {
    output.innerHTML = `
        <k>Draft <code>directory.json</code> entry...</k>
        <pre class="json-box">${JSON.stringify(mod, null, 4)}</pre>
        <a target="mod-preview" href="/index.html?preview=${encodeURIComponent(JSON.stringify(mod))}">Preview Page</a>
    `;
}


async function main() {
    directory = await fetch('/directory.json').then(x => x.json());
    qs('select[name="id-choices"]').innerHTML += directory.map(x =>
        `<option value="${x.id}">${x.name}</option>`).join('\n');
    qs('select[name="id-choices"]').addEventListener('input', ev => {
        qs('input[name="id"]').value = ev.currentTarget.value;
    });
    fileInput = qs('input[type="file"][name="zip"]');
    fileInput.addEventListener('change', ev => {
        refreshFile();
    });
    qs('#generate-uuid').addEventListener('click', ev => {
        qs('select[name="id-choices"]').value = '';
        qs('input[name="id"]').value = crypto.randomUUID();
        formToModObject();
        renderOutput();
    });
    qs('form').addEventListener('input', ev => {
        formToModObject();
        renderOutput();
    });
}

main();
