

(function () {
    const vscode = acquireVsCodeApi();

    let model = { classes: [] };
    let editingNameId = null, editingDraft = '';
    let primitiveTypes = [];

    function newClass(x = 20, y = 20) {
        return {
            id: cryptoRandomId(),
            name: 'NewClass',
            x, y,
            width: 400,
            height: 120,
            baseClassId: null,
            interfaces: [],
            isAbstract: false,
            isInterface: false,
            attributes: [],
            operations: []
        };
    }
    function cryptoRandomId() { return Math.random().toString(36).slice(2, 10); }

    const container = document.getElementById('container');
    const canvas = document.getElementById('canvas');
    const svg = document.getElementById('relationSvg');
    document.getElementById('langSelect').addEventListener('change', (event) => {
        vscode.postMessage({ command: 'changedPrimitiveTypes', language: event.target.value });
    });
    document.getElementById('addClass').addEventListener('click', () => {
        model.classes.push(newClass(40 + model.classes.length * 30, 40 + model.classes.length * 20));
        vscode.postMessage({ command: 'showAlert', text: `model length :  ${model.classes.length}` });
        render();
    });
    document.getElementById('saveJson').addEventListener('click', () => vscode.postMessage({ command: 'saveJson', payload: model }));
    document.getElementById('loadJson').addEventListener('click', () => vscode.postMessage({ command: 'loadJson' }));
    document.getElementById('generate').addEventListener('click', () => {
        const lang = document.getElementById('langSelect').value || 'csharp';
        const exportModel = modelForExport(); // convert IDs -> names for compatibility
        vscode.postMessage({ command: 'generateCode', payload: { model: exportModel, language: lang } });

    });

    window.addEventListener('message', event => {
        const msg = event.data;
        switch (msg.command) {
            case 'loadedJson':
                model = msg.payload;
                migrateModel();
                render();
                break;
            case 'changedPrimitiveTypes':
                primitiveTypes = msg.primitiveTypes;
                render();
                break;
            default:
                break;
        }

    });

    function migrateModel() {
        // build maps
        const nameToId = {};
        const idToClass = {};
        for (const c of model.classes || []) {
            if (!c.id) c.id = cryptoRandomId(); // ensure id present
            nameToId[c.name] = c.id;
            idToClass[c.id] = c;
        }

        for (const c of model.classes || []) {
            //if (!c.baseClass) c.baseClass = 'None';
            if (!Array.isArray(c.interfaces)) c.interfaces = [];
            if (typeof c.isAbstract === 'undefined') c.isAbstract = false;
            if (typeof c.isInterface === 'undefined') c.isInterface = false;
            if (!Array.isArray(c.attributes)) c.attributes = [];
            if (!Array.isArray(c.operations)) c.operations = [];

            // convert interfaces entries if they look like names (string values that match a class name)
            // after conversion, interfaces will contain IDs only (strings that are ids present in model)
            c.interfaces = c.interfaces.map(it => {
                if (!it) return null;
                // if already an id present, keep it
                if (idToClass[it]) return it;
                // if it's a name that maps to an id, convert
                if (nameToId[it]) return nameToId[it];
                // unknown value -> drop by returning null
                return null;
            }).filter(x => !!x);

            // --- migrate baseClass -> baseClassId:
            //  - old saved form may have c.baseClass (name); convert to id if possible
            if (typeof c.baseClassId === 'undefined') {
                // if already has baseClassId undefined and there's a legacy baseClass (name), convert
                if (c.baseClass && nameToId[c.baseClass]) {
                    c.baseClassId = nameToId[c.baseClass];

                } else {
                    // if no baseClass or unknown, ensure null
                    c.baseClassId = null;
                }
            } else {
                // baseClassId exists: ensure it's valid; if it's a name (legacy) convert
                if (c.baseClassId && !idToClass[c.baseClassId] && nameToId[c.baseClassId]) {
                    // someone saved name into baseClassId field -> convert
                    c.baseClassId = nameToId[c.baseClassId];

                }
                // if invalid id, set null
                if (c.baseClassId && !idToClass[c.baseClassId]) c.baseClassId = null;
            }
        }

        // cleanup: remove interface IDs that do not exist (in case)
        const validIds = new Set((model.classes || []).map(c => c.id));
        for (const c of model.classes || []) {
            c.interfaces = c.interfaces.filter(id => validIds.has(id));
            // ensure baseClass exists as name; if not set to None
            //if (c.baseClass && c.baseClass !== 'None' && !nameToId[c.baseClass]) c.baseClass = 'None';
        }
    }


    function render() {
        // ensure svg size matches container scrollable area
        svg.setAttribute('width', container.clientWidth);
        svg.setAttribute('height', container.clientHeight);

        canvas.innerHTML = '';
        drawDefs();

        // build name lists
        const classNames = model.classes.map(c => c.name).filter(n => !!n);
        const classEntries = model.classes.map(c => ({ id: c.id, name: c.name }));
        //const primitives = ['int', 'string', 'bool', 'double', 'float', 'void', 'object'];
        const primitives = primitiveTypes;

        const typeOptionsAll = primitives.concat(classNames);
        const baseOptions = ['None'].concat(classNames);

        for (const cls of model.classes) {
            const el = document.createElement('div');
            el.className = 'classbox';
            el.style.left = cls.x + 'px';
            el.style.top = cls.y + 'px';
            el.style.width = cls.width + 'px';
            el.dataset.id = cls.id;

            // namebar
            const namebar = document.createElement('div'); namebar.className = 'namebar';
            const leftGroup = document.createElement('div'); leftGroup.className = 'leftGroup';

            // kind select
            const kind = document.createElement('select');
            ['class', 'abstract', 'interface'].forEach(k => { const o = document.createElement('option'); o.value = k; o.innerText = k; kind.appendChild(o); });
            kind.value = cls.isInterface ? 'interface' : (cls.isAbstract ? 'abstract' : 'class');
            kind.addEventListener('change', () => { if (kind.value === 'interface') { cls.isInterface = true; cls.isAbstract = false; } else if (kind.value === 'abstract') { cls.isInterface = false; cls.isAbstract = true; } else { cls.isInterface = false; cls.isAbstract = false; } render(); });
            leftGroup.appendChild(kind);

            // name area
            const nameText = document.createElement('div');
            nameText.className = 'nameText';
            //nameText.style.color = 'black';
            if (editingNameId === cls.id) {
                const inp = document.createElement('input'); inp.type = 'text'; inp.value = editingDraft; inp.style.minWidth = '30px';
                nameText.appendChild(inp);
                setTimeout(() => inp.focus(), 0);
                inp.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') {
                        cls.name = inp.value.trim() || 'Unnamed';
                        editingNameId = null;
                        editingDraft = '';
                        //cleanupReferencesById(cls.id);
                        render();
                    }
                    else if (ev.key === 'Escape') { editingNameId = null; editingDraft = ''; render(); }
                    else { editingDraft = inp.value; } // do not re-render on every key
                });
                inp.addEventListener('blur', () => { // keep focus until Enter or Escape: re-focus
                    setTimeout(() => { if (editingNameId === cls.id) inp.focus(); }, 0);
                });
            } else {
                nameText.innerText = cls.name;
                nameText.addEventListener('dblclick', (ev) => { editingNameId = cls.id; editingDraft = cls.name; render(); ev.stopPropagation(); });
            }

            // Interfaces button (to the right of the class name, as requested)
            const interfacesBtn = document.createElement('button');
            interfacesBtn.className = 'smallBtn interfacesBtn';
            interfacesBtn.title = 'Interfaces';
            interfacesBtn.innerText = 'Interfaces';
            // stopPropagation so click doesn't start drag
            interfacesBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                showInterfacesPopup(cls, el);
            });
            leftGroup.appendChild(interfacesBtn);


            leftGroup.appendChild(nameText);
            namebar.appendChild(leftGroup);

            // delete button (right)
            const rightGroup = document.createElement('div');
            const delBtn = document.createElement('button'); delBtn.className = 'deleteTop'; delBtn.innerText = '✕'; delBtn.title = 'Delete';
            delBtn.addEventListener('click', () => {
                const idx = model.classes.findIndex(x => x.id === cls.id);
                if (idx >= 0) {
                    model.classes.splice(idx, 1);
                    cleanupReferencesById(cls.id);
                    render();
                    //cleanupReferences(deletedName);
                }
            });
            rightGroup.appendChild(delBtn);
            namebar.appendChild(rightGroup);

            el.appendChild(namebar);

            // body
            const section = document.createElement('div'); section.className = 'section';

            // base select (None + class names only)
            const baseRow = document.createElement('div'); baseRow.className = 'row';
            const baseLabel = document.createElement('label'); baseLabel.innerText = 'Base:';
            //baseLabel.style.color = 'black';
            const baseSelect = document.createElement('select');
            // for (const t of baseOptions) {
            //     const o = document.createElement('option');
            //     o.value = t;
            //     o.innerText = t;
            //     baseSelect.appendChild(o);
            // }
            // "None" option with empty value
            const noneOpt = document.createElement('option'); noneOpt.value = '';
            noneOpt.innerText = 'None';
            baseSelect.appendChild(noneOpt);
            for (const entry of classEntries) {
                // skip self to avoid selecting itself as base
                if (entry.id === cls.id) continue;
                const o = document.createElement('option'); o.value = entry.id; o.innerText = entry.name; baseSelect.appendChild(o);
            }
            //baseSelect.value = cls.baseClass || 'None';
            baseSelect.value = cls.baseClassId || '';
            baseSelect.addEventListener('change', () => {
                //cls.baseClass = baseSelect.value; render();
                const val = baseSelect.value;
                cls.baseClassId = val ? val : null;
                render();
            });
            baseRow.appendChild(baseLabel); baseRow.appendChild(baseSelect); section.appendChild(baseRow);

            // attributes
            const attrsDiv = document.createElement('div'); const attrsHeader = document.createElement('div');
            attrsHeader.innerText = 'Attributes';
            //attrsHeader.style.color = 'black';
            attrsDiv.appendChild(attrsHeader);
            for (let i = 0; i < cls.attributes.length; i++) {
                const a = cls.attributes[i];
                const row = document.createElement('div'); row.className = 'row';
                const nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.value = a.name || ''; nameIn.addEventListener('input', () => a.name = nameIn.value);
                //nameIn.className = 'mini';
                const typeIn = document.createElement('select');
                typeIn.className = 'mini';
                for (const t of typeOptionsAll) {
                    const o = document.createElement('option');
                    o.value = t; o.innerText = t; typeIn.appendChild(o);
                }
                typeIn.value = a.type || 'object';
                typeIn.addEventListener('change', () => { a.type = typeIn.value; render(); });
                const vis = document.createElement('select');['private', 'public', 'protected', 'internal'].forEach(v => { const o = document.createElement('option'); o.value = v; o.innerText = v; vis.appendChild(o); }); vis.value = a.visibility || 'private'; vis.addEventListener('change', () => a.visibility = vis.value);
                vis.className = 'mini';
                const mod = document.createElement('select');['None', 'abstract', 'virtual', 'override', 'static', 'aggregation', 'composition'].forEach(m => { const o = document.createElement('option'); o.value = m; o.innerText = m; mod.appendChild(o); }); mod.value = a.modifier || 'None'; mod.addEventListener('change', () => { a.modifier = mod.value; render(); });
                mod.className = 'mini';
                const rem = document.createElement('button'); rem.className = 'removeBtn'; rem.innerText = 'x'; rem.addEventListener('click', () => { cls.attributes.splice(i, 1); render(); });

                row.appendChild(nameIn); row.appendChild(typeIn); row.appendChild(vis); row.appendChild(mod); row.appendChild(rem);
                attrsDiv.appendChild(row);
            }
            const addAttrBtn = document.createElement('button'); addAttrBtn.innerText = '+Attr'; addAttrBtn.className = 'mini'; addAttrBtn.addEventListener('click', () => { cls.attributes.push({ name: 'field', type: 'int', visibility: 'private', modifier: 'None' }); render(); });
            attrsDiv.appendChild(addAttrBtn); section.appendChild(attrsDiv);

            // operations
            const opsDiv = document.createElement('div');
            const opsHeader = document.createElement('div');
            opsHeader.innerText = 'Operations';
            //opsHeader.style.color = 'black';
            opsDiv.appendChild(opsHeader);
            for (let i = 0; i < cls.operations.length; i++) {
                const o = cls.operations[i];
                const row = document.createElement('div'); row.className = 'row';
                const nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.value = o.name || ''; nameIn.addEventListener('input', () => o.name = nameIn.value);
                const retIn = document.createElement('select'); for (const t of typeOptionsAll) { const opt = document.createElement('option'); opt.value = t; opt.innerText = t; retIn.appendChild(opt); } retIn.value = o.returnType || 'void'; retIn.addEventListener('change', () => o.returnType = retIn.value);
                retIn.className = 'mini';
                const vis = document.createElement('select');['private', 'public', 'protected', 'internal'].forEach(v => { const oo = document.createElement('option'); oo.value = v; oo.innerText = v; vis.appendChild(oo); }); vis.value = o.visibility || 'private'; vis.addEventListener('change', () => o.visibility = vis.value);
                vis.className = 'mini';
                const mod = document.createElement('select');['None', 'abstract', 'virtual', 'override', 'static', 'aggregation', 'composition'].forEach(m => { const oo = document.createElement('option'); oo.value = m; oo.innerText = m; mod.appendChild(oo); }); mod.value = o.modifier || 'None'; mod.addEventListener('change', () => { o.modifier = mod.value; render(); });
                mod.className = 'mini';
                const rem = document.createElement('button'); rem.className = 'removeBtn'; rem.innerText = 'x'; rem.addEventListener('click', () => { cls.operations.splice(i, 1); render(); });
                row.appendChild(nameIn); row.appendChild(retIn); row.appendChild(vis); row.appendChild(mod); row.appendChild(rem);

                const paramsDiv = document.createElement('div');
                for (let p = 0; p < (o.parameters || []).length; p++) {
                    const pi = o.parameters[p];
                    const pRow = document.createElement('div'); pRow.className = 'row';
                    const pn = document.createElement('input'); pn.type = 'text'; pn.value = pi.name || ''; pn.addEventListener('input', () => pi.name = pn.value);
                    const pt = document.createElement('select'); for (const t of typeOptionsAll) { const opel = document.createElement('option'); opel.value = t; opel.innerText = t; pt.appendChild(opel); } pt.value = pi.type || 'int'; pt.addEventListener('change', () => { pi.type = pt.value; render(); });
                    pt.className = 'mini';
                    const prem = document.createElement('button'); prem.className = 'removeBtn'; prem.innerText = 'x'; prem.addEventListener('click', () => { o.parameters.splice(p, 1); render(); });
                    pRow.appendChild(pn); pRow.appendChild(pt); pRow.appendChild(prem); paramsDiv.appendChild(pRow);
                }
                const addParamBtn = document.createElement('button'); addParamBtn.innerText = '+Param'; addParamBtn.className = 'mini'; addParamBtn.addEventListener('click', () => { if (!o.parameters) o.parameters = []; o.parameters.push({ name: 'p', type: 'int' }); render(); });
                paramsDiv.appendChild(addParamBtn);
                opsDiv.appendChild(row); opsDiv.appendChild(paramsDiv);
            }
            const addOpBtn = document.createElement('button'); addOpBtn.innerText = '+Op'; addOpBtn.className = 'mini'; addOpBtn.addEventListener('click', () => { cls.operations.push({ name: 'Op', returnType: 'void', visibility: 'private', modifier: 'None', parameters: [] }); render(); });
            opsDiv.appendChild(addOpBtn); section.appendChild(opsDiv);

            el.appendChild(section); canvas.appendChild(el);

            // drag handling with guard for interactive elements and name editing
            const namebarEl = namebar;
            let isDragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
            namebarEl.addEventListener('pointerdown', (ev) => {
                if (editingNameId === cls.id) return;
                const tgt = ev.target;
                if (tgt.closest && (tgt.closest('input') || tgt.closest('select') || tgt.closest('button') || tgt.closest('.nameText'))) return;
                isDragging = true; startX = ev.clientX; startY = ev.clientY; origX = cls.x; origY = cls.y; try { namebarEl.setPointerCapture(ev.pointerId); } catch { }
            });
            window.addEventListener('pointermove', (ev) => {
                if (!isDragging) return;
                const dx = ev.clientX - startX, dy = ev.clientY - startY;
                cls.x = origX + dx; cls.y = origY + dy;
                const currEl = document.querySelector('.classbox[data-id="' + cls.id + '"]');
                if (currEl) { currEl.style.left = cls.x + 'px'; currEl.style.top = cls.y + 'px'; }
                // live update relations
                drawRelations();
            });
            window.addEventListener('pointerup', (ev) => { if (isDragging) { isDragging = false; try { namebarEl.releasePointerCapture(ev.pointerId); } catch { } drawRelations(); } });
        } // end for

        // draw relations after DOM updated
        drawRelations();
    }

    // ---------- Relation computation & drawing ----------
    function drawDefs() {
        // define markers once
        svg.innerHTML = '';
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        // triangle marker (filled white, stroked black)
        const tri = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        tri.setAttribute('id', 'tri');
        tri.setAttribute('markerWidth', '12');
        tri.setAttribute('markerHeight', '12');
        tri.setAttribute('refX', '12');
        tri.setAttribute('refY', '6');
        tri.setAttribute('orient', 'auto');
        tri.setAttribute('markerUnits', 'userSpaceOnUse');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '0,0 12,6 0,12');
        poly.setAttribute('fill', 'white');
        poly.setAttribute('stroke', 'black');
        poly.setAttribute('stroke-width', '1');
        tri.appendChild(poly);
        defs.appendChild(tri);

        // small arrow marker for associations (optional)
        const arr = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        arr.setAttribute('id', 'arrow');
        arr.setAttribute('markerWidth', '8');
        arr.setAttribute('markerHeight', '8');
        arr.setAttribute('refX', '8');
        arr.setAttribute('refY', '4');
        arr.setAttribute('orient', 'auto');
        const pa = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pa.setAttribute('d', 'M0,0 L8,4 L0,8 z');
        pa.setAttribute('fill', 'black');
        arr.appendChild(pa);
        defs.appendChild(arr);

        // filled diamond (composition) - to be used as marker-start
        const diamondFilled = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        diamondFilled.setAttribute('id', 'diamondFilledStart');
        diamondFilled.setAttribute('markerWidth', '16');
        diamondFilled.setAttribute('markerHeight', '16');
        diamondFilled.setAttribute('refX', '0');
        diamondFilled.setAttribute('refY', '8');
        diamondFilled.setAttribute('orient', 'auto');
        diamondFilled.setAttribute('markerUnits', 'userSpaceOnUse');
        const dpf = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        // points form a diamond centered; orientation handled by marker orient
        dpf.setAttribute('points', '8,0 16,8 8,16 0,8');
        dpf.setAttribute('fill', 'black');
        dpf.setAttribute('stroke', 'black');
        dpf.setAttribute('stroke-width', '1');
        diamondFilled.appendChild(dpf);
        defs.appendChild(diamondFilled);

        // hollow diamond (aggregation) - marker-start
        const diamondHollow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        diamondHollow.setAttribute('id', 'diamondHollowStart');
        diamondHollow.setAttribute('markerWidth', '16');
        diamondHollow.setAttribute('markerHeight', '16');
        diamondHollow.setAttribute('refX', '0');
        diamondHollow.setAttribute('refY', '8');
        diamondHollow.setAttribute('orient', 'auto');
        diamondHollow.setAttribute('markerUnits', 'userSpaceOnUse');
        const dph = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        dph.setAttribute('points', '8,0 16,8 8,16 0,8');
        dph.setAttribute('fill', 'white');
        dph.setAttribute('stroke', 'black');
        dph.setAttribute('stroke-width', '1');
        diamondHollow.appendChild(dph);
        defs.appendChild(diamondHollow);

        svg.appendChild(defs);
    }

    function clearSvg() { while (svg.lastChild) svg.removeChild(svg.lastChild); drawDefs(); }

    function computeRelationsFromModel() {
        const rels = [];
        const nameToId = {};
        const idToClass = {};
        for (const c of model.classes) {
            nameToId[c.name] = c.id;
            idToClass[c.id] = c;
        }

        for (const c of model.classes) {
            // inheritance
            // inheritance: baseClassId is used
            if (c.baseClassId && idToClass[c.baseClassId]) {
                rels.push({ fromId: c.id, toId: c.baseClassId, type: 'Inheritance' });
            }

            // interfaces
            if (Array.isArray(c.interfaces)) {
                for (const iid of c.interfaces) {
                    if (idToClass[iid]) {
                        rels.push({ fromId: c.id, toId: iid, type: 'Interface' });
                    }
                }
            }

            // attributes -> association / aggregation / composition
            for (const a of c.attributes || []) {
                if (a.type && nameToId[a.type]) {
                    // check modifier hint: 'composition' or 'aggregation'
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
            // operations -> dependency for params & return
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
        // We need coords relative to svg's coordinate system (container's client rect)
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

    // line intersects rectangle edges - return intersection point on perimeter
    function lineRectIntersection(rect, x1, y1, x2, y2) {
        const edges = [
            { x3: rect.left, y3: rect.top, x4: rect.right, y4: rect.top },    // top
            { x3: rect.right, y3: rect.top, x4: rect.right, y4: rect.bottom },// right
            { x3: rect.right, y3: rect.bottom, x4: rect.left, y4: rect.bottom },// bottom
            { x3: rect.left, y3: rect.bottom, x4: rect.left, y4: rect.top }   // left
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
        // choose intersection with smallest positive t (closest to start)
        intersections.sort((a, b) => a.t - b.t);
        return { x: intersections[0].x, y: intersections[0].y };
    }

    function drawRelations() {
        // clear existing lines but keep defs
        // remove all children except <defs>
        while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild);

        const rels = computeRelationsFromModel();
        for (const r of rels) {
            const fromRect = getBoxRectById(r.fromId);
            const toRect = getBoxRectById(r.toId);
            if (!fromRect || !toRect) continue;

            const start = lineRectIntersection(fromRect, fromRect.cx, fromRect.cy, toRect.cx, toRect.cy);
            const end = lineRectIntersection(toRect, toRect.cx, toRect.cy, fromRect.cx, fromRect.cy);

            // build path (straight line). Optionally could add midpoints to route around boxes.
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            //path.setAttribute('d', 'M ' + start.x + ' ' + start.y + ' L ' + end.x + ' ' + end.y);
            if (r.type === 'Dependency') {
                // draw from target edge to source edge so arrow points to source (reverse)
                path.setAttribute('d', 'M ' + end.x + ' ' + end.y + ' L ' + start.x + ' ' + start.y);
            } else {
                // normal direction: from source -> target
                path.setAttribute('d', 'M ' + start.x + ' ' + start.y + ' L ' + end.x + ' ' + end.y);
            }
            path.setAttribute('fill', 'none');

            // style by type
            // if (r.type === 'Inheritance') {
            //     path.setAttribute('stroke', 'black');
            //     path.setAttribute('stroke-width', '1.5');
            //     path.setAttribute('marker-end', 'url(#tri)');
            //     path.setAttribute('stroke-dasharray', ''); // solid
            // } else if (r.type === 'Interface') {
            //     path.setAttribute('stroke', 'black');
            //     path.setAttribute('stroke-width', '1.2');
            //     path.setAttribute('marker-end', 'url(#tri)');
            //     path.setAttribute('stroke-dasharray', '6 4'); // dashed
            // } else if (r.type === 'Association') {
            //     path.setAttribute('stroke', 'black');
            //     path.setAttribute('stroke-width', '1');
            //     path.setAttribute('marker-end', 'url(#arrow)');
            // } else { // Dependency or others
            //     path.setAttribute('stroke', 'gray');
            //     path.setAttribute('stroke-width', '1');
            //     path.setAttribute('stroke-dasharray', '4 3');
            // }

            if (r.type === 'Composition') {
                path.setAttribute('stroke', 'black');
                path.setAttribute('stroke-width', '1.2');
                // diamond at whole side -> we treat the declaring class as "from", so diamond at start
                path.setAttribute('marker-start', 'url(#diamondFilledStart)');
                path.setAttribute('stroke-dasharray', ''); // solid
            } else if (r.type === 'Aggregation') {
                path.setAttribute('stroke', 'black');
                path.setAttribute('stroke-width', '1.2');
                path.setAttribute('marker-start', 'url(#diamondHollowStart)');
                path.setAttribute('stroke-dasharray', ''); // solid
            } else if (r.type === 'Association') {
                path.setAttribute('stroke', 'black');
                path.setAttribute('stroke-width', '1');
                path.setAttribute('marker-end', 'url(#arrow)');
                path.setAttribute('stroke-dasharray', ''); // solid
            } else if (r.type === 'Dependency') {
                path.setAttribute('stroke', 'gray');
                path.setAttribute('stroke-width', '1');
                path.setAttribute('marker-end', 'url(#arrow)');
                path.setAttribute('stroke-dasharray', '4 3'); // dashed
            } else if (r.type === 'Inheritance') {
                path.setAttribute('stroke', 'black');
                path.setAttribute('stroke-width', '1.5');
                path.setAttribute('marker-end', 'url(#tri)');
                path.setAttribute('stroke-dasharray', ''); // solid
            } else if (r.type === 'Interface') {
                path.setAttribute('stroke', 'black');
                path.setAttribute('stroke-width', '1.2');
                path.setAttribute('marker-end', 'url(#tri)');
                path.setAttribute('stroke-dasharray', '6 4'); // dashed
            } else {
                // fallback
                path.setAttribute('stroke', 'black');
                path.setAttribute('stroke-width', '1');
            }

            svg.appendChild(path);
        }
    }

    // ---------- Interfaces popup ----------
    function showInterfacesPopup(cls, anchorEl) {
        // remove any existing popup
        const existing = document.querySelector('.interfaces-popup');
        if (existing) existing.remove();

        // list only classes that are marked as isInterface (and not the class itself)
        const candidates = model.classes.filter(c => c.isInterface && c.id !== cls.id);

        // create popup
        const popup = document.createElement('div');
        popup.className = 'interfaces-popup';
        popup.setAttribute('role', 'dialog');
        popup.innerHTML = '<div class="ip-title">Select Interfaces</div>';
        popup.style.color = 'black';
        const list = document.createElement('div');
        list.className = 'ip-list';

        if (candidates.length === 0) {
            const note = document.createElement('div'); note.className = 'ip-note'; note.innerText = 'No interface classes available.';
            note.style.color = 'black';
            list.appendChild(note);
        } else {
            for (const c of candidates) {
                const id = 'chk_' + c.id;
                const row = document.createElement('div'); row.className = 'ip-row';
                const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.value = c.id;
                if (Array.isArray(cls.interfaces) && cls.interfaces.indexOf(c.id) >= 0) cb.checked = true;
                const lbl = document.createElement('label'); lbl.htmlFor = id; lbl.innerText = c.name;
                //lbl.style.color = 'black';
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

        // position popup next to anchorEl (class box) but inside container coordinates
        const contRect = container.getBoundingClientRect();
        const anchorRect = anchorEl.getBoundingClientRect();
        // place to the right, but if space insufficient, place below
        let left = anchorRect.right - contRect.left + container.scrollLeft + 8;
        let top = anchorRect.top - contRect.top + container.scrollTop;
        // clamp within container size
        if (left + 250 > container.clientWidth) left = Math.max(8, anchorRect.left - contRect.left + container.scrollLeft - 260);
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';

        // OK handler: collect checked
        ok.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const checked = Array.from(popup.querySelectorAll('input[type=checkbox]:checked')).map(x => x.value);
            cls.interfaces = checked;
            popup.remove();
            render();
        });

        // Cancel handler
        cancel.addEventListener('click', (ev) => { ev.stopPropagation(); popup.remove(); });

        // close when clicking outside
        const outsideHandler = (ev) => {
            if (!popup.contains(ev.target)) {
                popup.remove();
                window.removeEventListener('pointerdown', outsideHandler);
            }
        };
        // listen after a tick so the click that opened the popup doesn't immediately close it
        setTimeout(() => window.addEventListener('pointerdown', outsideHandler), 0);
    }

    // 削除されたクラス名を受け取り、他のクラスの参照を消す（interfaces と baseClass をクリアする）
    function cleanupReferences(deletedName) {
        if (!deletedName) return;
        for (const c of model.classes) {
            // interfaces: 名前ベースの配列なら削除された名前を除外
            if (Array.isArray(c.interfaces) && c.interfaces.length > 0) {
                c.interfaces = c.interfaces.filter(name => name !== deletedName);
            }
            // baseClass が該当名なら 'None' に戻す
            if (c.baseClass === deletedName) {
                c.baseClass = 'None';
            }
            // もし将来的に attributes / operations 内で参照をクリアしたければここで処理可能
            // 例: 属性の型が削除されたクラス名なら型を 'object' 等に戻す（現在は任意）
            // for (const a of c.attributes || []) { if (a.type === deletedName) a.type = 'object'; }
        }
    }

    // produce a copy of the model suitable for export/generation:
    // convert interfaces IDs -> names so older generators keep working
    function modelForExport() {
        const idToName = {};
        for (const c of model.classes) idToName[c.id] = c.name;

        const copy = { classes: [] };
        for (const c of model.classes) {
            const cc = JSON.parse(JSON.stringify(c)); // deep-ish clone
            // convert interfaces ids -> names
            //cc.interfaces = (c.interfaces || []).map(id => idToName[id]).filter(n => !!n);
            // convert baseClassId -> baseClass (name) for export
            cc.baseClass = c.baseClassId ? idToName[c.baseClassId] : 'None';
            // keep baseClassId in internal model, but remove it from exported copy (optional)
            //delete cc.baseClassId;
            copy.classes.push(cc);
        }
        return copy;
    }
    // cleanup references after deleting a class (by id)
    function cleanupReferencesById(deletedId) {
        if (!deletedId) return;
        // also obtain name for baseClass cleanup
        const deleted = model.classes.find(c => c.id === deletedId);
        const deletedName = deleted ? deleted.name : null;
        for (const c of model.classes) {
            if (Array.isArray(c.interfaces) && c.interfaces.length > 0) {
                c.interfaces = c.interfaces.filter(id => id !== deletedId);
            }
            if (c.baseClassId === deletedId) {
                c.baseClassId = null;
            }
            if (deletedName && c.baseClass === deletedName) {
                c.baseClass = 'None';
            }
            // Optional: clear attribute/operation type references to deletedName if they used names
            for (const a of c.attributes || []) {
                if (a.type === deletedName) a.type = 'object';
            }
            for (const o of c.operations || []) {
                if (o.returnType === deletedName) o.returnType = 'void';
                for (const p of o.parameters || []) {
                    if (p.type === deletedName) p.type = 'object';
                }
            }
        }
    }
    // init with one class
    model.classes.push(newClass(40, 40));
    migrateModel();
    render();
})();