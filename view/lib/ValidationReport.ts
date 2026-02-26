/**
 * ValidationReport.ts
 *
 * DSL仕様の品質統計・Validationレポートを生成するモジュール。
 * MarkdownGenerator.ts と同じ MarkdownInput を受け取り、Markdown文字列を返す。
 *
 * 検出項目:
 *   - needsなしフィールド（設計意図未記載）
 *   - How/Whyなしのシナリオステップ（When/Then）
 *   - Scenarioが0件のメソッド
 *   - 循環依存・孤立クラス
 *   - クラスごとのメンバ数・操作数のばらつき
 *   - エンドポイントのneedsなし
 *
 * Usage:
 *   import { generateValidationReport } from '@/lib/ValidationReport'
 */

import type {
    ClassInfo,
    ClassOperation,
    ClassMember,
    Relationship,
    ParsedEndpoint,
} from './class-diagram-types'

// ============================================================
// Public API
// ============================================================

export interface ValidationInput {
    classes: ClassInfo[]
    relationships: Relationship[]
    endpoints?: ParsedEndpoint[]
}

export interface ValidationIssue {
    severity: 'error' | 'warning' | 'info'
    category: string
    target: string      // "ClassName" / "ClassName.methodName" / "GET /path"
    message: string
}

export interface ValidationStats {
    totalClasses: number
    totalMembers: number
    totalOperations: number
    totalScenarios: number
    totalEndpoints: number
    needsCoverage: number       // needsあり / 全フィールド（%）
    scenarioCoverage: number    // Scenarioありメソッド / 全メソッド（%）
    howCoverage: number         // Howあり When / 全When（%）
    whyCoverage: number         // Whyあり Then / 全Then（%）
    issues: ValidationIssue[]
}

/**
 * Markdown形式のValidationレポートを生成する。
 */
export function generateValidationReport(input: ValidationInput): string {
    const stats = analyze(input)
    return renderReport(stats, input)
}

/**
 * 統計データだけ取得したい場合に使用。
 */
export function analyzeValidation(input: ValidationInput): ValidationStats {
    return analyze(input)
}

// ============================================================
// Analysis
// ============================================================

