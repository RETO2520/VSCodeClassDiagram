/**
 * WorkflowLinter.ts
 *
 * シナリオ順序の静的解析モジュール。
 *
 * フロントエンド (WebView) とホスト (Node.js拡張) の両方から使えるよう
 * Node.js 固有 API・vscode モジュールへの依存を一切持たない純粋関数として実装。
 *
 * ホスト側は CodeGenerator.ts の lintWorkflow を引き続き使用できる。
 * フロントエンド側はこのファイルを import する。
 *
 * Usage:
 *   import { lintWorkflow } from '@/lib/WorkflowLinter'
 *   import type { LintWarning } from '@/lib/WorkflowLinter'
 */

// ============================================================
// 型定義（CodeGenerator.ts の IWorkflowModel/IWorkflowEdge と同構造）
// ============================================================

/** ワークフローのノード */
export interface WFLintNode {
    id: string;
    /** 'start' | 'end' | 'process' | 'decision' | 'loop' | 'call' */
    type: string;
    label: string;
}

/** ワークフローのエッジ */
export interface WFLintEdge {
    from: string;
    to: string;
    /** シナリオ名 (startノードからのエッジに付く) */
    condition?: string | null;
    /** src: アノテーションによるトレーサビリティ参照 */
    srcs?: { label: string; url: string }[];
}

/** lintWorkflow に渡すワークフロー（最小構造） */
export interface WFLintWorkflow {
    nodes: WFLintNode[];
    edges: WFLintEdge[];
}

// ============================================================
// 警告型
// ============================================================

export interface LintWarning {
    /** 警告の種別 */
    code: 'GUARD_LAST' | 'ERROR_BEFORE_SUCCESS' | 'MULTIPLE_SUCCESS';
    /** 人間向けメッセージ */
    message: string;
    /** 対象シナリオ名 */
    scenarioName: string;
    /** 推奨するシナリオ順序 (あれば) */
    suggestedOrder?: string[];
}

// ============================================================
// キーワード分類
// ============================================================

/** ガード節キーワード（null・空・未入力・不正など） */
const GUARD_KEYWORDS = [
    'null', 'nil', '空', '未入力', 'empty', '空欄', 'なし', 'ない',
    '不正', 'invalid', 'missing', '未定義', 'undefined', '0件', '存在しない',
]

/** 例外/失敗系キーワード */
const ERROR_KEYWORDS = [
    'エラー', '失敗', '間違い', '不一致', 'error', 'fail', 'wrong',
    'invalid', 'exception', '拒否', 'denied', '異常',
]

/** 正常/成功系キーワード */
const SUCCESS_KEYWORDS = [
    '成功', '完了', '正常', 'success', 'ok', 'valid', 'complete', '許可', '認証',
]

type ScenarioKind = 'guard' | 'error' | 'success' | 'unknown'

function classifyScenario(name: string, steps: string[]): ScenarioKind {
    const text = [name, ...steps].join(' ').toLowerCase()
    if (GUARD_KEYWORDS.some(k => text.includes(k))) return 'guard'
    if (ERROR_KEYWORDS.some(k => text.includes(k))) return 'error'
    if (SUCCESS_KEYWORDS.some(k => text.includes(k))) return 'success'
    return 'unknown'
}

// ============================================================
// lintWorkflow
// ============================================================

/**
 * シナリオ順序を静的解析して警告を返す。
 *
 * 検出パターン:
 *   GUARD_LAST          — ガード節（null/空/未入力系）が先頭以外にある
 *   ERROR_BEFORE_SUCCESS — 失敗系シナリオが成功系より前にある
 *   MULTIPLE_SUCCESS    — 成功系シナリオが2本以上ある
 *
 * @param workflow  解析対象のワークフロー
 * @param opName    メッセージ用の操作名（例: "User.login()"）
 */
export function lintWorkflow(workflow: WFLintWorkflow, opName: string): LintWarning[] {
    const warnings: LintWarning[] = []
    const startNode = workflow.nodes.find(n => n.type === 'start')
    if (!startNode) return warnings

    // start から出るエッジ = シナリオ分岐
    const scenarioEdges = workflow.edges.filter(e => e.from === startNode.id)
    if (scenarioEdges.length < 2) return warnings  // 1本以下は順序問題なし

    // 各シナリオのステップラベルを収集するためのマップ
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]))
    const outEdges = new Map<string, WFLintEdge[]>()
    for (const e of workflow.edges) {
        if (!outEdges.has(e.from)) outEdges.set(e.from, [])
        outEdges.get(e.from)!.push(e)
    }

    type ScenarioInfo = { name: string; kind: ScenarioKind; index: number }

    const scenarios: ScenarioInfo[] = scenarioEdges.map((edge, idx) => {
        const name = edge.condition ?? `シナリオ${idx + 1}`

        // シナリオのステップラベルを順に収集
        const stepLabels: string[] = []
        const visited = new Set<string>()
        let cur: string | null = edge.to
        while (cur) {
            if (visited.has(cur)) break
            visited.add(cur)
            const node = nodeMap.get(cur)
            if (!node) break
            if (node.type !== 'start' && node.type !== 'end') stepLabels.push(node.label)
            const nexts: WFLintEdge[] = outEdges.get(cur) ?? []
            cur = nexts.length > 0 ? nexts[0].to : null
        }

        return { name, kind: classifyScenario(name, stepLabels), index: idx }
    })

    // ── 検出1: ガード節が先頭以外にある ─────────────────────
    // 推奨: ガード節は先頭に置く（早期 return の前提）
    const guardsNotFirst = scenarios.filter(s => s.kind === 'guard' && s.index > 0)
    for (const g of guardsNotFirst) {
        const suggested = [
            ...scenarios.filter(s => s.kind === 'guard').map(s => s.name),
            ...scenarios.filter(s => s.kind === 'error').map(s => s.name),
            ...scenarios.filter(s => s.kind === 'success' || s.kind === 'unknown').map(s => s.name),
        ]
        warnings.push({
            code: 'GUARD_LAST',
            message: `[${opName}] "${g.name}" はガード節と推定されます。先頭に移動を検討してください。`,
            scenarioName: g.name,
            suggestedOrder: suggested,
        })
    }

    // ── 検出2: 失敗系が成功系より前にある ───────────────────
    const firstSuccessIdx = scenarios.find(s => s.kind === 'success')?.index ?? Infinity
    const errorsBeforeSuccess = scenarios.filter(
        s => s.kind === 'error' && s.index < firstSuccessIdx
    )
    if (errorsBeforeSuccess.length > 0 && firstSuccessIdx !== Infinity) {
        for (const e of errorsBeforeSuccess) {
            warnings.push({
                code: 'ERROR_BEFORE_SUCCESS',
                message: `[${opName}] "${e.name}" (失敗系) が成功系シナリオより前にあります。可読性のため成功系を先に書くことを検討してください。`,
                scenarioName: e.name,
            })
        }
    }

    // ── 検出3: 成功系が複数ある ──────────────────────────────
    const successScenarios = scenarios.filter(s => s.kind === 'success')
    if (successScenarios.length > 1) {
        warnings.push({
            code: 'MULTIPLE_SUCCESS',
            message: `[${opName}] 成功系シナリオが ${successScenarios.length} 本あります (${successScenarios.map(s => `"${s.name}"`).join(', ')})。設計の曖昧さがないか確認してください。`,
            scenarioName: successScenarios.map(s => s.name).join(', '),
        })
    }

    return warnings
}