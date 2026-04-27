/**
 * WorkflowEditorPanel.tsx
 *
 * ループ表示の修正 (2026-04-24):
 *   Problem 1: forEach/forRange のボディノードと exit ノードが重なる
 *     → ボディを baseX から左にオフセット配置し、exit は baseX に垂直配置
 *   Problem 2: ループバックエッジ (bodyTail→forId) が右側ベジェ弧にならない
 *     → WFEdge に loopBack フラグを追加し getEdgePoints で検出して弧描画
 */

import React, { useReducer, useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { createWorldViewport, polylineIntersectsViewport, rectIntersectsViewport } from '@/lib/viewport-culling'

export type NodeType =
    | 'start' | 'end' | 'process' | 'decision' | 'loop' | 'call'
    | 'given' | 'when' | 'then' | 'how'
    | 'foreach' | 'forrange' | 'switch' | 'break' | 'continue'

export interface WFNode {
    id: string; type: NodeType; label: string; x: number; y: number
    metadata?: { howSteps?: string[]; whyReason?: string }
}
export interface WFEdge {
    from: string; to: string; condition?: string | null
    mid?: { x: number; y: number }
    /** ループバックエッジ (bodyTail→loopNode) のフラグ。右側ベジェ弧で描画する */
    loopBack?: boolean
}
export interface WFWorkflow { nodes: WFNode[]; edges: WFEdge[] }
type FlowAst = { variables: Array<{ name: string; type: string; initialValue?: string }>; body: any[] }
export interface WFOpRef { classIndex: number; opIndex: number; classId: string; operationId: string; label: string }
export interface WorkflowEditorPanelProps {
    opRef: WFOpRef | null
    diagram: { classes: any[] }
    service: import('@/lib/application/ClassDiagramService').ClassDiagramService
}

function generateId(p: string) { return `${p}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}` }
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
function createEmptyWorkflow(x = 220): WFWorkflow {
    const s = generateId('start'), e = generateId('end')
    return { nodes: [{ id: s, type: 'start', label: 'Start', x, y: 80 }, { id: e, type: 'end', label: 'End', x, y: 260 }], edges: [{ from: s, to: e }] }
}

// ── Node geometry ────────────────────────────────────────────
const HOW_ITEM_H = 16, HOW_PADDING = 8
function nodeSize(type: NodeType): { w: number; h: number } {
    if (type === 'decision') return { w: 120, h: 80 }
    if (type === 'start' || type === 'end') return { w: 100, h: 50 }
    if (type === 'given' || type === 'when' || type === 'then' || type === 'how') return { w: 160, h: 40 }
    if (type === 'foreach' || type === 'forrange') return { w: 160, h: 50 }
    if (type === 'switch') return { w: 150, h: 60 }
    if (type === 'break' || type === 'continue') return { w: 120, h: 38 }
    return { w: 140, h: 40 }
}
const GHERKIN_KEYWORDS: NodeType[] = ['given', 'when', 'then', 'how']
function nodeSizeWithMeta(node: WFNode): { w: number; h: number } {
    const base = nodeSize(node.type)
    if (!GHERKIN_KEYWORDS.includes(node.type as any)) return base
    const howH = (node.metadata?.howSteps?.length ?? 0) > 0 ? HOW_PADDING + node.metadata!.howSteps!.length * HOW_ITEM_H + HOW_PADDING : 0
    const whyH = node.metadata?.whyReason ? HOW_ITEM_H + 4 : 0
    return { w: base.w, h: base.h + howH + whyH }
}

// ── Utils ────────────────────────────────────────────────────
function computePolylineMidpoint(points: { x: number; y: number }[]) {
    let total = 0; const lens: number[] = []
    for (let i = 0; i < points.length - 1; i++) {
        const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y); lens.push(l); total += l
    }
    let target = total / 2
    for (let i = 0; i < lens.length; i++) {
        if (target <= lens[i]) { const t = lens[i] === 0 ? 0 : target / lens[i]; return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t } }
        target -= lens[i]
    }
    return points[Math.floor(points.length / 2)]
}
function boundaryPointTowards(node: WFNode, target: { x: number; y: number }) {
    const { x: cx, y: cy } = node; const dx = target.x - cx, dy = target.y - cy
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy }
    const { w, h } = GHERKIN_KEYWORDS.includes(node.type as any) ? nodeSizeWithMeta(node) : nodeSize(node.type)
    const RECT: NodeType[] = ['process', 'loop', 'call', 'given', 'when', 'then', 'how', 'foreach', 'forrange', 'break', 'continue']
    if (RECT.includes(node.type)) { const sx = dx === 0 ? Infinity : (w / 2) / Math.abs(dx), sy = dy === 0 ? Infinity : (h / 2) / Math.abs(dy); return { x: cx + dx * Math.min(sx, sy), y: cy + dy * Math.min(sx, sy) } }
    if (node.type === 'decision' || node.type === 'switch') { const d = Math.abs(dx) * 2 / w + Math.abs(dy) * 2 / h; const t = d === 0 ? 0 : 1 / d; return { x: cx + dx * t, y: cy + dy * t } }
    const rx = w / 2, ry = h / 2; const sq = dx * dx / (rx * rx) + dy * dy / (ry * ry); const t = sq === 0 ? 0 : 1 / Math.sqrt(sq); return { x: cx + dx * t, y: cy + dy * t }
}

type EdgeResult =
    | { kind: 'poly'; pts: readonly [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] }
    | { kind: 'loop'; d: string; labelPt: { x: number; y: number } }

/**
 * エッジの描画パラメータを返す。
 *
 * ループバック描画の条件（いずれかを満たすとき右側ベジェ弧）:
 *   1. edge.from === edge.to   (自己ループ)
 *   2. edge.loopBack === true  (bodyTail → loopNode の逆行エッジ)
 *
 * 弧の形状:
 *   - 自己ループ: loopNode 右辺の上端→右外側→下端
 *   - loopBack: bodyTail(from)右辺 → 右外側に膨らむ → loopNode(to)右辺（上向き）
 *   - ボディは loopNode より右・下にあるため、右側の弧はボディと重ならない
 */
function getEdgePoints(edge: WFEdge, nodeMap: Map<string, WFNode>): EdgeResult | null {
    const from = nodeMap.get(edge.from), to = nodeMap.get(edge.to); if (!from || !to) return null

    // 自己ループ または loopBack フラグ付きエッジ → 右側ベジェ弧
    const isLoopArc = edge.from === edge.to || edge.loopBack === true
    if (isLoopArc) {
        if (edge.from === edge.to) {
            // 自己ループ（空ボディ）: ループノード右辺で小さな弧
            const { w, h } = nodeSize(from.type)
            const rx = w / 2, ry = h / 2
            const sx = from.x + rx, sy = from.y - ry * 0.4
            const ex = from.x + rx, ey = from.y + ry * 0.4
            const BULGE = Math.max(60, w * 0.5)
            const d = `M${sx},${sy} C${sx + BULGE},${sy - 16} ${sx + BULGE},${ey + 16} ${ex},${ey}`
            return { kind: 'loop', d, labelPt: { x: from.x + rx + BULGE * 0.55, y: from.y } }
        }
        // loopBack: bodyTail(from) の右辺から loopNode(to) の右辺へ戻る上向き弧
        // ボディは loopNode より右・下にあるため、両ノードの右辺を右外側で繋ぐ
        const fromSz = nodeSize(from.type), toSz = nodeSize(to.type)
        const fromRx = fromSz.w / 2, toRx = toSz.w / 2
        // 出発点: bodyTail 右辺の中央
        const sx = from.x + fromRx, sy = from.y
        // 到着点: loopNode 右辺の中央
        const ex = to.x + toRx, ey = to.y
        // 制御点: 両点の右側で最も張り出した X を基準に膨らます
        const BULGE = Math.max(80, Math.abs(from.x - to.x) * 0.5 + 60)
        const rightX = Math.max(sx, ex) + BULGE
        const d = `M${sx},${sy} C${rightX},${sy} ${rightX},${ey} ${ex},${ey}`
        const labelPt = { x: rightX - BULGE * 0.25, y: (sy + ey) / 2 }
        return { kind: 'loop', d, labelPt }
    }

    // 通常エッジ
    const st = edge.mid ?? to, et = edge.mid ?? from
    const start = boundaryPointTowards(from, st), end = boundaryPointTowards(to, et)
    const mid = edge.mid ? { x: edge.mid.x, y: edge.mid.y } : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    return { kind: 'poly', pts: [start, mid, end] }
}

