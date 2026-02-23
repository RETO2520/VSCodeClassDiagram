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
 */

import React, {
    useReducer,
    useRef,
    useCallback,
    useEffect,
    useState,
} from 'react'

// ============================================================
// Types
// ============================================================

export type NodeType = 'start' | 'end' | 'process' | 'decision' | 'loop' | 'call'

export interface WFNode {
    id: string
    type: NodeType
    label: string
    x: number
    y: number
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

export interface WFOpRef {
    /** diagram.classes 配列上のインデックス（workflowDiagram への参照に使用） */
    classIndex: number
    /** そのクラス内での operation のインデックス */
    opIndex: number
    /** ClassInfo.id — DomainModel / Service への直接参照に使用 */
    classId: string
    /** ClassOperation.id — DomainModel / Service への直接参照に使用 */
    operationId: string
    /** 表示用ラベル ("ClassName.methodName()") */
    label: string
}

export interface WorkflowEditorPanelProps {
    opRef: WFOpRef | null
    /**
     * ワークフロー図の初期データ読み込み用。
     * ClassInfo の operations[].workflow を参照するためだけに使用する（読み取り専用）。
     * 書き込みは service.applyUpdateOperationWorkflow() 経由で行う。
     */
    diagram: { classes: any[] }
    /** ワークフロー保存に使用する ClassDiagramService インスタンス */
    service: import('@/lib/application/ClassDiagramService').ClassDiagramService
}

// ============================================================
// Node geometry (workflow.draw.js に合わせた寸法)
// ============================================================

function nodeSize(type: NodeType): { w: number; h: number } {
    if (type === 'decision') return { w: 120, h: 80 }
    if (type === 'start' || type === 'end') return { w: 100, h: 50 }
    return { w: 140, h: 40 }
}

// ============================================================
// Utils (workflow.utils.js を TypeScript で移植)
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
    const { w, h } = nodeSize(node.type)

    if (node.type === 'process' || node.type === 'loop' || node.type === 'call') {
        const sx = dx === 0 ? Infinity : (w / 2) / Math.abs(dx)
        const sy = dy === 0 ? Infinity : (h / 2) / Math.abs(dy)
        const s = Math.min(sx, sy)
        return { x: cx + dx * s, y: cy + dy * s }
    }
    if (node.type === 'decision') {
        const denom = Math.abs(dx) * 2 / w + Math.abs(dy) * 2 / h
        const t = denom === 0 ? 0 : 1 / denom
        return { x: cx + dx * t, y: cy + dy * t }
    }
    // ellipse
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
            s.add(c)
                ; (outEdges.get(c) || []).forEach(e => q.push(e.to))
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

        if (n.type === 'end') return [{ type: 'return', value: (n.label && n.label !== 'End') ? n.label : undefined }]
        if (n.type === 'process' || n.type === 'call') return [{ type: 'action', statement: n.label }, ...walk(outs[0]?.to, stop)]
        if (n.type === 'decision') {
            const te = outs.find(e => String(e.condition).toLowerCase() === 'true')
            const fe = outs.find(e => String(e.condition).toLowerCase() === 'false')
            const mp = mergePoint(te?.to, fe?.to)
            const res: any[] = [{ type: 'if', condition: n.label, then: walk(te?.to, mp), else: walk(fe?.to, mp) || undefined }]
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
        case 'DEL_NODE': return { nodes: s.nodes.filter(n => n.id !== a.id), edges: s.edges.filter(e => e.from !== a.id && e.to !== a.id) }
        case 'ADD_EDGE': return { ...s, edges: [...s.edges, a.edge] }
        case 'SET_EDGE_MID': return { ...s, edges: s.edges.map(e => edgeKey(e) === a.edgeKey ? { ...e, mid: a.mid } : e) }
        case 'DEL_EDGE': return { ...s, edges: s.edges.filter(e => edgeKey(e) !== a.edgeKey) }
        default: return s
    }
}

// ============================================================
// Design tokens — VSCode dark に準じたシック&シャープな配色
// ============================================================

