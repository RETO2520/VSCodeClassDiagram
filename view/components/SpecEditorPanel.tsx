/**
 * SpecEditorPanel.tsx
 *
 * 仕様書DSLエディタ — パターンC実装（下部ペイン）
 *
 * Monaco Editor は @monaco-editor/react で統合。
 * CDN動的ロードなし — npm install @monaco-editor/react で動作する。
 *
 * 機能:
 *   - Monaco Editor でDSLを編集（シンタックスハイライト + スニペット補完）
 *   - debounce(600ms) でリアルタイムにクラス図へ反映
 *   - ワークフローデータ（workflow/workflowAst）を全リセット時に名前ベースで引き継ぐ
 *   - 左端: アウトライン（パースしたクラス一覧）
 *   - 中央: Monaco エディタ本体
 *   - 下端: ステータスバー（カーソル位置 / エラー数 / 最終適用時刻）
 */
import type * as Monaco from 'monaco-editor'
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
loader.config({ monaco });

import React, { useRef, useState, useCallback, useEffect } from 'react'
import Editor, { useMonaco, OnMount, OnChange } from '@monaco-editor/react'
import type { ClassDiagramService } from '@/lib/application/ClassDiagramService'
import { SpecDslParser } from '@/lib/SpecDslParser'
import { generateMarkdownFromClasses } from '@/lib/MarkdownGenerator'
import { lintWorkflow } from '@/lib/WorkflowLinter'
import type { LintWarning } from '@/lib/WorkflowLinter'
import { lintDsl } from '@/lib/DslLinter'
import type { DslLintWarning } from '@/lib/DslLinter'
import { DomainModel } from '@/lib/DomainModel'
import type { ClassInfo, ClassOperation } from '@/lib/class-diagram-types'

// VSCode WebView 環境では acquireVsCodeApi 経由で postMessage を使う。
// ブラウザ環境ではフォールバックとして <a download> でファイル保存する。
function sendToHost(msg: object) {
    try {
        // @ts-ignore
        if (typeof acquireVsCodeApi !== 'undefined') {
            // @ts-ignore
            acquireVsCodeApi().postMessage(msg)
        }
    } catch { /* ブラウザ環境ではスルー */ }
}

// ============================================================
// DSL 言語定義
// ============================================================

const DSL_LANGUAGE_ID = 'class-spec-dsl'

/**
 * Monaco インスタンスが用意されたタイミングで一度だけ呼ぶ。
 * @monaco-editor/react の beforeMount / useMonaco で使用する。
 */
