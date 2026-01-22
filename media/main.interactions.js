import { state } from './main.state.js';

let vscode, utils, draw, container, canvas;

export function initInteractions(vsc, dom, refs) {
    vscode = vsc;
    container = dom.container;
    canvas = dom.canvas;
    utils = refs.utils;
    draw = refs.draw;
}

export function createNameBar(cls, el) {
    const namebar = document.createElement('div');
    namebar.className = 'namebar';
    const leftGroup = document.createElement('div');
    leftGroup.className = 'leftGroup';

    // kind select
    const kind = document.createElement('select');
    ['class', 'abstract', 'interface', 'struct'].forEach(k => {
        const o = document.createElement('option');
        o.value = k; o.innerText = k;
        kind.appendChild(o);
    });
    kind.value = cls.isInterface ? 'interface' : (cls.isStruct ? 'struct' : (cls.isAbstract ? 'abstract' : 'class'));
    kind.addEventListener('change', () => {
        if (kind.value === 'interface') { cls.isInterface = true; cls.isAbstract = false; cls.isStruct = false; }
        else if (kind.value === 'abstract') { cls.isInterface = false; cls.isAbstract = true; cls.isStruct = false; }
        else if (kind.value === 'struct') { cls.isInterface = false; cls.isAbstract = false; cls.isStruct = true; }
        else { cls.isInterface = false; cls.isAbstract = false; cls.isStruct = false; }
        draw.requestRender();
    });
    leftGroup.appendChild(kind);

    // name area
    const nameText = document.createElement('div');
    nameText.className = 'nameText';
    if (state.editingNameId === cls.id) {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.value = state.editingDraft; inp.style.minWidth = '30px';
        nameText.appendChild(inp);
        setTimeout(() => inp.focus(), 0);
        inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                cls.name = inp.value.trim() || 'Unnamed';
                state.editingNameId = null; state.editingDraft = '';
                draw.requestRender();
            }
            else if (ev.key === 'Escape') { state.editingNameId = null; state.editingDraft = ''; draw.requestRender(); }
            else { state.editingDraft = inp.value; }
        });
        inp.addEventListener('blur', () => {
            setTimeout(() => { if (state.editingNameId === cls.id) inp.focus(); }, 0);
        });
    } else {
        nameText.innerText = cls.name;
        nameText.addEventListener('dblclick', (ev) => {
            state.editingNameId = cls.id; state.editingDraft = cls.name;
            draw.requestRender(); ev.stopPropagation();
        });
    }

    // Interfaces button
    const interfacesBtn = document.createElement('button');
    interfacesBtn.className = 'smallBtn interfacesBtn';
    interfacesBtn.title = 'Interfaces';
    interfacesBtn.innerText = 'Interfaces';
    interfacesBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        showInterfacesPopup(cls, el);
    });

    leftGroup.appendChild(interfacesBtn);
    leftGroup.appendChild(nameText);
    namebar.appendChild(leftGroup);

    // delete button
    const rightGroup = document.createElement('div');
    const delBtn = document.createElement('button');
    delBtn.className = 'deleteTop'; delBtn.innerText = '✕'; delBtn.title = 'Delete';
    delBtn.addEventListener('click', () => {
        const idx = state.model.classes.findIndex(x => x.id === cls.id);
        if (idx >= 0) {
            state.model.classes.splice(idx, 1);
            utils.cleanupReferencesById(cls.id);
            draw.requestRender();
        }
    });
    rightGroup.appendChild(delBtn);
    namebar.appendChild(rightGroup);

    return namebar;
}

export function initDragHandling(cls, el, namebar) {
    let isDragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    namebar.addEventListener('pointerdown', (ev) => {
        if (state.editingNameId === cls.id) return;
        const tgt = ev.target;
        if (tgt.closest && (tgt.closest('input') || tgt.closest('select') || tgt.closest('button') || tgt.closest('.nameText'))) return;
        isDragging = true; startX = ev.clientX; startY = ev.clientY; origX = cls.x; origY = cls.y;
        try { namebar.setPointerCapture(ev.pointerId); } catch (e) { console.log(e); }
    });
    window.addEventListener('pointermove', (ev) => {
        if (!isDragging) return;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        cls.x = origX + dx; cls.y = origY + dy;
        el.style.left = cls.x + 'px'; el.style.top = cls.y + 'px';
        draw.drawRelations();
    });
    window.addEventListener('pointerup', (ev) => {
        if (isDragging) {
            isDragging = false;
            try { namebar.releasePointerCapture(ev.pointerId); } catch { }
            draw.drawRelations();
        }
    });
}

function showInterfacesPopup(cls, anchorEl) {
    const existing = document.querySelector('.interfaces-popup');
    if (existing) existing.remove();

    const candidates = state.model.classes.filter(c => c.isInterface && c.id !== cls.id);

    const popup = document.createElement('div');
    popup.className = 'interfaces-popup';
    popup.setAttribute('role', 'dialog');
    popup.innerHTML = '<div class="ip-title">Select Interfaces</div>';
    const list = document.createElement('div');
    list.className = 'ip-list';

    if (candidates.length === 0) {
        const note = document.createElement('div'); note.className = 'ip-note'; note.innerText = 'No interface classes available.';
        list.appendChild(note);
    } else {
        for (const c of candidates) {
            const id = 'chk_' + c.id;
            const row = document.createElement('div'); row.className = 'ip-row';
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.value = c.id;
            if (Array.isArray(cls.interfaces) && cls.interfaces.indexOf(c.id) >= 0) cb.checked = true;
            const lbl = document.createElement('label'); lbl.htmlFor = id; lbl.innerText = c.name;
            row.appendChild(cb); row.appendChild(lbl);
            list.appendChild(row);
        }
    }
    popup.appendChild(list);

    const btnRow = document.createElement('div'); btnRow.className = 'ip-buttons';
    const ok = document.createElement('button'); ok.innerText = 'OK'; ok.className = 'smallBtn';
    const cancel = document.createElement('button'); cancel.innerText = 'Cancel'; cancel.className = 'smallBtn';
    btnRow.appendChild(ok); btnRow.appendChild(cancel);
    popup.appendChild(btnRow);

    document.body.appendChild(popup);

    const contRect = container.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    let left = anchorRect.right - contRect.left + container.scrollLeft + 8;
    let top = anchorRect.top - contRect.top + container.scrollTop;
    if (left + 250 > container.clientWidth) left = Math.max(8, anchorRect.left - contRect.left + container.scrollLeft - 260);
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    ok.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const checked = Array.from(popup.querySelectorAll('input[type=checkbox]:checked')).map(x => x.value);
        cls.interfaces = checked;
        popup.remove();
        draw.requestRender();
    });

    cancel.addEventListener('click', (ev) => { ev.stopPropagation(); popup.remove(); });

    const outsideHandler = (ev) => {
        if (!popup.contains(ev.target)) {
            popup.remove();
            window.removeEventListener('pointerdown', outsideHandler);
        }
    };
    setTimeout(() => window.addEventListener('pointerdown', outsideHandler), 0);
}
