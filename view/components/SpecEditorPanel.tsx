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

import React, { useRef, useState, useCallback, useEffect } from 'react'
import Editor, { useMonaco, OnMount, OnChange } from '@monaco-editor/react'
import DOMPurify from 'dompurify'
import type * as Monaco from 'monaco-editor'
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
loader.config({ monaco });
import type { ClassDiagramService } from '@/lib/application/ClassDiagramService'
import { SpecDslParser } from '@/lib/SpecDslParser'
import type { CliSuggestion, ParsedDsl } from '@/lib/SpecDslParser'
import { generateMarkdownFromClasses } from '@/lib/MarkdownGenerator'
import { lintWorkflow } from '@/lib/WorkflowLinter'
import type { LintWarning } from '@/lib/WorkflowLinter'
import { lintDsl } from '@/lib/DslLinter'
import type { DslLintWarning } from '@/lib/DslLinter'
import { DomainModel } from '@/lib/DomainModel'
import type { ClassInfo, ClassOperation } from '@/lib/class-diagram-types'
import { postMessage, onMessage } from '../../frontend/src/bridge/vscode-bridge';
import { CommandLine } from './command-line';
import { cn } from '@/lib/utils'
import { CliParser } from '@/lib/CliParser';
import { DiffViewer } from './DiffViewer';
import { Command } from '@/lib/commands/Command';
import { FolderTree } from './FolderTree';


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
    /** CLI提案リスト（優先度降順） */
    cliSuggestions: CliSuggestion[]
}

interface OutlineItem {
    name: string
    kind: 'class' | 'interface' | 'struct'
    isAbstract: boolean
    memberCount: number
    operationCount: number
    line: number
}

export interface FileEntry {
    path: string;
    isDirectory: boolean;
}

// ============================================================
// resolveContext
//
// DSL文字列とカーソル行番号から、カーソルが属する
// クラス名・メソッド名を特定する純粋関数。
//
// 走査ルール:
//   - "class/interface/struct Foo ..." 行 → className を更新
//   - "+/- methodName(...)" 行          → operationName を更新
//   - 新しいクラス宣言が来たら operationName をリセット
//   - カーソル行以降の走査は不要なので targetLine で打ち切る
// ============================================================