function registerDslLanguage(monaco: typeof Monaco) {
    // 二重登録を防ぐ
    if (monaco.languages.getLanguages().some(l => l.id === DSL_LANGUAGE_ID)) return

    monaco.languages.register({ id: DSL_LANGUAGE_ID })

    monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
        keywords: ['class', 'interface', 'struct', 'abstract', 'extends', 'implements'],
        tokenizer: {
            root: [
                [/\/\/.*$/, 'comment'],
                [/#.*$/, 'comment'],
                // src: アノテーション（行のどこにでも書ける）
                [/\bsrc:/, { token: 'annotation.key', next: 'src_label' }],
                // Gherkin — 行の先頭（インデント可）で認識
                [/^(\s*)(Scenario|シナリオ)(:.*)?$/, 'gherkin.scenario'],
                [/^(\s*)(Given|前提)(\s)/, 'gherkin.given'],
                [/^(\s*)(When|もし)(\s)/, 'gherkin.when'],
                [/^(\s*)(Then|ならば)(\s)/, 'gherkin.then'],
                [/^(\s*)(And|But|かつ|しかし)(\s)/, 'gherkin.and'],
                [/\b(abstract|class|interface|struct|extends|implements)\b/, 'keyword'],
                [/^[\s]*[+\-#~]/, 'type.identifier'],
                [/\b[sa]\b/, 'keyword.modifier'],
                [/(-\/>|>\||>\/|\+>|->|o>|\*>)/, 'operator'],
                [/[A-Z][a-zA-Z0-9_]*/, 'type'],
                [/[a-z_][a-zA-Z0-9_]*/, 'identifier'],
                [/[()[\]]/, 'delimiter.bracket'],
                [/[,:]/, 'delimiter'],
                [/\d+(\.\d+)?/, 'number'],
                [/".*?"/, 'string'],
            ],
            // src: ステート: ラベル部分（REQ-001 など）を読む
            src_label: [
                [/\s+/, 'white'],
                [/\S+/, { token: 'annotation.label', next: 'src_url' }],
            ],
            // src: ステート: URL/パス部分を読む（ファイルパス・URLどちらも可）
            src_url: [
                [/\s+/, 'white'],
                [/\S+/, { token: 'annotation.url', next: '@pop' }],
            ],
        },
    } as any)

    monaco.editor.defineTheme('spec-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '7dd3fc', fontStyle: 'bold' },
            { token: 'keyword.modifier', foreground: 'f97316' },
            { token: 'type', foreground: '4ade80' },
            { token: 'type.identifier', foreground: 'fb923c', fontStyle: 'bold' },
            { token: 'operator', foreground: 'c084fc', fontStyle: 'bold' },
            { token: 'comment', foreground: '475569', fontStyle: 'italic' },
            { token: 'identifier', foreground: 'e2e8f0' },
            { token: 'string', foreground: 'fbbf24' },
            { token: 'number', foreground: '60a5fa' },
            { token: 'delimiter', foreground: '94a3b8' },
            // Gherkin
            { token: 'gherkin.scenario', foreground: 'f0abfc', fontStyle: 'bold' },
            { token: 'gherkin.given', foreground: '6ee7b7' },
            { token: 'gherkin.when', foreground: 'fcd34d' },
            { token: 'gherkin.then', foreground: '93c5fd' },
            { token: 'gherkin.and', foreground: '94a3b8', fontStyle: 'italic' },
            // src: アノテーション
            { token: 'annotation.key', foreground: 'fb923c', fontStyle: 'bold' },
            { token: 'annotation.label', foreground: 'fbbf24' },
            { token: 'annotation.url', foreground: '60a5fa', fontStyle: 'italic' },
        ],
        colors: {
            'editor.background': '#080f1a',
            'editor.foreground': '#e2e8f0',
            'editorLineNumber.foreground': '#334155',
            'editorCursor.foreground': '#3b82f6',
            'editor.lineHighlightBackground': '#1e293b80',
            'editorGutter.background': '#0f172a',
            'editor.selectionBackground': '#3b82f640',
            'editorIndentGuide.background1': '#1e293b',
        },
    })

    monaco.languages.registerCompletionItemProvider(DSL_LANGUAGE_ID, {
        provideCompletionItems(model, position) {
            const word = model.getWordUntilPosition(position)
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            }
            const snippets: Array<{ label: string; insert: string; doc: string }> = [
                { label: 'class', insert: 'class ${1:ClassName}\n  + ${2:field}: ${3:string}\n  + ${4:method}(): ${5:void}', doc: 'クラス定義' },
                { label: 'interface', insert: 'interface ${1:IName}\n  + ${2:method}(): ${3:void}', doc: 'インターフェース定義' },
                { label: 'struct', insert: 'struct ${1:Name}\n  + ${2:field}: ${3:int}', doc: '構造体定義' },
                { label: 'abstract class', insert: 'abstract class ${1:Name}\n  + a ${2:method}(): ${3:void}', doc: '抽象クラス' },
                { label: 'extends', insert: 'extends ${1:ParentClass}', doc: '継承' },
                { label: 'implements', insert: 'implements ${1:IName}', doc: 'インターフェース実装' },
                { label: '->', insert: '${1:Source} -> ${2:Target}', doc: '関連' },
                { label: 'o>', insert: '${1:Source} o> ${2:Target}', doc: '集約' },
                { label: '*>', insert: '${1:Source} *> ${2:Target}', doc: 'コンポジション' },
                { label: '>|', insert: '${1:Child} >| ${2:Parent}', doc: '汎化（継承）' },
                { label: '>/', insert: '${1:Class} >/ ${2:Interface}', doc: '実現' },
                // ── Gherkin ──
                { label: 'Scenario', insert: 'Scenario: ${1:シナリオ名}\n  Given ${2:前提条件}\n  When ${3:操作}\n  Then ${4:期待結果}', doc: 'Gherkin シナリオ' },
                { label: 'Given', insert: 'Given ${1:前提条件}', doc: 'Gherkin: Given' },
                { label: 'When', insert: 'When ${1:操作}', doc: 'Gherkin: When' },
                { label: 'Then', insert: 'Then ${1:期待結果}', doc: 'Gherkin: Then' },
                { label: 'And', insert: 'And ${1:追加条件}', doc: 'Gherkin: And' },
                { label: 'シナリオ', insert: 'シナリオ: ${1:シナリオ名}\n  前提 ${2:前提条件}\n  もし ${3:操作}\n  ならば ${4:期待結果}', doc: 'Gherkin シナリオ（日本語）' },
                // ── トレーサビリティ ──
                { label: 'src:', insert: 'src: ${1:REQ-001} ${2:https://example.com/req#1}', doc: '要求仕様へのトレーサビリティリンク（src: label url）' },
            ]
            return {
                suggestions: snippets.map(s => ({
                    label: s.label,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: s.insert,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: s.doc,
                    range,
                })),
            }
        },
    })
}