function analyze(input: ValidationInput): ValidationStats {
    const { classes, relationships, endpoints = [] } = input
    const issues: ValidationIssue[] = []

    // ---- 基本カウント ----
    let totalMembers = 0
    let totalOperations = 0
    let totalScenarios = 0
    let membersWithNeeds = 0
    let whenNodes = 0
    let whenWithHow = 0
    let thenNodes = 0
    let thenWithWhy = 0
    let operationsWithScenario = 0

    // ---- クラスごとの分析 ----
    const memberCounts: number[] = []
    const opCounts: number[] = []

    for (const cls of classes) {
        totalMembers += cls.members.length
        totalOperations += cls.operations.length
        memberCounts.push(cls.members.length)
        opCounts.push(cls.operations.length)

        // needs未記載フィールドの検出
        for (const m of cls.members) {
            if (!isPrimitiveType(m.type) && !m.needs) {
                issues.push({
                    severity: 'warning',
                    category: 'needs未記載',
                    target: `${cls.name}.${m.name}`,
                    message: `フィールド \`${m.name}: ${m.type}\` に needs 宣言がありません（設計意図未記載）`,
                })
            } else if (m.needs) {
                membersWithNeeds++
            }
        }

        // メソッドごとのScenario/How/Why分析
        for (const op of cls.operations) {
            const scenarios = extractScenarios(op)
            totalScenarios += scenarios.length

            // Scenario0件
            if (scenarios.length === 0 && !op.isAbstract) {
                issues.push({
                    severity: 'info',
                    category: 'Scenario未定義',
                    target: `${cls.name}.${op.name}`,
                    message: `メソッド \`${op.name}\` にScenarioがありません`,
                })
            } else if (scenarios.length > 0) {
                operationsWithScenario++
            }

            // When/Thenノードの How/Why カバレッジ
            if (op.workflow) {
                for (const node of op.workflow.nodes) {
                    if (node.type === 'when') {
                        whenNodes++
                        if (node.metadata?.howSteps && node.metadata.howSteps.length > 0) {
                            whenWithHow++
                        } else {
                            issues.push({
                                severity: 'info',
                                category: 'How未記載',
                                target: `${cls.name}.${op.name}`,
                                message: `Whenステップ「${stripKeyword(node.label)}」にHow（実装指針）がありません`,
                            })
                        }
                    }
                    if (node.type === 'then') {
                        thenNodes++
                        if (node.metadata?.whyReason) {
                            thenWithWhy++
                        } else {
                            issues.push({
                                severity: 'info',
                                category: 'Why未記載',
                                target: `${cls.name}.${op.name}`,
                                message: `Thenステップ「${stripKeyword(node.label)}」にWhy（設計意図）がありません`,
                            })
                        }
                    }
                }
            }
        }
    }

    // ---- 循環依存の検出 ----
    const cyclePaths = detectCycles(classes, relationships)
    for (const cycle of cyclePaths) {
        issues.push({
            severity: 'error',
            category: '循環依存',
            target: cycle.join(' → '),
            message: `循環依存が検出されました: ${cycle.join(' → ')}`,
        })
    }

    // ---- 孤立クラスの検出 ----
    const connectedIds = new Set<string>()
    for (const rel of relationships) {
        connectedIds.add(rel.sourceId)
        connectedIds.add(rel.targetId)
    }
    for (const cls of classes) {
        if (!connectedIds.has(cls.id) && cls.kind !== 'struct') {
            issues.push({
                severity: 'info',
                category: '孤立クラス',
                target: cls.name,
                message: `クラス \`${cls.name}\` は他のクラスとリレーションシップがありません`,
            })
        }
    }

    // ---- クラスごとのばらつき ----
    if (classes.length >= 3) {
        const memberOutliers = detectOutliers(classes, memberCounts, 'members')
        for (const { cls, value, mean, sigma } of memberOutliers) {
            issues.push({
                severity: 'warning',
                category: 'ばらつき（メンバ数）',
                target: cls.name,
                message: `メンバ数 ${value} が平均 ${mean.toFixed(1)} から ${sigma.toFixed(1)}σ 離れています（肥大化または空クラスの疑い）`,
            })
        }
        const opOutliers = detectOutliers(classes, opCounts, 'operations')
        for (const { cls, value, mean, sigma } of opOutliers) {
            issues.push({
                severity: 'warning',
                category: 'ばらつき（操作数）',
                target: cls.name,
                message: `操作数 ${value} が平均 ${mean.toFixed(1)} から ${sigma.toFixed(1)}σ 離れています（神クラスまたは空クラスの疑い）`,
            })
        }
    }

    // ---- エンドポイント分析 ----
    for (const ep of endpoints) {
        if (!ep.needs) {
            issues.push({
                severity: 'warning',
                category: 'Endpointのneeds未記載',
                target: `${ep.method} ${ep.path}`,
                message: `エンドポイント \`${ep.method} ${ep.path}\` にneeds宣言がありません（依存するドメイン操作が不明）`,
            })
        }
        for (const scenario of ep.scenarios) {
            const hasHow = scenario.steps.some(s => s.keyword === 'How')
            const hasWhy = scenario.steps.some(s => s.keyword === 'Why')
            if (!hasHow) {
                issues.push({
                    severity: 'info',
                    category: 'How未記載',
                    target: `${ep.method} ${ep.path} / ${scenario.name}`,
                    message: `Scenario「${scenario.name}」にHow（実装指針）がありません`,
                })
            }
            if (!hasWhy) {
                issues.push({
                    severity: 'info',
                    category: 'Why未記載',
                    target: `${ep.method} ${ep.path} / ${scenario.name}`,
                    message: `Scenario「${scenario.name}」にWhy（設計意図）がありません`,
                })
            }
        }
    }

    // ---- カバレッジ計算 ----
    const nonPrimitiveMembers = classes.reduce(
        (acc, cls) => acc + cls.members.filter(m => !isPrimitiveType(m.type)).length, 0
    )

    return {
        totalClasses: classes.length,
        totalMembers,
        totalOperations,
        totalScenarios,
        totalEndpoints: endpoints.length,
        needsCoverage: nonPrimitiveMembers > 0
            ? Math.min(100, Math.round(membersWithNeeds / nonPrimitiveMembers * 100)) : 100,
        scenarioCoverage: totalOperations > 0
            ? Math.min(100, Math.round(operationsWithScenario / totalOperations * 100)) : 100,
        howCoverage: whenNodes > 0
            ? Math.min(100, Math.round(whenWithHow / whenNodes * 100)) : 100,
        whyCoverage: thenNodes > 0
            ? Math.min(100, Math.round(thenWithWhy / thenNodes * 100)) : 100,
        issues,
    }
}

// ============================================================
// Cycle Detection (DFS)
// ============================================================