const STYLE: Record<NodeType, { fill: string; stroke: string; text: string }> = {
    start: { fill: '#14532d', stroke: '#4ade80', text: '#bbf7d0' },
    end: { fill: '#7f1d1d', stroke: '#f87171', text: '#fecaca' },
    process: { fill: '#1e293b', stroke: '#64748b', text: '#e2e8f0' },
    decision: { fill: '#2e1065', stroke: '#c084fc', text: '#f3e8ff' },
    loop: { fill: '#0c2a4a', stroke: '#38bdf8', text: '#e0f2fe' },
    call: { fill: '#431407', stroke: '#fb923c', text: '#ffedd5' },
}
const ACCENT = '#3b82f6'

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
    const { w, h } = nodeSize(node.type)
    const st = STYLE[node.type]
    const stroke = isSelected ? ACCENT : st.stroke
    const sw = isSelected ? 2.5 : 1.5
    const fid = `f${node.id}`

    const bodyProps = { fill: st.fill, stroke, strokeWidth: sw, filter: `url(#${fid})` }

    let body: React.ReactNode
    if (node.type === 'start' || node.type === 'end') {
        body = <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} {...bodyProps} />
    } else if (node.type === 'decision') {
        const pts = `0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`
        body = <polygon points={pts} {...bodyProps} />
    } else {
        body = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={5} {...bodyProps} />
    }

    return (
        <g
            transform={`translate(${node.x},${node.y})`}
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

            {/* Loop 装飾 */}
            {node.type === 'loop' && <>
                <path d={`M${-w / 2 + 10},${-h / 2 + 6} L${-w / 2 + 4},0 L${-w / 2 + 10},${h / 2 - 6}`}
                    fill="none" stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
                <path d={`M${w / 2 - 10},${-h / 2 + 6} L${w / 2 - 4},0 L${w / 2 - 10},${h / 2 - 6}`}
                    fill="none" stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
            </>}

            {/* Call 装飾 */}
            {node.type === 'call' && <>
                <line x1={-w / 2 + 12} y1={-h / 2 + 4} x2={-w / 2 + 12} y2={h / 2 - 4} stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
                <line x1={w / 2 - 12} y1={-h / 2 + 4} x2={w / 2 - 12} y2={h / 2 - 4} stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" />
            </>}

            {/* ラベル */}
            <text
                textAnchor="middle" dominantBaseline="central"
                fill={st.text} fontSize={11}
                fontFamily='"Cascadia Code","SF Mono","Fira Code",monospace'
                fontWeight={node.type === 'start' || node.type === 'end' ? '700' : '400'}
                pointerEvents="none"
            >
                {node.label.length > 17 ? node.label.slice(0, 16) + '…' : node.label}
            </text>

            {/* エッジ作成ハンドル */}
            <circle
                cx={w / 2 + 9} cy={0} r={5.5}
                fill={ACCENT} stroke="#0f172a" strokeWidth={1.5}
                style={{ cursor: 'crosshair' }}
                onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node) }}
            />
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
    const col = isSelected ? ACCENT : '#64748b'

    return (
        <g onContextMenu={ev => { ev.preventDefault(); onContextMenu(ev, edge) }}>
            {/* ヒット領域 */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'context-menu' }} />
            {/* エッジ本体 */}
            <path d={d} fill="none" stroke={col} strokeWidth={isSelected ? 2 : 1.5} markerEnd="url(#wf-arrow)" />
            {/* condition ラベル */}
            {edge.condition != null && (
                <text x={lp.x} y={lp.y - 9} textAnchor="middle" fontSize={10}
                    fontFamily='"Cascadia Code","SF Mono",monospace' fill="#94a3b8" pointerEvents="none">
                    {String(edge.condition)}
                </text>
            )}
            {/* 中点ドラッグハンドル */}
            <circle cx={m.x} cy={m.y} r={5}
                fill={isSelected ? ACCENT : '#334155'} stroke="#0f172a" strokeWidth={1.5}
                style={{ cursor: 'move' }}
                onPointerDown={ev => { ev.stopPropagation(); onMidPointerDown(ev, edge) }}
            />
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

    return (
        <input
            ref={ref} value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onCommit(val.trim() || node.id); if (e.key === 'Escape') onCancel() }}
            onBlur={() => onCommit(val.trim() || node.id)}
            style={{
                position: 'fixed', left: pos.left, top: pos.top,
                width: 200, zIndex: 500,
                background: '#0f172a', color: '#f1f5f9',
                border: '2px solid #3b82f6', borderRadius: 5,
                padding: '3px 8px', fontSize: 12,
                fontFamily: '"Cascadia Code","SF Mono",monospace', outline: 'none',
            }}
        />
    )
}

