import { state } from './main.state.js';
import { events } from './main.events.js';

let vscode, utils, interactions, container, canvas, svg;

export function initDrawing(vsc, dom, refs) {
    vscode = vsc;
    container = dom.container;
    canvas = dom.canvas;
    svg = dom.svg;
    utils = refs.utils;
    interactions = refs.interactions;
}

let renderRequested = false;

export function requestRender() {

    if (!renderRequested) {
        renderRequested = true;
        requestAnimationFrame(() => {
            render();
            renderRequested = false;
        });
    }
}

// Subscribe to rendering requests from other modules
events.on('requestRender', requestRender);

export function render() {
    svg.setAttribute('width', container.clientWidth);
    svg.setAttribute('height', container.clientHeight);
    canvas.innerHTML = '';
    drawDefs();

    const classNames = state.model.classes.map(c => c.name).filter(n => !!n);
    const classEntries = state.model.classes.map(c => ({ id: c.id, name: c.name }));
    const typeOptionsAll = state.primitiveTypes.concat(classNames);

    for (const cls of state.model.classes) {
        renderClassBox(cls, typeOptionsAll, classEntries);
    }
    drawRelations();

    // Dynamically adjust SVG size to match the container's scrollable area
    if (typeof window.adjustSvgSize === 'function') {
        window.adjustSvgSize();
    }
}

function renderClassBox(cls, typeOptionsAll, classEntries) {
    const el = document.createElement('div');
    el.className = 'classbox';
    el.style.left = cls.x + 'px';
    el.style.top = cls.y + 'px';
    el.style.width = cls.width + 'px';
    el.dataset.id = cls.id;

    const namebar = interactions.createNameBar(cls, el);
    const section = createBodySection(cls, typeOptionsAll, classEntries);

    el.appendChild(namebar);
    el.appendChild(section);
    canvas.appendChild(el);

    interactions.initDragHandling(cls, el, namebar);
}

function createBodySection(cls, typeOptionsAll, classEntries) {
    const section = document.createElement('div');
    section.className = 'section';

    const baseRow = document.createElement('div');
    baseRow.className = 'row';
    const baseLabel = document.createElement('label');
    baseLabel.innerText = 'Base:';
    const baseSelect = document.createElement('select');

    const noneOpt = document.createElement('option');
    noneOpt.value = ''; noneOpt.innerText = 'None';
    baseSelect.appendChild(noneOpt);

    for (const entry of classEntries) {
        if (entry.id === cls.id) continue;
        const o = document.createElement('option');
        o.value = entry.id; o.innerText = entry.name;
        baseSelect.appendChild(o);
    }
    baseSelect.value = cls.baseClassId || '';
    baseSelect.addEventListener('change', () => {
        const val = baseSelect.value;
        cls.baseClassId = val ? val : null;
        requestRender();
        //events.emit('requestRender');
    });
    baseRow.appendChild(baseLabel);
    baseRow.appendChild(baseSelect);
    section.appendChild(baseRow);

    section.appendChild(createAttributesSection(cls, typeOptionsAll));
    section.appendChild(createOperationsSection(cls, typeOptionsAll));

    return section;
}

function createAttributesSection(cls, typeOptionsAll) {
    const attrsDiv = document.createElement('div');
    const attrsHeader = document.createElement('div');
    attrsHeader.innerText = 'Attributes';
    attrsHeader.className = 'row mini';
    const addAttrBtn = document.createElement('button');
    addAttrBtn.innerText = '+Attr'; addAttrBtn.className = 'mini';
    addAttrBtn.addEventListener('click', () => {
        cls.attributes.push(utils.newAttribute());
        requestRender();
        //events.emit('requestRender');
    });

    attrsHeader.appendChild(addAttrBtn);
    attrsDiv.appendChild(attrsHeader);

    for (let i = 0; i < cls.attributes.length; i++) {
        const a = cls.attributes[i];
        const row = document.createElement('div'); row.className = 'row';
        const nameIn = document.createElement('input');
        nameIn.type = 'text'; nameIn.value = a.name || '';
        nameIn.addEventListener('input', () => a.name = nameIn.value);

        const typeIn = document.createElement('select');
        typeIn.className = 'mini';
        for (const t of typeOptionsAll) {
            const o = document.createElement('option');
            o.value = t; o.innerText = t; typeIn.appendChild(o);
        }
        typeIn.value = a.type || 'object';
        typeIn.addEventListener('change', () => {
            a.type = typeIn.value;
            requestRender();
            //events.emit('requestRender');
        });

        const vis = document.createElement('select');
        ['private', 'public', 'protected', 'internal'].forEach(v => {
            const o = document.createElement('option');
            o.value = v; o.innerText = v; vis.appendChild(o);
        });
        vis.value = a.visibility || 'private';
        vis.addEventListener('change', () => a.visibility = vis.value);
        vis.className = 'mini';

        const mod = document.createElement('select');
        ['None', 'abstract', 'virtual', 'override', 'static', 'aggregation', 'composition'].forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.innerText = m; mod.appendChild(o);
        });
        mod.value = a.modifier || 'None';
        mod.addEventListener('change', () => {
            a.modifier = mod.value;
            requestRender();
            //events.emit('requestRender');
        });
        mod.className = 'mini';

        const rem = document.createElement('button');
        rem.className = 'removeBtn'; rem.innerText = 'x';
        rem.addEventListener('click', () => {
            cls.attributes.splice(i, 1);
            requestRender();
            //events.emit('requestRender');
        });

        row.appendChild(nameIn); row.appendChild(typeIn);
        row.appendChild(vis); row.appendChild(mod); row.appendChild(rem);
        attrsDiv.appendChild(row);
    }
    return attrsDiv;
}

