export function getSvgPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return { x: clientX, y: clientY };
    return pt.matrixTransform(ctm.inverse());
}

export function computePolylineMidpoint(points) {
    let total = 0; const segLengths = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1]; const len = Math.hypot(b.x - a.x, b.y - a.y);
        segLengths.push(len); total += len;
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

export function boundaryPointTowards(node, target) {
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
        const rx = (node._width || 120) / 2; const ry = (node._height || 48) / 2;
        const sq = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        const t = sq === 0 ? 0 : 1 / Math.sqrt(sq);
        return { x: cx + dx * t, y: cy + dy * t };
    }
}

export function createRect(svgNs, w, h) {
    const r = document.createElementNS(svgNs, 'rect'); r.setAttribute('x', -w / 2); r.setAttribute('y', -h / 2);
    r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('rx', 6); return r;
}
export function createEllipse(svgNs, rx, ry) {
    const e = document.createElementNS(svgNs, 'ellipse'); e.setAttribute('cx', 0); e.setAttribute('cy', 0); e.setAttribute('rx', rx); e.setAttribute('ry', ry); return e;
}
export function createDiamond(svgNs, w, h) {
    const p = document.createElementNS(svgNs, 'polygon'); const pts = [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]].map(pt => pt.join(',')).join(' ');
    p.setAttribute('points', pts); return p;
}

export function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
export function generateId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`; }

/**
 * ワークフローのグラフ構造（Nodes/Edges）を抽象構文木（WorkflowAst）に変換する
 */
export function convertToAst(workflow) {
    const { nodes, edges } = workflow;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const outEdges = new Map();
    edges.forEach(e => {
        if (!outEdges.has(e.from)) outEdges.set(e.from, []);
        outEdges.get(e.from).push(e);
    });

    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) return { variables: [], body: [] };

    const variables = [];

    // 変数抽出の簡易実装: "let x = 0" などの形式を探す
    nodes.forEach(n => {
        if (n.type === 'process' && n.label.includes('=')) {
            const match = n.label.match(/(?:let|var|const)?\s*([a-zA-Z_]\w*)\s*=\s*(.*)/);
            if (match) {
                variables.push({
                    name: match[1],
                    type: 'string', // デフォルト
                    initialValue: match[2].trim()
                });
            }
        }
    });

    function getReachable(startId, stopAt = null) {
        const reach = new Set();
        const stack = [startId];
        while (stack.length > 0) {
            const curr = stack.pop();
            if (!curr || curr === stopAt || reach.has(curr)) continue;
            reach.add(curr);
            (outEdges.get(curr) || []).forEach(e => stack.push(e.to));
        }
        return reach;
    }

    function findMergePoint(id1, id2) {
        if (!id1 || !id2) return id1 || id2 || null;
        const reach1 = Array.from(getReachable(id1));
        const reach2 = getReachable(id2);
        // id1から到達可能なノードのうち、id2からも到達可能な最初のものを探す
        for (const id of reach1) {
            if (reach2.has(id)) return id;
        }
        return null;
    }

    function walk(nodeId, stopAt = null) {
        if (!nodeId || nodeId === stopAt) return [];

        const node = nodeMap.get(nodeId);
        if (!node) return [];

        const outs = outEdges.get(nodeId) || [];

        if (node.type === 'end') {
            return [{ type: 'return', value: (node.label && node.label !== 'End') ? node.label : undefined }];
        }

        if (node.type === 'process' || node.type === 'call') {
            const next = outs[0]?.to;
            return [
                { type: 'action', statement: node.label },
                ...walk(next, stopAt)
            ];
        }

        if (node.type === 'decision') {
            const trueEdge = outs.find(e => String(e.condition).toLowerCase() === 'true');
            const falseEdge = outs.find(e => String(e.condition).toLowerCase() === 'false');

            const mergePoint = findMergePoint(trueEdge?.to, falseEdge?.to);
            const thenBody = walk(trueEdge?.to, mergePoint);
            const elseBody = walk(falseEdge?.to, mergePoint);

            const result = [
                {
                    type: 'if',
                    condition: node.label,
                    then: thenBody,
                    else: (elseBody && elseBody.length > 0) ? elseBody : undefined
                }
            ];

            if (mergePoint && mergePoint !== stopAt) {
                result.push(...walk(mergePoint, stopAt));
            }
            return result;
        }

        if (node.type === 'loop') {
            const trueEdge = outs.find(e => String(e.condition).toLowerCase() === 'true');
            const falseEdge = outs.find(e => String(e.condition).toLowerCase() === 'false');

            // Loop の場合、自分に戻るまでのパスを body とし、false の方を継続とする
            const bodyNodes = walk(trueEdge?.to, nodeId);

            const result = [
                {
                    type: 'while',
                    condition: node.label,
                    body: bodyNodes
                }
            ];

            if (falseEdge?.to && falseEdge.to !== stopAt) {
                result.push(...walk(falseEdge.to, stopAt));
            }
            return result;
        }

        // Default: just move to next
        if (outs.length > 0) {
            return walk(outs[0].to, stopAt);
        }
        return [];
    }

    const firstNode = outEdges.get(startNode.id)?.[0]?.to;
    const body = walk(firstNode);

    return { variables, body };
}
