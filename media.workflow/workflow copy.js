(() => {
    const vscode = acquireVsCodeApi?.();
    const svg = document.getElementById('canvas');
    const nodesLayer = document.getElementById('nodes');
    const edgesLayer = document.getElementById('edges');
    const operationSelect = document.getElementById('operationSelect');
    const btnLoad = document.getElementById('btnLoad');
    const btnSave = document.getElementById('btnSave');
    const filePathSpan = document.getElementById('filePath');
    const contextMenu = document.getElementById('contextMenu');
    const edgeContextMenu = document.getElementById('edgeContextMenu');
    const createButtons = document.querySelectorAll('.createBtn');

    // diagram & workflow state
    let diagram = { classes: [] };
    let currentOpRef = null;
    let currentWorkflow = { nodes: [], edges: [] };

    const nodeMap = new Map(); // id -> node object

    // edge drag state (creating new edges by dragging handle)
    let edgeDragging = null; // { fromNode, tempLine, pointerId }

    // node drag state
    let nodeDragging = null; // { node, pointerId, offsetX, offsetY }

    // inline label editor element reference
    let inlineEditor = null;

    // edge handle drag state
    let edgeHandleDragging = null; // { edge, index, pointerId }

    // edge context target
    let contextTargetEdge = null;

    // request workspace diagram on start
    vscode.postMessage?.({ type: 'requestWorkspaceDiagram' });

    // ------------------ message handling ------------------
    window.addEventListener('message', (ev) => {
        const msg = ev.data;
        if (!msg || !msg.type) return;
        switch (msg.type) {
            case 'fileLoaded':
                filePathSpan.textContent = msg.filePath ? msg.filePath : '(new)';
                try { diagram = JSON.parse(msg.content); }
                catch (e) { console.error('Invalid JSON loaded', e); diagram = { classes: [] }; }
                rebuildOperationList();
                break;
            case 'saveCompleted':
                filePathSpan.textContent = msg.filePath;
                alert('Save completed: ' + msg.filePath);
                break;
            case 'error':
                alert('Error: ' + msg.message);
                break;
            default:
                console.log('msg', msg);
        }
    });

    // ------------------ UI event bindings ------------------
    btnLoad.addEventListener('click', () => vscode.postMessage?.({ type: 'openFile' }));
    btnSave.addEventListener('click', () => {
        if (!currentOpRef) { alert('No operation selected.'); return; }
        if (!diagram.classes[currentOpRef.classIndex]) { alert('Invalid operation reference.'); return; }
        const ops = diagram.classes[currentOpRef.classIndex].operations;
        ops[currentOpRef.opIndex] = ops[currentOpRef.opIndex] || {};
        ops[currentOpRef.opIndex].workflow = currentWorkflow;
        vscode.postMessage?.({ type: 'saveFile', content: JSON.stringify(diagram, null, 2) });
    });

    operationSelect.addEventListener('change', () => {
        const val = operationSelect.value;
        if (!val) return;
        const [classIndexStr, opIndexStr] = val.split(':');
        const ci = parseInt(classIndexStr, 10), oi = parseInt(opIndexStr, 10);
        currentOpRef = { classIndex: ci, opIndex: oi };
        loadWorkflowFromDiagram();
    });

    // toolbar create buttons
    createButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const pt = getSvgPoint(window.innerWidth / 2, (window.innerHeight - 44) / 2 + 44); // canvas center
            createNodeAt(type, pt.x, pt.y);
        });
    });

    // context menu click for node menu
    contextMenu.addEventListener('click', (ev) => {
        const item = ev.target.closest('.menuItem');
        if (!item || !contextTargetNode) { hideContextMenu(); return; }
        const type = item.dataset.type;
        if (type === 'delete') deleteNode(contextTargetNode);
        else addNodeNextTo(contextTargetNode, type);
        hideContextMenu();
    });

    // edge context menu click
    edgeContextMenu.addEventListener('click', (ev) => {
        const item = ev.target.closest('.menuItem');
        if (!item || !contextTargetEdge) { hideEdgeContextMenu(); return; }
        const type = item.dataset.type;
        if (type === 'deleteEdge') {
            deleteEdge(contextTargetEdge);
        }
        hideEdgeContextMenu();
    });

    // click outside to hide menus and inline editor
    window.addEventListener('pointerdown', (ev) => {
        if (!contextMenu.classList.contains('hidden')) {
            const within = ev.target && (ev.target.closest && ev.target.closest('#contextMenu'));
            if (!within) hideContextMenu();
        }
        if (!edgeContextMenu.classList.contains('hidden')) {
            const withinEdge = ev.target && (ev.target.closest && ev.target.closest('#edgeContextMenu'));
            if (!withinEdge) hideEdgeContextMenu();
        }
        // if clicked outside inline editor, commit and close it
        if (inlineEditor && !ev.target.closest('.inline-input')) {
            commitInlineEditor();
        }
    });

    // ------------------ operations list ------------------
    function rebuildOperationList() {
        operationSelect.innerHTML = '';
        for (let ci = 0; ci < (diagram.classes || []).length; ++ci) {
            const cls = diagram.classes[ci];
            const ops = cls.operations || [];
            for (let oi = 0; oi < ops.length; ++oi) {
                const op = ops[oi];
                const label = `${cls.name || 'Class'}.${op.name || ('op' + oi)}`;
                const opt = document.createElement('option');
                opt.value = `${ci}:${oi}`;
                opt.textContent = label;
                operationSelect.appendChild(opt);
            }
        }
        if (operationSelect.options.length === 0) {
            if (!diagram.classes) diagram.classes = [];
            if (diagram.classes.length === 0) {
                diagram.classes.push({ id: 'c0', name: 'NewClass', attributes: [], operations: [{ name: 'Op', returnType: 'void' }] });
            } else if (!diagram.classes[0].operations || diagram.classes[0].operations.length === 0) {
                diagram.classes[0].operations = [{ name: 'Op', returnType: 'void' }];
            }
            rebuildOperationList();
            return;
        }
        operationSelect.selectedIndex = 0;
        operationSelect.dispatchEvent(new Event('change'));
    }

    // ------------------ load workflow ------------------
    function loadWorkflowFromDiagram() {
        if (!currentOpRef) return;
        const cls = diagram.classes[currentOpRef.classIndex]; if (!cls) return;
        const op = cls.operations[currentOpRef.opIndex]; if (!op) return;
        currentWorkflow = op.workflow ? JSON.parse(JSON.stringify(op.workflow)) : { nodes: [], edges: [] };
        currentWorkflow.nodes = currentWorkflow.nodes || []; currentWorkflow.edges = currentWorkflow.edges || [];
        clearAllNodes();
        currentWorkflow.nodes.forEach(n => drawNode(n));
        drawEdges();
    }

    // ------------------ drawing helpers ------------------
    function clearAllNodes() { nodesLayer.innerHTML = ''; nodeMap.clear(); }
    function createRect(w, h) { const r = document.createElementNS(svg.namespaceURI, 'rect'); r.setAttribute('x', -w / 2); r.setAttribute('y', -h / 2); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('rx', 6); return r; }
    function createEllipse(rx, ry) { const e = document.createElementNS(svg.namespaceURI, 'ellipse'); e.setAttribute('cx', 0); e.setAttribute('cy', 0); e.setAttribute('rx', rx); e.setAttribute('ry', ry); return e; }
    function createDiamond(w, h) { const p = document.createElementNS(svg.namespaceURI, 'polygon'); const pts = [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]].map(pt => pt.join(',')).join(' '); p.setAttribute('points', pts); return p; }

    function drawNode(node) {
        if (nodeMap.has(node.id)) return;
        // fallback defaults
        node.type = node.type || 'process';
        node.label = node.label || node.id;

        const g = document.createElementNS(svg.namespaceURI, 'g');
        g.classList.add('node');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);
        g.dataset.id = node.id;

        let shape; let width = 140; let height = 40;
        if (node.type === 'process') shape = createRect(width, height);
        else if (node.type === 'decision') { width = 120; height = 80; shape = createDiamond(width, height); }
        else { shape = createEllipse(60, 24); width = 120; height = 48; }
        shape.setAttribute('class', 'shape');

        const text = document.createElementNS(svg.namespaceURI, 'text');
        text.setAttribute('x', 0);
        text.setAttribute('y', 6);
        text.setAttribute('text-anchor', 'middle');
        text.textContent = node.label;

        g.appendChild(shape);
        g.appendChild(text);

        // create handle for edge-drag on right side
        const handle = document.createElementNS(svg.namespaceURI, 'circle');
        handle.setAttribute('r', 6);
        handle.setAttribute('cx', width / 2 + 8);
        handle.setAttribute('cy', 0);
        handle.setAttribute('class', 'handle');
        g.appendChild(handle);

        nodesLayer.appendChild(g);

        node._width = width; node._height = height; node._g = g; node._textEl = text;
        nodeMap.set(node.id, node);

        // events:
        // node drag
        enableNodeDrag(g, node);
        // right-click menu on node
        g.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); showContextMenuForNode(ev.clientX, ev.clientY, node); });

        // double-click to edit label
        g.addEventListener('dblclick', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            openInlineEditorForNode(node);
        });

        // handle pointerdown for edge drag (prevent node drag)
        handle.addEventListener('pointerdown', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            startEdgeDrag(node, ev);
        });
    }

    // ------------------ エッジ描画: start -> mid -> end（折れ点は mid or edge.mid） ------------------
    function drawEdges() {
        edgesLayer.innerHTML = '';
        (currentWorkflow.edges || []).forEach((e, idx) => {
            const from = nodeMap.get(e.from); const to = nodeMap.get(e.to);
            if (!from || !to) return;

            // Use stored mid if present, otherwise center midpoint
            const start = boundaryPointTowards(from, e.mid ? e.mid : to);
            const end = boundaryPointTowards(to, e.mid ? e.mid : from);
            const mid = e.mid ? { x: e.mid.x, y: e.mid.y } : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

            const points = [start, mid, end];
            appendEdgePath(points, e, idx);
        });
    }

    /* appendEdgePath: points[] を path として追加。path に contextmenu をアタッチして右クリックで削除可能にする
       また mid に対してハンドル（circle.edge-handle）を作りドラッグ可能にする。
    */
    function appendEdgePath(points, edge, edgeIndex) {
        const d = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'edge');

        // store refs
        edge._path = path;
        edge._pointsCache = points.slice();

        // contextmenu で削除
        path.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            contextTargetEdge = edge;
            showEdgeContextMenu(ev.clientX, ev.clientY);
        });

        edgesLayer.appendChild(path);

        // condition ラベル
        if (edge.condition !== undefined && edge.condition !== null) {
            const midpt = computePolylineMidpoint(points);
            const label = document.createElementNS(svg.namespaceURI, 'text');
            label.setAttribute('x', midpt.x); label.setAttribute('y', midpt.y - 8);
            label.setAttribute('text-anchor', 'middle'); label.setAttribute('class', 'edge-label');
            label.textContent = String(edge.condition);
            label.style.pointerEvents = 'none';
            edgesLayer.appendChild(label);
            edge._labelEl = label;
        } else {
            edge._labelEl = null;
        }

        // ハンドル（折れ点） — ここで pointerdown によるオフセット計算を行う
        const mid = points[1];
        const handle = document.createElementNS(svg.namespaceURI, 'circle');
        handle.setAttribute('cx', mid.x);
        handle.setAttribute('cy', mid.y);
        handle.setAttribute('r', 6);
        handle.setAttribute('class', 'edge-handle');
        handle.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            contextTargetEdge = edge;
            showEdgeContextMenu(ev.clientX, ev.clientY);
        });
        handle.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            // SVG 座標で掴んだ位置を求め、折れ点との差分（オフセット）を保存
            const p = getSvgPoint(ev.clientX, ev.clientY);
            const offsetX = p.x - mid.x;
            const offsetY = p.y - mid.y;
            try { handle.setPointerCapture(ev.pointerId); } catch (e) { }
            edgeHandleDragging = { edge, handle, pointerId: ev.pointerId, offsetX, offsetY };
            // 排他: nodeDragging と競合しないよう nodeDragging を無視するチェックは既存コード側にあります
        });

        edgesLayer.appendChild(handle);
        edge._handleEl = handle;
    }

    // ------------------ coordinate helpers ------------------
    function getSvgPoint(clientX, clientY) {
        const pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = clientY;
        const ctm = svg.getScreenCTM(); if (!ctm) return { x: clientX, y: clientY };
        return pt.matrixTransform(ctm.inverse());
    }

    // ------------------ node drag ------------------
    function enableNodeDrag(gElement, node) {
        gElement.style.touchAction = 'none';
        gElement.addEventListener('pointerdown', (ev) => {
            // ignore pointerdown when edgeDragging in progress or clicking on handle (handled separately)
            if (edgeDragging) return;
            ev.preventDefault();
            const p = getSvgPoint(ev.clientX, ev.clientY);
            const offsetX = p.x - node.x; const offsetY = p.y - node.y;
            nodeDragging = { node, pointerId: ev.pointerId, offsetX, offsetY };
            try { gElement.setPointerCapture(ev.pointerId); } catch (e) { }
        });

        svg.addEventListener('pointermove', (ev) => {
            if (nodeDragging && !edgeDragging && !edgeHandleDragging) {
                if (ev.pointerId !== nodeDragging.pointerId) return;
                const p = getSvgPoint(ev.clientX, ev.clientY);
                nodeDragging.node.x = p.x - nodeDragging.offsetX; nodeDragging.node.y = p.y - nodeDragging.offsetY;
                nodeDragging.node._g.setAttribute('transform', `translate(${nodeDragging.node.x},${nodeDragging.node.y})`);
                // update edges visually without full rebuild: redraw all edges for simplicity
                drawEdges();
            }
        });

        function releaseIfMatches(ev) {
            if (!nodeDragging) return;
            if (ev && ev.pointerId && ev.pointerId !== nodeDragging.pointerId) return;
            try { nodeDragging.node._g.releasePointerCapture(nodeDragging.pointerId); } catch (e) { }
            nodeDragging = null;
        }
        svg.addEventListener('pointerup', releaseIfMatches);
        svg.addEventListener('pointercancel', releaseIfMatches);
    }

    // ------------------ edge drag (create new edge by dragging handle) ------------------
    function startEdgeDrag(fromNode, ev) {
        const p = getSvgPoint(ev.clientX, ev.clientY);
        const line = document.createElementNS(svg.namespaceURI, 'path');
        line.setAttribute('class', 'edge');
        line.setAttribute('d', `M${fromNode.x},${fromNode.y} L${p.x},${p.y}`);
        line.setAttribute('stroke-width', '3');
        edgesLayer.appendChild(line);
        edgeDragging = { fromNode, tempLine: line, pointerId: ev.pointerId };
        try { ev.target.setPointerCapture(ev.pointerId); } catch (e) { }
    }

    svg.addEventListener('pointermove', (ev) => {
        // handle creating-edge dragging
        if (edgeDragging) {
            if (ev.pointerId !== edgeDragging.pointerId) return;
            const p = getSvgPoint(ev.clientX, ev.clientY);
            edgeDragging.tempLine.setAttribute('d', `M${edgeDragging.fromNode.x},${edgeDragging.fromNode.y} L${p.x},${p.y}`);
            return;
        }

        // handle edge-handle dragging (midpoint)
        if (edgeHandleDragging) {
            if (ev.pointerId !== edgeHandleDragging.pointerId) return;
            const p = getSvgPoint(ev.clientX, ev.clientY);
            const { edge, offsetX, offsetY } = edgeHandleDragging;
            // 新しい mid = pointer - offset
            const newMid = { x: p.x - offsetX, y: p.y - offsetY };
            edge.mid = newMid;
            updateEdgeVisual(edge);
            return;
        }

        // node dragging handled in enableNodeDrag separately
    });

    svg.addEventListener('pointerup', (ev) => {
        // finish create-edge
        if (edgeDragging) {
            if (ev.pointerId === edgeDragging.pointerId) {
                let tgtNode = findNodeUnderPointer(ev.clientX, ev.clientY);
                const fromNode = edgeDragging.fromNode;
                try { edgeDragging.tempLine.remove(); } catch (e) { }
                if (tgtNode && tgtNode.id !== fromNode.id) {
                    const newEdge = { from: fromNode.id, to: tgtNode.id };
                    if (fromNode.type === 'decision') {
                        const outs = currentWorkflow.edges.filter(ex => ex.from === fromNode.id);
                        const hasFalse = outs.some(ex => String(ex.condition).toLowerCase() === 'false');
                        const hasTrue = outs.some(ex => String(ex.condition).toLowerCase() === 'true');
                        if (!hasFalse) newEdge.condition = 'false';
                        else if (!hasTrue) newEdge.condition = 'true';
                        else newEdge.condition = null;
                    }
                    currentWorkflow.edges.push(newEdge);
                    drawEdges();
                }
                edgeDragging = null;
            }
            return;
        }

        // finish handle dragging
        if (edgeHandleDragging) {
            if (ev.pointerId === edgeHandleDragging.pointerId) {
                // release pointer capture on the handle element if possible
                try { edgeHandleDragging.handle && edgeHandleDragging.handle.releasePointerCapture(edgeHandleDragging.pointerId); } catch (e) { }
                // finalize: edge.mid is already set during move and will be saved on Save JSON
                edgeHandleDragging = null;
            }
            return;
        }

        // nodeDragging pointerup handled elsewhere
    });

    svg.addEventListener('pointercancel', (ev) => {
        if (edgeDragging) {
            if (edgeDragging.tempLine && edgeDragging.tempLine.parentNode) edgeDragging.tempLine.parentNode.removeChild(edgeDragging.tempLine);
            edgeDragging = null;
        }
        if (edgeHandleDragging) {
            try { edgeHandleDragging.handle && edgeHandleDragging.handle.releasePointerCapture(edgeHandleDragging.pointerId); } catch (e) { }
            edgeHandleDragging = null;
        }
    });

    function findNodeUnderPointer(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return null;
        const g = el.closest && el.closest('.node');
        if (!g) return null;
        const id = g.dataset.id;
        return nodeMap.get(id);
    }

    // ------------------ context menu & node add/delete ------------------
    let contextTargetNode = null;
    function showContextMenuForNode(clientX, clientY, node) {
        contextTargetNode = node;
        const menu = contextMenu; menu.classList.remove('hidden');
        const maxX = window.innerWidth - 160; const maxY = window.innerHeight - 10;
        let left = clientX; let top = clientY;
        if (left > maxX) left = maxX; if (top > maxY) top = maxY;
        menu.style.left = left + 'px'; menu.style.top = top + 'px';
    }
    function hideContextMenu() { contextTargetNode = null; contextMenu.classList.add('hidden'); }

    // edge context menu
    function showEdgeContextMenu(clientX, clientY) {
        const menu = edgeContextMenu; menu.classList.remove('hidden');
        const maxX = window.innerWidth - 160; const maxY = window.innerHeight - 10;
        let left = clientX; let top = clientY;
        if (left > maxX) left = maxX; if (top > maxY) top = maxY;
        menu.style.left = left + 'px'; menu.style.top = top + 'px';
    }
    function hideEdgeContextMenu() { contextTargetEdge = null; edgeContextMenu.classList.add('hidden'); }

    function addNodeNextTo(node, type) {
        const id = generateId(type);
        const newX = node.x + 180; const newY = node.y;
        const newNode = { id, type, label: capitalize(type), x: newX, y: newY };
        currentWorkflow.nodes.push(newNode);

        const edge = { from: node.id, to: newNode.id };
        if (node.type === 'decision') {
            const outs = currentWorkflow.edges.filter(e => e.from === node.id);
            const hasFalse = outs.some(e => String(e.condition).toLowerCase() === 'false');
            const hasTrue = outs.some(e => String(e.condition).toLowerCase() === 'true');
            if (!hasFalse) edge.condition = 'false';
            else if (!hasTrue) edge.condition = 'true';
            else edge.condition = null;
        }
        currentWorkflow.edges.push(edge);
        drawNode(newNode);
        drawEdges();
    }

    function deleteNode(node) {
        if (!node) return;
        const nodeId = node.id;
        currentWorkflow.nodes = (currentWorkflow.nodes || []).filter(n => n.id !== nodeId);
        currentWorkflow.edges = (currentWorkflow.edges || []).filter(e => e.from !== nodeId && e.to !== nodeId);
        if (node._g && node._g.parentNode) node._g.parentNode.removeChild(node._g);
        nodeMap.delete(nodeId);
        drawEdges();
    }

    function deleteEdge(edge) {
        if (!edge) return;
        currentWorkflow.edges = (currentWorkflow.edges || []).filter(e => !(e.from === edge.from && e.to === edge.to && (('condition' in e ? String(e.condition) : null) === ('condition' in edge ? String(edge.condition) : null))));
        drawEdges();
    }

    function createNodeAt(type, x, y) {
        const id = generateId(type);
        const node = { id, type, label: capitalize(type), x, y };
        currentWorkflow.nodes.push(node);
        drawNode(node);
        drawEdges();
    }

    function generateId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`; }
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ------------------ inline label editor ------------------
    function openInlineEditorForNode(node) {
        commitInlineEditor(); // close previous
        const ctm = svg.getScreenCTM();
        const screenPoint = svg.createSVGPoint(); screenPoint.x = node.x; screenPoint.y = node.y;
        const sp = screenPoint.matrixTransform(ctm);
        const input = document.createElement('input');
        input.value = node.label || '';
        input.className = 'inline-input';
        input.style.left = (sp.x - 100) + 'px';
        input.style.top = (sp.y - 12) + 'px';
        input.style.width = '200px';
        document.body.appendChild(input);
        input.focus();
        inlineEditor = { input, node };

        function commit() {
            const v = input.value.trim();
            node.label = v || node.id;
            if (node._textEl) node._textEl.textContent = node.label;
            commitInlineEditor();
        }
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') commit();
            else if (ev.key === 'Escape') { commitInlineEditor(); }
        });
        input.addEventListener('blur', commit);
    }
    function commitInlineEditor() {
        if (!inlineEditor) return;
        try { inlineEditor.input.remove(); } catch (e) { }
        inlineEditor = null;
        drawEdges();
    }

    // ------------------ initialization & empty state ------------------
    function initEmpty() {
        clearAllNodes();
        if ((!currentWorkflow.nodes) || currentWorkflow.nodes.length === 0) {
            currentWorkflow.nodes = [
                { id: 'start_' + Date.now(), type: 'start', label: 'Start', x: 150, y: 80 },
                { id: 'end_' + Date.now(), type: 'end', label: 'End', x: 150, y: 320 }
            ];
            currentWorkflow.edges = [{ from: currentWorkflow.nodes[0].id, to: currentWorkflow.nodes[1].id }];
        }
        currentWorkflow.nodes.forEach(n => drawNode(n));
        drawEdges();
    }
    initEmpty();

    // expose for debug
    window.__workflow = () => currentWorkflow;

    // ------------------ utility: midpoint and polyline mid ------------------
    function computePolylineMidpoint(points) {
        let total = 0;
        const segLengths = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            segLengths.push(len);
            total += len;
        }
        let target = total / 2;
        for (let i = 0; i < segLengths.length; i++) {
            if (target <= segLengths[i]) {
                const a = points[i], b = points[i + 1];
                const t = segLengths[i] === 0 ? 0 : target / segLengths[i];
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            target -= segLengths[i];
        }
        return points[Math.floor(points.length / 2)];
    }

    // ------------------ boundaryPointTowards (shape collision support) ------------------
    function boundaryPointTowards(node, target) {
        const cx = node.x, cy = node.y;
        const dx = target.x - cx, dy = target.y - cy;
        if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy };

        const type = node.type || 'process';
        if (type === 'process') {
            const w = node._width || 140, h = node._height || 40;
            const sx = dx === 0 ? Infinity : (w / 2) / Math.abs(dx);
            const sy = dy === 0 ? Infinity : (h / 2) / Math.abs(dy);
            const s = Math.min(sx, sy);
            return { x: cx + dx * s, y: cy + dy * s };
        } else if (type === 'decision') {
            const w = node._width || 120, h = node._height || 80;
            const denom = (Math.abs(dx) * 2 / w) + (Math.abs(dy) * 2 / h);
            const t = denom === 0 ? 0 : 1 / denom;
            return { x: cx + dx * t, y: cy + dy * t };
        } else {
            const rx = (node._width || 120) / 2;
            const ry = (node._height || 48) / 2;
            const sq = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
            const t = sq === 0 ? 0 : 1 / Math.sqrt(sq);
            return { x: cx + dx * t, y: cy + dy * t };
        }
    }
    /* updateEdgeVisual: edge の mid/label/path/handle を再レンダリング（ライブ更新用） */
    function updateEdgeVisual(edge) {
        if (!edge) return;
        const from = nodeMap.get(edge.from), to = nodeMap.get(edge.to);
        if (!from || !to) return;

        const start = boundaryPointTowards(from, edge.mid ? edge.mid : to);
        const end = boundaryPointTowards(to, edge.mid ? edge.mid : from);
        const mid = edge.mid ? { x: edge.mid.x, y: edge.mid.y } : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const points = [start, mid, end];

        // path
        if (edge._path) {
            const d = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
            edge._path.setAttribute('d', d);
        }

        // label
        if (edge._labelEl) {
            const midpt = computePolylineMidpoint(points);
            edge._labelEl.setAttribute('x', midpt.x);
            edge._labelEl.setAttribute('y', midpt.y - 8);
        }

        // handle
        if (edge._handleEl) {
            edge._handleEl.setAttribute('cx', mid.x);
            edge._handleEl.setAttribute('cy', mid.y);
        }

        edge._pointsCache = points;
    }

})();
