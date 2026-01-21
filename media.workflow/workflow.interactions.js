import { state, setWorkflow, setCurrentOpRef } from './workflow.state.js';
import * as draw from './workflow.draw.js';
import { getSvgPoint as rawGetSvgPoint, capitalize, generateId } from './workflow.utils.js';

let svg, nodesLayer, edgesLayer, operationSelect, btnLoad, btnSave, filePathSpan, contextMenu, edgeContextMenu, createButtons, vscode;
let edgeDragging = null, nodeDragging = null, inlineEditor = null, edgeHandleDragging = null, contextTargetEdge = null, contextTargetNode = null;

export function initInteractions(params) {
  svg = params.svg; nodesLayer = params.nodesLayer; edgesLayer = params.edgesLayer;
  operationSelect = params.operationSelect; btnLoad = params.btnLoad; btnSave = params.btnSave; filePathSpan = params.filePath;
  contextMenu = params.contextMenu; edgeContextMenu = params.edgeContextMenu; createButtons = params.createButtons; vscode = params.vscode;

  const getSvgPoint = (x, y) => rawGetSvgPoint(svg, x, y);

  // API hooks
  btnLoad.addEventListener('click', () => vscode.postMessage?.({
    type: 'openFile'
  }));
  btnSave.addEventListener('click', () => {
    if (!state.currentOpRef) {
      vscode.postMessage?.({ type: 'alert', text: 'No operation selected.' });
      return;
    }
    const cls = state.diagram.classes[state.currentOpRef.classIndex];
    if (!cls) {
      vscode.postMessage?.({ type: 'alert', text: 'Invalid operation reference.' });
      return;
    }
    const ops = cls.operations || [];
    const op = ops[state.currentOpRef.opIndex] || {};
    ops[state.currentOpRef.opIndex] = op;

    // Save visual workflow
    op.workflow = JSON.parse(JSON.stringify(state.currentWorkflow));

    // Save generated AST for code generation
    try {
      op.workflowAst = params.convertToAst(state.currentWorkflow);
    } catch (e) {
      //console.error('AST Conversion failed', e);
      vscode.postMessage?.({ type: 'alert', text: 'AST Conversion failed: ' + e.message });
    }

    vscode.postMessage?.({
      type: 'saveFile',
      content: JSON.stringify(state.diagram, null, 2)
    });
  });

  operationSelect.addEventListener('change', () => {
    const val = operationSelect.value; if (!val) return;
    const [classIndexStr, opIndexStr] = val.split(':');
    const ci = parseInt(classIndexStr, 10), oi = parseInt(opIndexStr, 10);
    setCurrentOpRef({
      classIndex: ci,
      opIndex: oi
    });
    loadWorkflowFromDiagram();
  });

  createButtons.forEach(btn => btn.addEventListener('click', () => {
    const type = btn.dataset.type; const pt = getSvgPoint(window.innerWidth / 2, (window.innerHeight - 44) / 2 + 44);
    createNodeAt(type, pt.x, pt.y);
  }));

  contextMenu.addEventListener('click', (ev) => {
    const item = ev.target.closest('.menuItem'); if (!item || !contextTargetNode) { hideContextMenu(); return; }
    const type = item.dataset.type;
    if (type === 'delete') deleteNode(contextTargetNode); else addNodeNextTo(contextTargetNode, type);
    hideContextMenu();
  });


  edgeContextMenu.addEventListener('click', (ev) => {
    const item = ev.target.closest('.menuItem'); if (!item || !contextTargetEdge) { hideEdgeContextMenu(); return; }
    const type = item.dataset.type; if (type === 'deleteEdge') deleteEdge(contextTargetEdge); hideEdgeContextMenu();
  });

  window.addEventListener('pointerdown', (ev) => {
    if (!contextMenu.classList.contains('hidden')) {
      const within = ev.target && (ev.target.closest && ev.target.closest('#contextMenu'));
      if (!within) hideContextMenu();
    }
    if (!edgeContextMenu.classList.contains('hidden')) {
      const withinEdge = ev.target && (ev.target.closest && ev.target.closest('#edgeContextMenu'));
      if (!withinEdge) hideEdgeContextMenu();
    }
    if (inlineEditor && !ev.target.closest('.inline-input')) commitInlineEditor();
  });
  document.addEventListener('dblclick', (ev) => {
    const el = ev.target;
    // ノード上での右クリック
    const g = el.closest && el.closest('.node');
    if (g) {
      ev.preventDefault();
      const node = state.nodeMap.get(g.dataset.id);
      openInlineEditorForNode(node);
      return;
    }
  });
  document.addEventListener('contextmenu', (ev) => {
    const el = ev.target;
    // ノード上での右クリック
    const g = el.closest && el.closest('.node');
    if (g) {
      ev.preventDefault();
      const node = state.nodeMap.get(g.dataset.id);
      showContextMenuForNode(ev.clientX, ev.clientY, node);
      return;
    }
    // 折れ点（edge-handle）上での右クリック
    const handleEl = el.closest && el.closest('.edge-handle');
    if (handleEl) {
      ev.preventDefault();
      const edge = findEdgeByHandleElement(handleEl);
      if (edge) {
        contextTargetEdge = edge;
        showEdgeContextMenu(ev.clientX, ev.clientY);
      }
      return;
    }
    // エッジ(path)上での右クリック
    const pathEl = el.closest && el.closest('path.edge');
    if (pathEl) {
      ev.preventDefault();
      const edge = findEdgeByPathElement(pathEl);
      if (edge) {
        contextTargetEdge = edge;
        showEdgeContextMenu(ev.clientX, ev.clientY);
      }
      return;
    }
  });
  enableNodeDragSetup(getSvgPoint);
  enableEdgeCreate(getSvgPoint);
  enableEdgeHandleDrag(getSvgPoint);

  // initial empty drawing
  //draw.initEmpty();
}