function detectCycles(classes: ClassInfo[], relationships: Relationship[]): string[][] {
    const idToName = new Map(classes.map(c => [c.id, c.name]))

    // 継承・実装・コンポジション・集約のみ対象（依存は除く）
    const CYCLE_TYPES = new Set(['generalization', 'realization', 'composition', 'aggregation'])
    const adj = new Map<string, string[]>()
    for (const cls of classes) adj.set(cls.id, [])
    for (const rel of relationships) {
        if (CYCLE_TYPES.has(rel.type)) {
            adj.get(rel.sourceId)?.push(rel.targetId)
        }
    }

    const visited = new Set<string>()
    const recStack = new Set<string>()
    const cycles: string[][] = []

    function dfs(id: string, path: string[]): void {
        visited.add(id)
        recStack.add(id)
        for (const next of (adj.get(id) ?? [])) {
            if (!visited.has(next)) {
                dfs(next, [...path, next])
            } else if (recStack.has(next)) {
                // サイクル検出：パスの next 以降を切り出す
                const cycleStart = path.indexOf(next)
                const cyclePath = path.slice(cycleStart >= 0 ? cycleStart : 0)
                cycles.push(cyclePath.map(i => idToName.get(i) ?? i))
            }
        }
        recStack.delete(id)
    }

    for (const cls of classes) {
        if (!visited.has(cls.id)) dfs(cls.id, [cls.id])
    }
    return cycles
}

// ============================================================
// Outlier Detection (2σ rule)
// ============================================================

function detectOutliers(
    classes: ClassInfo[],
    counts: number[],
    _key: string
): Array<{ cls: ClassInfo; value: number; mean: number; sigma: number }> {
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length
    const std = Math.sqrt(variance)
    if (std < 1) return []   // ばらつきが小さすぎる場合はスキップ

    const results = []
    for (let i = 0; i < classes.length; i++) {
        const sigma = Math.abs(counts[i] - mean) / std
        if (sigma >= 2.0) {
            results.push({ cls: classes[i], value: counts[i], mean, sigma })
        }
    }
    return results
}

// ============================================================
// Helpers
// ============================================================

const PRIMITIVE_TYPES = new Set([
    'string', 'number', 'boolean', 'void', 'any', 'unknown', 'never', 'null', 'undefined',
    'int', 'float', 'double', 'char', 'byte', 'short', 'long',
    'String', 'Integer', 'Float', 'Double', 'Boolean',
    'Date', 'Object', 'Array',
])

function isPrimitiveType(type: string): boolean {
    const base = type.replace(/\[\]/g, '').replace(/^List<(.+)>$/i, '$1').trim()
    return PRIMITIVE_TYPES.has(base)
}

function stripKeyword(label: string): string {
    return label.replace(/^(Given|When|Then|How|And|But|前提|もし|ならば|かつ|しかし):\s*/i, '')
}

function extractScenarios(op: ClassOperation): string[] {
    if (!op.workflow) return []
    const scenarioEdges = op.workflow.edges.filter(e => e.condition != null)
    return scenarioEdges.map(e => String(e.condition))
}

// ============================================================
// Report Renderer
// ============================================================