function createOperationsSection(cls, typeOptionsAll) {
    const opsDiv = document.createElement('div');
    const opsHeader = document.createElement('div');
    opsHeader.innerText = 'Operations';
    opsHeader.className = 'row mini';
    const addOpBtn = document.createElement('button');
    addOpBtn.innerText = '+Op'; addOpBtn.className = 'mini';
    addOpBtn.addEventListener('click', () => {
        cls.operations.push(utils.newOperation());
        //requestRender();
        events.emit('requestRender');
    });
    opsHeader.appendChild(addOpBtn);
    opsDiv.appendChild(opsHeader);

    for (let i = 0; i < cls.operations.length; i++) {
        const o = cls.operations[i];
        const row = document.createElement('div'); row.className = 'row';
        const nameIn = document.createElement('input');
        nameIn.type = 'text'; nameIn.value = o.name || '';
        nameIn.addEventListener('input', () => o.name = nameIn.value);

        const retIn = document.createElement('select');
        for (const t of typeOptionsAll) {
            const opt = document.createElement('option');
            opt.value = t; opt.innerText = t; retIn.appendChild(opt);
        }
        retIn.value = o.returnType || 'void';
        retIn.addEventListener('change', () => o.returnType = retIn.value);
        retIn.className = 'mini';

        const vis = document.createElement('select');
        ['private', 'public', 'protected', 'internal'].forEach(v => {
            const oo = document.createElement('option');
            oo.value = v; oo.innerText = v; vis.appendChild(oo);
        });
        vis.value = o.visibility || 'private';
        vis.addEventListener('change', () => o.visibility = vis.value);
        vis.className = 'mini';

        const mod = document.createElement('select');
        ['None', 'abstract', 'virtual', 'override', 'static'].forEach(m => {
            const oo = document.createElement('option');
            oo.value = m; oo.innerText = m; mod.appendChild(oo);
        });
        mod.value = o.modifier || 'None';
        mod.addEventListener('change', () => {
            o.modifier = mod.value;
            requestRender();
            //events.emit('requestRender');
        });
        mod.className = 'mini';

        const rem = document.createElement('button');
        rem.className = 'removeBtn'; rem.innerText = 'x';
        rem.addEventListener('click', () => {
            cls.operations.splice(i, 1);
            requestRender();
            //events.emit('requestRender');
        });

        row.appendChild(nameIn); row.appendChild(retIn);
        row.appendChild(vis); row.appendChild(mod); row.appendChild(rem);

        const paramsDiv = document.createElement('div');
        for (let p = 0; p < (o.parameters || []).length; p++) {
            const pi = o.parameters[p];
            const pRow = document.createElement('div'); pRow.className = 'row';
            const pn = document.createElement('input');
            pn.type = 'text'; pn.value = pi.name || '';
            pn.addEventListener('input', () => pi.name = pn.value);

            const pt = document.createElement('select');
            for (const t of typeOptionsAll) {
                const opel = document.createElement('option');
                opel.value = t; opel.innerText = t; pt.appendChild(opel);
            }
            pt.value = pi.type || 'int';
            pt.addEventListener('change', () => {
                pi.type = pt.value;
                requestRender();
                //events.emit('requestRender');
            });
            pt.className = 'mini';

            const prem = document.createElement('button');
            prem.className = 'removeBtn'; prem.innerText = 'x';
            prem.addEventListener('click', () => {
                o.parameters.splice(p, 1);
                requestRender();
                //events.emit('requestRender');
            });
            pRow.appendChild(pn); pRow.appendChild(pt); pRow.appendChild(prem);
            paramsDiv.appendChild(pRow);
        }
        const addParamBtn = document.createElement('button');
        addParamBtn.innerText = '+Param'; addParamBtn.className = 'row mini';
        addParamBtn.addEventListener('click', () => {
            if (!o.parameters) o.parameters = [];
            o.parameters.push({ name: 'p', type: 'int' });
            requestRender();
            //events.emit('requestRender');
        });
        paramsDiv.appendChild(addParamBtn);

        opsDiv.appendChild(row);
        opsDiv.appendChild(paramsDiv);
    }
    return opsDiv;
}