// ── convertAstToWorkflow ────────────────────────────────────
//
// ノード配置の修正:
//   forEach / forRange / while のボディノードは baseX から右に BODY_OFFSET だけずらす。
//   exit ノードは baseX 正中に縦配置し、ボディと重ならない。
//   ループバックエッジには loopBack:true を付与し、bodyTail→loopNode の右側弧で描画させる。
//
export function convertAstToWorkflow(ast?: FlowAst): WFWorkflow {
    const wf = createEmptyWorkflow(); const startId = wf.nodes[0].id, endId = wf.nodes[1].id
    wf.edges = []
    const body = ast?.body ?? [], vars = ast?.variables ?? []
    const LANE_W = 200, STEP_Y = 86
    // ループボディを baseX から左にオフセットする量
    const BODY_OFFSET = 180
    let globalY = 140

    const addNode = (type: NodeType, label: string, x = 220): string => {
        const id = generateId(type); wf.nodes.push({ id, type, label, x, y: globalY }); globalY += STEP_Y; return id
    }
    const addEdge = (from: string, to: string, cond?: string | null, loopBack?: boolean) => {
        const e: WFEdge = { from, to }
        if (cond !== undefined) e.condition = cond
        if (loopBack) e.loopBack = true
        wf.edges.push(e)
    }

    // TerminalKind:
    //   'none'     – 通常フロー継続
    //   'return'   – return 文で終端 → end ノードへ接続済み
    //   'break'    – break 文で終端 → 最近傍ループの exitId へ接続が必要
    //   'continue' – continue 文で終端 → ループバック先へ接続しない
    type TerminalKind = 'none' | 'return' | 'break' | 'continue'
    type SeqResult = { tail: string; kind: TerminalKind }

    // appendSeq
    //   loopExitId: 現在のスコープで break が飛ぶべき exit ノードのID
    //               ループ外（トップレベル）では null
    const appendSeq = (
        fromId: string,
        stmts: any[],
        firstCond: string | null | undefined,
        baseX: number,
        loopExitId: string | null = null
    ): SeqResult => {
        let tail = fromId; let pendCond: string | null | undefined = firstCond

        for (const s of stmts) {
            if (!s || typeof s !== 'object') continue

            // ── if ──────────────────────────────────────────
            if (s.type === 'if') {
                const decId = addNode('decision', String(s.condition ?? 'if'), baseX)
                addEdge(tail, decId, pendCond); pendCond = undefined
                const savedY = globalY
                const thenStmts: any[] = Array.isArray(s.then) ? s.then : []
                const elseStmts: any[] = Array.isArray(s.else) ? s.else : []

                // then 分岐
                let thenTail: string, thenEndY: number, thenKind: TerminalKind
                if (thenStmts.length > 0) {
                    globalY = savedY
                    const r = appendSeq(decId, thenStmts, 'true', baseX + LANE_W, loopExitId)
                    thenTail = r.tail; thenEndY = globalY; thenKind = r.kind
                } else { thenTail = decId; thenEndY = savedY; thenKind = 'none' }

                // else 分岐
                let elseTail: string, elseEndY: number, elseKind: TerminalKind
                if (elseStmts.length > 0) {
                    globalY = savedY
                    const r = appendSeq(decId, elseStmts, 'false', baseX - LANE_W, loopExitId)
                    elseTail = r.tail; elseEndY = globalY; elseKind = r.kind
                } else { elseTail = decId; elseEndY = savedY; elseKind = 'none' }

                const thenTerminal = thenKind !== 'none'
                const elseTerminal = elseKind !== 'none'

                // ── ケース1: 両分岐が終端 → merge 不要、即 return ──────
                if (thenTerminal && elseTerminal) {
                    globalY = Math.max(thenEndY, elseEndY)
                    return { tail: thenTail, kind: thenKind }
                }

                // ── ケース2: then終端 & else空(elseTail===decId) ─────────
                // merge ノード不要。decId を tail として false エッジを次ノードへ遅延接続
                if (thenTerminal && elseTail === decId) {
                    globalY = Math.max(thenEndY, elseEndY)
                    // pendCond を 'false' にして次ノードへの接続を委ねる
                    tail = decId
                    pendCond = 'false'
                    continue
                }

                // ── ケース3: else終端 & then空(thenTail===decId) ─────────
                if (elseTerminal && thenTail === decId) {
                    globalY = Math.max(thenEndY, elseEndY)
                    tail = decId
                    pendCond = 'true'
                    continue
                }

                // ── ケース4: 片方または両方が非終端 → merge ノードへ収束 ─
                globalY = Math.max(thenEndY, elseEndY)
                const mergeId = addNode('process', '(merge)', baseX)
                if (!thenTerminal) {
                    if (thenTail === decId) addEdge(decId, mergeId, 'true'); else addEdge(thenTail, mergeId)
                }
                if (!elseTerminal) {
                    if (elseTail === decId) addEdge(decId, mergeId, 'false'); else addEdge(elseTail, mergeId)
                }
                tail = mergeId; continue
            }

            // ── while ───────────────────────────────────────
            if (s.type === 'while') {
                const loopId = addNode('loop', String(s.condition ?? 'while'), baseX)
                addEdge(tail, loopId, pendCond); pendCond = undefined
                // exitId を先に予約（y は body 処理後に addNode で確定）
                const exitId = generateId('exit')
                const bodyStmts: any[] = Array.isArray(s.body) ? s.body : []
                if (bodyStmts.length > 0) {
                    // body を右レーンで処理。globalY は body の最大 Y まで進む
                    const savedBodyStart = globalY
                    const r = appendSeq(loopId, bodyStmts, 'true', baseX + BODY_OFFSET, exitId)
                    if (r.kind === 'none') addEdge(r.tail, loopId, undefined, true)
                } else {
                    addEdge(loopId, loopId, 'true')
                }
                // body 処理後の globalY が exit ノードの正しい Y
                wf.nodes.push({ id: exitId, type: 'process', label: '↓ (exit)', x: baseX, y: globalY })
                globalY += STEP_Y
                addEdge(loopId, exitId, 'false')
                tail = exitId; continue
            }

            // ── forEach ─────────────────────────────────────
            if (s.type === 'forEach') {
                const forId = addNode('foreach', `for ${s.variable ?? 'item'} in ${s.collection ?? 'collection'}`, baseX)
                addEdge(tail, forId, pendCond); pendCond = undefined
                const exitId = generateId('exit')
                const bodyStmts: any[] = Array.isArray(s.body) ? s.body : []
                if (bodyStmts.length > 0) {
                    const r = appendSeq(forId, bodyStmts, 'body', baseX + BODY_OFFSET, exitId)
                    if (r.kind === 'none') addEdge(r.tail, forId, undefined, true)
                } else {
                    addEdge(forId, forId, 'body')
                }
                // body 処理後の globalY が exit ノードの正しい Y
                wf.nodes.push({ id: exitId, type: 'process', label: '↓ (exit)', x: baseX, y: globalY })
                globalY += STEP_Y
                addEdge(forId, exitId)
                tail = exitId; continue
            }

            // ── forRange ────────────────────────────────────
            if (s.type === 'forRange') {
                const forId = addNode('forrange', `for ${s.variable ?? 'i'} from ${s.from ?? '0'} to ${s.to ?? 'n'}`, baseX)
                addEdge(tail, forId, pendCond); pendCond = undefined
                const exitId = generateId('exit')
                const bodyStmts: any[] = Array.isArray(s.body) ? s.body : []
                if (bodyStmts.length > 0) {
                    const r = appendSeq(forId, bodyStmts, 'body', baseX + BODY_OFFSET, exitId)
                    if (r.kind === 'none') addEdge(r.tail, forId, undefined, true)
                } else {
                    addEdge(forId, forId, 'body')
                }
                // body 処理後の globalY が exit ノードの正しい Y
                wf.nodes.push({ id: exitId, type: 'process', label: '↓ (exit)', x: baseX, y: globalY })
                globalY += STEP_Y
                addEdge(forId, exitId)
                tail = exitId; continue
            }

            // ── switch ──────────────────────────────────────
            if (s.type === 'switch') {
                const swId = addNode('switch', String(s.expression ?? 'switch'), baseX)
                addEdge(tail, swId, pendCond); pendCond = undefined
                const cases: any[] = Array.isArray(s.cases) ? s.cases : []
                const hasDef = Array.isArray(s.default) && s.default.length > 0
                const total = cases.length + (hasDef ? 1 : 0)
                const caseW = LANE_W * 0.85
                const sx0 = baseX - ((total - 1) / 2) * caseW
                const savedY = globalY
                const caseResults: SeqResult[] = []
                let maxY = savedY
                cases.forEach((c: any, idx: number) => {
                    const cx = sx0 + idx * caseW; const cs: any[] = Array.isArray(c?.body) ? c.body : []
                    globalY = savedY
                    if (cs.length > 0) {
                        caseResults.push(appendSeq(swId, cs, String(c?.value ?? `case${idx}`), cx, loopExitId))
                    } else {
                        const eid = addNode('process', `case ${c?.value ?? idx}`, cx)
                        addEdge(swId, eid, String(c?.value ?? `case${idx}`))
                        caseResults.push({ tail: eid, kind: 'none' })
                    }
                    if (globalY > maxY) maxY = globalY
                })
                if (hasDef) {
                    const dx = sx0 + cases.length * caseW; globalY = savedY
                    caseResults.push(appendSeq(swId, s.default, 'default', dx, loopExitId))
                    if (globalY > maxY) maxY = globalY
                } else {
                    caseResults.push({ tail: swId, kind: 'none' })
                }
                globalY = maxY
                const mergeId = addNode('process', '(switch merge)', baseX)
                for (const cr of caseResults) {
                    if (cr.kind === 'none') {
                        if (cr.tail === swId) addEdge(swId, mergeId, 'default'); else addEdge(cr.tail, mergeId)
                    }
                    // return/break/continue は既に接続済み → merge へ繋がない
                }
                tail = mergeId; continue
            }

            // ── 末端ノード ───────────────────────────────────
            const nt: NodeType = s.type === 'break' ? 'break' : s.type === 'continue' ? 'continue' : 'process'
            const lbl = s.type === 'return' ? `return ${s.value ?? ''}`.trim()
                : s.type === 'action' ? String(s.statement ?? 'action')
                    : s.type === 'break' ? 'break' : s.type === 'continue' ? 'continue' : String(s.type ?? 'step')
            const id = addNode(nt, lbl, baseX)
            addEdge(tail, id, pendCond)
            pendCond = undefined
            tail = id
            if (s.type === 'return') {
                addEdge(id, endId)
                return { tail, kind: 'return' }
            }
            if (s.type === 'break') {
                // break → 最近傍ループの exit ノードへ接続
                if (loopExitId) addEdge(id, loopExitId)
                return { tail, kind: 'break' }
            }
            if (s.type === 'continue') {
                // continue → ループバックは外側が担当（ここでは接続しない）
                return { tail, kind: 'continue' }
            }
        }
        return { tail, kind: 'none' }
    }

    let tail = startId
    for (const v of vars) { const id = addNode('process', `var ${v.name}:${v.type}${v.initialValue ? ` = ${v.initialValue}` : ''}`); addEdge(tail, id); tail = id }
    const bodyResult = appendSeq(tail, body, undefined, 220)
    const endNode = wf.nodes.find(n => n.id === endId); if (endNode) endNode.y = globalY
    // トップレベルが terminal でない場合のみ末尾から end へ接続
    if (bodyResult.kind === 'none') addEdge(bodyResult.tail, endId)
    return wf
}

