/**
 * WorkflowEditorPanel.tsx
 *
 * workflow.js 群を完全に React + SVG で書き直したコンポーネント。
 * DOM 直接操作は一切行わず、全て React state + JSX でレンダリングする。
 *
 * 移植元対応:
 *   workflow.state.js        → useReducer
 *   workflow.utils.js        → 純関数として移植
 *   workflow.draw.js         → NodeShape / EdgeShape コンポーネント
 *   workflow.interactions.js → React Pointer イベントハンドラ
 *   workflow.api.js          → onDiagramChange コールバック
 *
 * Phase 2 追加 (2026-04-21):
 *   NodeType に foreach / forrange / switch / break / continue を追加
 *   各型に形状 (六角形 / 五角形 / 台形) と convertToAst 変換を実装
 */

import React, {
    useReducer,
    useRef,
    useCallback,
    useEffect,
    useState,
    useMemo,
} from 'react'
import {
    createWorldViewport,
    polylineIntersectsViewport,
    rectIntersectsViewport,
} from '@/lib/viewport-culling'

// ============================================================
// Types
// ============================================================

export type NodeType =
    | 'start' | 'end' | 'process' | 'decision' | 'loop' | 'call'
    | 'given' | 'when' | 'then' | 'how'
    // ── Phase 2: DSL拡張ノード ──────────────────────────────────
    | 'foreach'   // for v in collection ... end
    | 'forrange'  // for v from n to m ... end
    | 'switch'    // switch expr / case / default ... end
    | 'break'     // break (ループ脱出)
    | 'continue'  // continue (次反復スキップ)

export interface WFNode {
    id: string
    type: NodeType
    label: string
    x: number
    y: number
    /** How/Why等の拡張メタデータ */
    metadata?: {
        /** 実装順指針（Howブロック） */
        howSteps?: string[]
        /** 設計意図（Whyステップ） */
        whyReason?: string
    }
}

export interface WFEdge {
    from: string
    to: string
    condition?: string | null
    mid?: { x: number; y: number }
}

export interface WFWorkflow {
    nodes: WFNode[]
    edges: WFEdge[]
}

type FlowAst = {
    variables: Array<{ name: string; type: string; initialValue?: string }>
    body: any[]
}

export interface WFOpRef {
    classIndex: number
    opIndex: number
    classId: string
    operationId: string
    label: string
}

function createEmptyWorkflow(x = 220): WFWorkflow {
    const s = generateId('start')
    const e = generateId('end')
    return {
        nodes: [
            { id: s, type: 'start', label: 'Start', x, y: 80 },
            { id: e, type: 'end', label: 'End', x, y: 260 },
        ],
        edges: [{ from: s, to: e }],
    }
}

export interface WorkflowEditorPanelProps {
    opRef: WFOpRef | null
    diagram: { classes: any[] }
    service: import('@/lib/application/ClassDiagramService').ClassDiagramService
}

// ============================================================
// Node geometry
// ============================================================

const HOW_ITEM_H = 16
const HOW_PADDING = 8

function nodeSizeWithMeta(node: WFNode): { w: number; h: number } {
    const base = nodeSize(node.type)
    if (node.type !== 'how' && node.type !== 'when' && node.type !== 'then') return base
    const howSteps = node.metadata?.howSteps ?? []
    const whyReason = node.metadata?.whyReason
    const howH = howSteps.length > 0 ? HOW_PADDING + howSteps.length * HOW_ITEM_H + HOW_PADDING : 0
    const whyH = whyReason ? HOW_ITEM_H + 4 : 0
    return { w: base.w, h: base.h + howH + whyH }
}

function nodeSize(type: NodeType): { w: number; h: number } {
    if (type === 'decision') return { w: 120, h: 80 }
    if (type === 'start' || type === 'end') return { w: 100, h: 50 }
    if (type === 'given') return { w: 160, h: 40 }
    if (type === 'when') return { w: 160, h: 40 }
    if (type === 'then') return { w: 160, h: 40 }
    if (type === 'how') return { w: 160, h: 40 }
    // Phase 2
    if (type === 'foreach' || type === 'forrange') return { w: 160, h: 50 }
    if (type === 'switch') return { w: 150, h: 60 }
    if (type === 'break' || type === 'continue') return { w: 120, h: 38 }
    return { w: 140, h: 40 }
}

// ============================================================
// Utils
// ============================================================

function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: clientX, y: clientY }
    return pt.matrixTransform(ctm.inverse())
}

function computePolylineMidpoint(points: { x: number; y: number }[]) {
    let total = 0
    const lens: number[] = []
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1]
        const l = Math.hypot(b.x - a.x, b.y - a.y)
        lens.push(l); total += l
    }
    let target = total / 2
    for (let i = 0; i < lens.length; i++) {
        if (target <= lens[i]) {
            const a = points[i], b = points[i + 1]
            const t = lens[i] === 0 ? 0 : target / lens[i]
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
        }
        target -= lens[i]
    }
    return points[Math.floor(points.length / 2)]
}

function boundaryPointTowards(node: WFNode, target: { x: number; y: number }) {
    const cx = node.x, cy = node.y
    const dx = target.x - cx, dy = target.y - cy
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy }
    const { w, h } = GHERKIN_KEYWORDS.includes(node.type as any)
        ? nodeSizeWithMeta(node)
        : nodeSize(node.type)

    // 矩形系（ rect ベース境界）
    const RECT_TYPES: NodeType[] = [
        'process', 'loop', 'call',
        'given', 'when', 'then', 'how',
        'foreach', 'forrange',         // 六角形も概算はRectで十分
        'break', 'continue',           // 台形も同様
    ]
    if (RECT_TYPES.includes(node.type)) {
        const sx = dx === 0 ? Infinity : (w / 2) / Math.abs(dx)
        const sy = dy === 0 ? Infinity : (h / 2) / Math.abs(dy)
        return { x: cx + dx * Math.min(sx, sy), y: cy + dy * Math.min(sx, sy) }
    }
    if (node.type === 'decision' || node.type === 'switch') {
        const denom = Math.abs(dx) * 2 / w + Math.abs(dy) * 2 / h
        const t = denom === 0 ? 0 : 1 / denom
        return { x: cx + dx * t, y: cy + dy * t }
    }
    // ellipse (start / end)
    const rx = w / 2, ry = h / 2
    const sq = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
    const t = sq === 0 ? 0 : 1 / Math.sqrt(sq)
    return { x: cx + dx * t, y: cy + dy * t }
}