export function drawDefs() {
    svg.innerHTML = '';
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const tri = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    tri.setAttribute('id', 'tri'); tri.setAttribute('markerWidth', '12'); tri.setAttribute('markerHeight', '12');
    tri.setAttribute('refX', '12'); tri.setAttribute('refY', '6'); tri.setAttribute('orient', 'auto');
    tri.setAttribute('markerUnits', 'userSpaceOnUse');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0,0 12,6 0,12'); poly.setAttribute('fill', 'white'); poly.setAttribute('stroke', 'black'); poly.setAttribute('stroke-width', '1');
    tri.appendChild(poly); defs.appendChild(tri);

    const arr = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    arr.setAttribute('id', 'arrow'); arr.setAttribute('markerWidth', '8'); arr.setAttribute('markerHeight', '8');
    arr.setAttribute('refX', '8'); arr.setAttribute('refY', '4'); arr.setAttribute('orient', 'auto');
    const pa = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pa.setAttribute('d', 'M0,0 L8,4 L0,8 z'); pa.setAttribute('fill', 'black');
    arr.appendChild(pa); defs.appendChild(arr);

    const diamondFilled = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    diamondFilled.setAttribute('id', 'diamondFilledStart'); diamondFilled.setAttribute('markerWidth', '16'); diamondFilled.setAttribute('markerHeight', '16');
    diamondFilled.setAttribute('refX', '0'); diamondFilled.setAttribute('refY', '8'); diamondFilled.setAttribute('orient', 'auto');
    diamondFilled.setAttribute('markerUnits', 'userSpaceOnUse');
    const dpf = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    dpf.setAttribute('points', '8,0 16,8 8,16 0,8'); dpf.setAttribute('fill', 'black'); dpf.setAttribute('stroke', 'black'); dpf.setAttribute('stroke-width', '1');
    diamondFilled.appendChild(dpf); defs.appendChild(diamondFilled);

    const diamondHollow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    diamondHollow.setAttribute('id', 'diamondHollowStart'); diamondHollow.setAttribute('markerWidth', '16'); diamondHollow.setAttribute('markerHeight', '16');
    diamondHollow.setAttribute('refX', '0'); diamondHollow.setAttribute('refY', '8'); diamondHollow.setAttribute('orient', 'auto');
    diamondHollow.setAttribute('markerUnits', 'userSpaceOnUse');
    const dph = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    dph.setAttribute('points', '8,0 16,8 8,16 0,8'); dph.setAttribute('fill', 'white'); dph.setAttribute('stroke', 'black'); dph.setAttribute('stroke-width', '1');
    diamondHollow.appendChild(dph); defs.appendChild(diamondHollow);

    svg.appendChild(defs);
}

export function clearSvg() { while (svg.lastChild) svg.removeChild(svg.lastChild); drawDefs(); }

function computeRelationsFromModel() {
    const rels = [];
    const nameToId = {};
    const idToClass = {};
    const model = state.model;
    for (const c of model.classes) {
        nameToId[c.name] = c.id;
        idToClass[c.id] = c;
    }

    for (const c of model.classes) {
        if (c.baseClassId && idToClass[c.baseClassId]) {
            rels.push({ fromId: c.id, toId: c.baseClassId, type: 'Inheritance' });
        }
        if (Array.isArray(c.interfaces)) {
            for (const iid of c.interfaces) {
                if (idToClass[iid]) {
                    rels.push({ fromId: c.id, toId: iid, type: 'Interface' });
                }
            }
        }
        for (const a of c.attributes || []) {
            if (a.type && nameToId[a.type]) {
                const mod = (a.modifier || '').toLowerCase();
                if (mod === 'composition') {
                    rels.push({ fromId: c.id, toId: nameToId[a.type], type: 'Composition', origin: 'attr:' + a.name });
                }
                else if (mod === 'aggregation') {
                    rels.push({ fromId: c.id, toId: nameToId[a.type], type: 'Aggregation', origin: 'attr:' + a.name });
                }
                else {
                    rels.push({ fromId: c.id, toId: nameToId[a.type], type: 'Association', origin: 'attr:' + a.name });
                }
            }
        }
        for (const op of c.operations || []) {
            if (op.returnType && nameToId[op.returnType]) {
                rels.push({ fromId: c.id, toId: nameToId[op.returnType], type: 'Dependency', origin: 'ret:' + op.name });
            }
            for (const p of op.parameters || []) {
                if (p.type && nameToId[p.type]) {
                    rels.push({ fromId: c.id, toId: nameToId[p.type], type: 'Dependency', origin: 'param:' + op.name + ':' + p.name });
                }
            }
        }
    }
    return rels;
}