export function convertToAst(wf: WFWorkflow) {
    const { nodes, edges } = wf; const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const outEdges = new Map<string, WFEdge[]>()
    edges.forEach(e => { if (!outEdges.has(e.from)) outEdges.set(e.from, []); outEdges.get(e.from)!.push(e) })
    const startNode = nodes.find(n => n.type === 'start'); if (!startNode) return { variables: [], body: [] }
    const variables: any[] = []
    nodes.forEach(n => { if (n.type === 'process' && n.label.includes('=')) { const m = n.label.match(/(?:let|var|const)?\s*([a-zA-Z_]\w*)\s*=\s*(.*)/); if (m) variables.push({ name: m[1], type: 'string', initialValue: m[2].trim() }) } })
    function reach(id: string, stop: string | null = null): Set<string> { const s = new Set<string>(); const q = [id]; while (q.length) { const c = q.pop()!; if (!c || c === stop || s.has(c)) continue; s.add(c); (outEdges.get(c) || []).forEach(e => q.push(e.to)) } return s }
    function mp(a?: string, b?: string): string | null { if (!a || !b) return a || b || null; const ra = Array.from(reach(a)), rb = reach(b); for (const id of ra) if (rb.has(id)) return id; return null }
    function walk(id: string | undefined, stop: string | null = null): any[] {
        if (!id || id === stop) return []; const n = nodeMap.get(id); if (!n) return []; const outs = outEdges.get(id) || []
        if (n.type === 'end') return [{ type: 'return', value: (n.label && n.label !== 'End') ? n.label : undefined }]
        if (n.type === 'process' || n.type === 'call') {
            // return ラベルのノードは関数終端 — 後続を walk しない
            if (n.label.startsWith('return')) return [{ type: 'return', value: n.label.replace(/^return\s*/, '') || undefined }]
            return [{ type: 'action', statement: n.label }, ...walk(outs[0]?.to, stop)]
        }
        if (n.type === 'decision') { const te = outs.find(e => String(e.condition).toLowerCase() === 'true'), fe = outs.find(e => String(e.condition).toLowerCase() === 'false'), m = mp(te?.to, fe?.to); const res: any[] = [{ type: 'if', condition: n.label, then: walk(te?.to, m), else: walk(fe?.to, m) || undefined }]; if (m && m !== stop) res.push(...walk(m, stop)); return res }
        if (n.type === 'loop') { const te = outs.find(e => String(e.condition).toLowerCase() === 'true'), fe = outs.find(e => String(e.condition).toLowerCase() === 'false'); const res: any[] = [{ type: 'while', condition: n.label, body: walk(te?.to, id) }]; if (fe?.to && fe.to !== stop) res.push(...walk(fe.to, stop)); return res }
        if (n.type === 'foreach') { const be = outs.find(e => String(e.condition ?? '').toLowerCase() === 'body'), ne = outs.find(e => String(e.condition ?? '').toLowerCase() !== 'body') ?? outs[0]; const m = n.label.match(/^for\s+(\S+)\s+in\s+(.+)$/i); const res: any[] = [{ type: 'forEach', variable: m?.[1] ?? n.label, collection: m?.[2] ?? '', body: walk(be?.to, id) }]; if (ne?.to && ne.to !== stop) res.push(...walk(ne.to, stop)); return res }
        if (n.type === 'forrange') { const be = outs.find(e => String(e.condition ?? '').toLowerCase() === 'body'), ne = outs.find(e => String(e.condition ?? '').toLowerCase() !== 'body') ?? outs[0]; const m = n.label.match(/^for\s+(\S+)\s+from\s+(\S+)\s+to\s+(\S+)$/i); const res: any[] = [{ type: 'forRange', variable: m?.[1] ?? n.label, from: m?.[2] ?? '0', to: m?.[3] ?? '0', body: walk(be?.to, id) }]; if (ne?.to && ne.to !== stop) res.push(...walk(ne.to, stop)); return res }
        if (n.type === 'switch') { const ce = outs.filter(e => String(e.condition ?? '').toLowerCase() !== 'default' && e.condition != null), de = outs.find(e => String(e.condition ?? '').toLowerCase() === 'default'), m = outs.map(e => e.to).filter(Boolean).reduce<string | null>((a, id) => mp(a ?? undefined, id), null); const res: any[] = [{ type: 'switch', expression: n.label, cases: ce.map(e => ({ value: String(e.condition), body: walk(e.to, m ?? undefined) })), default: de ? walk(de.to, m ?? undefined) : undefined }]; if (m && m !== stop) res.push(...walk(m, stop)); return res }
        if (n.type === 'break') return [{ type: 'break' }]   // 後続を walk しない
        if (n.type === 'continue') return [{ type: 'continue' }]   // 後続を walk しない
        if (outs.length > 0) return walk(outs[0].to, stop); return []
    }
    return { variables, body: walk(outEdges.get(startNode.id)?.[0]?.to) }
}

// ── State ────────────────────────────────────────────────────
type WFAction = { type: 'SET_WF'; wf: WFWorkflow } | { type: 'ADD_NODE'; node: WFNode } | { type: 'MOVE_NODE'; id: string; x: number; y: number } | { type: 'RENAME_NODE'; id: string; label: string } | { type: 'SET_NODE_METADATA'; id: string; metadata: WFNode['metadata'] } | { type: 'DEL_NODE'; id: string } | { type: 'ADD_EDGE'; edge: WFEdge } | { type: 'SET_EDGE_MID'; edgeKey: string; mid: { x: number; y: number } } | { type: 'DEL_EDGE'; edgeKey: string }
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