function getEdgePoints(edge: WFEdge, nodeMap: Map<string, WFNode>) {
    const from = nodeMap.get(edge.from)
    const to = nodeMap.get(edge.to)
    if (!from || !to) return null
    const startTarget = edge.mid ?? to
    const endTarget = edge.mid ?? from
    const start = boundaryPointTowards(from, startTarget)
    const end = boundaryPointTowards(to, endTarget)
    const mid = edge.mid
        ? { x: edge.mid.x, y: edge.mid.y }
        : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    return [start, mid, end] as const
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
function generateId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`
}

// ============================================================
// convertToAst — Phase 2 拡張
// ============================================================

export function convertAstToWorkflow(ast?: FlowAst): WFWorkflow {
    const wf = createEmptyWorkflow()
    const startId = wf.nodes[0].id
    const endId = wf.nodes[1].id
    wf.edges = []
    const body = ast?.body ?? []
    const vars = ast?.variables ?? []
    let y = 140
    let tail = startId

    const add = (type: NodeType, label: string) => {
        const id = generateId(type)
        wf.nodes.push({ id, type, label, x: 220, y })
        y += 86
        wf.edges.push({ from: tail, to: id })
        tail = id
    }

    for (const v of vars) {
        add('process', `var ${v.name}:${v.type}${v.initialValue ? ` = ${v.initialValue}` : ''}`)
    }

    const visit = (stmts: any[]) => {
        for (const s of stmts) {
            if (!s || typeof s !== 'object') continue
            if (s.type === 'if') {
                add('decision', String(s.condition ?? 'if'))
                visit(Array.isArray(s.then) ? s.then : [])
                if (Array.isArray(s.else) && s.else.length > 0) {
                    add('process', 'else')
                    visit(s.else)
                }
                continue
            }
            if (s.type === 'while') {
                add('loop', String(s.condition ?? 'while'))
                visit(Array.isArray(s.body) ? s.body : [])
                continue
            }
            if (s.type === 'forEach') {
                add('foreach', `for ${s.variable ?? 'item'} in ${s.collection ?? 'collection'}`)
                visit(Array.isArray(s.body) ? s.body : [])
                continue
            }
            if (s.type === 'forRange') {
                add('forrange', `for ${s.variable ?? 'i'} from ${s.from ?? '0'} to ${s.to ?? 'n'}`)
                visit(Array.isArray(s.body) ? s.body : [])
                continue
            }
            if (s.type === 'switch') {
                add('switch', String(s.expression ?? 'switch'))
                for (const c of Array.isArray(s.cases) ? s.cases : []) {
                    add('process', `case ${String(c?.value ?? '')}`)
                    visit(Array.isArray(c?.body) ? c.body : [])
                }
                if (Array.isArray(s.default) && s.default.length > 0) {
                    add('process', 'default')
                    visit(s.default)
                }
                continue
            }
            if (s.type === 'break') { add('break', 'break'); continue }
            if (s.type === 'continue') { add('continue', 'continue'); continue }
            if (s.type === 'return') { add('then', `return ${s.value ?? ''}`.trim()); continue }
            if (s.type === 'action') { add('process', String(s.statement ?? 'action')); continue }
            add('process', String(s.type ?? 'step'))
        }
    }
    visit(body)
    wf.edges.push({ from: tail, to: endId })
    return wf
}

export function convertToAst(wf: WFWorkflow) {
    const { nodes, edges } = wf
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const outEdges = new Map<string, WFEdge[]>()
    edges.forEach(e => {
        if (!outEdges.has(e.from)) outEdges.set(e.from, [])
        outEdges.get(e.from)!.push(e)
    })

    const startNode = nodes.find(n => n.type === 'start')
    if (!startNode) return { variables: [], body: [] }

    const variables: any[] = []
    nodes.forEach(n => {
        if (n.type === 'process' && n.label.includes('=')) {
            const m = n.label.match(/(?:let|var|const)?\s*([a-zA-Z_]\w*)\s*=\s*(.*)/)
            if (m) variables.push({ name: m[1], type: 'string', initialValue: m[2].trim() })
        }
    })

    function reachable(id: string, stop: string | null = null): Set<string> {
        const s = new Set<string>()
        const q = [id]
        while (q.length) {
            const c = q.pop()!
            if (!c || c === stop || s.has(c)) continue
            s.add(c);
            (outEdges.get(c) || []).forEach(e => q.push(e.to))
        }
        return s
    }

    function mergePoint(a?: string, b?: string): string | null {
        if (!a || !b) return a || b || null
        const ra = Array.from(reachable(a))
        const rb = reachable(b)
        for (const id of ra) if (rb.has(id)) return id
        return null
    }

    function walk(id: string | undefined, stop: string | null = null): any[] {
        if (!id || id === stop) return []
        const n = nodeMap.get(id)
        if (!n) return []
        const outs = outEdges.get(id) || []

        // ── 既存ノード ──────────────────────────────────────────
        if (n.type === 'end') {
            return [{ type: 'return', value: (n.label && n.label !== 'End') ? n.label : undefined }]
        }
        if (n.type === 'process' || n.type === 'call') {
            return [{ type: 'action', statement: n.label }, ...walk(outs[0]?.to, stop)]
        }
        if (n.type === 'decision') {
            const te = outs.find(e => String(e.condition).toLowerCase() === 'true')
            const fe = outs.find(e => String(e.condition).toLowerCase() === 'false')
            const mp = mergePoint(te?.to, fe?.to)
            const res: any[] = [{
                type: 'if', condition: n.label,
                then: walk(te?.to, mp),
                else: walk(fe?.to, mp) || undefined,
            }]
            if (mp && mp !== stop) res.push(...walk(mp, stop))
            return res
        }
        if (n.type === 'loop') {
            const te = outs.find(e => String(e.condition).toLowerCase() === 'true')
            const fe = outs.find(e => String(e.condition).toLowerCase() === 'false')
            const res: any[] = [{ type: 'while', condition: n.label, body: walk(te?.to, id) }]
            if (fe?.to && fe.to !== stop) res.push(...walk(fe.to, stop))
            return res
        }

        // ── Phase 2: forEach ────────────────────────────────────
        // エッジ条件: 'body' → ループ本体, それ以外 → ループ後続
        if (n.type === 'foreach') {
            const bodyEdge = outs.find(e => String(e.condition ?? '').toLowerCase() === 'body')
            const nextEdge = outs.find(e => String(e.condition ?? '').toLowerCase() !== 'body') ?? outs[0]
            // label 形式: "for item in this.items" を解析
            const m = n.label.match(/^for\s+(\S+)\s+in\s+(.+)$/i)
            const variable = m?.[1] ?? n.label
            const collection = m?.[2] ?? ''
            const res: any[] = [{
                type: 'forEach',
                variable,
                collection,
                body: walk(bodyEdge?.to, id),
            }]
            if (nextEdge?.to && nextEdge.to !== stop) res.push(...walk(nextEdge.to, stop))
            return res
        }

        // ── Phase 2: forRange ───────────────────────────────────
        if (n.type === 'forrange') {
            const bodyEdge = outs.find(e => String(e.condition ?? '').toLowerCase() === 'body')
            const nextEdge = outs.find(e => String(e.condition ?? '').toLowerCase() !== 'body') ?? outs[0]
            // label 形式: "for i from 0 to 10"
            const m = n.label.match(/^for\s+(\S+)\s+from\s+(\S+)\s+to\s+(\S+)$/i)
            const variable = m?.[1] ?? n.label
            const from = m?.[2] ?? '0'
            const to = m?.[3] ?? '0'
            const res: any[] = [{
                type: 'forRange',
                variable,
                from,
                to,
                body: walk(bodyEdge?.to, id),
            }]
            if (nextEdge?.to && nextEdge.to !== stop) res.push(...walk(nextEdge.to, stop))
            return res
        }

        // ── Phase 2: switch ─────────────────────────────────────
        // エッジ条件: 各 case 値文字列 または "default"
        if (n.type === 'switch') {
            const caseEdges = outs.filter(e => String(e.condition ?? '').toLowerCase() !== 'default' && e.condition != null)
            const defaultEdge = outs.find(e => String(e.condition ?? '').toLowerCase() === 'default')
            // 全caseのマージポイントを探す
            const allTos = outs.map(e => e.to).filter(Boolean)
            const mp = allTos.reduce<string | null>((acc, id) => mergePoint(acc ?? undefined, id), null)
            const cases = caseEdges.map(e => ({
                value: String(e.condition),
                body: walk(e.to, mp ?? undefined),
            }))
            const res: any[] = [{
                type: 'switch',
                expression: n.label,
                cases,
                default: defaultEdge ? walk(defaultEdge.to, mp ?? undefined) : undefined,
            }]
            if (mp && mp !== stop) res.push(...walk(mp, stop))
            return res
        }

        // ── Phase 2: break / continue ───────────────────────────
        if (n.type === 'break') return [{ type: 'break' }]
        if (n.type === 'continue') return [{ type: 'continue' }]

        // Gherkin / その他 → 次ノードへ続行
        if (outs.length > 0) return walk(outs[0].to, stop)
        return []
    }

    return { variables, body: walk(outEdges.get(startNode.id)?.[0]?.to) }
}

// ============================================================
// State (useReducer)
// ============================================================

type WFAction =
    | { type: 'SET_WF'; wf: WFWorkflow }
    | { type: 'ADD_NODE'; node: WFNode }
    | { type: 'MOVE_NODE'; id: string; x: number; y: number }
    | { type: 'RENAME_NODE'; id: string; label: string }
    | { type: 'SET_NODE_METADATA'; id: string; metadata: WFNode['metadata'] }
    | { type: 'DEL_NODE'; id: string }
    | { type: 'ADD_EDGE'; edge: WFEdge }
    | { type: 'SET_EDGE_MID'; edgeKey: string; mid: { x: number; y: number } }
    | { type: 'DEL_EDGE'; edgeKey: string }

function edgeKey(e: WFEdge) { return `${e.from}>${e.to}>${e.condition ?? ''}` }

function wfReducer(s: WFWorkflow, a: WFAction): WFWorkflow {
    switch (a.type) {
        case 'SET_WF': return { ...a.wf }
        case 'ADD_NODE': return { ...s, nodes: [...s.nodes, a.node] }
        case 'MOVE_NODE': return { ...s, nodes: s.nodes.map(n => n.id === a.id ? { ...n, x: a.x, y: a.y } : n) }
        case 'RENAME_NODE': return { ...s, nodes: s.nodes.map(n => n.id === a.id ? { ...n, label: a.label } : n) }
        case 'SET_NODE_METADATA': return { ...s, nodes: s.nodes.map(n => n.id === a.id ? { ...n, metadata: a.metadata } : n) }
        case 'DEL_NODE': return { nodes: s.nodes.filter(n => n.id !== a.id), edges: s.edges.filter(e => e.from !== a.id && e.to !== a.id) }
        case 'ADD_EDGE': return { ...s, edges: [...s.edges, a.edge] }
        case 'SET_EDGE_MID': return { ...s, edges: s.edges.map(e => edgeKey(e) === a.edgeKey ? { ...e, mid: a.mid } : e) }
        case 'DEL_EDGE': return { ...s, edges: s.edges.filter(e => edgeKey(e) !== a.edgeKey) }
        default: return s
    }
}

// ============================================================
// Design tokens
// ============================================================

const STYLE: Record<NodeType, { fill: string; stroke: string; text: string }> = {
    start:    { fill: '#14532d', stroke: '#4ade80', text: '#bbf7d0' },
    end:      { fill: '#7f1d1d', stroke: '#f87171', text: '#fecaca' },
    process:  { fill: '#1e293b', stroke: '#64748b', text: '#e2e8f0' },
    decision: { fill: '#2e1065', stroke: '#c084fc', text: '#f3e8ff' },
    loop:     { fill: '#0c2a4a', stroke: '#38bdf8', text: '#e0f2fe' },
    call:     { fill: '#431407', stroke: '#fb923c', text: '#ffedd5' },
    given:    { fill: '#052e16', stroke: '#22c55e', text: '#bbf7d0' },
    when:     { fill: '#2e1065', stroke: '#a855f7', text: '#f3e8ff' },
    then:     { fill: '#0c1a4a', stroke: '#60a5fa', text: '#dbeafe' },
    how:      { fill: '#0f172a', stroke: '#1d4ed8', text: '#93c5fd' },
    // Phase 2 ─────────────────────────────────────────────────
    foreach:  { fill: '#0d2b2b', stroke: '#2dd4bf', text: '#99f6e4' },  // teal: コレクションループ
    forrange: { fill: '#0a2323', stroke: '#14b8a6', text: '#5eead4' },  // teal暗め: 範囲ループ
    switch:   { fill: '#2c1a00', stroke: '#f59e0b', text: '#fde68a' },  // amber: 分岐ハブ
    break:    { fill: '#2d0a0a', stroke: '#f87171', text: '#fecaca' },  // red: 脱出
    continue: { fill: '#1c0d2b', stroke: '#a78bfa', text: '#ede9fe' },  // violet: スキップ
}

const ACCENT = '#3b82f6'
const VIEWPORT_CULL_PADDING = 280

// ============================================================
// Gherkin系ノード用ヘルパー
// ============================================================

const GHERKIN_KEYWORDS: NodeType[] = ['given', 'when', 'then', 'how']
const KEYWORD_LABEL: Record<string, string> = {
    given: 'Given', when: 'When', then: 'Then', how: 'How'
}

function stripKeyword(label: string): string {
    return label.replace(/^(Given|When|Then|How|And|But|前提|もし|ならば|かつ|しかし):\s*/i, '')
}

// ============================================================
// SVG shape helpers for Phase 2 nodes
// ============================================================

/** 六角形 (foreach / forrange) — 左右を斜めにカットした横長六角 */
function hexagonPoints(w: number, h: number): string {
    const cx = w / 2, cy = h / 2
    const indent = h * 0.28  // 左右の切り込み幅
    return [
        [-cx + indent, -cy],
        [cx - indent,  -cy],
        [cx,            0],
        [cx - indent,   cy],
        [-cx + indent,  cy],
        [-cx,           0],
    ].map(p => p.join(',')).join(' ')
}

/** 五角形・家型 (switch) — 上に三角の屋根を持つ形 */
function pentagonPoints(w: number, h: number): string {
    const cx = w / 2, cy = h / 2
    const roofH = h * 0.32
    return [
        [0,   -cy],           // 頂点（屋根）
        [cx,  -cy + roofH],   // 右肩
        [cx,   cy],           // 右下
        [-cx,  cy],           // 左下
        [-cx, -cy + roofH],   // 左肩
    ].map(p => p.join(',')).join(' ')
}

/** 台形 (break / continue) — 上辺が短い台形 */
function trapezoidPoints(w: number, h: number): string {
    const cx = w / 2, cy = h / 2
    const topInset = w * 0.18  // 上辺の内側への引き込み量
    return [
        [-cx + topInset, -cy],
        [ cx - topInset, -cy],
        [ cx,             cy],
        [-cx,             cy],
    ].map(p => p.join(',')).join(' ')
}

// ============================================================
// NodeShape
// ============================================================

interface NodeShapeProps {
    node: WFNode
    isSelected: boolean
    onPointerDown: (e: React.PointerEvent, id: string) => void
    onHandlePointerDown: (e: React.PointerEvent, node: WFNode) => void
    onDoubleClick: (e: React.MouseEvent, node: WFNode) => void
    onContextMenu: (e: React.MouseEvent, node: WFNode) => void
}

function NodeShape({ node, isSelected, onPointerDown, onHandlePointerDown, onDoubleClick, onContextMenu }: NodeShapeProps) {
    const isGherkin = GHERKIN_KEYWORDS.includes(node.type as any)
    const { w, h: baseH } = nodeSize(node.type)
    const { h: totalH } = isGherkin ? nodeSizeWithMeta(node) : { h: baseH }
    const st = STYLE[node.type]
    const stroke = isSelected ? ACCENT : st.stroke
    const sw = isSelected ? 2.5 : 1.5
    const fid = `f${node.id}`

    const bodyProps = { fill: st.fill, stroke, strokeWidth: sw, filter: `url(#${fid})` }

    // ── Phase 2: foreach / forrange ──────────────────────────────
    if (node.type === 'foreach' || node.type === 'forrange') {
        const pts = hexagonPoints(w, baseH)
        const badge = node.type === 'foreach' ? 'for…in' : 'for…to'
        return (
            <g transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'move', userSelect: 'none' }}
                onPointerDown={e => onPointerDown(e, node.id)}
                onDoubleClick={e => onDoubleClick(e, node)}
                onContextMenu={e => onContextMenu(e, node)}
            >
                <defs>
                    <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3"
                            floodColor={isSelected ? '#3b82f650' : '#00000060'} />
                    </filter>
                </defs>
                <polygon points={pts} {...bodyProps} />
                {/* 右側にループ矢印マーク */}
                <text x={w / 2 - 12} y={0}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={10} fill={st.stroke} pointerEvents="none" opacity={0.7}>↻</text>
                {/* バッジ */}
                <text x={-w / 2 + 28} y={-baseH / 2 + 9}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={7} fontWeight="700" fill={st.stroke} opacity={0.8}
                    fontFamily='"Cascadia Code","SF Mono",monospace' pointerEvents="none">
                    {badge}
                </text>
                {/* ラベル本文 */}
                <text x={-4} y={2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={10} fill={st.text}
                    fontFamily='"Cascadia Code","SF Mono",monospace' pointerEvents="none">
                    {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
                </text>
                <circle cx={w / 2 + 9} cy={0} r={5.5}
                    fill={ACCENT} stroke="#0f172a" strokeWidth={1.5}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node) }} />
            </g>
        )
    }

    // ── Phase 2: switch ──────────────────────────────────────────
    if (node.type === 'switch') {
        const pts = pentagonPoints(w, baseH)
        return (
            <g transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'move', userSelect: 'none' }}
                onPointerDown={e => onPointerDown(e, node.id)}
                onDoubleClick={e => onDoubleClick(e, node)}
                onContextMenu={e => onContextMenu(e, node)}
            >
                <defs>
                    <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3"
                            floodColor={isSelected ? '#3b82f650' : '#00000060'} />
                    </filter>
                </defs>
                <polygon points={pts} {...bodyProps} />
                {/* "SW" ラベル */}
                <text x={0} y={-baseH / 2 + baseH * 0.22}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={7} fontWeight="700" fill={st.stroke} opacity={0.85}
                    fontFamily='"Cascadia Code","SF Mono",monospace' pointerEvents="none">
                    switch
                </text>
                <text x={0} y={baseH * 0.15}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={10} fill={st.text}
                    fontFamily='"Cascadia Code","SF Mono",monospace' pointerEvents="none">
                    {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
                </text>
                <circle cx={w / 2 + 9} cy={0} r={5.5}
                    fill={ACCENT} stroke="#0f172a" strokeWidth={1.5}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node) }} />
            </g>
        )
    }

    // ── Phase 2: break / continue ────────────────────────────────
    if (node.type === 'break' || node.type === 'continue') {
        const pts = trapezoidPoints(w, baseH)
        const icon = node.type === 'break' ? '⏹' : '⏭'
        return (
            <g transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'move', userSelect: 'none' }}
                onPointerDown={e => onPointerDown(e, node.id)}
                onDoubleClick={e => onDoubleClick(e, node)}
                onContextMenu={e => onContextMenu(e, node)}
            >
                <defs>
                    <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3"
                            floodColor={isSelected ? '#3b82f650' : '#00000060'} />
                    </filter>
                </defs>
                <polygon points={pts} {...bodyProps} />
                <text x={-w / 2 + 20} y={1}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={11} fill={st.stroke} pointerEvents="none">{icon}</text>
                <text x={10} y={1}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={10} fill={st.text} fontWeight="600"
                    fontFamily='"Cascadia Code","SF Mono",monospace' pointerEvents="none">
                    {node.label}
                </text>
                <circle cx={w / 2 + 9} cy={0} r={5.5}
                    fill={ACCENT} stroke="#0f172a" strokeWidth={1.5}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node) }} />
            </g>
        )
    }

    // ── Gherkin系ノード ──────────────────────────────────────────
    if (isGherkin) {
        const howSteps = node.metadata?.howSteps ?? []
        const whyReason = node.metadata?.whyReason
        const keyword = KEYWORD_LABEL[node.type] ?? node.type
        const bodyText = stripKeyword(node.label)
        const howH = howSteps.length > 0 ? HOW_PADDING + howSteps.length * HOW_ITEM_H + HOW_PADDING : 0
        const whyH = whyReason ? HOW_ITEM_H + 4 : 0
        const expandH = howH + whyH

        return (
            <g transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'move', userSelect: 'none' }}
                onPointerDown={e => onPointerDown(e, node.id)}
                onDoubleClick={e => onDoubleClick(e, node)}
                onContextMenu={e => onContextMenu(e, node)}
            >
                <defs>
                    <filter id={fid} x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3"
                            floodColor={isSelected ? '#3b82f650' : '#00000060'} />
                    </filter>
                </defs>
                <rect x={-w / 2} y={-totalH / 2} width={w} height={totalH} rx={6} {...bodyProps} />
                <rect x={-w / 2 + 4} y={-totalH / 2 + 4} width={34} height={14} rx={3}
                    fill={st.stroke} opacity={0.25} pointerEvents="none" />
                <text x={-w / 2 + 21} y={-totalH / 2 + 11}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={8} fontWeight="700" fill={st.stroke}
                    fontFamily='"Cascadia Code","SF Mono",monospace' pointerEvents="none">
                    {keyword}
                </text>
                <text x={0} y={-totalH / 2 + baseH / 2 + 2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={10} fill={st.text}
                    fontFamily='"Cascadia Code","SF Mono","Fira Code",monospace' pointerEvents="none">
                    {bodyText.length > 20 ? bodyText.slice(0, 19) + '…' : bodyText}
                </text>
                {howSteps.length > 0 && (
                    <g pointerEvents="none">
                        <line x1={-w / 2 + 8} y1={-totalH / 2 + baseH} x2={w / 2 - 8} y2={-totalH / 2 + baseH}
                            stroke={st.stroke} strokeWidth={0.5} opacity={0.4} />
                        <text x={-w / 2 + 8} y={-totalH / 2 + baseH + HOW_PADDING - 2}
                            fontSize={7} fontWeight="700" fill="#93c5fd"
                            fontFamily='"Cascadia Code","SF Mono",monospace'>How</text>
                        {howSteps.map((step, i) => (
                            <text key={i} x={-w / 2 + 10}
                                y={-totalH / 2 + baseH + HOW_PADDING + i * HOW_ITEM_H + 10}
                                fontSize={8} fill="#bfdbfe"
                                fontFamily='"Cascadia Code","SF Mono",monospace'>
                                {`${i + 1}. ${step.length > 17 ? step.slice(0, 16) + '…' : step}`}
                            </text>
                        ))}
                    </g>
                )}
                {whyReason && (
                    <g pointerEvents="none">
                        <line x1={-w / 2 + 8} y1={-totalH / 2 + baseH + howH}
                            x2={w / 2 - 8} y2={-totalH / 2 + baseH + howH}
                            stroke="#a78bfa" strokeWidth={0.5} opacity={0.4} />
                        <text x={-w / 2 + 8} y={-totalH / 2 + baseH + howH + HOW_ITEM_H / 2 + 2}
                            fontSize={7} fontWeight="700" fill="#a78bfa"
                            fontFamily='"Cascadia Code","SF Mono",monospace'>Why</text>
                        <text x={-w / 2 + 28} y={-totalH / 2 + baseH + howH + HOW_ITEM_H / 2 + 2}
                            fontSize={8} fill="#c4b5fd"
                            fontFamily='"Cascadia Code","SF Mono",monospace'>
                            {whyReason.length > 15 ? whyReason.slice(0, 14) + '…' : whyReason}
                        </text>
                    </g>
                )}
                <circle cx={w / 2 + 9} cy={0} r={5.5}
                    fill={ACCENT} stroke="#0f172a" strokeWidth={1.5}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node) }} />
            </g>
        )
    }

    // ── 従来ノード (start / end / process / decision / loop / call) ──
    let body: React.ReactNode
    if (node.type === 'start' || node.type === 'end') {
        body = <ellipse cx={0} cy={0} rx={w / 2} ry={baseH / 2} {...bodyProps} />
    } else if (node.type === 'decision') {
        const pts = `0,${-baseH / 2} ${w / 2},0 0,${baseH / 2} ${-w / 2},0`
        body = <polygon points={pts} {...bodyProps} />
    } else {
        body = <rect x={-w / 2} y={-baseH / 2} width={w} height={baseH} rx={5} {...bodyProps} />
    }

    return (
        <g transform={`translate(${node.x},${node.y})`}
            style={{ cursor: 'move', userSelect: 'none' }}
            onPointerDown={e => onPointerDown(e, node.id)}
            onDoubleClick={e => onDoubleClick(e, node)}
            onContextMenu={e => onContextMenu(e, node)}
        >
            <defs>
                <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="3" stdDeviation="4"
                        floodColor={isSelected ? '#3b82f650' : '#00000070'} />
                </filter>
            </defs>
            {body}
            {node.type === 'loop' && <>
                <path d={`M${-w / 2 + 10},${-baseH / 2 + 6} L${-w / 2 + 4},0 L${-w / 2 + 10},${baseH / 2 - 6}`}
                    fill="none" stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
                <path d={`M${w / 2 - 10},${-baseH / 2 + 6} L${w / 2 - 4},0 L${w / 2 - 10},${baseH / 2 - 6}`}
                    fill="none" stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
            </>}
            {node.type === 'call' && <>
                <line x1={-w / 2 + 12} y1={-baseH / 2 + 4} x2={-w / 2 + 12} y2={baseH / 2 - 4} stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
                <line x1={w / 2 - 12} y1={-baseH / 2 + 4} x2={w / 2 - 12} y2={baseH / 2 - 4} stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
            </>}
            <text textAnchor="middle" dominantBaseline="central"
                fill={st.text} fontSize={11}
                fontFamily='"Cascadia Code","SF Mono","Fira Code",monospace'
                fontWeight={node.type === 'start' || node.type === 'end' ? '700' : '400'}
                pointerEvents="none">
                {node.label.length > 17 ? node.label.slice(0, 16) + '…' : node.label}
            </text>
            <circle cx={w / 2 + 9} cy={0} r={5.5}
                fill={ACCENT} stroke="#0f172a" strokeWidth={1.5}
                style={{ cursor: 'crosshair' }}
                onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node) }} />
        </g>
    )
}

