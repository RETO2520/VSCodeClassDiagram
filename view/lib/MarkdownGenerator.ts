/**
 * MarkdownGenerator.ts
 *
 * ClassInfo / ParsedClass からMarkdown仕様書を生成するフロントエンド専用モジュール。
 * ExportSpecCommand.ts（ホスト側）の生成ロジックを DomainModel 依存なしで移植。
 *
 * vscode / Node.js 固有 API への依存なし。SpecEditorPanel から直接使用可能。
 *
 * Usage:
 *   import { generateMarkdownFromClasses } from '@/lib/MarkdownGenerator'
 */

import type { ClassInfo, ClassMember, ClassOperation, Relationship, RelationshipType } from './class-diagram-types'
import { visibilitySymbol } from './class-diagram-types'

// ============================================================
// Public API
// ============================================================

export interface MarkdownInput {
    classes: ClassInfo[]
    relationships: Relationship[]
}

/**
 * ClassInfo 配列から Markdown 仕様書文字列を生成する。
 */
export function generateMarkdownFromClasses(input: MarkdownInput): string {
    const { classes, relationships } = input
    const idToName = new Map(classes.map(c => [c.id, c.name]))
    const lines: string[] = []

    // ---- ヘッダ ----
    lines.push('# クラス仕様書')
    lines.push('')
    lines.push(`> 生成日時: ${new Date().toLocaleString('ja-JP')}  `)
    const classCount = classes.filter(c => c.kind === 'class' && !c.isAbstract).length
    const abstractCount = classes.filter(c => c.kind === 'class' && c.isAbstract).length
    const ifaceCount = classes.filter(c => c.kind === 'interface').length
    const structCount = classes.filter(c => c.kind === 'struct').length
    lines.push(`> クラス数: ${classes.length}  (class: ${classCount}, abstract: ${abstractCount}, interface: ${ifaceCount}, struct: ${structCount})`)
    lines.push('')

    // ---- 目次 ----
    lines.push('## 目次')
    lines.push('')
    lines.push('1. [クラス一覧](#クラス一覧)')
    lines.push('2. [リレーションシップ一覧](#リレーションシップ一覧)')
    lines.push('3. [依存グラフ](#依存グラフ)')
    lines.push('4. [クラス詳細](#クラス詳細)')
    lines.push('')

    // ---- クラス一覧 ----
    lines.push('## クラス一覧')
    lines.push('')
    lines.push('| クラス名 | 種別 | 抽象 | メンバ数 | 操作数 |')
    lines.push('|----------|------|------|----------|--------|')
    for (const cls of classes) {
        const kind = kindLabel(cls)
        const isAbstract = cls.kind === 'class' && cls.isAbstract ? '✔' : '-'
        lines.push(`| [${cls.name}](#${anchorId(cls.name)}) | ${kind} | ${isAbstract} | ${cls.members.length} | ${cls.operations.length} |`)
    }
    lines.push('')

    // ---- リレーションシップ一覧 ----
    lines.push('## リレーションシップ一覧')
    lines.push('')
    if (relationships.length === 0) {
        lines.push('_リレーションシップはありません。_')
    } else {
        lines.push('| 種別 | ソース | ターゲット | ラベル | 多重度 |')
        lines.push('|------|--------|------------|--------|--------|')
        for (const rel of relationships) {
            const srcName = idToName.get(rel.sourceId) ?? rel.sourceId
            const tgtName = idToName.get(rel.targetId) ?? rel.targetId
            const label = rel.label ?? '-'
            const multiplicity = formatMultiplicity(rel)
            lines.push(`| ${relationshipLabel(rel.type)} | ${srcName} | ${tgtName} | ${label} | ${multiplicity} |`)
        }
    }
    lines.push('')

    // ---- 依存グラフ ----
    lines.push('## 依存グラフ')
    lines.push('')
    lines.push(...renderDependencyGraph(classes, relationships, idToName))

    // ---- クラス詳細 ----
    lines.push('## クラス詳細')
    lines.push('')
    for (const cls of classes) {
        lines.push(...renderClass(cls, idToName))
    }

    return lines.join('\n')
}

// ============================================================
// Class Renderer
// ============================================================

function renderClass(cls: ClassInfo, idToName: Map<string, string>): string[] {
    const lines: string[] = []
    const stereotype = stereotypeLabel(cls)

    lines.push(`### ${cls.name}`)
    lines.push('')

    if (stereotype) {
        lines.push(`**種別:** ${stereotype}`)
        lines.push('')
    }

    if (cls.baseClassId) {
        const baseName = idToName.get(cls.baseClassId)
        if (baseName) {
            lines.push(`**継承:** \`${baseName}\``)
            lines.push('')
        }
    }

    if (cls.interfaces.length > 0) {
        const ifaceNames = cls.interfaces
            .map(id => idToName.get(id) ? `\`${idToName.get(id)}\`` : id)
            .join(', ')
        lines.push(`**実装インターフェース:** ${ifaceNames}`)
        lines.push('')
    }

    if (cls.members.length > 0) {
        lines.push('#### メンバ（属性）')
        lines.push('')
        lines.push('| 可視性 | 名前 | 型 | static | abstract | 多重度 | リレーション |')
        lines.push('|--------|------|----|--------|----------|--------|--------------|')
        for (const m of cls.members) {
            lines.push(renderMemberRow(m))
        }
        lines.push('')
    }

    if (cls.operations.length > 0) {
        lines.push('#### 操作（メソッド）')
        lines.push('')
        for (const op of cls.operations) {
            lines.push(...renderOperation(op))
        }
        lines.push('')
    }

    lines.push('---')
    lines.push('')
    return lines
}