// ── Design tokens ────────────────────────────────────────────
const STYLE: Record<NodeType, { fill: string; stroke: string; text: string }> = {
    start: { fill: '#14532d', stroke: '#4ade80', text: '#bbf7d0' }, end: { fill: '#7f1d1d', stroke: '#f87171', text: '#fecaca' },
    process: { fill: '#1e293b', stroke: '#64748b', text: '#e2e8f0' }, decision: { fill: '#2e1065', stroke: '#c084fc', text: '#f3e8ff' },
    loop: { fill: '#0c2a4a', stroke: '#38bdf8', text: '#e0f2fe' }, call: { fill: '#431407', stroke: '#fb923c', text: '#ffedd5' },
    given: { fill: '#052e16', stroke: '#22c55e', text: '#bbf7d0' }, when: { fill: '#2e1065', stroke: '#a855f7', text: '#f3e8ff' },
    then: { fill: '#0c1a4a', stroke: '#60a5fa', text: '#dbeafe' }, how: { fill: '#0f172a', stroke: '#1d4ed8', text: '#93c5fd' },
    foreach: { fill: '#0d2b2b', stroke: '#2dd4bf', text: '#99f6e4' }, forrange: { fill: '#0a2323', stroke: '#14b8a6', text: '#5eead4' },
    switch: { fill: '#2c1a00', stroke: '#f59e0b', text: '#fde68a' }, break: { fill: '#2d0a0a', stroke: '#f87171', text: '#fecaca' },
    continue: { fill: '#1c0d2b', stroke: '#a78bfa', text: '#ede9fe' },
}
const ACCENT = '#3b82f6', VIEWPORT_CULL_PADDING = 280
const KEYWORD_LABEL: Record<string, string> = { given: 'Given', when: 'When', then: 'Then', how: 'How' }
function stripKeyword(l: string) { return l.replace(/^(Given|When|Then|How|And|But|前提|もし|ならば|かつ|しかし):\s*/i, '') }
function hexPts(w: number, h: number) { const cx = w / 2, cy = h / 2, i = h * 0.28; return [[-cx + i, -cy], [cx - i, -cy], [cx, 0], [cx - i, cy], [-cx + i, cy], [-cx, 0]].map(p => p.join(',')).join(' ') }
function pentPts(w: number, h: number) { const cx = w / 2, cy = h / 2, r = h * 0.32; return [[0, -cy], [cx, -cy + r], [cx, cy], [-cx, cy], [-cx, -cy + r]].map(p => p.join(',')).join(' ') }
function trapPts(w: number, h: number) { const cx = w / 2, cy = h / 2, t = w * 0.18; return [[-cx + t, -cy], [cx - t, -cy], [cx, cy], [-cx, cy]].map(p => p.join(',')).join(' ') }

// ── NodeShape ────────────────────────────────────────────────
interface NodeShapeProps { node: WFNode; isSelected: boolean; onPointerDown: (e: React.PointerEvent, id: string) => void; onHandlePointerDown: (e: React.PointerEvent, node: WFNode) => void; onDoubleClick: (e: React.MouseEvent, node: WFNode) => void; onContextMenu: (e: React.MouseEvent, node: WFNode) => void }
function NodeShape({ node, isSelected, onPointerDown, onHandlePointerDown, onDoubleClick, onContextMenu }: NodeShapeProps) {
    const isG = GHERKIN_KEYWORDS.includes(node.type as any); const { w, h: bH } = nodeSize(node.type); const { h: tH } = isG ? nodeSizeWithMeta(node) : { h: bH }
    const st = STYLE[node.type]; const stroke = isSelected ? ACCENT : st.stroke; const sw = isSelected ? 2.5 : 1.5
    const fid = `f${node.id}`; const bp = { fill: st.fill, stroke, strokeWidth: sw, filter: `url(#${fid})` }
    const wrap = (ch: React.ReactNode) => (
        <g transform={`translate(${node.x},${node.y})`} style={{ cursor: 'move', userSelect: 'none' }} onPointerDown={e => onPointerDown(e, node.id)} onDoubleClick={e => onDoubleClick(e, node)} onContextMenu={e => onContextMenu(e, node)}>
            <defs><filter id={fid} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={isSelected ? '#3b82f650' : '#00000060'} /></filter></defs>
            {ch}
            <circle cx={w / 2 + 9} cy={0} r={5.5} fill={ACCENT} stroke="#0f172a" strokeWidth={1.5} style={{ cursor: 'crosshair' }} onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node) }} />
        </g>
    )
    if (node.type === 'foreach' || node.type === 'forrange') return wrap(<>
        <polygon points={hexPts(w, bH)} {...bp} />
        <text x={w / 2 - 12} y={0} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={st.stroke} pointerEvents="none" opacity={0.7}>↻</text>
        <text x={-w / 2 + 28} y={-bH / 2 + 9} textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight="700" fill={st.stroke} opacity={0.8} fontFamily='"Cascadia Code",monospace' pointerEvents="none">{node.type === 'foreach' ? 'for…in' : 'for…to'}</text>
        <text x={-4} y={2} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={st.text} fontFamily='"Cascadia Code",monospace' pointerEvents="none">{node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}</text>
    </>)
    if (node.type === 'switch') return wrap(<>
        <polygon points={pentPts(w, bH)} {...bp} />
        <text x={0} y={-bH / 2 + bH * 0.22} textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight="700" fill={st.stroke} opacity={0.85} fontFamily='"Cascadia Code",monospace' pointerEvents="none">switch</text>
        <text x={0} y={bH * 0.15} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={st.text} fontFamily='"Cascadia Code",monospace' pointerEvents="none">{node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}</text>
    </>)
    if (node.type === 'break' || node.type === 'continue') return wrap(<>
        <polygon points={trapPts(w, bH)} {...bp} />
        <text x={-w / 2 + 20} y={1} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={st.stroke} pointerEvents="none">{node.type === 'break' ? '⏹' : '⏭'}</text>
        <text x={10} y={1} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={st.text} fontWeight="600" fontFamily='"Cascadia Code",monospace' pointerEvents="none">{node.label}</text>
    </>)
    if (isG) {
        const hs = node.metadata?.howSteps ?? [], wr = node.metadata?.whyReason
        const kw = KEYWORD_LABEL[node.type] ?? node.type, bt = stripKeyword(node.label)
        const hH = hs.length > 0 ? HOW_PADDING + hs.length * HOW_ITEM_H + HOW_PADDING : 0
        return wrap(<>
            <rect x={-w / 2} y={-tH / 2} width={w} height={tH} rx={6} {...bp} />
            <rect x={-w / 2 + 4} y={-tH / 2 + 4} width={34} height={14} rx={3} fill={st.stroke} opacity={0.25} pointerEvents="none" />
            <text x={-w / 2 + 21} y={-tH / 2 + 11} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight="700" fill={st.stroke} fontFamily='"Cascadia Code",monospace' pointerEvents="none">{kw}</text>
            <text x={0} y={-tH / 2 + bH / 2 + 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={st.text} fontFamily='"Cascadia Code",monospace' pointerEvents="none">{bt.length > 20 ? bt.slice(0, 19) + '…' : bt}</text>
            {hs.length > 0 && <g pointerEvents="none">
                <line x1={-w / 2 + 8} y1={-tH / 2 + bH} x2={w / 2 - 8} y2={-tH / 2 + bH} stroke={st.stroke} strokeWidth={0.5} opacity={0.4} />
                <text x={-w / 2 + 8} y={-tH / 2 + bH + HOW_PADDING - 2} fontSize={7} fontWeight="700" fill="#93c5fd" fontFamily='"Cascadia Code",monospace'>How</text>
                {hs.map((st2, i) => <text key={i} x={-w / 2 + 10} y={-tH / 2 + bH + HOW_PADDING + i * HOW_ITEM_H + 10} fontSize={8} fill="#bfdbfe" fontFamily='"Cascadia Code",monospace'>{`${i + 1}. ${st2.length > 17 ? st2.slice(0, 16) + '…' : st2}`}</text>)}
            </g>}
            {wr && <g pointerEvents="none">
                <line x1={-w / 2 + 8} y1={-tH / 2 + bH + hH} x2={w / 2 - 8} y2={-tH / 2 + bH + hH} stroke="#a78bfa" strokeWidth={0.5} opacity={0.4} />
                <text x={-w / 2 + 8} y={-tH / 2 + bH + hH + HOW_ITEM_H / 2 + 2} fontSize={7} fontWeight="700" fill="#a78bfa" fontFamily='"Cascadia Code",monospace'>Why</text>
                <text x={-w / 2 + 28} y={-tH / 2 + bH + hH + HOW_ITEM_H / 2 + 2} fontSize={8} fill="#c4b5fd" fontFamily='"Cascadia Code",monospace'>{wr.length > 15 ? wr.slice(0, 14) + '…' : wr}</text>
            </g>}
        </>)
    }
    let body: React.ReactNode
    if (node.type === 'start' || node.type === 'end') body = <ellipse cx={0} cy={0} rx={w / 2} ry={bH / 2} {...bp} />
    else if (node.type === 'decision') body = <polygon points={`0,${-bH / 2} ${w / 2},0 0,${bH / 2} ${-w / 2},0`} {...bp} />
    else body = <rect x={-w / 2} y={-bH / 2} width={w} height={bH} rx={5} {...bp} />
    return wrap(<>
        {body}
        {node.type === 'loop' && <><path d={`M${-w / 2 + 10},${-bH / 2 + 6} L${-w / 2 + 4},0 L${-w / 2 + 10},${bH / 2 - 6}`} fill="none" stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" /><path d={`M${w / 2 - 10},${-bH / 2 + 6} L${w / 2 - 4},0 L${w / 2 - 10},${bH / 2 - 6}`} fill="none" stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" /></>}
        {node.type === 'call' && <><line x1={-w / 2 + 12} y1={-bH / 2 + 4} x2={-w / 2 + 12} y2={bH / 2 - 4} stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" /><line x1={w / 2 - 12} y1={-bH / 2 + 4} x2={w / 2 - 12} y2={bH / 2 - 4} stroke={st.text} strokeWidth={1.2} opacity={0.5} pointerEvents="none" /></>}
        <text textAnchor="middle" dominantBaseline="central" fill={st.text} fontSize={11} fontFamily='"Cascadia Code","SF Mono","Fira Code",monospace' fontWeight={node.type === 'start' || node.type === 'end' ? '700' : '400'} pointerEvents="none">{node.label.length > 17 ? node.label.slice(0, 16) + '…' : node.label}</text>
    </>)
}

// ── EdgeShape ─────────────────────────────────────────────────
interface EdgeShapeProps { edge: WFEdge; nodeMap: Map<string, WFNode>; isSelected: boolean; onMidPointerDown: (e: React.PointerEvent, edge: WFEdge) => void; onContextMenu: (e: React.MouseEvent, edge: WFEdge) => void }
function EdgeShape({ edge, nodeMap, isSelected, onMidPointerDown, onContextMenu }: EdgeShapeProps) {
    const res = getEdgePoints(edge, nodeMap); if (!res) return null
    const isL = edge.condition != null; const col = isSelected ? ACCENT : isL ? '#a78bfa' : '#64748b'; const dash = isL ? '6 3' : undefined
    if (res.kind === 'loop') {
        const { d, labelPt: lp } = res; return (
            <g onContextMenu={ev => { ev.preventDefault(); onContextMenu(ev, edge) }}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={10} style={{ cursor: 'context-menu' }} />
                <path d={d} fill="none" stroke={col} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dash} markerEnd="url(#wf-arrow)" />
                {isL && <g pointerEvents="none">
                    <rect x={lp.x - 4} y={lp.y - 10} width={68} height={16} rx={3} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={0.8} opacity={0.9} />
                    <text x={lp.x + 30} y={lp.y - 2} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#c4b5fd" fontFamily='"Cascadia Code",monospace'>{String(edge.condition).length > 10 ? String(edge.condition).slice(0, 9) + '…' : String(edge.condition)}</text>
                </g>}
            </g>
        )
    }
    const { pts } = res; const [s, m, e_] = pts; const d = `M${s.x},${s.y} L${m.x},${m.y} L${e_.x},${e_.y}`; const lp = computePolylineMidpoint([s, m, e_])
    return (
        <g onContextMenu={ev => { ev.preventDefault(); onContextMenu(ev, edge) }}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'context-menu' }} />
            <path d={d} fill="none" stroke={col} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dash} markerEnd="url(#wf-arrow)" />
            {isL && <g pointerEvents="none">
                <rect x={lp.x - 54} y={lp.y - 22} width={108} height={16} rx={3} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={0.8} opacity={0.9} />
                <text x={lp.x} y={lp.y - 14} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#c4b5fd" fontFamily='"Cascadia Code",monospace'>{String(edge.condition).length > 18 ? String(edge.condition).slice(0, 17) + '…' : String(edge.condition)}</text>
            </g>}
            <circle cx={m.x} cy={m.y} r={5} fill={isSelected ? ACCENT : '#334155'} stroke="#0f172a" strokeWidth={1.5} style={{ cursor: 'move' }} onPointerDown={ev => { ev.stopPropagation(); onMidPointerDown(ev, edge) }} />
        </g>
    )
}