// ============================================================
// EdgeShape
// ============================================================

interface EdgeShapeProps {
    edge: WFEdge
    nodeMap: Map<string, WFNode>
    isSelected: boolean
    onMidPointerDown: (e: React.PointerEvent, edge: WFEdge) => void
    onContextMenu: (e: React.MouseEvent, edge: WFEdge) => void
}

function EdgeShape({ edge, nodeMap, isSelected, onMidPointerDown, onContextMenu }: EdgeShapeProps) {
    const pts = getEdgePoints(edge, nodeMap)
    if (!pts) return null
    const [s, m, e_] = pts
    const d = `M${s.x},${s.y} L${m.x},${m.y} L${e_.x},${e_.y}`
    const lp = computePolylineMidpoint([s, m, e_])
    const isScenarioBoundary = edge.condition != null
    const col = isSelected ? ACCENT : isScenarioBoundary ? '#a78bfa' : '#64748b'
    const strokeDash = isScenarioBoundary ? '6 3' : undefined

    return (
        <g onContextMenu={ev => { ev.preventDefault(); onContextMenu(ev, edge) }}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'context-menu' }} />
            <path d={d} fill="none" stroke={col}
                strokeWidth={isSelected ? 2 : 1.5}
                strokeDasharray={strokeDash}
                markerEnd="url(#wf-arrow)" />
            {isScenarioBoundary && (
                <g pointerEvents="none">
                    <rect x={lp.x - 54} y={lp.y - 22} width={108} height={16} rx={3}
                        fill="#1e1b4b" stroke="#a78bfa" strokeWidth={0.8} opacity={0.9} />
                    <text x={lp.x} y={lp.y - 14}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={9} fill="#c4b5fd"
                        fontFamily='"Cascadia Code","SF Mono",monospace'>
                        {String(edge.condition).length > 18
                            ? String(edge.condition).slice(0, 17) + '…'
                            : String(edge.condition)}
                    </text>
                </g>
            )}
            <circle cx={m.x} cy={m.y} r={5}
                fill={isSelected ? ACCENT : '#334155'} stroke="#0f172a" strokeWidth={1.5}
                style={{ cursor: 'move' }}
                onPointerDown={ev => { ev.stopPropagation(); onMidPointerDown(ev, edge) }} />
        </g>
    )
}

