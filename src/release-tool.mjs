import * as net from './net.mjs';
import * as modsCore from 'https://cdn.jsdelivr.net/gh/SauceLLC/sauce4zwift@85f10fb675881d5bb34154b34d5540a71d5cc350/src/mods-core.mjs';
import * as fflate from 'https://cdn.skypack.dev/fflate@0.8.2';

let relUrlInput;
let fileInput;
let directory;
let draftRelease;
let draftEntry = {};
let manifest;
const implications = new Map();
const newEntryId = crypto.randomUUID();

const outputEl = qs('.output');
const outputContentsEl = qs('.output .contents');
const implicationsEl = qs('.output .implications');
const fieldsFormEl = qs('form#fields');


function qs(selector) {
    return document.querySelector(selector);
}


function qsAll(selector) {
    return document.querySelectorAll(selector);
}


function checkFieldsForm() {
    const els = qsAll('#fields [data-entry-key]');
    const invalid = [];
    const onInvalid = ev => {
        const errors = [];
        for (const key in ev.target.validity) {
            if (ev.target.validity[key] === true) {
                errors.push(key);
            }
        }
        invalid.push({
            element: ev.target,
            errors,
        });
    };
    els.forEach(x => x.addEventListener('invalid', onInvalid));
    try {
        fieldsFormEl.checkValidity();
    } finally {
        els.forEach(x => x.removeEventListener('invalid', onInvalid));
    }
    if (invalid.length) {
        for (const x of invalid) {
            const key = x.element.dataset.entryKey;
            addError(`${key}: ${x.errors.join(', ')}`, `form-invalid:${key}`);
        }
    }
}


async function sha256(data) {
    const ab = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(ab)).map(x => x.toString(16).padStart(2, '0')).join('');
}


function clearImplications() {
    implications.clear();
}


function clearImplication(id) {
    implications.delete(id);
}


function addWarning(message, id) {
    id = id || JSON.stringify(['warning', message]);
    implications.set(id, {type: 'warning', message});
    return id;
}


function addError(message, id) {
    id = id || JSON.stringify(['warning', message]);
    implications.set(id, {type: 'error', message});
    return id;
}


function formToEntry() {
    const obj = draftEntry;
    for (const input of fieldsFormEl.querySelectorAll('input,textarea,select')) {
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
    for (const x of implications.keys()) {
        if (x.startsWith('form-invalid:')) {
            implications.delete(x);
        }
    }
    checkFieldsForm();
    draftEntry.releases.at(-1).updated = Date.now();
}


function entryToForm() {
    for (const input of fieldsFormEl.querySelectorAll('input,textarea,select')) {
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
    checkFieldsForm();
}


function setEntry(entry) {
    clearImplication('dup-version');
    if (entry) {
        draftEntry = structuredClone(entry);
        draftEntry.name = manifest.name;
        const srcEntry = directory.find(x => x.id === entry.id);
        if (srcEntry) {
            if (srcEntry.releases.some(x => x.version === manifest.version)) {
                addWarning('Duplicate version detected.\nIncrement the version number in your manifest.', 'dup-version');
            }
            draftEntry.releases = structuredClone(srcEntry.releases);
        } else {
            draftEntry.releases = [];
        }
    } else {
        draftEntry = {
            id: newEntryId,
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
    fieldsFormEl.classList.add('disabled');
    qsAll('.edit-fields').forEach(x => x.classList.add('loading'));
    outputContentsEl.innerHTML = '';
    fieldsFormEl.reset();
    manifest = undefined;
    clearImplications();
    outputEl.classList.add('pending');
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
        for (const x of warnings) {
            addWarning(x);
        }
        if (manifest.name.match(/\bsauce\b/i)) {
            addWarning('Manifest "name" contains the word "sauce".\n' +
                'Usage of this property is only used within the context of Sauce for Zwift Mods.\n' +
                'Consider using Sauce and/or Mod references in your README instead.');
        }
        if (manifest.name.match(/\bmods?\b/i)) {
            addWarning('Manifest "name" contains the word "mod".\n' +
                'Usage of this property is only used within the context of Sauce for Zwift Mods.\n' +
                'Consider using Sauce and/or Mod references in your README.');
        }
        qs('.manifest-name').textContent = manifest.name;
        draftRelease = {
            version: manifest.version,
            hash,
            url: null,
            size: data.byteLength,
        };
        if (!implications.size) {
            const upload = await net.uploadReleaseAsset(file);
            if (upload.hash !== hash) {
                throw new Error("server hash is not same as local hash");
            }
            console.info({upload});
            draftRelease.url = upload.url;
        }
        setEntry(directory.find(x => x.name === manifest.name));
        renderOutput();
        fieldsFormEl.classList.remove('disabled');
    } catch(e) {
        console.error('Package error:', e, e.responseJson);
        if (e.responseJson) {
            addError(JSON.stringify(e.responseJson, null, 2));
        } else {
            addError(e.stack);
        }
    } finally {
        qsAll('.edit-fields').forEach(x => x.classList.remove('loading'));
        outputEl.classList.remove('pending');
    }
}


function renderOutput() {
    const impTypes = Array.from(implications.values()).map(x => x.type);
    outputEl.classList.toggle('error', impTypes.indexOf('error') !== -1);
    outputEl.classList.toggle('warning', impTypes.indexOf('warning') !== -1);
    implicationsEl.innerHTML = '';
    outputContentsEl.innerHTML = '';
    if (implications.size) {
        let hasErrors;
        for (const x of implications.values()) {
            const el = document.createElement('div');
            if (x.type === 'error') {
                hasErrors = true;
            }
            el.classList.add('message', x.type);
            el.textContent = x.message;
            implicationsEl.append(el);
        }
        if (!hasErrors) {
            qs('iframe#preview').contentWindow.postMessage(JSON.stringify(draftEntry));
        }
        outputContentsEl.innerHTML = `<k>Draft <code>directory.json</code> entry: ` +
            `Unavailable until errors/warnings are fixed</k>`;
    } else {
        qs('iframe#preview').contentWindow.postMessage(JSON.stringify(draftEntry));
        outputContentsEl.innerHTML = `
            <k>Draft <code>directory.json</code> entry...</k>
            <pre class="json-box"></pre>
        `;
        outputContentsEl.querySelector('.json-box').textContent = JSON.stringify(draftEntry, null, 4)
            .replaceAll(/^/mg, '    ');
    }
}


async function main() {
    directory = await fetch('/directory.json').then(x => x.json());
    const idChoices = qs('select[name="id-choices"]');
    idChoices.querySelector('option[value=""]').value = newEntryId;
    idChoices.innerHTML += directory.map(x => `<option value="${x.id}">${x.name}</option>`).join('\n');
    qs('select[name="id-choices"]').addEventListener('input', ev => {
        let id = ev.currentTarget.value;
        if (!id) {
            setEntry(null);
        } else {
            setEntry(directory.find(x => x.id === id));
        }
        entryToForm();
    });
    qs('input[name="replace-release"]').addEventListener('input', ev => {
        setEntry(draftEntry);
    });
    fileInput = qs('input[type="file"][name="zip"]');
    fileInput.addEventListener('change', ev => refreshFile());
    fileInput.addEventListener('click', ev => {
        // file input is broken, you need to clear it to make it refresh consistently
        ev.currentTarget.value = null;
    });
    fieldsFormEl.addEventListener('input', ev => {
        formToEntry();
        renderOutput();
        fieldsFormEl.classList.remove('disabled');
    });
}

main();