function getBoxRectById(id) {
    const el = document.querySelector('.classbox[data-id="' + id + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cont = container.getBoundingClientRect();
    return {
        left: r.left - cont.left + container.scrollLeft,
        top: r.top - cont.top + container.scrollTop,
        width: r.width,
        height: r.height,
        right: r.left - cont.left + container.scrollLeft + r.width,
        bottom: r.top - cont.top + container.scrollTop + r.height,
        cx: r.left - cont.left + container.scrollLeft + r.width / 2,
        cy: r.top - cont.top + container.scrollTop + r.height / 2
    };
}

function lineRectIntersection(rect, x1, y1, x2, y2) {
    const edges = [
        { x3: rect.left, y3: rect.top, x4: rect.right, y4: rect.top },
        { x3: rect.right, y3: rect.top, x4: rect.right, y4: rect.bottom },
        { x3: rect.right, y3: rect.bottom, x4: rect.left, y4: rect.bottom },
        { x3: rect.left, y3: rect.bottom, x4: rect.left, y4: rect.top }
    ];
    const intersections = [];
    for (const e of edges) {
        const denom = (x1 - x2) * (e.y3 - e.y4) - (y1 - y2) * (e.x3 - e.x4);
        if (Math.abs(denom) < 1e-6) continue;
        const t = ((x1 - e.x3) * (e.y3 - e.y4) - (y1 - e.y3) * (e.x3 - e.x4)) / denom;
        const u = -((x1 - x2) * (y1 - e.y3) - (y1 - y2) * (x1 - e.x3)) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            const ix = x1 + t * (x2 - x1);
            const iy = y1 + t * (y2 - y1);
            intersections.push({ x: ix, y: iy, t: t });
        }
    }
    if (intersections.length === 0) return { x: x1, y: y1 };
    intersections.sort((a, b) => a.t - b.t);
    return { x: intersections[0].x, y: intersections[0].y };
}

export function drawRelations() {
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild);
    const rels = computeRelationsFromModel();
    for (const r of rels) {
        const fromRect = getBoxRectById(r.fromId);
        const toRect = getBoxRectById(r.toId);
        if (!fromRect || !toRect) continue;
        const start = lineRectIntersection(fromRect, fromRect.cx, fromRect.cy, toRect.cx, toRect.cy);
        const end = lineRectIntersection(toRect, toRect.cx, toRect.cy, fromRect.cx, fromRect.cy);
        const path = createRelationElement(r, start, end);
        svg.appendChild(path);
    }
}

function getRelationStyle(type) {
    const style = { stroke: 'var(--vscode-foreground)', strokeWidth: '1', markerStart: '', markerEnd: '', strokeDasharray: '' };
    switch (type) {
        case 'Composition': style.strokeWidth = '1.2'; style.markerStart = 'url(#diamondFilledStart)'; break;
        case 'Aggregation': style.strokeWidth = '1.2'; style.markerStart = 'url(#diamondHollowStart)'; break;
        case 'Association': style.markerEnd = 'url(#arrow)'; break;
        case 'Dependency': style.markerEnd = 'url(#arrow)'; style.strokeDasharray = '4 3'; break;
        case 'Inheritance': style.strokeWidth = '1.5'; style.markerEnd = 'url(#tri)'; break;
        case 'Interface': style.strokeWidth = '1.2'; style.markerEnd = 'url(#tri)'; style.strokeDasharray = '6 4'; break;
    }
    return style;
}

function createRelationElement(r, start, end) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const style = getRelationStyle(r.type);
    if (r.type === 'Dependency') { path.setAttribute('d', `M ${end.x} ${end.y} L ${start.x} ${start.y}`); }
    else { path.setAttribute('d', `M ${start.x} ${start.y} L ${end.x} ${end.y}`); }
    path.setAttribute('fill', 'none');
    path.style.stroke = style.stroke;
    path.setAttribute('stroke-width', style.strokeWidth);
    if (style.markerStart) path.setAttribute('marker-start', style.markerStart);
    if (style.markerEnd) path.setAttribute('marker-end', style.markerEnd);
    if (style.strokeDasharray) path.setAttribute('stroke-dasharray', style.strokeDasharray);
    return path;
}
