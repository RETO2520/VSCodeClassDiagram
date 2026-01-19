import { capitalize } from './workflow.utils.js';
import { state } from './workflow.state.js';

let svgEl, nodesLayer, edgesLayer, svgNs;
let helpers = {
};

export function initDrawing(params) {
  svgEl = params.svg; nodesLayer = params.nodesLayer; edgesLayer = params.edgesLayer;
  svgNs = svgEl.namespaceURI;
  helpers.getSvgPoint = params.getSvgPoint;
  helpers.computePolylineMidpoint = params.computePolylineMidpoint;
  helpers.boundaryPointTowards = params.boundaryPointTowards;
  helpers.createRect = params.createRect;
  helpers.createEllipse = params.createEllipse;
  helpers.createDiamond = params.createDiamond;
}

export function clearAllNodes() { nodesLayer.innerHTML = ''; state.nodeMap.clear(); }

export function drawNode(node) {
  if (state.nodeMap.has(node.id)) return;
  node.type = node.type || 'process';
  node.label = node.label || node.id;

  const g = document.createElementNS(svgNs, 'g');
  g.classList.add('node');
  g.classList.add(`type-${node.type}`);
  g.setAttribute('transform', `translate(${node.x},${node.y})`);
  g.dataset.id = node.id;

  let shape;
  let width = 140;
  let height = 40;

  if (node.type === 'process') {
    shape = helpers.createRect(svgNs, width, height);
  } else if (node.type === 'decision') {
    width = 120;
    height = 80;
    shape = helpers.createDiamond(svgNs, width, height);
  } else if (node.type === 'start' || node.type === 'end') {
    width = 100;
    height = 50;
    shape = helpers.createEllipse(svgNs, width / 2, height / 2);
  } else {
    // Default or unknown type
    shape = helpers.createRect(svgNs, width, height);
  }

  shape.setAttribute('class', 'shape');
  const text = document.createElementNS(svgNs, 'text');
  text.setAttribute('x', 0);
  text.setAttribute('y', 4); // Approximately center vertically
  text.setAttribute('text-anchor', 'middle');
  text.textContent = node.label;

  g.appendChild(shape);
  g.appendChild(text);

  // Connection handle for edges
  const handle = document.createElementNS(svgNs, 'circle');
  handle.setAttribute('r', 6);
  handle.setAttribute('cx', width / 2 + 8);
  handle.setAttribute('cy', 0);
  handle.setAttribute('class', 'handle');
  g.appendChild(handle);

  nodesLayer.appendChild(g);
  node._width = width;
  node._height = height;
  node._g = g;
  node._textEl = text;
  state.nodeMap.set(node.id, node);
}

export function appendEdgePath(points, edge, edgeIndex) {
  const d = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
  const path = document.createElementNS(svgNs, 'path'); path.setAttribute('d', d); path.setAttribute('class', 'edge');
  edge._path = path; edge._pointsCache = points.slice();
  edgesLayer.appendChild(path);
  if (edge.condition !== undefined && edge.condition !== null) {
    const midpt = helpers.computePolylineMidpoint(points);
    const label = document.createElementNS(svgNs, 'text'); label.setAttribute('x', midpt.x); label.setAttribute('y', midpt.y - 8);
    label.setAttribute('text-anchor', 'middle'); label.setAttribute('class', 'edge-label'); label.textContent = String(edge.condition);
    label.style.pointerEvents = 'none'; edgesLayer.appendChild(label); edge._labelEl = label;
  } else edge._labelEl = null;
  const mid = points[1];
  const handle = document.createElementNS(svgNs, 'circle'); handle.setAttribute('cx', mid.x); handle.setAttribute('cy', mid.y); handle.setAttribute('r', 6); handle.setAttribute('class', 'edge-handle');

  edgesLayer.appendChild(handle); edge._handleEl = handle;
  edge._handleEl = handle; edge._path = path;
  return {
    path,
    handle
  };
}

export function drawEdges() {
  edgesLayer.innerHTML = '';
  (state.currentWorkflow.edges || []).forEach((e, idx) => {
    const from = state.nodeMap.get(e.from), to = state.nodeMap.get(e.to);
    if (!from || !to) return;
    const start = helpers.boundaryPointTowards(from, e.mid ? e.mid : to);
    const end = helpers.boundaryPointTowards(to, e.mid ? e.mid : from);
    const mid = e.mid ? {
      x: e.mid.x,
      y: e.mid.y
    } : {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
    appendEdgePath([start, mid, end], e, idx);
  });
}

export function updateEdgeVisual(edge) {
  if (!edge) return;
  const from = state.nodeMap.get(edge.from), to = state.nodeMap.get(edge.to); if (!from || !to) return;
  const start = helpers.boundaryPointTowards(from, edge.mid ? edge.mid : to);
  const end = helpers.boundaryPointTowards(to, edge.mid ? edge.mid : from);
  const mid = edge.mid ? {
    x: edge.mid.x,
    y: edge.mid.y
  } : {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
  const points = [start, mid, end];
  if (edge._path) {
    const d = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
    edge._path.setAttribute('d', d);
  }
  if (edge._labelEl) {
    const midpt = helpers.computePolylineMidpoint(points);
    edge._labelEl.setAttribute('x', midpt.x); edge._labelEl.setAttribute('y', midpt.y - 8);
  }
  if (edge._handleEl) { edge._handleEl.setAttribute('cx', mid.x); edge._handleEl.setAttribute('cy', mid.y); }
  edge._pointsCache = points;
}

export function initEmpty() {
  clearAllNodes();
  if ((!state.currentWorkflow.nodes) || state.currentWorkflow.nodes.length === 0) {
    state.currentWorkflow.nodes = [
      {
        id: 'start_' + Date.now(),
        type: 'start',
        label: 'Start',
        x: 150,
        y: 80
      },
      {
        id: 'end_' + Date.now(),
        type: 'end',
        label: 'End',
        x: 150,
        y: 320
      }
    ];
    state.currentWorkflow.edges = [{
      from: state.currentWorkflow.nodes[0].id,
      to: state.currentWorkflow.nodes[1].id
    }];
  }
  state.currentWorkflow.nodes.forEach(n => drawNode(n));
  drawEdges();
}