// ============================================================
// Member / Operation Renderers
// ============================================================

function renderMemberRow(m: ClassMember): string {
    const vis = visibilitySymbol(m.visibility)
    const isStatic = m.isStatic ? '✔' : '-'
    const isAbstract = m.isAbstract ? '✔' : '-'
    const multiplicity = (m.sourceMultiplicity || m.targetMultiplicity)
        ? `${m.sourceMultiplicity ?? ''}..${m.targetMultiplicity ?? ''}`
        : '-'
    const rel = m.relationship === 'auto' ? 'auto' : m.relationship
    return `| \`${vis}\` | \`${m.name}\` | \`${m.type}\` | ${isStatic} | ${isAbstract} | ${multiplicity} | ${rel} |`
}

function renderOperation(op: ClassOperation): string[] {
    const lines: string[] = []
    const vis = visibilitySymbol(op.visibility)
    const modifiers: string[] = []
    if (op.isStatic) modifiers.push('static')
    if (op.isAbstract) modifiers.push('abstract')
    const modStr = modifiers.length > 0 ? ` _(${modifiers.join(', ')})_` : ''
    const params = op.parameters.map(p => `${p.name}: ${p.type}`).join(', ')
    lines.push(`- \`${vis} ${op.name}(${params}): ${op.returnType}\`${modStr}`)

    for (const p of op.parameters) {
        lines.push(`  - \`${p.name}\`: \`${p.type}\``)
    }
    if (op.returnType) {
        lines.push(`  - **戻り値:** \`${op.returnType}\``)
    }

    // シナリオの振る舞いテーブル
    if (op.workflow && op.workflow.nodes.length > 0) {
        lines.push(...renderBehaviorTable(op.workflow))
    }

    return lines
}

function renderBehaviorTable(workflow: NonNullable<ClassOperation['workflow']>): string[] {
    const lines: string[] = []
    const nodeNum = new Map(workflow.nodes.map((n, i) => [n.id, i + 1]))

    lines.push('')
    lines.push('#### 振る舞い')
    lines.push('')
    lines.push('| No | 内容 (Step) | 条件 / 分岐 | 次のステップ |')
    lines.push('| --- | --- | --- | --- |')

    for (const node of workflow.nodes) {
        const currentNo = nodeNum.get(node.id)
        const outgoing = workflow.edges.filter(e => e.from === node.id)

        if (outgoing.length === 0) {
            lines.push(`| ${currentNo} | **${node.label}** | - | (終了) |`)
        } else {
            outgoing.forEach((edge, idx) => {
                const targetNo = nodeNum.get(edge.to) ?? '??'
                let condition = (edge as any).condition ? `${(edge as any).condition}` : '-'

                // src: アノテーションがあれば Markdown リンクを付与
                const srcs = (edge as any).srcs as { label: string; url: string }[] | undefined
                if ((edge as any).condition && srcs && srcs.length > 0) {
                    const links = srcs.map(s => `[${s.label}](${s.url})`).join(' ')
                    condition = `${(edge as any).condition} ${links}`
                }

                const displayNo = idx === 0 ? currentNo : ''
                const displayLabel = idx === 0 ? `**${node.label}**` : ' 〃 '
                lines.push(`| ${displayNo} | ${displayLabel} | ${condition} | ${targetNo} |`)
            })
        }
    }

    return lines
}

// ============================================================
// Dependency Graph
// ============================================================

function renderDependencyGraph(
    classes: ClassInfo[],
    relationships: Relationship[],
    idToName: Map<string, string>
): string[] {
    const lines = new Map<string, { uses: Set<string>; usedBy: Set<string> }>()
    for (const cls of classes) lines.set(cls.id, { uses: new Set(), usedBy: new Set() })

    for (const rel of relationships) {
        lines.get(rel.sourceId)?.uses.add(rel.targetId)
        lines.get(rel.targetId)?.usedBy.add(rel.sourceId)
    }

    const out: string[] = []
    out.push('| クラス名 | 依存先（uses） | 被依存元（used by） |')
    out.push('|----------|----------------|---------------------|')
    for (const cls of classes) {
        const entry = lines.get(cls.id)!
        const uses = [...entry.uses].map(id => idToName.get(id) ?? id).join(', ') || '-'
        const usedBy = [...entry.usedBy].map(id => idToName.get(id) ?? id).join(', ') || '-'
        out.push(`| \`${cls.name}\` | ${uses} | ${usedBy} |`)
    }
    out.push('')
    return out
}

// ============================================================
// Helpers
// ============================================================

function kindLabel(cls: ClassInfo): string {
    if (cls.kind === 'interface') return 'Interface'
    if (cls.kind === 'struct') return 'Struct'
    return cls.isAbstract ? 'Abstract Class' : 'Class'
}

function stereotypeLabel(cls: ClassInfo): string | null {
    if (cls.kind === 'interface') return '«interface»'
    if (cls.kind === 'struct') return '«struct»'
    if (cls.kind === 'class' && cls.isAbstract) return '«abstract»'
    return null
}

function relationshipLabel(type: RelationshipType): string {
    const map: Record<RelationshipType, string> = {
        association: '関連',
        aggregation: '集約',
        composition: 'コンポジション',
        dependency: '依存',
        realization: '実現（implements）',
        generalization: '汎化（extends）',
    }
    return map[type] ?? type
}

function formatMultiplicity(rel: Relationship): string {
    const src = rel.sourceMultiplicity
    const tgt = rel.targetMultiplicity
    if (!src && !tgt) return '-'
    return `${src ?? ''}..${tgt ?? ''}`
}

function anchorId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-')
}