function rebuildOperationListFromDiagram() {
  operationSelect.innerHTML = '';
  for (let ci = 0; ci < (state.diagram.classes || []).length; ++ci) {
    const cls = state.diagram.classes[ci];
    if (cls.isInterface) continue;
    const ops = cls.operations || [];
    for (let oi = 0; oi < ops.length; ++oi) {
      const op = ops[oi];
      if (op.modifier === 'abstract') continue;
      const label = `${cls.name || 'Class'}.${op.name || ('op' + oi)}`;
      const opt = document.createElement('option'); opt.value = `${ci}:${oi}`; opt.textContent = label; operationSelect.appendChild(opt);
    }
  }
  if (operationSelect.options.length === 0) {
    if (!state.diagram.classes) state.diagram.classes = [];
    if (state.diagram.classes.length === 0) {
      vscode.postMessage?.({
        type: 'alert',
        text: 'クラス図が存在しないため、新規に作成します。'
      });
      state.diagram.classes.push({
        id: 'c0',
        name: 'NewClass',
        x: 20,
        y: 20,
        width: 400,
        height: 120,
        baseClassId: null,
        interfaces: [],
        isAbstract: false,
        isInterface: false,
        attributes: [],
        operations: [{
          name: 'Op',
          returnType: 'void',
          visibility: 'private',
          modifier: 'None',
          parameters: []
        }]
      });

    } else if (!state.diagram.classes[0].operations || state.diagram.classes[0].operations.length === 0) {
      state.diagram.classes[0].operations = [{
        name: 'Op',
        returnType: 'void'
      }];

    }
    rebuildOperationListFromDiagram(); return;
  }
  operationSelect.selectedIndex = 0; operationSelect.dispatchEvent(new Event('change'));
}