// ── InlineEditor ─────────────────────────────────────────────
function InlineEditor({ node, svgRef, onCommit, onCancel }: { node: WFNode; svgRef: React.RefObject<SVGSVGElement | null>; onCommit: (v: string) => void; onCancel: () => void }) {
    const [val, setVal] = useState(node.label); const ref = useRef<HTMLInputElement>(null)
    const pos = (() => { const svg = svgRef.current; if (!svg) return { left: 0, top: 0 }; const ctm = svg.getScreenCTM(); if (!ctm) return { left: 0, top: 0 }; const pt = svg.createSVGPoint(); pt.x = node.x; pt.y = node.y; const sp = pt.matrixTransform(ctm); return { left: sp.x - 100, top: sp.y - 14 } })()
    useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
    const ph = node.type === 'foreach' ? 'for item in this.items' : node.type === 'forrange' ? 'for i from 0 to 10' : node.type === 'switch' ? 'this.status' : undefined
    return (<input ref={ref} value={val} placeholder={ph} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onCommit(val.trim() || node.id); if (e.key === 'Escape') onCancel() }} onBlur={() => onCommit(val.trim() || node.id)} style={{ position: 'fixed', left: pos.left, top: pos.top, width: 220, zIndex: 500, background: '#0f172a', color: '#f1f5f9', border: '2px solid #3b82f6', borderRadius: 5, padding: '3px 8px', fontSize: 12, fontFamily: '"Cascadia Code","SF Mono",monospace', outline: 'none' }} />)
}

