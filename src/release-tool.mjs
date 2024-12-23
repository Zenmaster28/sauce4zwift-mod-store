import * as net from './net.mjs';
import * as modsCore from 'https://cdn.jsdelivr.net/gh/SauceLLC/sauce4zwift@85f10fb675881d5bb34154b34d5540a71d5cc350/src/mods-core.mjs';
import * as fflate from 'https://cdn.skypack.dev/fflate@0.8.2';

let relUrlInput;
let fileInput;
let directory;
let draftRelease;
let draftEntry = {};
let manifest;

const qs = document.querySelector.bind(document);
const qsAll = document.querySelectorAll.bind(document);


async function sha256(data) {
    const ab = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(ab)).map(x => x.toString(16).padStart(2, '0')).join('');
}


function formToEntry() {
    const form = qs('form#fields');
    const obj = draftEntry;
    for (const input of form.querySelectorAll('input,textarea,select')) {
        if (input.hasAttribute('writeonly')) {
            continue;
        }
        let o = obj;
        let key;
        if (input.classList.contains('release')) {
            key = input.dataset.releaseKey;
            o = obj.releases.at(-1);
        } else {
            key = input.dataset.entryKey;
        }
        if (key == null) {
            continue;
        }
        let value = input.value === '' ? undefined : input.value;
        if (input.type === 'number') {
            value = Number(value);
        } else if (input.type === 'date') {
            value = (new Date(value)).getTime() + ((new Date()).getTimezoneOffset() * 60000);
        } else if (input.type === 'datetime-local') {
            value = new Date(value).getTime();
        } else if (key === 'tags') {
            value = value ? value.split(',').map(x => x.trim()) : undefined;
        } else if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.value === undefined) {
            console.error("Missed form input:", input);
            debugger;
        }
        o[key] = value;
    }
    draftEntry.releases.at(-1).updated = Date.now();
}


function entryToForm() {
    const form = qs('form#fields');
    for (const input of form.querySelectorAll('input,textarea,select')) {
        let obj = draftEntry;
        let key;
        if (input.classList.contains('release')) {
            key = input.dataset.releaseKey;
            obj = obj.releases.at(-1);
        } else {
            key = input.dataset.entryKey;
        }
        if (key == null) {
            continue;
        }
        const value = obj[key];
        if (['number', 'text', 'url', 'email', 'textarea', 'select-one'].includes(input.type)) {
            if (Array.isArray(value)) {
                input.value = value.join(',');
            } else {
                input.value = value == null ? '' : value;
            }
        } else if (['date', 'datetime-local'].includes(input.type)) {
            input.valueAsNumber = value;
        } else if (input.type === 'checkbox') {
            input.checked = !!value;
        } else {
            console.error("Missed form input:", input);
            debugger;
        }
    }
}


function setEntry(entry) {
    if (entry) {
        draftEntry = structuredClone(entry);
        draftEntry.name = manifest.name;
        qs('form#fields').classList.remove('disabled');
    } else {
        draftEntry = {
            name: manifest.name,
            releases: []
        };
    }
    if (!qs('input[name="replace-release"]').checked || !draftEntry.releases.length) {
        draftEntry.releases.push({});
    }
    Object.assign(draftEntry.releases.at(-1), draftRelease, {updated: Date.now()});
    entryToForm();
}


async function refreshFile() {
    qs('form#fields').classList.add('disabled');
    for (const x of qsAll('.edit-fields')) {
        x.classList.add('loading');
    }
    output.classList.remove('error');
    output.innerHTML = '';
    qs('form#fields').reset();
    manifest = undefined;
    try {
        const file = fileInput.files[0];
        if (!file) {
            return;
        }
        const data = await file.arrayBuffer();
        const hash = await sha256(data);
        const zip = fflate.unzipSync(new Uint8Array(data), {filter: x => x.name.endsWith('/manifest.json')});
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
        console.info({manifest});
        const {warnings} = modsCore.validateMod({manifest});
        if (manifest.name.match(/\bsauce\b/i)) {
            warnings.push('Manifest name contains redundant reference to "sauce".\n' +
                'The Mod name is only ever used within the context of Sauce for Zwift Mods.\n' +
                'Consider using Sauce and/or Mod references in your README instead.');
        }
        if (manifest.name.match(/\bmods?\b/i)) {
            warnings.push('Manifest name contains redundant reference to "mod".\n' +
                'The Mod name is only ever used within the context of Sauce for Zwift Mods.\n' +
                'Consider using Sauce and/or Mod references in your README.');
        }
        if (warnings.length) {
            output.classList.add('error');
            output.textContent = `Blocking Mod issues:\n` + warnings.join('\n');
            return;
        }
        qs('.manifest-name').textContent = manifest.name;
        draftRelease = {
            version: manifest.version,
            hash,
            url: null,
            size: data.byteLength,
        };
        const upload = await net.uploadReleaseAsset(file);
        if (upload.hash !== hash) {
            throw new Error("server hash is not same as local hash");
        }
        console.info({upload});
        draftRelease.url = upload.url;
        setEntry(directory.find(x => x.name === manifest.name));
        renderOutput();
        qs('form#fields').classList.remove('disabled');
    } catch(e) {
        console.error(e, e.responseJson);
        output.classList.add('error');
        if (e.responseJson) {
            output.textContent = JSON.stringify(e.responseJson, null, 2);
        } else {
            output.textContent = e.stack;
        }
    } finally {
        qsAll('.edit-fields').forEach(x => x.classList.remove('loading'));
    }
}


function renderOutput() {
    qs('iframe#preview').contentWindow.postMessage(JSON.stringify(draftEntry));
    output.innerHTML = `
        <k>Draft <code>directory.json</code> entry...</k>
        <pre class="json-box"></pre>
    `;
    output.querySelector('.json-box').textContent = JSON.stringify(draftEntry, null, 4);
}


async function main() {
    directory = await fetch('/directory.json').then(x => x.json());
    qs('select[name="id-choices"]').innerHTML += directory.map(x =>
        `<option value="${x.id}">${x.name}</option>`).join('\n');
    qs('select[name="id-choices"]').addEventListener('input', ev => {
        let id = ev.currentTarget.value;
        if (!id) {
            setEntry(null);
            draftEntry.id = crypto.randomUUID();
        } else {
            setEntry(directory.find(x => x.id === id));
        }
        entryToForm();
    });
    qs('input[name="replace-release"]').addEventListener('input', ev => {
        const srcEntry = directory.find(x => x.id === draftEntry.id);
        if (srcEntry) {
            draftEntry.releases = structuredClone(srcEntry.releases);
        } else {
            draftEntry.releases.length = 0;
        }
        if (draftEntry.releases.filter(x => x.version === manifest.version).length) {
            alert('Duplicate version detected.\nIncrement the version number in your manifest.');
            ev.currentTarget.checked = true;
        }
        setEntry(draftEntry);
    });
    fileInput = qs('input[type="file"][name="zip"]');
    fileInput.addEventListener('change', ev => refreshFile());
    fileInput.addEventListener('click', ev => {
        // file input is broken, you need to clear it to make it refresh consistently
        ev.currentTarget.value = null;
    });
    qs('form#fields').addEventListener('input', ev => {
        formToEntry();
        renderOutput();
        qs('form#fields').classList.remove('disabled');
    });
}

main();