export function loadWorkflowFromDiagram() {
  if (!state.currentOpRef) return;
  const cls = state.diagram.classes[state.currentOpRef.classIndex]; if (!cls) return;
  const op = cls.operations[state.currentOpRef.opIndex]; if (!op) return;
  state.currentWorkflow = op.workflow ? JSON.parse(JSON.stringify(op.workflow)) : {
    nodes: [],
    edges: []
  };
  state.currentWorkflow.nodes = state.currentWorkflow.nodes || []; state.currentWorkflow.edges = state.currentWorkflow.edges || [];
  draw.clearAllNodes();
  state.currentWorkflow.nodes.forEach(n => draw.drawNode(n));
  draw.drawEdges();
}

function enableNodeDragSetup(getSvgPoint) {
  let nodeDragging = null;
  svg.addEventListener('pointermove', (ev) => {
    if (nodeDragging && !edgeDragging && !edgeHandleDragging) {
      if (ev.pointerId !== nodeDragging.pointerId) return;
      const p = getSvgPoint(ev.clientX, ev.clientY);
      nodeDragging.node.x = p.x - nodeDragging.offsetX; nodeDragging.node.y = p.y - nodeDragging.offsetY;
      nodeDragging.node._g.setAttribute('transform', `translate(${nodeDragging.node.x},${nodeDragging.node.y})`);
      draw.drawEdges();
    }
  });
  svg.addEventListener('pointerup', (ev) => { if (nodeDragging && ev.pointerId === nodeDragging.pointerId) { try { nodeDragging.node._g.releasePointerCapture(nodeDragging.pointerId); } catch (e) { } nodeDragging = null; } });
  svg.addEventListener('pointercancel', () => { nodeDragging = null; });

  // delegate pointerdown to node elements when nodes are created
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target;
    const g = el.closest && el.closest('.node');
    if (!g) return;
    if (edgeDragging) return;
    ev.preventDefault();
    const node = state.nodeMap.get(g.dataset.id);
    const p = getSvgPoint(ev.clientX, ev.clientY);
    const offsetX = p.x - node.x; const offsetY = p.y - node.y;
    nodeDragging = {
      node,
      pointerId: ev.pointerId,
      offsetX,
      offsetY
    };
    try { g.setPointerCapture(ev.pointerId); } catch (e) { }
  });
}

function enableEdgeCreate(getSvgPoint) {
  svg.addEventListener('pointermove', (ev) => {
    if (edgeDragging) {
      if (ev.pointerId !== edgeDragging.pointerId) return;
      const p = getSvgPoint(ev.clientX, ev.clientY);
      edgeDragging.tempLine.setAttribute('d', `M${edgeDragging.fromNode.x},${edgeDragging.fromNode.y} L${p.x},${p.y}`);
    }
  });
  svg.addEventListener('pointerup', (ev) => {
    if (edgeDragging && ev.pointerId === edgeDragging.pointerId) {
      let tgtNode = findNodeUnderPointer(ev.clientX, ev.clientY);
      const fromNode = edgeDragging.fromNode;
      try { edgeDragging.tempLine.remove(); } catch (e) { }
      if (tgtNode && tgtNode.id !== fromNode.id) {
        const newEdge = {
          from: fromNode.id,
          to: tgtNode.id
        };
        if (fromNode.type === 'decision' || fromNode.type === 'loop') {
          const outs = state.currentWorkflow.edges.filter(ex => ex.from === fromNode.id);
          const hasFalse = outs.some(ex => String(ex.condition).toLowerCase() === 'false');
          const hasTrue = outs.some(ex => String(ex.condition).toLowerCase() === 'true');
          if (!hasFalse) newEdge.condition = 'false';
          else if (!hasTrue) newEdge.condition = 'true';
          else newEdge.condition = null;
        }
        state.currentWorkflow.edges.push(newEdge);
        draw.drawEdges();
      }
      edgeDragging = null;
    }
  });

  svg.addEventListener('pointercancel', () => { if (edgeDragging) { try { edgeDragging.tempLine.remove(); } catch (e) { } edgeDragging = null; } });

  // startEdgeDrag is attached to node handle when node is drawn; we attach global delegator
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target;
    if (!el.classList || !el.classList.contains('handle')) return;
    ev.preventDefault(); ev.stopPropagation();
    const g = el.closest('.node'); if (!g) return;
    const node = state.nodeMap.get(g.dataset.id);
    const p = getSvgPoint(ev.clientX, ev.clientY);
    const line = document.createElementNS(svg.namespaceURI, 'path');
    line.setAttribute('class', 'edge'); line.setAttribute('d', `M${node.x},${node.y} L${p.x},${p.y}`); line.setAttribute('stroke-width', '3');
    edgesLayer.appendChild(line);
    edgeDragging = {
      fromNode: node,
      tempLine: line,
      pointerId: ev.pointerId
    };
    try { ev.target.setPointerCapture(ev.pointerId); } catch (e) { }
  });
}