// ── MiniWorkflowPreview ──────────────────────────────────────
function MiniWorkflowPreview({ title, wf }: { title: string; wf: WFWorkflow }) {
    const W = 360, H = 200
    if (!wf.nodes.length) return <div style={{ border: '1px solid #334155', borderRadius: 6, background: '#0b1220', padding: 10, color: '#64748b', fontSize: 11 }}>{title}: empty</div>
    const xs = wf.nodes.map(n => n.x), ys = wf.nodes.map(n => n.y)
    const mnX = Math.min(...xs), mxX = Math.max(...xs), mnY = Math.min(...ys), mxY = Math.max(...ys)
    const bw = Math.max(1, mxX - mnX + 120), bh = Math.max(1, mxY - mnY + 80)
    const sc = Math.min((W - 20) / bw, (H - 20) / bh)
    const tx = 10 + (W - 20 - bw * sc) / 2 - mnX * sc + 60 * sc, ty = 10 + (H - 20 - bh * sc) / 2 - mnY * sc + 40 * sc
    const pos = (x: number, y: number) => ({ x: x * sc + tx, y: y * sc + ty })
    const map = new Map(wf.nodes.map(n => [n.id, n]))
    return (<div style={{ border: '1px solid #334155', borderRadius: 6, background: '#0b1220', overflow: 'hidden' }}>
        <div style={{ padding: '6px 10px', borderBottom: '1px solid #1f2937', fontSize: 11, color: '#cbd5e1' }}>{title} ({wf.nodes.length} nodes)</div>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            <rect width={W} height={H} fill="#0b1220" />
            {wf.edges.map((e, i) => { const f = map.get(e.from), t = map.get(e.to); if (!f || !t) return null; const a = pos(f.x, f.y), b = pos(t.x, t.y); if (e.from === e.to || e.loopBack) return <path key={i} d={`M${a.x + 8},${a.y - 4} C${a.x + 20},${a.y - 12} ${a.x + 20},${b.y + 12} ${b.x + 8},${b.y + 4}`} fill="none" stroke="#64748b" strokeWidth={1} />; return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#64748b" strokeWidth={1.2} /> })}
            {wf.nodes.map(n => { const p = pos(n.x, n.y); const st = STYLE[n.type]; return (<g key={n.id} transform={`translate(${p.x},${p.y})`}><rect x={-28} y={-10} width={56} height={20} rx={3} fill={st.fill} stroke={st.stroke} strokeWidth={1} /><text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill={st.text} fontSize={8}>{n.label.length > 10 ? `${n.label.slice(0, 9)}…` : n.label}</text></g>) })}
        </svg>
    </div>)
}
// ── Node type meta ───────────────────────────────────────────
const NODE_TYPES: NodeType[] = ['start', 'process', 'decision', 'loop', 'call', 'end']
const GHERKIN_NODE_TYPES: NodeType[] = ['given', 'when', 'then', 'how']
const FLOW_NODE_TYPES: NodeType[] = ['foreach', 'forrange', 'switch', 'break', 'continue']
const NODE_COL: Record<NodeType, string> = { start: '#4ade80', end: '#f87171', process: '#94a3b8', decision: '#c084fc', loop: '#38bdf8', call: '#fb923c', given: '#22c55e', when: '#a855f7', then: '#60a5fa', how: '#1d4ed8', foreach: '#2dd4bf', forrange: '#14b8a6', switch: '#f59e0b', break: '#f87171', continue: '#a78bfa' }
const FLOW_NODE_LABEL: Record<string, string> = { foreach: 'ForEach', forrange: 'ForRange', switch: 'Switch', break: 'Break', continue: 'Continue' }
function autoCondition(fromNode: WFNode, existingOuts: WFEdge[]): string | null | undefined {
    const t = fromNode.type
    if (t === 'decision' || t === 'loop') { const hF = existingOuts.some(e => String(e.condition ?? '').toLowerCase() === 'false'), hT = existingOuts.some(e => String(e.condition ?? '').toLowerCase() === 'true'); if (!hF) return 'false'; if (!hT) return 'true'; return null }
    if (t === 'foreach' || t === 'forrange') { if (!existingOuts.some(e => String(e.condition ?? '').toLowerCase() === 'body')) return 'body'; return undefined }
    if (t === 'switch') { const used = new Set(existingOuts.map(e => String(e.condition ?? ''))); if (!used.has('default')) { const cnt = existingOuts.filter(e => String(e.condition ?? '').startsWith('case')).length; const next = `case${cnt}`; if (!used.has(next)) return next; return 'default' } return null }
    return undefined
}

// ── WorkflowEditorPanel ──────────────────────────────────────
export function WorkflowEditorPanel({ opRef, diagram, service }: WorkflowEditorPanelProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [gherkinWf, dispatchGherkin] = useReducer(wfReducer, { nodes: [], edges: [] })
    const [flowWf, dispatchFlow] = useReducer(wfReducer, { nodes: [], edges: [] })
    const [viewMode, setViewMode] = useState<'both' | 'gherkin' | 'flow'>('both')
    const [bothEditLayer, setBothEditLayer] = useState<'gherkin' | 'flow'>('gherkin')
    const [flowDirty, setFlowDirty] = useState(false)
    const lastWfJson = useRef(''), lastAstJson = useRef(''), currentOpKey = useRef('')
    const opRefRef = useRef(opRef), serviceRef = useRef(service), loadedAstRef = useRef<FlowAst | undefined>(undefined)
    useEffect(() => { opRefRef.current = opRef }, [opRef])
    useEffect(() => { serviceRef.current = service }, [service])

    const loadFromService = useCallback(() => {
        const cur = opRefRef.current; if (!cur) return
        const model = serviceRef.current.getModel()
        let cls = model.findClassById(cur.classId); let op = cls?.operations.find(o => o.id === cur.operationId)
        if (!op) { const m = cur.label.match(/^(.+?)\.(.+?)\(/); if (m) { cls = model.findClassByName(m[1]) ?? undefined; op = cls?.operations.find(o => o.name === m[2]) } }
        if (!op || !cls) return
        const inWf = op.workflow?.nodes?.length ? op.workflow : null; const inWfJ = JSON.stringify(inWf)
        const inAst = (op.workflowAst ?? { variables: [], body: [] }) as FlowAst; const inAstJ = JSON.stringify(inAst)
        if (inWfJ === lastWfJson.current && inAstJ === lastAstJson.current) return
        lastWfJson.current = inWfJ; lastAstJson.current = inAstJ
        loadedAstRef.current = JSON.parse(inAstJ); setFlowDirty(false)
        dispatchGherkin({ type: 'SET_WF', wf: inWf ? JSON.parse(inWfJ) : createEmptyWorkflow() })
        dispatchFlow({ type: 'SET_WF', wf: convertAstToWorkflow(JSON.parse(inAstJ)) })
    }, [])

    useEffect(() => {
        if (!opRef) return
        const key = `${opRef.classId}:${opRef.operationId}`
        if (currentOpKey.current !== key) { currentOpKey.current = key; lastWfJson.current = ''; lastAstJson.current = ''; setViewMode('both'); setBothEditLayer('gherkin') }
        loadFromService()
    }, [opRef, loadFromService])

    useEffect(() => { service.onModelChanged(loadFromService); return () => service.offModelChanged(loadFromService) }, [service, loadFromService])

    const activeLayer: 'gherkin' | 'flow' = viewMode === 'both' ? bothEditLayer : (viewMode === 'flow' ? 'flow' : 'gherkin')
    const wf = activeLayer === 'flow' ? flowWf : gherkinWf
    const dispatch = useCallback((action: WFAction) => {
        if (activeLayer === 'flow') { dispatchFlow(action); if (action.type !== 'SET_WF') setFlowDirty(true); return }
        dispatchGherkin(action)
    }, [activeLayer])
    const nodeMap = useMemo(() => new Map(wf.nodes.map(n => [n.id, n])), [wf.nodes])

    const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 }); const [viewSize, setViewSize] = useState({ width: 0, height: 0 })
    const canvasDrag = useRef<{ ptId: number; sx: number; sy: number; px: number; py: number } | null>(null)

    useEffect(() => {
        const svg = svgRef.current; if (!svg) return
        const sync = () => { const r = svg.getBoundingClientRect(); setViewSize({ width: r.width, height: r.height }) }
        sync(); const obs = new ResizeObserver(sync); obs.observe(svg); return () => obs.disconnect()
    }, [viewMode])

    const clampZ = (z: number) => Math.min(3, Math.max(0.2, z))
    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault(); const svg = svgRef.current; if (!svg) return
        const r = svg.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top; const d = e.deltaY < 0 ? 1.12 : 1 / 1.12
        setZoom(z => { const nz = clampZ(z * d); setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })); return nz })
    }, [])
    const zoomBy = useCallback((f: number) => { setZoom(z => { const nz = clampZ(z * f); const svg = svgRef.current; if (svg) { const { width: W, height: H } = svg.getBoundingClientRect(); setPan(p => ({ x: W / 2 - (W / 2 - p.x) * (nz / z), y: H / 2 - (H / 2 - p.y) * (nz / z) })) } return nz }) }, [])
    const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

    const nodeDrag = useRef<{ id: string; ox: number; oy: number; ptId: number } | null>(null)
    const edgeDrag = useRef<{ from: WFNode; ptId: number; x: number; y: number } | null>(null)
    const midDrag = useRef<{ edge: WFEdge; key: string; ox: number; oy: number; ptId: number } | null>(null)
    const [tempLine, setTempLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
    const [editing, setEditing] = useState<WFNode | null>(null)
    const [selEdge, setSelEdge] = useState<string | null>(null)
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: { label: string; col?: string; fn: () => void }[] } | null>(null)

    const svgPt = useCallback((cx: number, cy: number) => { const svg = svgRef.current!; const r = svg.getBoundingClientRect(); return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom } }, [pan, zoom])

    const onNodePD = useCallback((e: React.PointerEvent, id: string) => {
        if (e.button !== 0 || edgeDrag.current) return; e.preventDefault()
        const n = nodeMap.get(id)!; const p = svgPt(e.clientX, e.clientY)
        nodeDrag.current = { id, ox: p.x - n.x, oy: p.y - n.y, ptId: e.pointerId }; (e.target as Element).setPointerCapture(e.pointerId)
    }, [nodeMap, svgPt])
    const onHandlePD = useCallback((e: React.PointerEvent, node: WFNode) => {
        e.preventDefault(); const p = svgPt(e.clientX, e.clientY)
        edgeDrag.current = { from: node, ptId: e.pointerId, x: p.x, y: p.y }; (e.target as Element).setPointerCapture(e.pointerId)
        setTempLine({ x1: node.x, y1: node.y, x2: p.x, y2: p.y })
    }, [svgPt])
    const onMidPD = useCallback((e: React.PointerEvent, edge: WFEdge) => {
        e.preventDefault(); const res = getEdgePoints(edge, nodeMap); if (!res || res.kind !== 'poly') return
        const [, mid] = res.pts; const p = svgPt(e.clientX, e.clientY)
        midDrag.current = { edge, key: edgeKey(edge), ox: p.x - mid.x, oy: p.y - mid.y, ptId: e.pointerId }; (e.target as Element).setPointerCapture(e.pointerId)
    }, [nodeMap, svgPt])
    const onSvgPM = useCallback((e: React.PointerEvent) => {
        const p = svgPt(e.clientX, e.clientY)
        if (nodeDrag.current && e.pointerId === nodeDrag.current.ptId) { const { id, ox, oy } = nodeDrag.current; dispatch({ type: 'MOVE_NODE', id, x: p.x - ox, y: p.y - oy }); return }
        if (edgeDrag.current && e.pointerId === edgeDrag.current.ptId) { edgeDrag.current.x = p.x; edgeDrag.current.y = p.y; const f = edgeDrag.current.from; setTempLine({ x1: f.x, y1: f.y, x2: p.x, y2: p.y }); return }
        if (midDrag.current && e.pointerId === midDrag.current.ptId) { const { key, ox, oy } = midDrag.current; dispatch({ type: 'SET_EDGE_MID', edgeKey: key, mid: { x: p.x - ox, y: p.y - oy } }); return }
        if (canvasDrag.current && e.pointerId === canvasDrag.current.ptId) { setPan({ x: canvasDrag.current.px + (e.clientX - canvasDrag.current.sx), y: canvasDrag.current.py + (e.clientY - canvasDrag.current.sy) }) }
    }, [svgPt])
    const onSvgPU = useCallback((e: React.PointerEvent) => {
        if (edgeDrag.current && e.pointerId === edgeDrag.current.ptId) {
            const p = svgPt(e.clientX, e.clientY); const from = edgeDrag.current.from
            const target = wf.nodes.find(n => { if (n.id === from.id) return false; const { w, h } = nodeSize(n.type); return Math.abs(p.x - n.x) <= w / 2 + 4 && Math.abs(p.y - n.y) <= h / 2 + 4 })
            if (target) { const ne: WFEdge = { from: from.id, to: target.id }; const cond = autoCondition(from, wf.edges.filter(ex => ex.from === from.id)); if (cond !== undefined) ne.condition = cond; dispatch({ type: 'ADD_EDGE', edge: ne }) }
            edgeDrag.current = null; setTempLine(null); return
        }
        if (nodeDrag.current && e.pointerId === nodeDrag.current.ptId) nodeDrag.current = null
        if (midDrag.current && e.pointerId === midDrag.current.ptId) midDrag.current = null
        if (canvasDrag.current && e.pointerId === canvasDrag.current.ptId) canvasDrag.current = null
    }, [svgPt, wf.nodes, wf.edges])

    const addNode = useCallback((type: NodeType, cx?: number, cy?: number) => {
        const svg = svgRef.current; if (!svg) return
        let p: { x: number; y: number }
        if (cx !== undefined && cy !== undefined) { p = svgPt(cx, cy) } else { const r = svg.getBoundingClientRect(); p = svgPt(r.left + r.width / 2 + (Math.random() - 0.5) * 120, r.top + r.height / 2 + (Math.random() - 0.5) * 80) }
        const lbl = type === 'foreach' ? 'for item in collection' : type === 'forrange' ? 'for i from 0 to n' : type === 'switch' ? 'this.status' : capitalize(type)
        dispatch({ type: 'ADD_NODE', node: { id: generateId(type), type, label: lbl, x: p.x, y: p.y } })
    }, [svgPt])

    const onNodeCtx = useCallback((e: React.MouseEvent, node: WFNode) => {
        e.preventDefault(); e.stopPropagation()
        const isW = node.label.startsWith('When'), isT = node.label.startsWith('Then')
        setCtxMenu({
            x: e.clientX, y: e.clientY, items: [
                { label: 'Edit label', fn: () => setEditing(node) },
                ...(isW ? [{ label: node.metadata?.howSteps?.length ? `Edit How (${node.metadata.howSteps.length}件)` : 'Add How（実装順指針）', col: '#93c5fd', fn: () => { const c = node.metadata?.howSteps?.join('\n') ?? ''; const i = prompt('実装順指針を1行ずつ入力してください:', c); if (i === null) return; dispatch({ type: 'SET_NODE_METADATA', id: node.id, metadata: { ...node.metadata, howSteps: i.split('\n').map(s => s.trim()).filter(Boolean) } }) } }] : []),
                ...((isW || isT) ? [{ label: node.metadata?.whyReason ? 'Edit Why（設計意図）' : 'Add Why（設計意図）', col: '#c4b5fd', fn: () => { const c = node.metadata?.whyReason ?? ''; const i = prompt('設計意図を入力してください:', c); if (i === null) return; dispatch({ type: 'SET_NODE_METADATA', id: node.id, metadata: { ...node.metadata, whyReason: i?.trim() || undefined } }) } }] : []),
                ...[...NODE_TYPES, ...FLOW_NODE_TYPES].map(t => ({
                    label: `Add ${capitalize(t)} →`, col: NODE_COL[t], fn: () => {
                        const id = generateId(t); const { w } = nodeSize(node.type)
                        const lbl = t === 'foreach' ? 'for item in collection' : t === 'forrange' ? 'for i from 0 to n' : t === 'switch' ? 'this.status' : capitalize(t)
                        dispatch({ type: 'ADD_NODE', node: { id, type: t, label: lbl, x: node.x + w + 60, y: node.y } })
                        const ne: WFEdge = { from: node.id, to: id }; const cond = autoCondition(node, wf.edges.filter(ex => ex.from === node.id)); if (cond !== undefined) ne.condition = cond; dispatch({ type: 'ADD_EDGE', edge: ne })
                    }
                })),
                { label: 'Delete node', col: '#f87171', fn: () => dispatch({ type: 'DEL_NODE', id: node.id }) },
            ]
        })
    }, [wf.edges])
    const onEdgeCtx = useCallback((e: React.MouseEvent, edge: WFEdge) => {
        e.preventDefault(); e.stopPropagation(); const k = edgeKey(edge)
        setCtxMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Delete edge', col: '#f87171', fn: () => { dispatch({ type: 'DEL_EDGE', edgeKey: k }); setSelEdge(null) } }] })
    }, [])
    const onSvgCtx = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setCtxMenu({
            x: e.clientX, y: e.clientY, items: [
                ...NODE_TYPES.map(t => ({ label: `Add ${capitalize(t)}`, col: NODE_COL[t], fn: () => addNode(t, e.clientX, e.clientY) })),
                { label: '─ Flow control ─', col: '#475569', fn: () => { } },
                ...FLOW_NODE_TYPES.map(t => ({ label: `Add ${FLOW_NODE_LABEL[t] ?? capitalize(t)}`, col: NODE_COL[t], fn: () => addNode(t, e.clientX, e.clientY) })),
            ]
        })
    }, [addNode])
    const onSvgPD = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return; if (nodeDrag.current || edgeDrag.current) return
        const tag = (e.target as SVGElement).tagName.toLowerCase()
        if (!['svg', 'rect', 'circle', 'pattern'].includes(tag)) return
        canvasDrag.current = { ptId: e.pointerId, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }; (e.currentTarget as Element).setPointerCapture(e.pointerId)
    }, [pan])

    useEffect(() => { if (!ctxMenu) return; const h = () => setCtxMenu(null); window.addEventListener('pointerdown', h); return () => window.removeEventListener('pointerdown', h) }, [ctxMenu])

    const save = useCallback(() => {
        if (!opRef) return
        if (!opRef.classId || !opRef.operationId) { console.error('[WorkflowEditorPanel] save: missing ids', opRef); return }
        let ast: FlowAst | ReturnType<typeof convertToAst> | undefined = loadedAstRef.current
        if (flowDirty || !ast) { try { ast = convertToAst(flowWf) } catch (e) { console.error('[WorkflowEditorPanel] AST conversion failed', e) } }
        const wfCopy = JSON.parse(JSON.stringify(gherkinWf))
        try {
            service.applyUpdateOperationWorkflow({ classId: opRef.classId, operationId: opRef.operationId, workflow: wfCopy, workflowAst: ast })
            lastWfJson.current = JSON.stringify(wfCopy); lastAstJson.current = JSON.stringify(ast ?? { variables: [], body: [] })
            loadedAstRef.current = JSON.parse(lastAstJson.current); setFlowDirty(false)
        } catch (e) { console.error('[WorkflowEditorPanel] applyUpdateOperationWorkflow failed', e) }
    }, [opRef, gherkinWf, flowWf, flowDirty, service])

    const reset = useCallback(() => { dispatch({ type: 'SET_WF', wf: createEmptyWorkflow() }); if (activeLayer === 'flow') setFlowDirty(true) }, [dispatch, activeLayer])

    const worldViewport = useMemo(() => createWorldViewport(viewSize.width, viewSize.height, zoom, pan, VIEWPORT_CULL_PADDING), [viewSize.width, viewSize.height, zoom, pan])
    const visibleNodeIds = useMemo(() => { const ids = new Set<string>(); for (const n of wf.nodes) { const { w, h } = nodeSizeWithMeta(n); if (rectIntersectsViewport(n.x - w / 2, n.y - h / 2, w, h, worldViewport)) ids.add(n.id) } return ids }, [wf.nodes, worldViewport])
    const visibleNodes = useMemo(() => wf.nodes.filter(n => visibleNodeIds.has(n.id)), [wf.nodes, visibleNodeIds])
    const visibleEdges = useMemo(() => wf.edges.filter(edge => {
        if (edge.from === edge.to) return visibleNodeIds.has(edge.from)
        const res = getEdgePoints(edge, nodeMap); if (!res) return false
        if (res.kind !== 'poly') return visibleNodeIds.has(edge.from)
        if (visibleNodeIds.has(edge.from) || visibleNodeIds.has(edge.to)) return true
        return polylineIntersectsViewport(res.pts, worldViewport)
    }), [wf.edges, nodeMap, visibleNodeIds, worldViewport])

    const otherWf = activeLayer === 'flow' ? gherkinWf : flowWf

    const svgContent = (
        <>
            <defs>
                <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z" fill="#64748b" /></marker>
                <pattern id="wf-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x % 28} ${pan.y % 28}) scale(${zoom})`}>
                    <circle cx="0" cy="0" r="0.8" fill="#1e293b" /><circle cx="28" cy="0" r="0.8" fill="#1e293b" /><circle cx="0" cy="28" r="0.8" fill="#1e293b" /><circle cx="28" cy="28" r="0.8" fill="#1e293b" />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#wf-grid)" />
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {visibleEdges.map((edge, i) => <EdgeShape key={`${edgeKey(edge)}-${i}`} edge={edge} nodeMap={nodeMap} isSelected={selEdge === edgeKey(edge)} onMidPointerDown={onMidPD} onContextMenu={onEdgeCtx} />)}
                {visibleNodes.map(node => <NodeShape key={node.id} node={node} isSelected={false} onPointerDown={onNodePD} onHandlePointerDown={onHandlePD} onDoubleClick={(e, n) => { e.stopPropagation(); setEditing(n) }} onContextMenu={onNodeCtx} />)}
                {tempLine && <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2} stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4" markerEnd="url(#wf-arrow)" pointerEvents="none" />}
            </g>
        </>
    )
    const svgProps = { ref: svgRef, style: { width: '100%', height: '100%', display: 'block' as const, cursor: canvasDrag.current ? 'grabbing' : 'grab' }, onPointerMove: onSvgPM, onPointerUp: onSvgPU, onPointerCancel: onSvgPU, onPointerDown: onSvgPD, onContextMenu: onSvgCtx, onWheel, onClick: () => { setSelEdge(null); setCtxMenu(null) } }

    return (
        <div className="relative flex flex-col h-full w-full overflow-hidden" style={{ background: '#0f172a', fontFamily: '"Cascadia Code","SF Mono","Fira Code",monospace' }}>
            {/* Toolbar */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 shrink-0 flex-wrap" style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, padding: '2px 8px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={opRef?.label ?? '—'}>{opRef ? opRef.label : '— 未選択 —'}</span>
                <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />
                {(['both', 'gherkin', 'flow'] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} disabled={!opRef} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${viewMode === mode ? '#60a5fa' : '#334155'}`, color: viewMode === mode ? '#dbeafe' : '#94a3b8', background: viewMode === mode ? '#1e3a8a' : '#0f172a', fontSize: 11, cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4 }}>
                        {mode === 'both' ? 'Both' : mode === 'gherkin' ? 'Gherkin' : 'Flow'}
                    </button>
                ))}
                {opRef && <>
                    <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />
                    {viewMode === 'both' && <>
                        <button onClick={() => setBothEditLayer('gherkin')} style={{ height: 26, padding: '0 8px', borderRadius: 4, border: `1px solid ${activeLayer === 'gherkin' ? '#34d399' : '#334155'}`, color: activeLayer === 'gherkin' ? '#d1fae5' : '#94a3b8', background: activeLayer === 'gherkin' ? '#064e3b' : '#0f172a', fontSize: 11, cursor: 'pointer' }}>Edit:Gherkin</button>
                        <button onClick={() => setBothEditLayer('flow')} style={{ height: 26, padding: '0 8px', borderRadius: 4, border: `1px solid ${activeLayer === 'flow' ? '#f59e0b' : '#334155'}`, color: activeLayer === 'flow' ? '#fef3c7' : '#94a3b8', background: activeLayer === 'flow' ? '#78350f' : '#0f172a', fontSize: 11, cursor: 'pointer' }}>Edit:Flow{flowDirty ? ' *' : ''}</button>
                    </>}
                    {activeLayer === 'gherkin' && NODE_TYPES.map(t => <button key={t} onClick={() => addNode(t)} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${NODE_COL[t]}`, color: NODE_COL[t], background: `${NODE_COL[t]}18`, fontSize: 11, cursor: 'pointer' }}>+ {capitalize(t)}</button>)}
                    {activeLayer === 'gherkin' && GHERKIN_NODE_TYPES.map(t => <button key={t} onClick={() => addNode(t)} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${NODE_COL[t]}`, color: NODE_COL[t], background: `${NODE_COL[t]}18`, fontSize: 11, cursor: 'pointer' }}>+ {KEYWORD_LABEL[t]}</button>)}
                    {activeLayer === 'flow' && FLOW_NODE_TYPES.map(t => <button key={t} onClick={() => addNode(t)} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: `1px solid ${NODE_COL[t]}`, color: NODE_COL[t], background: `${NODE_COL[t]}18`, fontSize: 11, cursor: 'pointer' }}>+ {FLOW_NODE_LABEL[t]}</button>)}
                </>}
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button onClick={() => zoomBy(1 / 1.25)} style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #334155', color: '#94a3b8', background: 'transparent', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>−</button>
                    <button onClick={resetView} style={{ height: 26, padding: '0 8px', borderRadius: 4, border: '1px solid #334155', color: '#64748b', background: 'transparent', fontSize: 10, cursor: 'pointer', minWidth: 44, fontFamily: 'inherit' }}>{Math.round(zoom * 100)}%</button>
                    <button onClick={() => zoomBy(1.25)} style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #334155', color: '#94a3b8', background: 'transparent', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>＋</button>
                </div>
                <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />
                <button onClick={reset} disabled={!opRef} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: '1px solid #475569', color: '#94a3b8', background: 'transparent', fontSize: 11, cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.4 }}>Reset</button>
                <button onClick={save} disabled={!opRef} style={{ height: 26, padding: '0 12px', borderRadius: 4, background: opRef ? '#1d4ed8' : '#1e3a5f', color: '#bfdbfe', border: '1px solid #2563eb', fontSize: 11, cursor: opRef ? 'pointer' : 'not-allowed', opacity: opRef ? 1 : 0.5 }}>Save</button>
            </div>
            {/* Canvas */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
                {!opRef && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#475569', zIndex: 10, pointerEvents: 'none' }}><p style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>クラス図のメソッドをクリックして<br />ワークフロー図を開いてください</p></div>}
                {viewMode === 'both' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12, height: '100%', boxSizing: 'border-box' }}>
                        <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden', borderRadius: 6, border: '1px solid #334155' }}><svg {...svgProps}>{svgContent}</svg></div>
                        <div style={{ minHeight: 0, overflow: 'auto' }}><MiniWorkflowPreview title={activeLayer === 'flow' ? 'Gherkin Layer' : `Flow Layer${flowDirty ? ' *' : ''}`} wf={otherWf} /></div>
                    </div>
                ) : (<svg {...svgProps}>{svgContent}</svg>)}
            </div>
            {editing && <InlineEditor node={editing} svgRef={svgRef} onCommit={v => { dispatch({ type: 'RENAME_NODE', id: editing.id, label: v }); setEditing(null) }} onCancel={() => setEditing(null)} />}
            {ctxMenu && (
                <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, boxShadow: '0 8px 24px #00000070', padding: '4px 0', minWidth: 192, zIndex: 400 }} onPointerDown={e => e.stopPropagation()}>
                    {ctxMenu.items.map((item, i) => <button key={i} onClick={() => { item.fn(); setCtxMenu(null) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 14px', background: 'transparent', border: 'none', fontSize: 12, color: item.col ?? '#e2e8f0', cursor: 'pointer', fontFamily: 'inherit' }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{item.label}</button>)}
                </div>
            )}
            <div style={{ padding: '3px 12px', borderTop: '1px solid #1e293b', background: '#080f1a', fontSize: 10, color: '#334155', display: 'flex', gap: 16, flexShrink: 0 }}>
                <span>背景ドラッグ: 移動</span><span>スクロール: ズーム</span><span>右クリック: ノード追加/削除</span><span>●ドラッグ: エッジ接続</span><span>ダブルクリック: ラベル編集</span>
            </div>
        </div>
    )
}