// ============================================================
// Node type meta
// ============================================================

const NODE_TYPES: NodeType[] = ['start', 'process', 'decision', 'loop', 'call', 'end']
const NODE_COL: Record<NodeType, string> = {
    start: '#4ade80', end: '#f87171', process: '#94a3b8',
    decision: '#c084fc', loop: '#38bdf8', call: '#fb923c',
}

// ============================================================
// WorkflowEditorPanel
// ============================================================

export function WorkflowEditorPanel({ opRef, diagram, service }: WorkflowEditorPanelProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [wf, dispatch] = useReducer(wfReducer, { nodes: [], edges: [] })

    // ── workflow ロード ──────────────────────────────────────────
    //
    // 旧実装の問題:
    //   loadedRef に "classIndex:opIndex" をキャッシュし、同じkeyなら即returnしていた。
    //   → DSLを編集してworkflowが外部更新されても同じメソッドを表示中なら
    //     永遠にスキップされ、リアルタイム更新が反映されなかった。
    //
    // 新実装:
    //   1. opRefが切り替わったとき → 強制ロード
    //   2. service.onModelChanged → 外部更新（SpecEditorPanel等）を検知して再ロード
    //   3. ロード内容が現在の表示と同じならスキップ（編集中の状態を保護）

    // 最後にロードした workflow の JSON（差分検知用）
    const lastLoadedJson = useRef<string>('')
    // 現在表示中の opRef キー（切り替え検知用）
    const currentOpKey = useRef<string>('')

    // opRef と service を ref で保持する。
    // これにより loadFromService を deps なしの安定した関数にでき、
    // onModelChanged に登録した関数が常に最新の opRef/service を参照できる。
    // （useCallback([opRef, service]) にすると opRef 変化のたびに新インスタンスが生成され、
    //   古い関数が subscription に残って stale closure になる）
    const opRefRef = useRef(opRef)
    const serviceRef = useRef(service)
    useEffect(() => { opRefRef.current = opRef }, [opRef])
    useEffect(() => { serviceRef.current = service }, [service])

    const loadFromService = useCallback(() => {
        const currentOpRef = opRefRef.current
        if (!currentOpRef) return

        const model = serviceRef.current.getModel()

        // まず classId / operationId で直接検索（通常ケース）
        let cls = model.findClassById(currentOpRef.classId)
        let op = cls?.operations.find(o => o.id === currentOpRef.operationId)

        // IDで見つからない場合（モデルリセット後）は名前ベースでフォールバック検索する。
        // SpecEditorPanel が setModel(empty) → parse() を行うと新しい ID が振られるため。
        if (!op) {
            const m = currentOpRef.label.match(/^(.+?)\.(.+?)\(/)
            if (m) {
                cls = model.findClassByName(m[1]) ?? undefined
                op = cls?.operations.find(o => o.name === m[2])
            }
        }

        if (!op || !cls) {
            return
        }

        const incoming = op.workflow?.nodes?.length ? op.workflow : null
        const incomingJson = JSON.stringify(incoming)

        if (incomingJson === lastLoadedJson.current) return
        lastLoadedJson.current = incomingJson

        if (incoming) {
            dispatch({ type: 'SET_WF', wf: JSON.parse(incomingJson) })
        } else {
            const s = generateId('start'), e = generateId('end')
            dispatch({
                type: 'SET_WF', wf: {
                    nodes: [
                        { id: s, type: 'start', label: 'Start', x: 220, y: 80 },
                        { id: e, type: 'end', label: 'End', x: 220, y: 260 },
                    ],
                    edges: [{ from: s, to: e }],
                }
            })
        }
        // 依存配列は空 — opRef/service は ref 経由で参照するため関数インスタンスが安定する
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // opRef が変わったとき → キャッシュをクリアして強制ロード
    useEffect(() => {
        if (!opRef) return
        const key = `${opRef.classId}:${opRef.operationId}`
        if (currentOpKey.current !== key) {
            currentOpKey.current = key
            lastLoadedJson.current = ''  // 強制再ロード
        }
        loadFromService()
    }, [opRef, loadFromService])

    // service のモデル変化を購読（loadFromService が安定しているので張り直し不要）
    useEffect(() => {
        service.onModelChanged(loadFromService)
        return () => service.offModelChanged(loadFromService)
    }, [service, loadFromService])

    const nodeMap = new Map(wf.nodes.map(n => [n.id, n]))

    // ── pan / zoom state ──
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const canvasDrag = useRef<{ ptId: number; sx: number; sy: number; px: number; py: number } | null>(null)

    const clampZoom = (z: number) => Math.min(3, Math.max(0.2, z))

    // ホイールでズーム（カーソル位置を中心に）
    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault()
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12
        setZoom(z => {
            const nz = clampZoom(z * delta)
            // ズーム前後でカーソル位置が動かないよう pan を補正
            setPan(p => ({
                x: cx - (cx - p.x) * (nz / z),
                y: cy - (cy - p.y) * (nz / z),
            }))
            return nz
        })
    }, [])

    // ズームボタン用
    const zoomBy = useCallback((factor: number) => {
        setZoom(z => {
            const nz = clampZoom(z * factor)
            // 中心基準でズーム
            const svg = svgRef.current
            if (svg) {
                const { width, height } = svg.getBoundingClientRect()
                const cx = width / 2, cy = height / 2
                setPan(p => ({
                    x: cx - (cx - p.x) * (nz / z),
                    y: cy - (cy - p.y) * (nz / z),
                }))
            }
            return nz
        })
    }, [])

    const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

    // ── drag state refs ──
    const nodeDrag = useRef<{ id: string; ox: number; oy: number; ptId: number } | null>(null)
    const edgeDrag = useRef<{ from: WFNode; ptId: number; x: number; y: number } | null>(null)
    const midDrag = useRef<{ edge: WFEdge; key: string; ox: number; oy: number; ptId: number } | null>(null)

    const [tempLine, setTempLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
    const [editing, setEditing] = useState<WFNode | null>(null)
    const [selEdge, setSelEdge] = useState<string | null>(null)
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: { label: string; col?: string; fn: () => void }[] } | null>(null)

    const svgPt = useCallback((cx: number, cy: number) => {
        const svg = svgRef.current!
        const rect = svg.getBoundingClientRect()
        // SVG内の生座標（px単位）→ pan/zoom の <g> 内座標に変換
        return {
            x: (cx - rect.left - pan.x) / zoom,
            y: (cy - rect.top - pan.y) / zoom,
        }
    }, [pan, zoom])

    // Node pointer down
    const onNodePD = useCallback((e: React.PointerEvent, id: string) => {
        if (e.button !== 0 || edgeDrag.current) return
        e.preventDefault()
        const n = nodeMap.get(id)!
        const p = svgPt(e.clientX, e.clientY)
        nodeDrag.current = { id, ox: p.x - n.x, oy: p.y - n.y, ptId: e.pointerId }
            ; (e.target as Element).setPointerCapture(e.pointerId)
    }, [nodeMap, svgPt])

    // Handle pointer down (edge create)
    const onHandlePD = useCallback((e: React.PointerEvent, node: WFNode) => {
        e.preventDefault()
        const p = svgPt(e.clientX, e.clientY)
        edgeDrag.current = { from: node, ptId: e.pointerId, x: p.x, y: p.y }
            ; (e.target as Element).setPointerCapture(e.pointerId)
        setTempLine({ x1: node.x, y1: node.y, x2: p.x, y2: p.y })
    }, [svgPt])

    // Edge mid pointer down
    const onMidPD = useCallback((e: React.PointerEvent, edge: WFEdge) => {
        e.preventDefault()
        const pts = getEdgePoints(edge, nodeMap)
        if (!pts) return
        const [, mid] = pts
        const p = svgPt(e.clientX, e.clientY)
        midDrag.current = { edge, key: edgeKey(edge), ox: p.x - mid.x, oy: p.y - mid.y, ptId: e.pointerId }
            ; (e.target as Element).setPointerCapture(e.pointerId)
    }, [nodeMap, svgPt])

    // SVG pointer move
    const onSvgPM = useCallback((e: React.PointerEvent) => {
        const p = svgPt(e.clientX, e.clientY)
        if (nodeDrag.current && e.pointerId === nodeDrag.current.ptId) {
            const { id, ox, oy } = nodeDrag.current
            dispatch({ type: 'MOVE_NODE', id, x: p.x - ox, y: p.y - oy })
            return
        }
        if (edgeDrag.current && e.pointerId === edgeDrag.current.ptId) {
            edgeDrag.current.x = p.x; edgeDrag.current.y = p.y
            const f = edgeDrag.current.from
            setTempLine({ x1: f.x, y1: f.y, x2: p.x, y2: p.y })
            return
        }
        if (midDrag.current && e.pointerId === midDrag.current.ptId) {
            const { key, ox, oy } = midDrag.current
            dispatch({ type: 'SET_EDGE_MID', edgeKey: key, mid: { x: p.x - ox, y: p.y - oy } })
            return
        }
        // キャンバスドラッグ → pan
        if (canvasDrag.current && e.pointerId === canvasDrag.current.ptId) {
            const dx = e.clientX - canvasDrag.current.sx
            const dy = e.clientY - canvasDrag.current.sy
            setPan({ x: canvasDrag.current.px + dx, y: canvasDrag.current.py + dy })
        }
    }, [svgPt])

    // SVG pointer up
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
                if (from.type === 'decision' || from.type === 'loop') {
                    const outs = wf.edges.filter(ex => ex.from === from.id)
                    const hasF = outs.some(ex => String(ex.condition).toLowerCase() === 'false')
                    const hasT = outs.some(ex => String(ex.condition).toLowerCase() === 'true')
                    if (!hasF) ne.condition = 'false'; else if (!hasT) ne.condition = 'true'; else ne.condition = null
                }
                dispatch({ type: 'ADD_EDGE', edge: ne })
            }
            edgeDrag.current = null; setTempLine(null)
            return
        }
        if (nodeDrag.current && e.pointerId === nodeDrag.current.ptId) { nodeDrag.current = null }
        if (midDrag.current && e.pointerId === midDrag.current.ptId) { midDrag.current = null }
        if (canvasDrag.current && e.pointerId === canvasDrag.current.ptId) { canvasDrag.current = null }
    }, [svgPt, wf.nodes, wf.edges])

    // Add node
    const addNode = useCallback((type: NodeType, cx?: number, cy?: number) => {
        const svg = svgRef.current; if (!svg) return
        let p: { x: number; y: number }
        if (cx !== undefined && cy !== undefined) {
            p = svgPt(cx, cy)
        } else {
            const r = svg.getBoundingClientRect()
            p = svgPt(r.left + r.width / 2 + (Math.random() - 0.5) * 120, r.top + r.height / 2 + (Math.random() - 0.5) * 80)
        }
        dispatch({ type: 'ADD_NODE', node: { id: generateId(type), type, label: capitalize(type), x: p.x, y: p.y } })
    }, [svgPt])

    // Node context menu
    const onNodeCtx = useCallback((e: React.MouseEvent, node: WFNode) => {
        e.preventDefault(); e.stopPropagation()
        setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: [
                { label: 'Edit label', fn: () => setEditing(node) },
                ...NODE_TYPES.map(t => ({
                    label: `Add ${capitalize(t)} →`,
                    col: NODE_COL[t],
                    fn: () => {
                        const id = generateId(t)
                        const { w } = nodeSize(node.type)
                        dispatch({ type: 'ADD_NODE', node: { id, type: t, label: capitalize(t), x: node.x + w + 60, y: node.y } })
                        dispatch({ type: 'ADD_EDGE', edge: { from: node.id, to: id } })
                    },
                })),
                { label: 'Delete node', col: '#f87171', fn: () => dispatch({ type: 'DEL_NODE', id: node.id }) },
            ],
        })
    }, [])

    // Edge context menu
    const onEdgeCtx = useCallback((e: React.MouseEvent, edge: WFEdge) => {
        e.preventDefault(); e.stopPropagation()
        const k = edgeKey(edge)
        setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: [{ label: 'Delete edge', col: '#f87171', fn: () => { dispatch({ type: 'DEL_EDGE', edgeKey: k }); setSelEdge(null) } }],
        })
    }, [])

    // SVG right-click (canvas)
    const onSvgCtx = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: NODE_TYPES.map(t => ({ label: `Add ${capitalize(t)}`, col: NODE_COL[t], fn: () => addNode(t, e.clientX, e.clientY) })),
        })
    }, [addNode])

    // SVG背景ポインターダウン → pan 開始（ノード/エッジ上ではない場合のみ）
    const onSvgPD = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return
        if (nodeDrag.current || edgeDrag.current) return
        // ターゲットが SVG 自体か背景 rect/pattern の場合のみ pan 開始
        const tag = (e.target as SVGElement).tagName.toLowerCase()
        if (!['svg', 'rect', 'circle', 'pattern'].includes(tag)) return
        canvasDrag.current = { ptId: e.pointerId, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
            ; (e.currentTarget as Element).setPointerCapture(e.pointerId)
    }, [pan])

    // Close ctx menu on outside click
    useEffect(() => {
        if (!ctxMenu) return
        const h = () => setCtxMenu(null)
        window.addEventListener('pointerdown', h)
        return () => window.removeEventListener('pointerdown', h)
    }, [ctxMenu])

    // Save — ClassDiagramService を経由してドメインモデルを正規ルートで更新する
    const save = useCallback(() => {
        if (!opRef) return

        if (!opRef.classId || !opRef.operationId) {
            console.error('[WorkflowEditorPanel] save: classId or operationId is missing in opRef', opRef)
            return
        }

        let workflowAst: ReturnType<typeof convertToAst> | undefined
        try {
            workflowAst = convertToAst(wf)
        } catch (e) {
            console.error('[WorkflowEditorPanel] AST conversion failed', e)
        }

        const workflowCopy = JSON.parse(JSON.stringify(wf))

        try {
            service.applyUpdateOperationWorkflow({
                classId: opRef.classId,
                operationId: opRef.operationId,
                workflow: workflowCopy,
                workflowAst,
            })
            // 保存後にキャッシュを更新する。
            // notifyModelChanged → loadFromService が呼ばれても
            // 「内容が変わっていない」と判定され、編集中状態が上書きされない。
            lastLoadedJson.current = JSON.stringify(workflowCopy)
        } catch (e) {
            console.error('[WorkflowEditorPanel] applyUpdateOperationWorkflow failed', e)
        }
    }, [opRef, wf, service])

    // Reset
    const reset = useCallback(() => {
        const s = generateId('start'), e = generateId('end')
        dispatch({
            type: 'SET_WF', wf: {
                nodes: [{ id: s, type: 'start', label: 'Start', x: 220, y: 80 }, { id: e, type: 'end', label: 'End', x: 220, y: 260 }],
                edges: [{ from: s, to: e }],
            }
        })
    }, [])

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
                {NODE_TYPES.map(t => (
                    <button key={t} onClick={() => addNode(t)} disabled={!opRef}
                        style={{
                            height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${NODE_COL[t]}`,
                            color: NODE_COL[t], background: `${NODE_COL[t]}18`, fontSize: 11,
                            cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4,
                        }}>
                        + {capitalize(t)}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                {/* ズームコントロール */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button onClick={() => zoomBy(1 / 1.25)} title="ズームアウト (Scroll↓)"
                        style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #334155', color: '#94a3b8', background: 'transparent', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>−</button>
                    <button onClick={resetView} title="ビューをリセット"
                        style={{ height: 26, padding: '0 8px', borderRadius: 4, border: '1px solid #334155', color: '#64748b', background: 'transparent', fontSize: 10, cursor: 'pointer', minWidth: 44, fontFamily: 'inherit' }}>
                        {Math.round(zoom * 100)}%
                    </button>
                    <button onClick={() => zoomBy(1.25)} title="ズームイン (Scroll↑)"
                        style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #334155', color: '#94a3b8', background: 'transparent', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>＋</button>
                </div>
                <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />
                <button onClick={reset} disabled={!opRef} style={{
                    height: 26, padding: '0 10px', borderRadius: 4,
                    border: '1px solid #475569', color: '#94a3b8', background: 'transparent',
                    fontSize: 11, cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4,
                }}>Reset</button>
                <button onClick={save} disabled={!opRef} style={{
                    height: 26, padding: '0 12px', borderRadius: 4,
                    background: opRef ? '#1d4ed8' : '#1e3a5f', color: '#bfdbfe',
                    border: '1px solid #2563eb', fontSize: 11,
                    cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.5,
                }}>Save Workflow</button>
            </div>

            {/* Canvas */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
                {!opRef && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 12,
                        color: '#475569', zIndex: 10, pointerEvents: 'none',
                    }}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity={0.3}>
                            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                        </svg>
                        <p style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
                            クラス図のメソッドをクリックして<br />ワークフロー図を開いてください
                        </p>
                    </div>
                )}

                <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block', cursor: canvasDrag.current ? 'grabbing' : 'grab' }}
                    onPointerMove={onSvgPM}
                    onPointerUp={onSvgPU}
                    onPointerCancel={onSvgPU}
                    onPointerDown={onSvgPD}
                    onContextMenu={onSvgCtx}
                    onWheel={onWheel}
                    onClick={() => { setSelEdge(null); setCtxMenu(null) }}
                >
                    <defs>
                        <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                            <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                        </marker>
                        {/* グリッドは pan/zoom に追従させるため patternTransform を使う */}
                        <pattern id="wf-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse"
                            patternTransform={`translate(${pan.x % 28} ${pan.y % 28}) scale(${zoom})`}>
                            <circle cx="0" cy="0" r="0.8" fill="#1e293b" />
                            <circle cx="28" cy="0" r="0.8" fill="#1e293b" />
                            <circle cx="0" cy="28" r="0.8" fill="#1e293b" />
                            <circle cx="28" cy="28" r="0.8" fill="#1e293b" />
                        </pattern>
                    </defs>

                    <rect width="100%" height="100%" fill="url(#wf-grid)" />

                    {/* pan/zoom transform をノード・エッジ全体にかける */}
                    <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                        {/* Edges */}
                        {wf.edges.map((edge, i) => (
                            <EdgeShape key={`${edgeKey(edge)}-${i}`}
                                edge={edge} nodeMap={nodeMap}
                                isSelected={selEdge === edgeKey(edge)}
                                onMidPointerDown={onMidPD}
                                onContextMenu={onEdgeCtx}
                            />
                        ))}

                        {/* Nodes */}
                        {wf.nodes.map(node => (
                            <NodeShape key={node.id} node={node} isSelected={false}
                                onPointerDown={onNodePD}
                                onHandlePointerDown={onHandlePD}
                                onDoubleClick={(e, n) => { e.stopPropagation(); setEditing(n) }}
                                onContextMenu={onNodeCtx}
                            />
                        ))}
                    </g>

                    {/* Temp edge（transform group 内に配置） */}
                    <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                        {tempLine && (
                            <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2}
                                stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4"
                                markerEnd="url(#wf-arrow)" pointerEvents="none" />
                        )}
                    </g>
                </svg>
            </div>

            {/* Inline editor */}
            {editing && (
                <InlineEditor node={editing} svgRef={svgRef}
                    onCommit={v => { dispatch({ type: 'RENAME_NODE', id: editing.id, label: v }); setEditing(null) }}
                    onCancel={() => setEditing(null)} />
            )}

            {/* Context menu */}
            {ctxMenu && (
                <div style={{
                    position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
                    background: '#1e293b', border: '1px solid #334155',
                    borderRadius: 6, boxShadow: '0 8px 24px #00000070',
                    padding: '4px 0', minWidth: 180, zIndex: 400,
                }} onPointerDown={e => e.stopPropagation()}>
                    {ctxMenu.items.map((item, i) => (
                        <button key={i} onClick={() => { item.fn(); setCtxMenu(null) }}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '5px 14px', background: 'transparent', border: 'none',
                                fontSize: 12, color: item.col ?? '#e2e8f0', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >{item.label}</button>
                    ))}
                </div>
            )}

            {/* Hint bar */}
            <div style={{
                padding: '3px 12px', borderTop: '1px solid #1e293b',
                background: '#080f1a', fontSize: 10, color: '#334155',
                display: 'flex', gap: 16, flexShrink: 0,
            }}>
                <span>背景ドラッグ: 移動</span>
                <span>スクロール: ズーム</span>
                <span>右クリック: ノード追加/削除</span>
                <span>●ドラッグ: エッジ接続</span>
                <span>ダブルクリック: ラベル編集</span>
            </div>
        </div>
    )
}