function renderReport(stats: ValidationStats, input: ValidationInput): string {
    const lines: string[] = []

    lines.push('# Validation レポート')
    lines.push('')
    lines.push(`> 生成日時: ${new Date().toLocaleString('ja-JP')}`)
    lines.push('')

    // ---- サマリーカード ----
    lines.push('## サマリー')
    lines.push('')
    lines.push('| 指標 | 値 |')
    lines.push('| --- | --- |')
    lines.push(`| クラス数 | ${stats.totalClasses} |`)
    lines.push(`| フィールド数 | ${stats.totalMembers} |`)
    lines.push(`| メソッド数 | ${stats.totalOperations} |`)
    lines.push(`| Scenario数 | ${stats.totalScenarios} |`)
    lines.push(`| エンドポイント数 | ${stats.totalEndpoints} |`)
    lines.push('')

    // ---- カバレッジゲージ ----
    lines.push('## カバレッジ')
    lines.push('')
    lines.push('| 項目 | カバレッジ | ゲージ |')
    lines.push('| --- | --- | --- |')
    lines.push(`| needs（設計意図）カバレッジ | ${stats.needsCoverage}% | ${gauge(stats.needsCoverage)} |`)
    lines.push(`| Scenario カバレッジ | ${stats.scenarioCoverage}% | ${gauge(stats.scenarioCoverage)} |`)
    lines.push(`| How（実装指針）カバレッジ | ${stats.howCoverage}% | ${gauge(stats.howCoverage)} |`)
    lines.push(`| Why（設計意図）カバレッジ | ${stats.whyCoverage}% | ${gauge(stats.whyCoverage)} |`)
    lines.push('')

    // ---- Issue一覧 ----
    const errors = stats.issues.filter(i => i.severity === 'error')
    const warnings = stats.issues.filter(i => i.severity === 'warning')
    const infos = stats.issues.filter(i => i.severity === 'info')

    lines.push('## Issues')
    lines.push('')
    lines.push(`🔴 Error: **${errors.length}件** ／ 🟡 Warning: **${warnings.length}件** ／ 🔵 Info: **${infos.length}件**`)
    lines.push('')

    if (stats.issues.length === 0) {
        lines.push('✅ Issueは検出されませんでした。')
        lines.push('')
    } else {
        // カテゴリ別にグループ化して出力
        const byCategory = new Map<string, ValidationIssue[]>()
        for (const issue of stats.issues) {
            if (!byCategory.has(issue.category)) byCategory.set(issue.category, [])
            byCategory.get(issue.category)!.push(issue)
        }

        for (const [category, issues] of byCategory) {
            lines.push(`### ${severityIcon(issues[0].severity)} ${category}`)
            lines.push('')
            lines.push('| 対象 | 内容 |')
            lines.push('| --- | --- |')
            for (const issue of issues) {
                lines.push(`| \`${issue.target}\` | ${issue.message} |`)
            }
            lines.push('')
        }
    }

    // ---- クラスばらつきマトリクス ----
    lines.push('## クラス詳細統計')
    lines.push('')
    lines.push('| クラス名 | 種別 | メンバ数 | 操作数 | Scenario数 | needs率 | Scenario率 |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')

    for (const cls of input.classes) {
        const nonPrimMembers = cls.members.filter(m => !isPrimitiveType(m.type))
        const needsRate = nonPrimMembers.length > 0
            ? Math.round(nonPrimMembers.filter(m => m.needs).length / nonPrimMembers.length * 100)
            : 100
        const opsWithScenario = cls.operations.filter(op => {
            if (!op.workflow) return false
            return op.workflow.edges.some(e => e.condition != null)
        })
        const scenarioRate = cls.operations.length > 0
            ? Math.round(opsWithScenario.length / cls.operations.length * 100)
            : 100
        const totalScenarios = cls.operations.reduce((acc, op) => {
            if (!op.workflow) return acc
            return acc + op.workflow.edges.filter(e => e.condition != null).length
        }, 0)
        const kindLabel = cls.kind === 'interface' ? 'interface'
            : cls.kind === 'struct' ? 'struct'
                : cls.isAbstract ? 'abstract' : 'class'

        lines.push(`| \`${cls.name}\` | ${kindLabel} | ${cls.members.length} | ${cls.operations.length} | ${totalScenarios} | ${needsRate}% | ${scenarioRate}% |`)
    }
    lines.push('')

    // ---- エンドポイント統計 ----
    if (input.endpoints && input.endpoints.length > 0) {
        lines.push('## エンドポイント統計')
        lines.push('')
        lines.push('| エンドポイント | Scenario数 | needs | How率 | Why率 |')
        lines.push('| --- | --- | --- | --- | --- |')
        for (const ep of input.endpoints) {
            const scenarioCount = ep.scenarios.length
            const hasNeeds = ep.needs ? '✔' : '—'
            const howCount = ep.scenarios.filter(s => s.steps.some(st => st.keyword === 'How')).length
            const whyCount = ep.scenarios.filter(s => s.steps.some(st => st.keyword === 'Why')).length
            const howRate = scenarioCount > 0 ? Math.round(howCount / scenarioCount * 100) : 100
            const whyRate = scenarioCount > 0 ? Math.round(whyCount / scenarioCount * 100) : 100
            lines.push(`| \`${ep.method} ${ep.path}\` | ${scenarioCount} | ${hasNeeds} | ${howRate}% | ${whyRate}% |`)
        }
        lines.push('')
    }

    return lines.join('\n')
}

// ============================================================
// Render Helpers
// ============================================================

function gauge(pct: number): string {
    const clamped = Math.max(0, Math.min(100, pct))
    const filled = Math.round(clamped / 10)
    const empty = 10 - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    const color = pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴'
    return `${color} \`${bar}\``
}

function severityIcon(severity: ValidationIssue['severity']): string {
    return severity === 'error' ? '🔴' : severity === 'warning' ? '🟡' : '🔵'
}