// ============================================================
// Types
// ============================================================

interface ParseStatus {
    state: 'idle' | 'parsing' | 'ok' | 'error'
    errors: string[]
    warnings: LintWarning[]
    dslWarnings: DslLintWarning[]
    classCount: number
    lastApplied: Date | null
}

interface OutlineItem {
    name: string
    kind: 'class' | 'interface' | 'struct'
    isAbstract: boolean
    memberCount: number
    operationCount: number
    line: number
}

interface CursorPos { line: number; col: number }

// ============================================================
// Props
// ============================================================

export interface SpecEditorPanelProps {
    service: ClassDiagramService
    /** ワークフローデータ引き継ぎ用・読み取り専用 */
    classes: ClassInfo[]
    visible: boolean
}

// ============================================================
// Outline
// ============================================================

function Outline({ items, onSelect }: {
    items: OutlineItem[]
    onSelect: (line: number) => void
}) {
    const kindBadge = (k: OutlineItem['kind'], isAbstract: boolean) => {
        if (k === 'interface') return { label: 'I', color: '#38bdf8' }
        if (k === 'struct') return { label: 'S', color: '#fb923c' }
        if (isAbstract) return { label: 'A', color: '#a78bfa' }
        return { label: 'C', color: '#4ade80' }
    }

    return (
        <div style={{
            width: 176, minWidth: 176, flexShrink: 0,
            borderRight: '1px solid #1e293b',
            background: '#0a1628',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <div style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700,
                color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase',
                borderBottom: '1px solid #1e293b', flexShrink: 0,
                fontFamily: '"Cascadia Code","SF Mono",monospace',
            }}>
                OUTLINE
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
                {items.length === 0
                    ? <p style={{ padding: '10px', fontSize: 11, color: '#334155', fontStyle: 'italic', margin: 0 }}>
                        No classes found
                    </p>
                    : items.map((item, i) => {
                        const { label, color } = kindBadge(item.kind, item.isAbstract)
                        return (
                            <button key={i} onClick={() => onSelect(item.line)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    width: '100%', textAlign: 'left',
                                    padding: '4px 10px', background: 'transparent', border: 'none',
                                    cursor: 'pointer',
                                    fontFamily: '"Cascadia Code","SF Mono",monospace',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {/* バッジ */}
                                <span style={{
                                    fontSize: 9, fontWeight: 700, color: '#0f172a',
                                    background: color, borderRadius: 2,
                                    padding: '0 3px', lineHeight: '14px', flexShrink: 0,
                                }}>{label}</span>
                                {/* クラス名 */}
                                <span style={{ fontSize: 11, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.name}
                                </span>
                                {/* メンバ数 */}
                                <span style={{ fontSize: 9, color: '#334155', flexShrink: 0 }}>
                                    {item.memberCount + item.operationCount}
                                </span>
                            </button>
                        )
                    })
                }
            </div>
        </div>
    )
}

// ============================================================
// MarkdownViewer
// ============================================================

/** markdown文字列をHTMLに変換する最小実装（外部ライブラリ不要） */
function mdToHtml(md: string): string {
    let html = md
        // エスケープ
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // 見出し
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // 水平線
        .replace(/^---$/gm, '<hr/>')
        // 引用
        .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
        // 太字・イタリック・コード（インライン）
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/_\((.+?)\)_/g, '<em>($1)</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Markdownリンク
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        // テーブル（ヘッダ行 + 区切り行 + データ行）
        .replace(/^(\|.+\|\r?\n)+/gm, (block) => { // gmフラグで複数行を対象に
            const rows = block.trim().split('\n');
            if (rows.length < 2) return block;

            const isSep = (r: string) => /^\|[\s\-|:]+\|$/.test(r.trim());

            let out = '<table>';
            let hasThead = false;

            rows.forEach((row, i) => {
                if (isSep(row)) {
                    // セパレータ行自体はHTMLに出力しない
                    return;
                }

                // 2行目がセパレータなら、1行目はthead（th）として扱う
                const isHeader = (i === 0 && isSep(rows[1]));
                const tag = isHeader ? 'th' : 'td';

                if (isHeader && !hasThead) {
                    out += '<thead>';
                    hasThead = true;
                } else if (i === 2 && hasThead) { // セパレータの次の行
                    out += '</thead><tbody>';
                }

                const cells = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                out += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
            });

            out += hasThead ? '</tbody></table>' : '</table>';
            return out;
        })
        // リスト項目
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>?) + /g, m => `<ul>${m}</ul > `)
        // 段落（連続する非HTMLタグ行）
        .replace(/^(?!<)(.+)$/gm, '<p>$1</p>')
        // 空の <p></p> 除去
        .replace(/<p><\/p>/g, '')

    return html
}