const CLASS_DECL_RE = /^(?:abstract\s+)?(?:class|interface|struct)\s+(\w+)/
const OPERATION_RE = /^[+\-#~]\s*(?:s|a\s+)?(\w+)\s*\(/

function resolveContext(dsl: string, targetLine: number): CursorContext {
    const lines = dsl.split("\n").map(l => l.trimEnd());
    let className: string | null = null
    let operationName: string | null = null

    for (let i = 0; i < Math.min(targetLine, lines.length); i++) {
        const trimmed = lines[i].trim()

        const classM = trimmed.match(CLASS_DECL_RE)
        if (classM) {
            className = classM[1]
            operationName = null   // クラスが変わったらメソッドコンテキストをリセット
            continue
        }

        const opM = trimmed.match(OPERATION_RE)
        if (opM && className) {
            operationName = opM[1]
        }
    }

    return { className, operationName }
}

interface CursorPos { line: number; col: number }

// ============================================================
// Props
// ============================================================

/** カーソル位置から特定したコンテキスト */
export interface CursorContext {
    /** カーソルが属するクラス名（クラス外なら null） */
    className: string | null
    /** カーソルが属するメソッド名（メソッドブロック外なら null） */
    operationName: string | null
}

export interface SpecEditorPanelProps {
    service: ClassDiagramService
    /** ワークフローデータ引き継ぎ用・読み取り専用 */
    classes: ClassInfo[]
    visible: boolean
    /**
     * カーソル移動時にコンテキストが変わったら呼ばれる。
     * 親はこれを受けてクラス図 / ワークフロー図を切り替える。
     */
    onCursorContext?: (ctx: CursorContext) => void
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
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            flex: 1,
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
/** インライン装飾（太字・イタリック・コード・リンク）を変換 */
function inlineHtml(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/_\((.+?)\)_/g, '<em>($1)</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** テーブル行かどうか */
function isTableRow(line: string): boolean {
    return line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')
}

/** 区切り行（|---|---| など）かどうか */
function isSepRow(line: string): boolean {
    return /^\|[\s\-|:]+\|$/.test(line.trim())
}

/** テーブルブロック（行配列）→ HTML */
function renderTable(rows: string[]): string {
    let out = '<table><thead>'
    let inBody = false
    for (const row of rows) {
        if (isSepRow(row)) {
            out += '</thead><tbody>'
            inBody = true
            continue
        }
        const tag = inBody ? 'td' : 'th'
        const cells = row.split('|').slice(1, -1).map(c => inlineHtml(c.trim()))
        out += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>'
    }
    out += inBody ? '</tbody></table>' : '</thead></table>'
    return out
}

function mdToHtml(md: string): string {
    // まず & < > をエスケープ
    const escaped = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    const lines = escaped.split('\n')
    const output: string[] = []
    let tableBuffer: string[] = []
    let listBuffer: string[] = []

    const flushTable = () => {
        if (tableBuffer.length > 0) {
            output.push(renderTable(tableBuffer))
            tableBuffer = []
        }
    }
    const flushList = () => {
        if (listBuffer.length > 0) {
            output.push('<ul>' + listBuffer.join('') + '</ul>')
            listBuffer = []
        }
    }

    for (const raw of lines) {
        const line = raw

        // ── テーブル行の蓄積 ──
        if (isTableRow(line)) {
            flushList()
            tableBuffer.push(line)
            continue
        }
        flushTable()

        // ── リスト項目 ──
        const liM = line.match(/^- (.+)$/)
        if (liM) {
            output.length > 0 && output[output.length - 1] !== '' && flushList()
            listBuffer.push(`<li>${inlineHtml(liM[1])}</li>`)
            continue
        }
        flushList()

        // ── 見出し ──
        const h4 = line.match(/^#### (.+)$/)
        if (h4) { output.push(`<h4>${inlineHtml(h4[1])}</h4>`); continue }
        const h3 = line.match(/^### (.+)$/)
        if (h3) { output.push(`<h3>${inlineHtml(h3[1])}</h3>`); continue }
        const h2 = line.match(/^## (.+)$/)
        if (h2) { output.push(`<h2>${inlineHtml(h2[1])}</h2>`); continue }
        const h1 = line.match(/^# (.+)$/)
        if (h1) { output.push(`<h1>${inlineHtml(h1[1])}</h1>`); continue }

        // ── 水平線 ──
        if (line.trim() === '---') { output.push('<hr/>'); continue }

        // ── 引用 ──
        const bq = line.match(/^&gt; (.+)$/)
        if (bq) { output.push(`<blockquote>${inlineHtml(bq[1])}</blockquote>`); continue }

        // ── 空行 ──
        if (line.trim() === '') { output.push(''); continue }

        // ── 通常テキスト → 段落 ──
        output.push(`<p>${inlineHtml(line)}</p>`)
    }

    flushTable()
    flushList()

    const rawHtml = output.join('\n')
    // DOMPurify でサニタイズ（ブラウザ環境または WebView 環境を想定）
    return DOMPurify.sanitize(rawHtml)
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
        .md-viewer h1 { color: #f1f5f9; font-size: 18px; border-bottom: 1px solid #1e293b; padding-bottom: 4px; margin: 16px 0 8px; }
        .md-viewer h2 { color: #e2e8f0; font-size: 15px; border-bottom: 1px solid #1e293b; padding-bottom: 2px; margin: 14px 0 6px; }
        .md-viewer h3 { color: #cbd5e1; font-size: 13px; margin: 12px 0 4px; }
        .md-viewer h4 { color: #94a3b8; font-size: 12px; margin: 8px 0 4px; }
        .md-viewer table { border-collapse: collapse; width: 100%; font-size: 11px; margin: 6px 0; }
        .md-viewer th, .md-viewer td { border: 1px solid #1e293b; padding: 3px 8px; text-align: left; }
        .md-viewer th { background: #0f172a; color: #94a3b8; }
        .md-viewer code { background: #1e293b; padding: 1px 4px; border-radius: 3px; font-family: "Cascadia Code",monospace; font-size: 11px; color: #7dd3fc; }
        .md-viewer a { color: #60a5fa; text-decoration: none; }
        .md-viewer a:hover { text-decoration: underline; }
        .md-viewer blockquote { border-left: 3px solid #334155; margin: 0; padding: 2px 8px; color: #64748b; }
        .md-viewer hr { border: none; border-top: 1px solid #1e293b; margin: 8px 0; }
        .md-viewer ul { padding-left: 16px; margin: 4px 0; }
        .md-viewer li { margin: 2px 0; }
        .md-viewer p { margin: 4px 0; }
        .md-viewer strong { color: #e2e8f0; }
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
        ok: `✓ 適用済み (${status.classCount} クラス)`,
        error: `✗ ${status.errors.length} エラー`,
    }[status.state]

    const lastStr = status.lastApplied
        ? status.lastApplied.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—'

    const SEP = <span style={{ color: '#1e293b', margin: '0 2px' }}>│</span>

    // 警告の詳細テキスト（ホバーで全件表示）
    const warnTooltip = status.warnings?.map((w, i) => {
        const lines = [`${i + 1}. ${w.message}`]
        if (w.suggestedOrder) lines.push(`   推奨順序: ${w.suggestedOrder.join(' → ')}`)
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
                        const lines = [`${i + 1}. ${w.message}`]
                        if (w.cycle) lines.push(`   サイクル: ${w.cycle.join(' → ')}`)
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
// CliSuggestionsPanel
// ============================================================

/**
 * CLI提案をステータスバー上部に折りたたみ表示するパネル。
 * 提案をクリックするとコマンドラインに自動入力される。
 */
function CliSuggestionsPanel({
    suggestions,
    onSelectSuggestion,
}: {
    suggestions: CliSuggestion[]
    onSelectSuggestion: (cmd: string, dryRun: boolean) => void
}) {
    const [expanded, setExpanded] = useState(false)

    if (suggestions.length === 0) return null

    const kindIcon: Record<string, string> = {
        'generate-code': '⚙',
        'add-member': '＋',
        'add-state-machine': '◎',
        'add-constraint': '⊘',
        'add-relation': '↔',
    }

    return (
        <div style={{
            borderTop: '1px solid #1e293b',
            background: '#0a1628',
            flexShrink: 0,
            overflow: 'hidden',
        }}>
            {/* ヘッダ（折りたたみトグル） */}
            <button
                onClick={() => setExpanded(v => !v)}
                style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 12px', background: 'transparent', border: 'none',
                    cursor: 'pointer', color: '#f59e0b',
                    fontFamily: '"Cascadia Code","SF Mono",monospace', fontSize: 10,
                }}
            >
                <span style={{ fontSize: 9 }}>{expanded ? '▾' : '▸'}</span>
                <span style={{ fontWeight: 700 }}>⚡ CLI提案</span>
                <span style={{
                    background: '#f59e0b22', border: '1px solid #f59e0b44',
                    borderRadius: 8, padding: '0 5px', fontSize: 9, color: '#fbbf24',
                }}>
                    {suggestions.length}
                </span>
                {!expanded && (
                    <span style={{ color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        — {suggestions[0].reason}
                    </span>
                )}
            </button>

            {/* 提案リスト */}
            {expanded && (
                <div style={{ maxHeight: 160, overflowY: 'auto', padding: '0 0 4px' }}>
                    {suggestions.map((s, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                padding: '4px 12px', cursor: 'pointer',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            onClick={() => onSelectSuggestion(s.command, s.dryRun ?? false)}
                            title={s.reason}
                        >
                            {/* アイコン */}
                            <span style={{ fontSize: 10, color: '#f59e0b', flexShrink: 0, marginTop: 1 }}>
                                {kindIcon[s.kind] ?? '•'}
                            </span>
                            {/* コマンド */}
                            <span style={{
                                fontSize: 10, color: '#7dd3fc', flexShrink: 0,
                                fontFamily: '"Cascadia Code","SF Mono",monospace',
                            }}>
                                {s.command}
                            </span>
                            {/* dry-run バッジ */}
                            {s.dryRun && (
                                <span style={{
                                    fontSize: 9, color: '#a78bfa',
                                    border: '1px solid #a78bfa44', borderRadius: 3,
                                    padding: '0 4px', flexShrink: 0, lineHeight: '14px',
                                }}>
                                    preview
                                </span>
                            )}
                            {/* 理由 */}
                            <span style={{
                                fontSize: 10, color: '#475569',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {s.reason}
                            </span>
                        </div>
                    ))}
                </div>
            )}
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
                border: `1px solid ${accent}30`, color: accent,
                background: `${accent}12`, fontSize: 10,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${accent}28`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${accent}12`)}
        >
            {children}
        </button>
    )
}

// ============================================================
// Main SpecEditorPanel
// ============================================================

const DEBOUNCE_MS = 600

const INITIAL_DSL = `// クラス仕様書 DSL
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
  + a getId(): string

// リレーション
Order *> OrderItem :items 1 *
`

export function SpecEditorPanel({ service, classes, visible, onCursorContext }: SpecEditorPanelProps) {
    // @monaco-editor/react が用意する monaco インスタンス
    const monaco = useMonaco()

    // エディタインスタンスへの ref（カーソル操作・getValue・マーカーに使用）
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const parserRef = useRef(new SpecDslParser())
    /** CodeLens に渡す最新のCLI提案。applyDsl が更新する。 */
    const cliSuggestionsRef = useRef<CliSuggestion[]>([])
    /** 元DSLのコメント・alias行を保持。toDSL()生成後に先頭へ差し込む。 */
    const headerBlockRef = useRef<string>('')
    /** パーサが収集したaliasマップ。toDSL()に渡してalias宣言を再生成する。 */
    const aliasMapRef = useRef<Map<string, string>>(new Map())

    const [status, setStatus] = useState<ParseStatus>({ state: 'idle', errors: [], warnings: [], dslWarnings: [], classCount: 0, lastApplied: null, cliSuggestions: [] })
    const [outline, setOutline] = useState<OutlineItem[]>([])
    const [cursor, setCursor] = useState<CursorPos>({ line: 1, col: 1 })
    const [charCount, setCharCount] = useState(INITIAL_DSL.length)
    const [showPreview, setShowPreview] = useState(false)
    const [markdownText, setMarkdownText] = useState('')

    // コマンドパレット用
    const [isCmdOpen, setIsCmdOpen] = useState(false);
    const [diffData, setDiffData] = useState<{ original: string; modified: string; command: Command } | null>(null);
    /** CodeLens からコマンドラインを開く際の初期入力値 */
    const [cmdInitialValue, setCmdInitialValue] = useState<string>('');

    const [diagramFiles, setDiagramFiles] = useState<FileEntry[]>([]);
    const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

    // ── IPC Listeners ──────────────────────────────────────────
    useEffect(() => {
        postMessage({ command: 'requestDiagramFiles' });

        const cleanup = onMessage(msg => {
            if (msg.command === 'diagramFilesLoaded') {
                setDiagramFiles(msg.payload.files as unknown as FileEntry[]);
            } else if (msg.command === 'diagramFileLoaded') {
                const { relativePath, dsl } = msg.payload;
                setActiveFilePath(relativePath);
                if (editorRef.current) {
                    editorRef.current.setValue(dsl);
                } else {
                    // もしエディタマウント前なら、INITIAL_DSLにどうやって渡すか...
                    // useRefで保持して handleMount で set するか。
                    // 簡単のため、今回はそのまま (通常はマウント後にロードされる想定)
                }
            }
        });
        return cleanup;
    }, []);

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
                    new RegExp(`(abstract\\s+)?(class|interface|struct)\\s+${cls.name}\\b`).test(l)
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
                        const opLabel = `${cls.name}.${op.name}()`
                        allWarnings.push(...lintWorkflow(op.workflow as any, opLabel))
                    }
                }
            }

            // 7. DSL構造の静的解析（lintDsl）
            const dslWarnings = lintDsl(parsed.classes)

            setStatus({ state: 'ok', errors: [], warnings: allWarnings, dslWarnings, classCount: parsed.classes.length, lastApplied: new Date(), cliSuggestions: parsed.cliSuggestions })

            // 9. CodeLens の更新：提案をエディタ上に表示する
            //    registerCodeLensProvider は Monaco マウント時に一度だけ登録するため、
            //    ここでは最新の cliSuggestions を shared ref 経由で渡す。
            cliSuggestionsRef.current = parsed.cliSuggestions;

            // 10. headerBlock と aliasMap を保持する
            //     コマンド実行後に toDSL() を呼ぶ際、これらを差し込んでコメント・alias を復元する。
            headerBlockRef.current = parsed.headerBlock;
            aliasMapRef.current = parserRef.current.getAliasMap();

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

            setStatus({ state: 'error', errors: [msg], warnings: [], dslWarnings: [], classCount: 0, lastApplied: null, cliSuggestions: [] })
        }
    }, [classes, service, monaco])

    // コマンドラインを閉じるときは、逆にエディタにフォーカスを戻すと親切です
    const handleClose = useCallback(() => {
        setIsCmdOpen(false);
        // エディタにフォーカスを戻す
        editorRef.current?.focus();
    }, []);
    // コマンド実行時のハンドラ
    const handleCommandExecute = useCallback((cmd: string) => {
        // ここで command-line の命令を DSL に変換するか、直接 service を叩くロジックを入れます
        postMessage({ command: 'log', level: 'debug', text: 'Execute command: ' + cmd });
        const parser = new CliParser();
        const command = parser.parse(cmd);
        if (!command) {
            postMessage({ command: 'log', level: 'error', text: 'Invalid command: ' + cmd });
            return;
        }
        const result = command.executeFromService(service);

        postMessage({ command: 'log', level: 'debug', text: `Result: ${result.success}` });


        if (result.success) {
            // toDSL() にaliasMapを渡してalias宣言を再生成し、
            // headerBlock（コメント行）を先頭に差し込む
            const rawDsl = result.payload?.dsl
                || result.model.toDSL(aliasMapRef.current);
            const header = headerBlockRef.current;
            const newDsl = header ? `${header}\n\n${rawDsl}` : rawDsl;

            if (command.isDryRun) {
                const currentDsl = editorRef.current?.getValue() ?? '';
                setDiffData({
                    original: currentDsl,
                    modified: newDsl,
                    command: command
                });
                setIsCmdOpen(false);
                return;
            }

            // Monaco エディタの内容を置き換え
            // pushUndoStop + executeEdits を使うと Ctrl+Z で元に戻せる
            const editor = editorRef.current;
            if (editor) {
                const model = editor.getModel();
                if (model) {
                    editor.pushUndoStop();
                    editor.executeEdits('spec-sync', [{
                        range: model.getFullModelRange(),   // 全体を選択範囲として
                        text: newDsl,
                        forceMoveMarkers: true,
                    }]);
                    editor.pushUndoStop();
                }
            }

            // クラス図・アウトライン・Markdownプレビューを再描画
            applyDsl(newDsl);
        }
        // 4. ステータスバーにメッセージを表示
        if (result.message) {
            setStatus(s => ({
                ...s,
                state: result.success ? 'ok' : 'error',
                errors: result.success ? [] : [result.message!],
            }));
        }

        //postMessage({ command: 'log', level: 'debug', text: 'DSL: ' + dsl });
        setIsCmdOpen(false);
    }, [service, applyDsl]);
    const [cmdPosition, setCmdPosition] = useState<{ top: number; left: number } | null>(null);
    // ── Monaco マウント時 ─────────────────────────────────────
    const handleMount: OnMount = useCallback((editor, monacoInstance) => {
        editorRef.current = editor

        // 言語・テーマ登録（useMonaco より確実なタイミング）
        registerDslLanguage(monacoInstance)

        // ── CodeLens 登録（CLI提案をエディタ上に表示） ──────────────
        // 既に登録済みの場合は再登録しない（Monaco は言語IDごとに管理）
        if (!monacoInstance.languages.getLanguages().some(
            (l: any) => l.id === DSL_LANGUAGE_ID && (l as any)._codeLensRegistered
        )) {
            monacoInstance.languages.registerCodeLensProvider(DSL_LANGUAGE_ID, {
                provideCodeLenses(model: any) {
                    const suggestions = cliSuggestionsRef.current;
                    if (!suggestions.length) return { lenses: [], dispose: () => { } };

                    const text = model.getValue();
                    const lines = text.split('\n');
                    const lenses: Monaco.languages.CodeLens[] = [];

                    for (const suggestion of suggestions.slice(0, 5)) { // 上位5件まで表示
                        if (!suggestion.className) continue;

                        // クラス宣言行を探す
                        const lineIdx = lines.findIndex((l: any) =>
                            new RegExp(`(abstract\\s+)?(class|interface|struct)\\s+${suggestion.className}\\b`).test(l)
                        );
                        if (lineIdx === -1) continue;

                        const prefix = suggestion.dryRun ? 'dry-run ' : '';
                        lenses.push({
                            range: {
                                startLineNumber: lineIdx + 1,
                                startColumn: 1,
                                endLineNumber: lineIdx + 1,
                                endColumn: 1,
                            },
                            command: {
                                id: 'spec.applyCliSuggestion',
                                title: `⚡ ${suggestion.dryRun ? '👁 ' : ''}${suggestion.command}`,
                                tooltip: `${suggestion.reason}${suggestion.dryRun ? '\n(DiffViewerでプレビュー後に適用)' : ''}`,
                                arguments: [prefix + suggestion.command],
                            },
                        });
                    }
                    return { lenses, dispose: () => { } };
                },
                resolveCodeLens(_: any, codeLens: any) {
                    return codeLens;
                },
            });
        }

        // ── CodeLens コマンドのハンドラ登録 ───────────────────────
        // addCommand(0,...) は arguments を受け取れないため、
        // monacoInstance.editor.registerCommand を使う。
        // CodeLens の command.id にはここで登録した ID を使う。
        monacoInstance.editor.registerCommand(
            'spec.applyCliSuggestion',
            (_accessor: any, cmd: string) => {
                if (cmd) {
                    setCmdInitialValue(cmd);
                    setIsCmdOpen(true);
                }
            }
        );

        // カーソル位置 + コンテキスト解決
        let lastCtxKey = ''  // 前回のコンテキストと同じなら通知しない
        editor.onDidChangeCursorPosition(e => {
            const lineNumber = e.position.lineNumber
            setCursor({ line: lineNumber, col: e.position.column })
            if (onCursorContext) {
                const dsl = editor.getValue()
                const ctx = resolveContext(dsl, lineNumber)
                const key = `${ctx.className ?? ''}::${ctx.operationName ?? ''}`
                if (key !== lastCtxKey) {
                    lastCtxKey = key
                    onCursorContext(ctx)
                }
            } else {
                // log

            }

        })

        // 例: ":" キーでコマンドラインを開く
        editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.Semicolon, () => {
            // ここで直接状態を更新
            // setIsCmdOpen(true) がスコープ内にあることを確認
            setIsCmdOpen(true);
        });
        // "Escape" で閉じるアクションも追加 (コマンドラインが開いている時用)
        editor.addCommand(monacoInstance.KeyCode.Escape, () => {
            // コマンドラインが開いている場合のみ閉じる
            setIsCmdOpen(prev => {
                if (prev) return false;
                return prev;
            });
        });

        editor.addAction({
            id: 'open-command-line',
            label: 'Open Command Line',
            keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.Semicolon],
            run: (ed) => {
                const cursor = ed.getPosition();
                if (cursor) {
                    // カーソルのピクセル位置を取得
                    const pixelCoords = ed.getScrolledVisiblePosition(cursor);
                    if (pixelCoords) {
                        // エディタのコンテナに対する相対位置を計算
                        // lineHeight (20px) 分だけ下にずらして、次行に表示されるようにする
                        setCmdPosition({
                            top: pixelCoords.top + 22,
                            left: pixelCoords.left
                        });
                        setIsCmdOpen(true);
                    }
                }
            }
        });

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

        // 2. 変更時にも現在のカーソル位置でコンテキストを再計算して通知する
        if (editorRef.current && onCursorContext) {
            const position = editorRef.current.getPosition();
            if (position) {
                const ctx = resolveContext(value || '', position.lineNumber);
                onCursorContext(ctx); // これにより、入力直後にワークフロー表示が切り替わる
            }
        }
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
                if (activeFilePath) {
                    postMessage({ command: 'saveDiagramFile', payload: { relativePath: activeFilePath, dsl } });
                } else {
                    postMessage({ command: 'saveDsl', payload: { dsl, fileName } })
                }
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

            {/* ── メイン: Sidebar(FolderTree+Outline) + Editor + Markdown Preview ── */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                {/* 左サイドバー: FolderTree と Outline を縦積み */}
                <div style={{
                    width: 176, minWidth: 176, flexShrink: 0,
                    borderRight: '1px solid #1e293b',
                    background: '#0a1628',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                    <FolderTree
                        files={diagramFiles}
                        activeFilePath={activeFilePath}
                        onSelectFile={(path) => postMessage({ command: 'loadDiagramFile', payload: { relativePath: path } })}
                        onCreateFile={(path) => {
                            postMessage({ command: 'ui.createFile', payload: { relativeParentPath: path } });
                        }}
                        onCreateFolder={(path) => {
                            postMessage({ command: 'ui.createFolder', payload: { relativeParentPath: path } });
                        }}
                        onDelete={(path) => {
                            postMessage({ command: 'ui.deleteEntry', payload: { relativePath: path } });
                        }}
                        onRename={(oldPath, newName) => {
                            postMessage({ command: 'ui.renameEntry', payload: { oldRelativePath: oldPath, newName } });
                        }}
                        onRefresh={() => postMessage({ command: 'requestDiagramFiles' })}
                    />
                    <Outline items={outline} onSelect={handleOutlineSelect} />
                </div>

                {/* @monaco-editor/react の Editor コンポーネント */}
                <div className="relative flex-1 flex flex-col min-w-0" style={{ flex: 1, minWidth: 0 }}>
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
                    {/* ── Floating CommandLine Overlay ── */}
                    {isCmdOpen && (
                        <div className="absolute inset-0 z-50 overflow-visible">
                            {/* 背景クリックで閉じる */}
                            <div className="absolute inset-0" onClick={() => setIsCmdOpen(false)} />

                            {/* コマンドライン本体 */}
                            <div className={cn(
                                "absolute pointer-events-auto z-60 w-[400px]",
                                // アニメーションクラス
                                "animate-in fade-in zoom-in-95 duration-150 ease-out"
                            )}
                                style={{
                                    top: cmdPosition?.top,
                                    left: cmdPosition?.left,
                                    width: '400px', // インラインなので少し幅を狭める
                                }}>
                                {/* ここにCommandLine を配置 */}
                                <CommandLine
                                    classes={classes || []}
                                    initialValue={cmdInitialValue}
                                    onExecute={(cmd) => {
                                        setCmdInitialValue('');
                                        handleCommandExecute(cmd);
                                        // setIsCmdOpen(false); // handleCommandExecute 内で dry-run の場合に制御するためここでは消さない
                                    }}
                                    onClose={() => {
                                        setCmdInitialValue('');
                                        setIsCmdOpen(false);
                                        editorRef.current?.focus();
                                    }}
                                />
                            </div>

                        </div>
                    )}

                    {/* ── Diff Viewer Overlay ── */}
                    {diffData && (
                        <DiffViewer
                            original={diffData.original}
                            modified={diffData.modified}
                            onApply={() => {
                                const cmd = diffData.command;
                                cmd.isDryRun = false; // 実際に適用する
                                const res = cmd.executeFromService(service);
                                if (res.success) {
                                    const rawDsl = res.payload?.dsl
                                        || res.model.toDSL(aliasMapRef.current);
                                    const header = headerBlockRef.current;
                                    const dsl = header ? `${header}\n\n${rawDsl}` : rawDsl;
                                    const editor = editorRef.current;
                                    if (editor) {
                                        const model = editor.getModel();
                                        if (model) {
                                            editor.pushUndoStop();
                                            editor.executeEdits('spec-sync', [{
                                                range: model.getFullModelRange(),
                                                text: dsl,
                                                forceMoveMarkers: true,
                                            }]);
                                            editor.pushUndoStop();
                                        }
                                    }
                                    applyDsl(dsl);
                                }
                                setDiffData(null);
                                editorRef.current?.focus();
                            }}
                            onCancel={() => {
                                setDiffData(null);
                                editorRef.current?.focus();
                            }}
                        />
                    )}
                </div>

                {/* ── Markdown Preview Pane ── */}
                {showPreview && (
                    <MarkdownViewer markdown={markdownText} />
                )}
            </div>


            {/* ── CLI提案パネル ── */}
            <CliSuggestionsPanel
                suggestions={status.cliSuggestions}
                onSelectSuggestion={(cmd, dryRun) => {
                    const finalCmd = dryRun ? `dry-run ${cmd}` : cmd;
                    setCmdInitialValue(finalCmd);
                    const editor = editorRef.current;
                    if (editor) {
                        const cursor = editor.getPosition();
                        if (cursor) {
                            const pixelCoords = editor.getScrolledVisiblePosition(cursor);
                            if (pixelCoords) {
                                setCmdPosition({ top: pixelCoords.top + 22, left: pixelCoords.left });
                            }
                        }
                    }
                    setIsCmdOpen(true);
                }}
            />

            {/* ── StatusBar ── */}
            <StatusBar status={status} cursor={cursor} charCount={charCount} />
            {/* 簡易アニメーション */}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translate(-50%, -10px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
            `}</style>
        </div>
    )
}