function enableEdgeHandleDrag(getSvgPoint) {
  svg.addEventListener('pointermove', (ev) => {
    if (edgeHandleDragging) {
      if (ev.pointerId !== edgeHandleDragging.pointerId) return;
      const p = getSvgPoint(ev.clientX, ev.clientY);
      const { edge, offsetX, offsetY } = edgeHandleDragging;
      const newMid = {
        x: p.x - offsetX,
        y: p.y - offsetY
      }; edge.mid = newMid;
      draw.updateEdgeVisual(edge);
    }
  });
  svg.addEventListener('pointerup', (ev) => {
    if (edgeHandleDragging && ev.pointerId === edgeHandleDragging.pointerId) {
      try { edgeHandleDragging.handle && edgeHandleDragging.handle.releasePointerCapture(edgeHandleDragging.pointerId); } catch (e) { }
      edgeHandleDragging = null;
    }
  });
  svg.addEventListener('pointercancel', () => {
    if (edgeHandleDragging) {
      try {
        edgeHandleDragging.handle && edgeHandleDragging.handle.releasePointerCapture(edgeHandleDragging.pointerId);
      } catch (e) { } edgeHandleDragging = null;
    }
  });

  // delegate pointerdown on edge-handle to start drag + save offset
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target;
    if (!el.classList || !el.classList.contains('edge-handle')) return;
    ev.preventDefault(); ev.stopPropagation();
    const edge = findEdgeByHandleElement(el);
    if (!edge) return;
    const p = getSvgPoint(ev.clientX, ev.clientY);
    const mid = edge.mid ? edge.mid : {
      x: edge._pointsCache[1].x,
      y: edge._pointsCache[1].y
    };
    const offsetX = p.x - mid.x; const offsetY = p.y - mid.y;
    try { el.setPointerCapture(ev.pointerId); } catch (e) { }
    edgeHandleDragging = {
      edge,
      handle: el,
      pointerId: ev.pointerId,
      offsetX,
      offsetY
    };
  });
}

function findNodeUnderPointer(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY); if (!el) return null;
  const g = el.closest && el.closest('.node'); if (!g) return null; return state.nodeMap.get(g.dataset.id);
}

function findEdgeByHandleElement(el) {
  // find edge by matching handle DOM element reference stored in edge._handleEl
  for (const e of (state.currentWorkflow.edges || [])) {
    if (e._handleEl === el) return e;
  }
  return null;
}
function findEdgeByPathElement(el) {
  for (const e of (state.currentWorkflow.edges || [])) {
    if (e._path === el) return e;
  }
  // fallback: try to match by comparing DOM nodes (in case clones/rehydration)
  for (const e of (state.currentWorkflow.edges || [])) {
    if (e._path && e._path.isSameNode && el.isSameNode && e._path.isSameNode(el)) return e;
  }
  return null;
}
function showContextMenuForNode(clientX, clientY, node) {
  contextTargetNode = node;
  const menu = contextMenu; menu.classList.remove('hidden');
  const maxX = window.innerWidth - 160; const maxY = window.innerHeight - 10;
  let left = clientX; let top = clientY; if (left > maxX) left = maxX; if (top > maxY) top = maxY;
  menu.style.left = left + 'px'; menu.style.top = top + 'px';
}
function hideContextMenu() { contextTargetNode = null; contextMenu.classList.add('hidden'); }