function MarkdownViewer({ markdown }: { markdown: string }) {
    const html = mdToHtml(markdown)

    return (
        <div style={{
            width: 480, minWidth: 320, maxWidth: '45%', flexShrink: 0,
            borderLeft: '1px solid #1e293b',
            background: '#0d1829',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            {/* ヘッダ */}
            <div style={{
                padding: '5px 12px', fontSize: 10, fontWeight: 700,
                color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase',
                borderBottom: '1px solid #1e293b', flexShrink: 0,
                fontFamily: '"Cascadia Code","SF Mono",monospace',
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: markdown ? '#4ade80' : '#334155',
                }} />
                MARKDOWN PREVIEW
            </div>

            {/* コンテンツ */}
            <div
                className="md-viewer"
                dangerouslySetInnerHTML={{ __html: html }}
                style={{
                    flex: 1, overflowY: 'auto', padding: '12px 16px',
                    color: '#cbd5e1', fontSize: 12, lineHeight: 1.7,
                    fontFamily: 'system-ui, "Segoe UI", sans-serif',
                }}
            />

            {/* インラインCSS */}
            <style>{`
                .md - viewer h1 { color: #f1f5f9; font - size: 18px; border - bottom: 1px solid #1e293b; padding - bottom: 4px; margin: 16px 0 8px; }
        .md - viewer h2 { color: #e2e8f0; font - size: 15px; border - bottom: 1px solid #1e293b; padding - bottom: 2px; margin: 14px 0 6px; }
        .md - viewer h3 { color: #cbd5e1; font - size: 13px; margin: 12px 0 4px; }
        .md - viewer h4 { color: #94a3b8; font - size: 12px; margin: 8px 0 4px; }
        .md - viewer table { border - collapse: collapse; width: 100 %; font - size: 11px; margin: 6px 0; }
        .md - viewer th, .md - viewer td { border: 1px solid #1e293b; padding: 3px 8px; text - align: left; }
        .md - viewer th { background: #0f172a; color: #94a3b8; }
        .md - viewer code { background: #1e293b; padding: 1px 4px; border - radius: 3px; font - family: "Cascadia Code", monospace; font - size: 11px; color: #7dd3fc; }
        .md - viewer a { color: #60a5fa; text - decoration: none; }
        .md - viewer a:hover { text - decoration: underline; }
        .md - viewer blockquote { border - left: 3px solid #334155; margin: 0; padding: 2px 8px; color: #64748b; }
        .md - viewer hr { border: none; border - top: 1px solid #1e293b; margin: 8px 0; }
        .md - viewer ul { padding - left: 16px; margin: 4px 0; }
        .md - viewer li { margin: 2px 0; }
        .md - viewer p { margin: 4px 0; }
        .md - viewer strong { color: #e2e8f0; }
    `}</style>
        </div>
    )
}

// ============================================================
// StatusBar
// ============================================================

function StatusBar({ status, cursor, charCount }: {
    status: ParseStatus
    cursor: CursorPos
    charCount: number
}) {
    const warnCount = status.warnings?.length ?? 0
    const dslWarnCount = status.dslWarnings?.length ?? 0
    const totalWarn = warnCount + dslWarnCount
    // 警告があっても state は 'ok' のまま。色はアンバー
    const stateColor = status.state === 'error' ? '#f87171'
        : status.state === 'ok' && totalWarn > 0 ? '#fbbf24'
            : { idle: '#475569', parsing: '#fbbf24', ok: '#4ade80' }[status.state]

    const stateLabel = {
        idle: '待機中',
        parsing: '解析中…',
        ok: `✓ 適用済み(${status.classCount} クラス)`,
        error: `✗ ${status.errors.length} エラー`,
    }[status.state]

    const lastStr = status.lastApplied
        ? status.lastApplied.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—'

    const SEP = <span style={{ color: '#1e293b', margin: '0 2px' }}>│</span>

    // 警告の詳細テキスト（ホバーで全件表示）
    const warnTooltip = status.warnings?.map((w, i) => {
        const lines = [`${i + 1}. ${w.message} `]
        if (w.suggestedOrder) lines.push(`   推奨順序: ${w.suggestedOrder.join(' → ')} `)
        return lines.join('\n')
    }).join('\n\n') ?? ''

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '2px 12px', background: '#080f1a',
            borderTop: '1px solid #1e293b', flexShrink: 0, height: 22,
            fontFamily: '"Cascadia Code","SF Mono",monospace', fontSize: 10,
        }}>
            <span style={{ color: stateColor, fontWeight: 600 }}>{stateLabel}</span>

            {status.errors.length > 0 && <>
                {SEP}
                <span style={{ color: '#ef4444', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={status.errors.join('\n')}>
                    {status.errors[0]}
                </span>
            </>}

            {warnCount > 0 && <>
                {SEP}
                <span
                    title={warnTooltip}
                    style={{
                        color: '#fbbf24', cursor: 'help',
                        maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                    ⚠ {warnCount} 件の順序警告 — {status.warnings[0].message}
                </span>
            </>}

            {dslWarnCount > 0 && <>
                {SEP}
                <span
                    title={status.dslWarnings.map((w, i) => {
                        const lines = [`${i + 1}. ${w.message} `]
                        if (w.cycle) lines.push(`   サイクル: ${w.cycle.join(' → ')} `)
                        return lines.join('\n')
                    }).join('\n\n')}
                    style={{
                        color: '#f87171', cursor: 'help',
                        maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                    ✗ {dslWarnCount} 件の構造エラー — {status.dslWarnings[0].message}
                </span>
            </>}

            <div style={{ flex: 1 }} />

            <span style={{ color: '#334155' }}>Last applied: {lastStr}</span>
            {SEP}
            <span style={{ color: '#334155' }}>{charCount} chars</span>
            {SEP}
            <span style={{ color: '#475569' }}>Ln {cursor.line}, Col {cursor.col}</span>
        </div>
    )
}

// ============================================================
// ToolbarBtn
// ============================================================

function ToolbarBtn({ onClick, title, accent = '#94a3b8', children }: {
    onClick: () => void
    title: string
    accent?: string
    children: React.ReactNode
}) {
    return (
        <button onClick={onClick} title={title}
            style={{
                height: 22, padding: '0 8px', borderRadius: 3,
                border: `1px solid ${accent} 30`, color: accent,
                background: `${accent} 12`, fontSize: 10,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${accent} 28`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${accent} 12`)}
        >
            {children}
        </button>
    )
}

// ============================================================
// Main SpecEditorPanel
// ============================================================

const DEBOUNCE_MS = 600

const INITIAL_DSL = `
// クラス仕様書 DSL
// 書き込むとリアルタイムでクラス図に反映されます

class Order
    extends Entity
    implements IAggregate
  - id: string
    - items: OrderItem[]
    - status: OrderStatus
    + getTotal(): number
    + confirm(): void
    + cancel(): void

class OrderItem
    - productId: string
    - quantity: int
    - unitPrice: number
    + getSubtotal(): number

interface IAggregate
    + getId(): string

abstract class Entity
    # id: string
    + getId(): string

// リレーション
Order *> OrderItem :items 1 *
`

export function SpecEditorPanel({ service, classes, visible }: SpecEditorPanelProps) {
    // @monaco-editor/react が用意する monaco インスタンス
    const monaco = useMonaco()

    // エディタインスタンスへの ref（カーソル操作・getValue・マーカーに使用）
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const parserRef = useRef(new SpecDslParser())

    const [status, setStatus] = useState<ParseStatus>({ state: 'idle', errors: [], warnings: [], dslWarnings: [], classCount: 0, lastApplied: null })
    const [outline, setOutline] = useState<OutlineItem[]>([])
    const [cursor, setCursor] = useState<CursorPos>({ line: 1, col: 1 })
    const [charCount, setCharCount] = useState(INITIAL_DSL.length)
    const [showPreview, setShowPreview] = useState(false)
    const [markdownText, setMarkdownText] = useState('')

    // ── DSL → クラス図 適用 ──────────────────────────────────
    const applyDsl = useCallback((dsl: string) => {
        try {
            // 1. ワークフローデータを className → opName でキャッシュ
            const wfCache = new Map<string, Map<string, {
                workflow?: ClassOperation['workflow']
                workflowAst?: ClassOperation['workflowAst']
            }>>()
            for (const cls of classes) {
                const opMap = new Map<string, { workflow?: ClassOperation['workflow']; workflowAst?: ClassOperation['workflowAst'] }>()
                for (const op of cls.operations) {
                    if (op.workflow || op.workflowAst) {
                        opMap.set(op.name, { workflow: op.workflow, workflowAst: op.workflowAst })
                    }
                }
                if (opMap.size > 0) wfCache.set(cls.name, opMap)
            }

            // 2. モデルをリセットして再構築
            service.setModel(DomainModel.createEmpty())
            const parsed = parserRef.current.parse(dsl, service)

            // 3. ワークフローデータを名前ベースで復元
            //    ただしパーサが DSL 内の Scenario から既に workflow を設定した操作は除外する。
            //    （parse() 内で applyUpdateOperationWorkflow が済んでいる操作を
            //      wfCache の古いデータで上書きしてしまうのを防ぐ）
            for (const cls of service.getModel().getClasses()) {
                const opMap = wfCache.get(cls.name)
                if (!opMap) continue
                for (const op of cls.operations) {
                    const cached = opMap.get(op.name)
                    if (!cached?.workflow) continue
                    // パーサが既に workflow を設定済みの場合はスキップ
                    if (op.workflow?.nodes?.length) continue
                    try {
                        service.applyUpdateOperationWorkflow({
                            classId: cls.id,
                            operationId: op.id,
                            workflow: cached.workflow,
                            workflowAst: cached.workflowAst,
                        })
                    } catch { /* メソッドシグネチャ変更時は無視 */ }
                }
            }

            // 4. アウトライン更新
            const lines = dsl.split('\n')
            setOutline(parsed.classes.map(cls => ({
                name: cls.name,
                kind: cls.kind as OutlineItem['kind'],
                isAbstract: cls.isAbstract,
                memberCount: cls.members.length,
                operationCount: cls.operations.length,
                line: (lines.findIndex(l =>
                    new RegExp(`(abstract\\s +) ? (class| interface | struct) \\s + ${cls.name} \\b`).test(l)
                ) + 1) || 1,
            })))

            // 5. エラーマーカーをクリア
            if (monaco && editorRef.current) {
                monaco.editor.setModelMarkers(editorRef.current.getModel()!, 'dsl-parser', [])
            }

            // 6. シナリオ順序の静的解析（lintWorkflow）
            const allWarnings: LintWarning[] = []
            for (const cls of service.getModel().getClasses()) {
                for (const op of cls.operations) {
                    if (op.workflow && op.workflow.nodes.length > 0) {
                        const opLabel = `${cls.name}.${op.name} ()`
                        allWarnings.push(...lintWorkflow(op.workflow as any, opLabel))
                    }
                }
            }

            // 7. DSL構造の静的解析（lintDsl）
            const dslWarnings = lintDsl(parsed.classes)

            setStatus({ state: 'ok', errors: [], warnings: allWarnings, dslWarnings, classCount: parsed.classes.length, lastApplied: new Date() })

            // 8. Markdownプレビュー更新（showPreview が true のときのみ生成してコストを抑える）
            const mdClasses = service.getModel().getClasses()
            const mdRelationships = service.getModel().detectRelationships()
            setMarkdownText(generateMarkdownFromClasses({ classes: mdClasses, relationships: mdRelationships }))
        } catch (err: any) {
            const msg = err?.message ?? String(err)

            // エラーマーカーを表示
            if (monaco && editorRef.current) {
                monaco.editor.setModelMarkers(editorRef.current.getModel()!, 'dsl-parser', [{
                    severity: monaco.MarkerSeverity.Error,
                    message: msg,
                    startLineNumber: 1, startColumn: 1,
                    endLineNumber: 1, endColumn: 1,
                }])
            }

            setStatus({ state: 'error', errors: [msg], warnings: [], dslWarnings: [], classCount: 0, lastApplied: null })
        }
    }, [classes, service, monaco])

    // ── Monaco マウント時 ─────────────────────────────────────
    const handleMount: OnMount = useCallback((editor, monacoInstance) => {
        editorRef.current = editor

        // 言語・テーマ登録（useMonaco より確実なタイミング）
        registerDslLanguage(monacoInstance)

        // カーソル位置
        editor.onDidChangeCursorPosition(e => {
            setCursor({ line: e.position.lineNumber, col: e.position.column })
        })

        // 初回パース
        applyDsl(editor.getValue())
    }, [applyDsl])

    // ── Monaco beforeMount（テーマを事前登録）────────────────
    const handleBeforeMount = useCallback((monacoInstance: typeof Monaco) => {
        registerDslLanguage(monacoInstance)
    }, [])

    // ── 内容変化 → debounce ──────────────────────────────────
    const handleChange: OnChange = useCallback((value) => {
        const dsl = value ?? ''
        setCharCount(dsl.length)
        setStatus(s => ({ ...s, state: 'parsing' }))

        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => applyDsl(dsl), DEBOUNCE_MS)
    }, [applyDsl])

    // ── アウトライン → エディタジャンプ ─────────────────────
    const handleOutlineSelect = useCallback((line: number) => {
        const editor = editorRef.current
        if (!editor) return
        editor.revealLineInCenter(line)
        editor.setPosition({ lineNumber: line, column: 1 })
        editor.focus()
    }, [])

    // ── ツールバーアクション ─────────────────────────────────
    const handleApplyNow = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        applyDsl(editorRef.current?.getValue() ?? '')
    }, [applyDsl])

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(editorRef.current?.getValue() ?? '').catch(() => { })
    }, [])

    const handleClear = useCallback(() => {
        editorRef.current?.setValue('')
    }, [])

    // ── DSL保存 ─────────────────────────────────────────────────
    // VSCode WebView: postMessage で拡張ホストにファイル保存を依頼
    // ブラウザ:      <a download> でそのままダウンロード
    const handleSave = useCallback(() => {
        const dsl = editorRef.current?.getValue() ?? ''
        const fileName = 'spec.dsl'

        // VSCode WebView 環境
        try {
            // @ts-ignore
            if (typeof acquireVsCodeApi !== 'undefined') {
                sendToHost({ command: 'saveDsl', payload: { dsl, fileName } })
                return
            }
        } catch { /* ignore */ }

        // ブラウザ環境: ファイルダウンロード
        const blob = new Blob([dsl], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
    }, [])

    // ── ペースト（クリップボード → エディタ）────────────────────
    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText()
            const editor = editorRef.current
            if (!editor || !text) return
            // 現在の選択範囲に挿入（選択なければカーソル位置に挿入）
            editor.focus()
            editor.executeEdits('clipboard-paste', [{
                range: editor.getSelection()!,
                text,
                forceMoveMarkers: true,
            }])
        } catch {
            // clipboard API が使えない環境（権限拒否など）
            // Monaco の標準 Ctrl+V を案内
            editorRef.current?.focus()
        }
    }, [])

    // ── ファイルから読み込み ──────────────────────────────────────
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleLoadFile = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const input = e.target          // ref を保持（非同期後も参照できるよう）
        const reader = new FileReader()
        reader.onload = ev => {
            const result = ev.target?.result
            const text = typeof result === 'string' ? result : ''
            editorRef.current?.setValue(text)
            // 読み込み完了後にリセット（readAsText より前に実行すると一部環境でキャンセルされる）
            input.value = ''
        }
        reader.onerror = () => {
            input.value = ''
        }
        reader.readAsText(file, 'utf-8')
    }, [])

    // ── Ctrl+S でファイル保存 ─────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                handleSave()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleSave])

    // ── レンダー ─────────────────────────────────────────────
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: '#080f1a', overflow: 'hidden',
            fontFamily: '"Cascadia Code","SF Mono","Fira Code",monospace',
        }}>
            {/* ── Toolbar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                padding: '3px 10px', background: '#0f172a',
                borderBottom: '1px solid #1e293b',
            }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.08em', marginRight: 4 }}>
                    SPEC DSL
                </span>

                <div style={{ width: 1, height: 14, background: '#1e293b' }} />

                <ToolbarBtn onClick={handleApplyNow} title="Ctrl+Enter で即時適用" accent="#3b82f6">
                    ▶ Apply Now
                </ToolbarBtn>

                <div style={{ width: 1, height: 14, background: '#1e293b' }} />

                <ToolbarBtn onClick={handleSave} title="DSLをファイルに保存 (Ctrl+S)" accent="#4ade80">
                    💾 Save
                </ToolbarBtn>

                <div style={{ width: 1, height: 14, background: '#1e293b' }} />

                <ToolbarBtn onClick={handleCopy} title="DSLをクリップボードにコピー">
                    ⎘ Copy
                </ToolbarBtn>
                <ToolbarBtn onClick={handlePaste} title="クリップボードからエディタに貼り付け">
                    ⎗ Paste
                </ToolbarBtn>
                <ToolbarBtn onClick={handleLoadFile} title="ファイルから読み込む">
                    📂 Load
                </ToolbarBtn>
                <ToolbarBtn onClick={handleClear} title="エディタをクリア" accent="#f87171">
                    ✕ Clear
                </ToolbarBtn>

                {/* 隠しファイルインプット（Load ボタンのトリガー） */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".dsl,.txt,.spec"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />

                <div style={{ flex: 1 }} />

                {/* プレビュートグル */}
                <ToolbarBtn
                    onClick={() => setShowPreview(v => !v)}
                    title="Markdown仕様書プレビューを表示/非表示"
                    accent={showPreview ? '#38bdf8' : '#475569'}
                >
                    {showPreview ? '▣ Preview' : '□ Preview'}
                </ToolbarBtn>

                <div style={{ width: 1, height: 14, background: '#1e293b' }} />

                {/* リアルタイム同期インジケーター */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%', transition: 'background 0.25s',
                        background: {
                            ok: '#4ade80',
                            error: '#f87171',
                            parsing: '#fbbf24',
                            idle: '#334155',
                        }[status.state],
                    }} />
                    <span style={{ fontSize: 10, color: '#475569' }}>
                        {status.state === 'parsing' ? '解析中…' : 'リアルタイム同期'}
                    </span>
                </div>
            </div>

            {/* ── メイン: Outline + Editor + Markdown Preview ── */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                <Outline items={outline} onSelect={handleOutlineSelect} />

                {/* @monaco-editor/react の Editor コンポーネント */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Editor
                        defaultValue={INITIAL_DSL}
                        language={DSL_LANGUAGE_ID}
                        theme="spec-dark"
                        onMount={handleMount}
                        beforeMount={handleBeforeMount}
                        onChange={handleChange}
                        options={{
                            fontSize: 13,
                            lineHeight: 20,
                            fontFamily: '"Cascadia Code","SF Mono","Fira Code",monospace',
                            fontLigatures: true,
                            minimap: { enabled: false },
                            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                            overviewRulerLanes: 0,
                            padding: { top: 10, bottom: 10 },
                            renderLineHighlight: 'gutter',
                            scrollBeyondLastLine: false,
                            wordWrap: 'off',
                            automaticLayout: true,   // visible 変化・リサイズに自動追従
                            suggest: { showSnippets: true },
                            quickSuggestions: true,
                            tabSize: 2,
                            insertSpaces: true,
                            folding: true,
                            lineNumbers: 'on',
                        }}
                    />
                </div>

                {/* ── Markdown Preview Pane ── */}
                {showPreview && (
                    <MarkdownViewer markdown={markdownText} />
                )}
            </div>

            {/* ── StatusBar ── */}
            <StatusBar status={status} cursor={cursor} charCount={charCount} />
        </div>
    )
}