// ============================================================
// InlineEditor overlay
// ============================================================

function InlineEditor({ node, svgRef, onCommit, onCancel }: {
    node: WFNode
    svgRef: React.RefObject<SVGSVGElement | null>
    onCommit: (v: string) => void
    onCancel: () => void
}) {
    const [val, setVal] = useState(node.label)
    const ref = useRef<HTMLInputElement>(null)

    const pos = (() => {
        const svg = svgRef.current
        if (!svg) return { left: 0, top: 0 }
        const ctm = svg.getScreenCTM()
        if (!ctm) return { left: 0, top: 0 }
        const pt = svg.createSVGPoint()
        pt.x = node.x; pt.y = node.y
        const sp = pt.matrixTransform(ctm)
        return { left: sp.x - 100, top: sp.y - 14 }
    })()

    useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

    // foreach / forrange はラベル構文のヒントをプレースホルダーで案内
    const placeholder =
        node.type === 'foreach'  ? 'for item in this.items' :
        node.type === 'forrange' ? 'for i from 0 to 10' :
        node.type === 'switch'   ? 'this.status' :
        undefined

    return (
        <input ref={ref} value={val} placeholder={placeholder}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => {
                if (e.key === 'Enter') onCommit(val.trim() || node.id)
                if (e.key === 'Escape') onCancel()
            }}
            onBlur={() => onCommit(val.trim() || node.id)}
            style={{
                position: 'fixed', left: pos.left, top: pos.top,
                width: 220, zIndex: 500,
                background: '#0f172a', color: '#f1f5f9',
                border: '2px solid #3b82f6', borderRadius: 5,
                padding: '3px 8px', fontSize: 12,
                fontFamily: '"Cascadia Code","SF Mono",monospace', outline: 'none',
            }}
        />
    )
}

