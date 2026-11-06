const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../release.js'), 'utf8').replace(/\r\n/g, '\n');
const instrumentedSource = source.replace(
    "    init();\n    document.addEventListener('turbo:load', init);",
    `    window.releaseTest = { getCurrentOS, getCurrentArch, parseFileArch, parseFileGroup,
        calculateMatchScore, getAssetRows, getAssetLink, formatAndSortUI, findTagNameForAssets };
    init();
    document.addEventListener('turbo:load', init);`
);
if (instrumentedSource === source) throw new Error('Cannot instrument release.js');

function row(name, { tag = 'li', classes = '', role = '', href, renamed = false } = {}) {
    href ||= `/owner/repo/releases/download/v1/${encodeURIComponent(name)}`;
    return `<${tag} ${role ? `role="${role}"` : ''} class="${classes}" data-file="${name}">
        <div class="asset-name"><a href="${href}"><span>${renamed ? 'Renamed asset' : name}</span></a></div>
        <div class="col-md-6"><div class="flex-1 d-sm-none d-md-none">sha256:example</div><span>10 MB</span></div>
    </${tag}>`;
}

function release(rows, { listTag = 'ul', listRole = '', summary = 'Assets', open = true, fragment = '' } = {}) {
    return `<details id="assets" ${open ? 'open' : ''}><summary><span>${summary}</span></summary>
        ${fragment ? `<include-fragment src="${fragment}">` : ''}
        <${listTag} id="asset-list" ${listRole ? `role="${listRole}"` : ''}>${rows}</${listTag}>
        ${fragment ? '</include-fragment>' : ''}</details>`;
}

function savedRow(number) {
    return fs.readFileSync(path.join(__dirname, `../../docs/html/release${number || ''}.html`), 'utf8');
}

module.exports = { source, instrumentedSource, row, release, savedRow };
