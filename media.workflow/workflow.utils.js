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