function MiniWorkflowPreview({ title, wf }: { title: string; wf: WFWorkflow }) {
    const width = 360
    const height = 200
    if (!wf.nodes.length) {
        return <div style={{ border: '1px solid #334155', borderRadius: 6, background: '#0b1220', padding: 10, color: '#64748b', fontSize: 11 }}>{title}: empty</div>
    }
    const xs = wf.nodes.map(n => n.x)
    const ys = wf.nodes.map(n => n.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const bw = Math.max(1, maxX - minX + 120)
    const bh = Math.max(1, maxY - minY + 80)
    const s = Math.min((width - 20) / bw, (height - 20) / bh)
    const tx = 10 + (width - 20 - bw * s) / 2 - minX * s + 60 * s
    const ty = 10 + (height - 20 - bh * s) / 2 - minY * s + 40 * s
    const pos = (x: number, y: number) => ({ x: x * s + tx, y: y * s + ty })
    const map = new Map(wf.nodes.map(n => [n.id, n]))

    return (
        <div style={{ border: '1px solid #334155', borderRadius: 6, background: '#0b1220', overflow: 'hidden' }}>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid #1f2937', fontSize: 11, color: '#cbd5e1' }}>
                {title} ({wf.nodes.length} nodes / {wf.edges.length} edges)
            </div>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
                <rect width={width} height={height} fill="#0b1220" />
                {wf.edges.map((e, i) => {
                    const from = map.get(e.from)
                    const to = map.get(e.to)
                    if (!from || !to) return null
                    const a = pos(from.x, from.y)
                    const b = pos(to.x, to.y)
                    return <line key={`${e.from}-${e.to}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#64748b" strokeWidth={1.2} />
                })}
                {wf.nodes.map(n => {
                    const p = pos(n.x, n.y)
                    const st = STYLE[n.type]
                    return (
                        <g key={n.id} transform={`translate(${p.x},${p.y})`}>
                            <rect x={-28} y={-10} width={56} height={20} rx={3} fill={st.fill} stroke={st.stroke} strokeWidth={1} />
                            <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill={st.text} fontSize={8}>
                                {n.label.length > 10 ? `${n.label.slice(0, 9)}…` : n.label}
                            </text>
                        </g>
                    )
                })}
            </svg>
        </div>
    )
}

// ============================================================
// Node type meta
// ============================================================

const NODE_TYPES: NodeType[] = ['start', 'process', 'decision', 'loop', 'call', 'end']
const GHERKIN_NODE_TYPES: NodeType[] = ['given', 'when', 'then', 'how']
// Phase 2
const FLOW_NODE_TYPES: NodeType[] = ['foreach', 'forrange', 'switch', 'break', 'continue']

const NODE_COL: Record<NodeType, string> = {
    start: '#4ade80', end: '#f87171', process: '#94a3b8',
    decision: '#c084fc', loop: '#38bdf8', call: '#fb923c',
    given: '#22c55e', when: '#a855f7', then: '#60a5fa', how: '#1d4ed8',
    // Phase 2
    foreach:  '#2dd4bf',
    forrange: '#14b8a6',
    switch:   '#f59e0b',
    break:    '#f87171',
    continue: '#a78bfa',
}

const FLOW_NODE_LABEL: Record<string, string> = {
    foreach:  'ForEach',
    forrange: 'ForRange',
    switch:   'Switch',
    break:    'Break',
    continue: 'Continue',
}

// ============================================================
// エッジ条件自動付与ロジック (Phase 2 拡張)
// ============================================================

function autoCondition(fromNode: WFNode, existingOuts: WFEdge[]): string | null | undefined {
    const type = fromNode.type

    // decision / loop: true/false
    if (type === 'decision' || type === 'loop') {
        const hasF = existingOuts.some(e => String(e.condition ?? '').toLowerCase() === 'false')
        const hasT = existingOuts.some(e => String(e.condition ?? '').toLowerCase() === 'true')
        if (!hasF) return 'false'
        if (!hasT) return 'true'
        return null
    }

    // foreach / forrange: body → それ以外は次続き (undefined = 無条件)
    if (type === 'foreach' || type === 'forrange') {
        const hasBody = existingOuts.some(e => String(e.condition ?? '').toLowerCase() === 'body')
        if (!hasBody) return 'body'
        return undefined  // 後続エッジは条件なし
    }

    // switch: case0, case1, ... default の順に自動割り当て
    if (type === 'switch') {
        const usedConditions = new Set(existingOuts.map(e => String(e.condition ?? '')))
        if (!usedConditions.has('default')) {
            // case0, case1 ... を埋めてから default を割り当て
            const caseCount = existingOuts.filter(e => String(e.condition ?? '').startsWith('case')).length
            const nextCase = `case${caseCount}`
            if (!usedConditions.has(nextCase)) return nextCase
            return 'default'
        }
        return null
    }

    return undefined  // break / continue / その他: 条件なし
}

// ============================================================
// WorkflowEditorPanel
// ============================================================

export function WorkflowEditorPanel({ opRef, diagram, service }: WorkflowEditorPanelProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [gherkinWf, dispatchGherkin] = useReducer(wfReducer, { nodes: [], edges: [] })
    const [flowWf, dispatchFlow] = useReducer(wfReducer, { nodes: [], edges: [] })
    const [viewMode, setViewMode] = useState<'both' | 'gherkin' | 'flow'>('both')
    const [bothEditLayer, setBothEditLayer] = useState<'gherkin' | 'flow'>('gherkin')
    const [flowDirty, setFlowDirty] = useState(false)

    const lastLoadedWorkflowJson = useRef<string>('')
    const lastLoadedAstJson = useRef<string>('')
    const currentOpKey = useRef<string>('')
    const opRefRef = useRef(opRef)
    const serviceRef = useRef(service)
    const loadedFlowAstRef = useRef<FlowAst | undefined>(undefined)
    useEffect(() => { opRefRef.current = opRef }, [opRef])
    useEffect(() => { serviceRef.current = service }, [service])

    const loadFromService = useCallback(() => {
        const currentOpRef = opRefRef.current
        if (!currentOpRef) return
        const model = serviceRef.current.getModel()
        let cls = model.findClassById(currentOpRef.classId)
        let op = cls?.operations.find(o => o.id === currentOpRef.operationId)
        if (!op) {
            const m = currentOpRef.label.match(/^(.+?)\.(.+?)\(/)
            if (m) {
                cls = model.findClassByName(m[1]) ?? undefined
                op = cls?.operations.find(o => o.name === m[2])
            }
        }
        if (!op || !cls) return
        const incomingWorkflow = op.workflow?.nodes?.length ? op.workflow : null
        const incomingWorkflowJson = JSON.stringify(incomingWorkflow)
        const incomingAst = (op.workflowAst ?? { variables: [], body: [] }) as FlowAst
        const incomingAstJson = JSON.stringify(incomingAst)
        if (
            incomingWorkflowJson === lastLoadedWorkflowJson.current &&
            incomingAstJson === lastLoadedAstJson.current
        ) return
        lastLoadedWorkflowJson.current = incomingWorkflowJson
        lastLoadedAstJson.current = incomingAstJson
        loadedFlowAstRef.current = JSON.parse(incomingAstJson)
        setFlowDirty(false)

        if (incomingWorkflow) {
            dispatchGherkin({ type: 'SET_WF', wf: JSON.parse(incomingWorkflowJson) })
        } else {
            dispatchGherkin({ type: 'SET_WF', wf: createEmptyWorkflow() })
        }
        dispatchFlow({ type: 'SET_WF', wf: convertAstToWorkflow(JSON.parse(incomingAstJson)) })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!opRef) return
        const key = `${opRef.classId}:${opRef.operationId}`
        if (currentOpKey.current !== key) {
            currentOpKey.current = key
            lastLoadedWorkflowJson.current = ''
            lastLoadedAstJson.current = ''
            setViewMode('both')
            setBothEditLayer('gherkin')
        }
        loadFromService()
    }, [opRef, loadFromService])

    useEffect(() => {
        service.onModelChanged(loadFromService)
        return () => service.offModelChanged(loadFromService)
    }, [service, loadFromService])

    const activeLayer: 'gherkin' | 'flow' =
        viewMode === 'both' ? bothEditLayer : (viewMode === 'flow' ? 'flow' : 'gherkin')
    const wf = activeLayer === 'flow' ? flowWf : gherkinWf
    const dispatch = useCallback((action: WFAction) => {
        if (activeLayer === 'flow') {
            dispatchFlow(action)
            if (action.type !== 'SET_WF') setFlowDirty(true)
            return
        }
        dispatchGherkin(action)
    }, [activeLayer])

    const nodeMap = useMemo(() => new Map(wf.nodes.map(n => [n.id, n])), [wf.nodes])

    // ── pan / zoom ──
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [viewSize, setViewSize] = useState({ width: 0, height: 0 })
    const canvasDrag = useRef<{ ptId: number; sx: number; sy: number; px: number; py: number } | null>(null)

    useEffect(() => {
        const svg = svgRef.current; if (!svg) return
        const syncSize = () => { const r = svg.getBoundingClientRect(); setViewSize({ width: r.width, height: r.height }) }
        syncSize()
        const obs = new ResizeObserver(syncSize); obs.observe(svg)
        return () => obs.disconnect()
    }, [viewMode])

    const clampZoom = (z: number) => Math.min(3, Math.max(0.2, z))

    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault()
        const svg = svgRef.current; if (!svg) return
        const rect = svg.getBoundingClientRect()
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top
        const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12
        setZoom(z => {
            const nz = clampZoom(z * delta)
            setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
            return nz
        })
    }, [])

    const zoomBy = useCallback((factor: number) => {
        setZoom(z => {
            const nz = clampZoom(z * factor)
            const svg = svgRef.current
            if (svg) {
                const { width, height } = svg.getBoundingClientRect()
                const cx = width / 2, cy = height / 2
                setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
            }
            return nz
        })
    }, [])

    const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

    // ── drag refs ──
    const nodeDrag = useRef<{ id: string; ox: number; oy: number; ptId: number } | null>(null)
    const edgeDrag = useRef<{ from: WFNode; ptId: number; x: number; y: number } | null>(null)
    const midDrag  = useRef<{ edge: WFEdge; key: string; ox: number; oy: number; ptId: number } | null>(null)

    const [tempLine, setTempLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
    const [editing, setEditing] = useState<WFNode | null>(null)
    const [selEdge, setSelEdge] = useState<string | null>(null)
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: { label: string; col?: string; fn: () => void }[] } | null>(null)

    const svgPt = useCallback((cx: number, cy: number) => {
        const svg = svgRef.current!
        const rect = svg.getBoundingClientRect()
        return { x: (cx - rect.left - pan.x) / zoom, y: (cy - rect.top - pan.y) / zoom }
    }, [pan, zoom])

    const onNodePD = useCallback((e: React.PointerEvent, id: string) => {
        if (e.button !== 0 || edgeDrag.current) return
        e.preventDefault()
        const n = nodeMap.get(id)!
        const p = svgPt(e.clientX, e.clientY)
        nodeDrag.current = { id, ox: p.x - n.x, oy: p.y - n.y, ptId: e.pointerId }
            ; (e.target as Element).setPointerCapture(e.pointerId)
    }, [nodeMap, svgPt])

    const onHandlePD = useCallback((e: React.PointerEvent, node: WFNode) => {
        e.preventDefault()
        const p = svgPt(e.clientX, e.clientY)
        edgeDrag.current = { from: node, ptId: e.pointerId, x: p.x, y: p.y }
            ; (e.target as Element).setPointerCapture(e.pointerId)
        setTempLine({ x1: node.x, y1: node.y, x2: p.x, y2: p.y })
    }, [svgPt])

    const onMidPD = useCallback((e: React.PointerEvent, edge: WFEdge) => {
        e.preventDefault()
        const pts = getEdgePoints(edge, nodeMap); if (!pts) return
        const [, mid] = pts
        const p = svgPt(e.clientX, e.clientY)
        midDrag.current = { edge, key: edgeKey(edge), ox: p.x - mid.x, oy: p.y - mid.y, ptId: e.pointerId }
            ; (e.target as Element).setPointerCapture(e.pointerId)
    }, [nodeMap, svgPt])

    const onSvgPM = useCallback((e: React.PointerEvent) => {
        const p = svgPt(e.clientX, e.clientY)
        if (nodeDrag.current && e.pointerId === nodeDrag.current.ptId) {
            const { id, ox, oy } = nodeDrag.current
            dispatch({ type: 'MOVE_NODE', id, x: p.x - ox, y: p.y - oy }); return
        }
        if (edgeDrag.current && e.pointerId === edgeDrag.current.ptId) {
            edgeDrag.current.x = p.x; edgeDrag.current.y = p.y
            const f = edgeDrag.current.from
            setTempLine({ x1: f.x, y1: f.y, x2: p.x, y2: p.y }); return
        }
        if (midDrag.current && e.pointerId === midDrag.current.ptId) {
            const { key, ox, oy } = midDrag.current
            dispatch({ type: 'SET_EDGE_MID', edgeKey: key, mid: { x: p.x - ox, y: p.y - oy } }); return
        }
        if (canvasDrag.current && e.pointerId === canvasDrag.current.ptId) {
            const dx = e.clientX - canvasDrag.current.sx, dy = e.clientY - canvasDrag.current.sy
            setPan({ x: canvasDrag.current.px + dx, y: canvasDrag.current.py + dy })
        }
    }, [svgPt])

    const onSvgPU = useCallback((e: React.PointerEvent) => {
        if (edgeDrag.current && e.pointerId === edgeDrag.current.ptId) {
            const p = svgPt(e.clientX, e.clientY)
            const from = edgeDrag.current.from
            const target = wf.nodes.find(n => {
                if (n.id === from.id) return false
                const { w, h } = nodeSize(n.type)
                return Math.abs(p.x - n.x) <= w / 2 + 4 && Math.abs(p.y - n.y) <= h / 2 + 4
            })
            if (target) {
                const ne: WFEdge = { from: from.id, to: target.id }
                const existingOuts = wf.edges.filter(ex => ex.from === from.id)
                const cond = autoCondition(from, existingOuts)
                if (cond !== undefined) ne.condition = cond
                dispatch({ type: 'ADD_EDGE', edge: ne })
            }
            edgeDrag.current = null; setTempLine(null); return
        }
        if (nodeDrag.current && e.pointerId === nodeDrag.current.ptId) nodeDrag.current = null
        if (midDrag.current && e.pointerId === midDrag.current.ptId) midDrag.current = null
        if (canvasDrag.current && e.pointerId === canvasDrag.current.ptId) canvasDrag.current = null
    }, [svgPt, wf.nodes, wf.edges])

    const addNode = useCallback((type: NodeType, cx?: number, cy?: number) => {
        const svg = svgRef.current; if (!svg) return
        let p: { x: number; y: number }
        if (cx !== undefined && cy !== undefined) { p = svgPt(cx, cy) }
        else {
            const r = svg.getBoundingClientRect()
            p = svgPt(r.left + r.width / 2 + (Math.random() - 0.5) * 120, r.top + r.height / 2 + (Math.random() - 0.5) * 80)
        }
        // foreach / forrange はデフォルトラベルを構文ヒント形式にする
        const defaultLabel =
            type === 'foreach'  ? 'for item in collection' :
            type === 'forrange' ? 'for i from 0 to n' :
            type === 'switch'   ? 'this.status' :
            capitalize(type)
        dispatch({ type: 'ADD_NODE', node: { id: generateId(type), type, label: defaultLabel, x: p.x, y: p.y } })
    }, [svgPt])

    // Node context menu
    const onNodeCtx = useCallback((e: React.MouseEvent, node: WFNode) => {
        e.preventDefault(); e.stopPropagation()
        const isWhenNode = node.label.startsWith('When')
        const isThenNode = node.label.startsWith('Then')
        setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: [
                { label: 'Edit label', fn: () => setEditing(node) },
                ...(isWhenNode ? [{
                    label: node.metadata?.howSteps?.length
                        ? `Edit How (${node.metadata.howSteps.length}件)`
                        : 'Add How（実装順指針）',
                    col: '#93c5fd',
                    fn: () => {
                        const current = node.metadata?.howSteps?.join('\n') ?? ''
                        const input = prompt('実装順指針を1行ずつ入力してください:', current)
                        if (input === null) return
                        const howSteps = input.split('\n').map(s => s.trim()).filter(Boolean)
                        dispatch({ type: 'SET_NODE_METADATA', id: node.id, metadata: { ...node.metadata, howSteps } })
                    },
                }] : []),
                ...((isWhenNode || isThenNode) ? [{
                    label: node.metadata?.whyReason ? 'Edit Why（設計意図）' : 'Add Why（設計意図）',
                    col: '#c4b5fd',
                    fn: () => {
                        const current = node.metadata?.whyReason ?? ''
                        const input = prompt('設計意図を入力してください:', current)
                        if (input === null) return
                        dispatch({ type: 'SET_NODE_METADATA', id: node.id, metadata: { ...node.metadata, whyReason: input?.trim() || undefined } })
                    },
                }] : []),
                // 全ノード型への接続追加（Phase 2 型を含む）
                ...[...NODE_TYPES, ...FLOW_NODE_TYPES].map(t => ({
                    label: `Add ${capitalize(t)} →`,
                    col: NODE_COL[t],
                    fn: () => {
                        const id = generateId(t)
                        const { w } = nodeSize(node.type)
                        const defaultLabel =
                            t === 'foreach'  ? 'for item in collection' :
                            t === 'forrange' ? 'for i from 0 to n' :
                            t === 'switch'   ? 'this.status' :
                            capitalize(t)
                        dispatch({ type: 'ADD_NODE', node: { id, type: t, label: defaultLabel, x: node.x + w + 60, y: node.y } })
                        const existingOuts = wf.edges.filter(ex => ex.from === node.id)
                        const ne: WFEdge = { from: node.id, to: id }
                        const cond = autoCondition(node, existingOuts)
                        if (cond !== undefined) ne.condition = cond
                        dispatch({ type: 'ADD_EDGE', edge: ne })
                    },
                })),
                { label: 'Delete node', col: '#f87171', fn: () => dispatch({ type: 'DEL_NODE', id: node.id }) },
            ],
        })
    }, [wf.edges])

    const onEdgeCtx = useCallback((e: React.MouseEvent, edge: WFEdge) => {
        e.preventDefault(); e.stopPropagation()
        const k = edgeKey(edge)
        setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: [{ label: 'Delete edge', col: '#f87171', fn: () => { dispatch({ type: 'DEL_EDGE', edgeKey: k }); setSelEdge(null) } }],
        })
    }, [])

    const onSvgCtx = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: [
                ...NODE_TYPES.map(t => ({ label: `Add ${capitalize(t)}`, col: NODE_COL[t], fn: () => addNode(t, e.clientX, e.clientY) })),
                { label: '─ Flow control ─', col: '#475569', fn: () => {} },
                ...FLOW_NODE_TYPES.map(t => ({ label: `Add ${FLOW_NODE_LABEL[t] ?? capitalize(t)}`, col: NODE_COL[t], fn: () => addNode(t, e.clientX, e.clientY) })),
            ],
        })
    }, [addNode])

    const onSvgPD = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return
        if (nodeDrag.current || edgeDrag.current) return
        const tag = (e.target as SVGElement).tagName.toLowerCase()
        if (!['svg', 'rect', 'circle', 'pattern'].includes(tag)) return
        canvasDrag.current = { ptId: e.pointerId, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
            ; (e.currentTarget as Element).setPointerCapture(e.pointerId)
    }, [pan])

    useEffect(() => {
        if (!ctxMenu) return
        const h = () => setCtxMenu(null)
        window.addEventListener('pointerdown', h)
        return () => window.removeEventListener('pointerdown', h)
    }, [ctxMenu])

    const save = useCallback(() => {
        if (!opRef) return
        if (!opRef.classId || !opRef.operationId) { console.error('[WorkflowEditorPanel] save: classId or operationId is missing', opRef); return }
        let workflowAst: ReturnType<typeof convertToAst> | FlowAst | undefined = loadedFlowAstRef.current
        if (flowDirty || !workflowAst) {
            try { workflowAst = convertToAst(flowWf) } catch (e) { console.error('[WorkflowEditorPanel] AST conversion failed', e) }
        }
        const workflowCopy = JSON.parse(JSON.stringify(gherkinWf))
        try {
            service.applyUpdateOperationWorkflow({ classId: opRef.classId, operationId: opRef.operationId, workflow: workflowCopy, workflowAst })
            lastLoadedWorkflowJson.current = JSON.stringify(workflowCopy)
            lastLoadedAstJson.current = JSON.stringify(workflowAst ?? { variables: [], body: [] })
            loadedFlowAstRef.current = JSON.parse(lastLoadedAstJson.current)
            setFlowDirty(false)
        } catch (e) { console.error('[WorkflowEditorPanel] applyUpdateOperationWorkflow failed', e) }
    }, [opRef, gherkinWf, flowWf, flowDirty, service])

    const reset = useCallback(() => {
        dispatch({ type: 'SET_WF', wf: createEmptyWorkflow() })
        if (activeLayer === 'flow') setFlowDirty(true)
    }, [dispatch, activeLayer])

    const worldViewport = useMemo(
        () => createWorldViewport(viewSize.width, viewSize.height, zoom, pan, VIEWPORT_CULL_PADDING),
        [viewSize.width, viewSize.height, zoom, pan],
    )

    const visibleNodeIds = useMemo(() => {
        const ids = new Set<string>()
        for (const node of wf.nodes) {
            const { w, h } = nodeSizeWithMeta(node)
            if (rectIntersectsViewport(node.x - w / 2, node.y - h / 2, w, h, worldViewport)) ids.add(node.id)
        }
        return ids
    }, [wf.nodes, worldViewport])

    const visibleNodes = useMemo(() => wf.nodes.filter(n => visibleNodeIds.has(n.id)), [wf.nodes, visibleNodeIds])
    const visibleEdges = useMemo(() =>
        wf.edges.filter(edge => {
            const points = getEdgePoints(edge, nodeMap); if (!points) return false
            if (visibleNodeIds.has(edge.from) || visibleNodeIds.has(edge.to)) return true
            return polylineIntersectsViewport(points, worldViewport)
        }),
        [wf.edges, nodeMap, visibleNodeIds, worldViewport],
    )
    const otherWf = activeLayer === 'flow' ? gherkinWf : flowWf

    // ============================================================
    // Render
    // ============================================================

    return (
        <div className="relative flex flex-col h-full w-full overflow-hidden"
            style={{ background: '#0f172a', fontFamily: '"Cascadia Code","SF Mono","Fira Code",monospace' }}>

            {/* Toolbar */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 shrink-0 flex-wrap"
                style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <span style={{
                    fontSize: 11, color: '#94a3b8', background: '#0f172a',
                    border: '1px solid #334155', borderRadius: 4, padding: '2px 8px',
                    maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={opRef?.label ?? '—'}>
                    {opRef ? opRef.label : '— 未選択 —'}
                </span>
                <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />

                {(['both', 'gherkin', 'flow'] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} disabled={!opRef} style={{
                        height: 26, padding: '0 10px', borderRadius: 4,
                        border: `1px solid ${viewMode === mode ? '#60a5fa' : '#334155'}`,
                        color: viewMode === mode ? '#dbeafe' : '#94a3b8',
                        background: viewMode === mode ? '#1e3a8a' : '#0f172a',
                        fontSize: 11, cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4,
                    }}>
                        {mode === 'both' ? 'Both' : mode === 'gherkin' ? 'Gherkin' : 'Flow'}
                    </button>
                ))}
                {opRef && (
                    <>
                        <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />
                        {viewMode === 'both' && (
                            <>
                                <button onClick={() => setBothEditLayer('gherkin')} style={{
                                    height: 26, padding: '0 8px', borderRadius: 4,
                                    border: `1px solid ${activeLayer === 'gherkin' ? '#34d399' : '#334155'}`,
                                    color: activeLayer === 'gherkin' ? '#d1fae5' : '#94a3b8',
                                    background: activeLayer === 'gherkin' ? '#064e3b' : '#0f172a', fontSize: 11,
                                }}>Edit:Gherkin</button>
                                <button onClick={() => setBothEditLayer('flow')} style={{
                                    height: 26, padding: '0 8px', borderRadius: 4,
                                    border: `1px solid ${activeLayer === 'flow' ? '#f59e0b' : '#334155'}`,
                                    color: activeLayer === 'flow' ? '#fef3c7' : '#94a3b8',
                                    background: activeLayer === 'flow' ? '#78350f' : '#0f172a', fontSize: 11,
                                }}>Edit:Flow</button>
                            </>
                        )}
                        {activeLayer === 'gherkin' && NODE_TYPES.map(t => (
                            <button key={t} onClick={() => addNode(t)} disabled={!opRef} style={{
                                height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${NODE_COL[t]}`,
                                color: NODE_COL[t], background: `${NODE_COL[t]}18`, fontSize: 11,
                                cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4,
                            }}>+ {capitalize(t)}</button>
                        ))}
                        {activeLayer === 'gherkin' && GHERKIN_NODE_TYPES.map(t => (
                            <button key={t} onClick={() => addNode(t)} disabled={!opRef} style={{
                                height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${NODE_COL[t]}`,
                                color: NODE_COL[t], background: `${NODE_COL[t]}18`, fontSize: 11,
                                cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4,
                            }}>+ {KEYWORD_LABEL[t]}</button>
                        ))}
                        {activeLayer === 'flow' && FLOW_NODE_TYPES.map(t => (
                            <button key={t} onClick={() => addNode(t)} disabled={!opRef} style={{
                                height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${NODE_COL[t]}`,
                                color: NODE_COL[t], background: `${NODE_COL[t]}18`, fontSize: 11,
                                cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4,
                            }}>+ {FLOW_NODE_LABEL[t]}</button>
                        ))}
                    </>
                )}

                <div style={{ flex: 1 }} />

                {/* ズームコントロール */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button onClick={() => zoomBy(1 / 1.25)} title="ズームアウト" style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #334155', color: '#94a3b8', background: 'transparent', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>−</button>
                    <button onClick={resetView} title="ビューをリセット" style={{ height: 26, padding: '0 8px', borderRadius: 4, border: '1px solid #334155', color: '#64748b', background: 'transparent', fontSize: 10, cursor: 'pointer', minWidth: 44, fontFamily: 'inherit' }}>
                        {Math.round(zoom * 100)}%</button>
                    <button onClick={() => zoomBy(1.25)} title="ズームイン" style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #334155', color: '#94a3b8', background: 'transparent', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>＋</button>
                </div>
                <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />
                <button onClick={reset} disabled={!opRef} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: '1px solid #475569', color: '#94a3b8', background: 'transparent', fontSize: 11, cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4 }}>Reset</button>
                <button onClick={save} disabled={!opRef} style={{ height: 26, padding: '0 12px', borderRadius: 4, background: opRef ? '#1d4ed8' : '#1e3a5f', color: '#bfdbfe', border: '1px solid #2563eb', fontSize: 11, cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.5 }}>Save Gherkin+Flow</button>
            </div>

            {/* Canvas */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
                {!opRef && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#475569', zIndex: 10, pointerEvents: 'none' }}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity={0.3}>
                            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                        </svg>
                        <p style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
                            クラス図のメソッドをクリックして<br />ワークフロー図を開いてください
                        </p>
                    </div>
                )}
                {viewMode === 'both' ? (
                    <div className="h-full w-full grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
                        <div className="relative min-h-0 overflow-hidden rounded-md border border-slate-700">
                            <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block', cursor: canvasDrag.current ? 'grabbing' : 'grab' }}
                                onPointerMove={onSvgPM} onPointerUp={onSvgPU} onPointerCancel={onSvgPU}
                                onPointerDown={onSvgPD} onContextMenu={onSvgCtx} onWheel={onWheel}
                                onClick={() => { setSelEdge(null); setCtxMenu(null) }}>
                                <defs>
                                    <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                                        <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                                    </marker>
                                    <pattern id="wf-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse"
                                        patternTransform={`translate(${pan.x % 28} ${pan.y % 28}) scale(${zoom})`}>
                                        <circle cx="0" cy="0" r="0.8" fill="#1e293b" />
                                        <circle cx="28" cy="0" r="0.8" fill="#1e293b" />
                                        <circle cx="0" cy="28" r="0.8" fill="#1e293b" />
                                        <circle cx="28" cy="28" r="0.8" fill="#1e293b" />
                                    </pattern>
                                </defs>
                                <rect width="100%" height="100%" fill="url(#wf-grid)" />
                                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                                    {visibleEdges.map((edge, i) => (
                                        <EdgeShape key={`${edgeKey(edge)}-${i}`} edge={edge} nodeMap={nodeMap}
                                            isSelected={selEdge === edgeKey(edge)}
                                            onMidPointerDown={onMidPD} onContextMenu={onEdgeCtx} />
                                    ))}
                                    {visibleNodes.map(node => (
                                        <NodeShape key={node.id} node={node} isSelected={false}
                                            onPointerDown={onNodePD} onHandlePointerDown={onHandlePD}
                                            onDoubleClick={(e, n) => { e.stopPropagation(); setEditing(n) }}
                                            onContextMenu={onNodeCtx} />
                                    ))}
                                </g>
                                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                                    {tempLine && (
                                        <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2}
                                            stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4"
                                            markerEnd="url(#wf-arrow)" pointerEvents="none" />
                                    )}
                                </g>
                            </svg>
                        </div>
                        <div className="min-h-0 overflow-auto">
                            <MiniWorkflowPreview
                                title={activeLayer === 'flow' ? 'Gherkin Layer (workflow)' : `Flow Layer (workflowAst)${flowDirty ? ' *' : ''}`}
                                wf={otherWf}
                            />
                        </div>
                    </div>
                ) : (
                    <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block', cursor: canvasDrag.current ? 'grabbing' : 'grab' }}
                        onPointerMove={onSvgPM} onPointerUp={onSvgPU} onPointerCancel={onSvgPU}
                        onPointerDown={onSvgPD} onContextMenu={onSvgCtx} onWheel={onWheel}
                        onClick={() => { setSelEdge(null); setCtxMenu(null) }}>
                        <defs>
                            <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                            </marker>
                            <pattern id="wf-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse"
                                patternTransform={`translate(${pan.x % 28} ${pan.y % 28}) scale(${zoom})`}>
                                <circle cx="0" cy="0" r="0.8" fill="#1e293b" />
                                <circle cx="28" cy="0" r="0.8" fill="#1e293b" />
                                <circle cx="0" cy="28" r="0.8" fill="#1e293b" />
                                <circle cx="28" cy="28" r="0.8" fill="#1e293b" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#wf-grid)" />
                        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                            {visibleEdges.map((edge, i) => (
                                <EdgeShape key={`${edgeKey(edge)}-${i}`} edge={edge} nodeMap={nodeMap}
                                    isSelected={selEdge === edgeKey(edge)}
                                    onMidPointerDown={onMidPD} onContextMenu={onEdgeCtx} />
                            ))}
                            {visibleNodes.map(node => (
                                <NodeShape key={node.id} node={node} isSelected={false}
                                    onPointerDown={onNodePD} onHandlePointerDown={onHandlePD}
                                    onDoubleClick={(e, n) => { e.stopPropagation(); setEditing(n) }}
                                    onContextMenu={onNodeCtx} />
                            ))}
                        </g>
                        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                            {tempLine && (
                                <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2}
                                    stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4"
                                    markerEnd="url(#wf-arrow)" pointerEvents="none" />
                            )}
                        </g>
                    </svg>
                )}
            </div>

            {/* Inline editor */}
            {editing && (
                <InlineEditor node={editing} svgRef={svgRef}
                    onCommit={v => { dispatch({ type: 'RENAME_NODE', id: editing.id, label: v }); setEditing(null) }}
                    onCancel={() => setEditing(null)} />
            )}

            {/* Context menu */}
            {ctxMenu && (
                <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, boxShadow: '0 8px 24px #00000070', padding: '4px 0', minWidth: 192, zIndex: 400 }}
                    onPointerDown={e => e.stopPropagation()}>
                    {ctxMenu.items.map((item, i) => (
                        <button key={i} onClick={() => { item.fn(); setCtxMenu(null) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 14px', background: 'transparent', border: 'none', fontSize: 12, color: item.col ?? '#e2e8f0', cursor: 'pointer', fontFamily: 'inherit' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            {item.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Hint bar */}
            <div style={{ padding: '3px 12px', borderTop: '1px solid #1e293b', background: '#080f1a', fontSize: 10, color: '#334155', display: 'flex', gap: 16, flexShrink: 0 }}>
                <span>背景ドラッグ: 移動</span>
                <span>スクロール: ズーム</span>
                <span>右クリック: ノード追加/削除</span>
                <span>●ドラッグ: エッジ接続</span>
                <span>ダブルクリック: ラベル編集</span>
            </div>
        </div>
    )
}