function showEdgeContextMenu(clientX, clientY) {
  const menu = edgeContextMenu; menu.classList.remove('hidden');
  const maxX = window.innerWidth - 160; const maxY = window.innerHeight - 10; let left = clientX; let top = clientY;
  if (left > maxX) left = maxX; if (top > maxY) top = maxY; menu.style.left = left + 'px'; menu.style.top = top + 'px';
}
function hideEdgeContextMenu() { contextTargetEdge = null; edgeContextMenu.classList.add('hidden'); }

function addNodeNextTo(node, type) {
  const id = generateId(type);
  const newX = node.x + 180; const newY = node.y;
  const newNode = {
    id,
    type,
    label: capitalize(type),
    x: newX,
    y: newY
  };
  state.currentWorkflow.nodes.push(newNode);
  const edge = {
    from: node.id,
    to: newNode.id
  };
  if (node.type === 'decision' || node.type === 'loop') {
    const outs = state.currentWorkflow.edges.filter(e => e.from === node.id);
    const hasFalse = outs.some(e => String(e.condition).toLowerCase() === 'false');
    const hasTrue = outs.some(e => String(e.condition).toLowerCase() === 'true');
    if (!hasFalse) edge.condition = 'false'; else if (!hasTrue) edge.condition = 'true'; else edge.condition = null;
  }
  state.currentWorkflow.edges.push(edge);
  draw.drawNode(newNode); draw.drawEdges();
}

function deleteNode(node) {
  if (!node) return;
  const nodeId = node.id;
  state.currentWorkflow.nodes = (state.currentWorkflow.nodes || []).filter(n => n.id !== nodeId);
  state.currentWorkflow.edges = (state.currentWorkflow.edges || []).filter(e => e.from !== nodeId && e.to !== nodeId);
  if (node._g && node._g.parentNode) node._g.parentNode.removeChild(node._g);
  state.nodeMap.delete(nodeId);
  draw.drawEdges();
}

function deleteEdge(edge) {
  if (!edge) return;
  state.currentWorkflow.edges = (state.currentWorkflow.edges || []).filter(e => !(e.from === edge.from && e.to === edge.to && (('condition' in e ? String(e.condition) : null) === ('condition' in edge ? String(edge.condition) : null))));
  draw.drawEdges();
}

function createNodeAt(type, x, y) {
  const id = generateId(type); const node = {
    id,
    type,
    label: capitalize(type),
    x,
    y
  };
  state.currentWorkflow.nodes.push(node); draw.drawNode(node); draw.drawEdges();
}

function openInlineEditorForNode(node) {
  commitInlineEditor();
  const ctm = svg.getScreenCTM();
  const screenPoint = svg.createSVGPoint(); screenPoint.x = node.x; screenPoint.y = node.y;
  const sp = screenPoint.matrixTransform(ctm);
  const input = document.createElement('input'); input.value = node.label || ''; input.className = 'inline-input';
  input.style.left = (sp.x - 100) + 'px'; input.style.top = (sp.y - 12) + 'px'; input.style.width = '200px'; document.body.appendChild(input); input.focus();
  inlineEditor = {
    input,
    node
  };
  function commit() {
    const v = input.value.trim(); node.label = v || node.id; if (node._textEl) node._textEl.textContent = node.label; commitInlineEditor();
  }
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); else if (ev.key === 'Escape') commitInlineEditor(); });
  input.addEventListener('blur', commit);
}
function commitInlineEditor() { if (!inlineEditor) return; try { inlineEditor.input.remove(); } catch (e) { } inlineEditor = null; draw.drawEdges(); }

// expose some hooks for other modules
export const interactions = {
  rebuildOperationListFromDiagram,
  loadWorkflowFromDiagram,
  showContextMenuForNode,
  showEdgeContextMenu,
  createNodeAt,
  deleteNode,
  deleteEdge,
  openInlineEditorForNode
};