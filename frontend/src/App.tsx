/**
 * App.tsx — クラス図 + ワークフロー図 + 仕様書DSLエディタ 統合エディタ
 *
 * レイアウト:
 *   [Toolbar]
 *   [ActivitySidebar] | [ClassEditorContainer] [DiagramCanvas]
 *                     | [WorkflowEditorPanel]
 *   ──── リサイズハンドル ────
 *   [SpecEditorPanel (下部ペイン, 高さ可変)]
 *   [CommandLine]
 */

import React, {
    useEffect,
    useState,
    useMemo,
    useCallback,
    useRef,
} from 'react'
import { ClassEditorContainer } from '@/components/ClassEditorContainer'
import { ClassDiagramService } from '@/lib/application/ClassDiagramService'
import { DiagramCanvas } from '@/components/diagram-canvas'
import { detectRelationships } from '@/lib/detect-relationships'
import type { ClassInfo } from '@/lib/class-diagram-types'
import { Undo2, Redo2, ChevronDown, ChevronUp } from 'lucide-react'
import { useVSCodeState } from './bridge/use-vscode'
import { CommandLine } from '@/components/command-line'
import { parseCommand } from '@/lib/command-executor'
import { useCommandHistory } from '@/hooks/use-command-history'

import { ActivitySidebar, EditorMode } from '@/components/ActivitySidebar'
import { WorkflowEditorPanel, WFOpRef } from '@/components/WorkflowEditorPanel'
import { SpecEditorPanel } from '@/components/SpecEditorPanel'

// ==============================
// 定数
// ==============================

const SPEC_PANE_MIN_HEIGHT = 120
const SPEC_PANE_MAX_HEIGHT = 600
const SPEC_PANE_DEFAULT_HEIGHT = 240

// ==============================
// Toolbar
// ==============================

function Toolbar({
    language, onLanguageChange, onSaveJson, onLoadJson, onLoadDsl, onGenerate,
    onUndo, onRedo, canUndo, canRedo, historyCount,
    specPaneOpen, onToggleSpecPane,
}: {
    language: string
    onLanguageChange: (lang: string) => void
    onSaveJson: () => void
    onLoadJson: () => void
    onLoadDsl: () => void
    onGenerate: () => void
    onUndo: () => void
    onRedo: () => void
    canUndo: boolean
    canRedo: boolean
    historyCount: number
    specPaneOpen: boolean
    onToggleSpecPane: () => void
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-1 border-r pr-2">
                <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
                    className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed">
                    <Undo2 className="h-4 w-4" />
                </button>
                <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
                    className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed">
                    <Redo2 className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground ml-1">{historyCount}</span>
            </div>

            <select value={language} onChange={e => onLanguageChange(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm">
                <option value="csharp">C#</option>
                <option value="typescript">TypeScript</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="rust">Rust</option>
            </select>

            <button onClick={onSaveJson} className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90">Save JSON</button>
            <button onClick={onLoadJson} className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90">Load JSON</button>
            <button onClick={onLoadDsl} className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90">Load DSL</button>
            <button onClick={onGenerate} className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90">Generate</button>

            <div className="flex-1" />

            {/* Spec DSL パネル開閉ボタン */}
            <button
                onClick={onToggleSpecPane}
                title={specPaneOpen ? 'Spec DSL エディタを閉じる' : 'Spec DSL エディタを開く'}
                className="h-8 flex items-center gap-1.5 px-3 rounded-md border text-sm transition-colors"
                style={{
                    borderColor: specPaneOpen ? '#3b82f6' : undefined,
                    color: specPaneOpen ? '#93c5fd' : undefined,
                    background: specPaneOpen ? 'rgba(59,130,246,0.1)' : undefined,
                }}
            >
                {specPaneOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                Spec DSL
            </button>
        </div>
    )
}

// ==============================
// ResizeHandle
// ==============================

function ResizeHandle({ onDrag }: { onDrag: (dy: number) => void }) {
    const dragging = useRef(false)
    const lastY = useRef(0)

    const onPointerDown = (e: React.PointerEvent) => {
        dragging.current = true
        lastY.current = e.clientY
            ; (e.target as Element).setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragging.current) return
        const dy = lastY.current - e.clientY   // 上にドラッグ = ペイン拡大
        lastY.current = e.clientY
        onDrag(dy)
    }
    const onPointerUp = () => { dragging.current = false }

    return (
        <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
                height: 5, flexShrink: 0, cursor: 'ns-resize',
                background: '#1e293b',
                borderTop: '1px solid #0f172a',
                borderBottom: '1px solid #0f172a',
                transition: 'background 0.15s',
                position: 'relative',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#3b82f6')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1e293b')}
        >
            {/* ドラッグガイドのドット */}
            <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex', gap: 3,
            }}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#334155' }} />
                ))}
            </div>
        </div>
    )
}

// ==============================
// Main App
// ==============================

export function App({ service }: { service: ClassDiagramService }) {
    const vsCodeState = useVSCodeState(service)
    const [language, setLanguage] = useState('csharp')
    const commandHistory = useCommandHistory(vsCodeState.classes)

    // ── エディタモード ──
    const [editorMode, setEditorMode] = useState<EditorMode>('class-diagram')

    // ── ワークフロー ──
    const [activeOpRef, setActiveOpRef] = useState<WFOpRef | null>(null)

    // ── Spec DSL 下部ペイン ──
    const [specPaneOpen, setSpecPaneOpen] = useState(true)
    const [specPaneHeight, setSpecPaneHeight] = useState(SPEC_PANE_DEFAULT_HEIGHT)

    const handleResizeDrag = useCallback((dy: number) => {
        setSpecPaneHeight(h =>
            Math.max(SPEC_PANE_MIN_HEIGHT, Math.min(SPEC_PANE_MAX_HEIGHT, h + dy))
        )
    }, [])

    // workflowDiagram（WorkflowEditorPanel向け・読み取り専用）
    const workflowDiagram = useMemo<{ classes: any[] }>(() => ({
        classes: commandHistory.classes.map(cls => ({
            id: cls.id,
            name: cls.name,
            isInterface: cls.kind === 'interface',
            isAbstract: cls.isAbstract,
            x: cls.x, y: cls.y,
            baseClassId: cls.baseClassId,
            interfaces: cls.interfaces,
            attributes: cls.members.map(m => ({
                name: m.name, type: m.type, visibility: m.visibility,
                isStatic: m.isStatic, isAbstract: m.isAbstract,
            })),
            operations: cls.operations.map(op => ({
                name: op.name, returnType: op.returnType, visibility: op.visibility,
                modifier: op.isAbstract ? 'abstract' : op.isStatic ? 'static' : 'None',
                parameters: op.parameters,
                workflow: op.workflow,
                workflowAst: op.workflowAst,
            })),
        })),
    }), [commandHistory.classes])



    // ── DiagramCanvas: operation クリック ──
    const classes = commandHistory.classes
    const setClasses = commandHistory.setClasses
    // ── service モデル変化 → classes state を同期 ──────────────────
    // SpecEditorPanel は service.setModel() + parse() でサービスのモデルを直接書き換える。
    // この変化を classes state（commandHistory）に反映しないと、
    // handleOperationClick で取る cls.id / op.id が古いIDのままになり、
    // WorkflowEditorPanel の findClassById が失敗する。
    useEffect(() => {
        const syncFromService = () => {
            const latest = service.getModel().getClasses()
            setClasses(latest)
        }
        service.onModelChanged(syncFromService)
        return () => service.offModelChanged(syncFromService)
    }, [service, setClasses])

    const handleOperationClick = useCallback(
        (params: { classIndex: number; opIndex: number; label: string }) => {
            // classes state ではなく service の最新モデルから classId/operationId を取る。
            // SpecEditorPanel がモデルをリセット後に classes state の同期が遅れる場合に備えて
            // 名前ベースでも検索する。
            const labelMatch = params.label.match(/^(.+?)\.(.+?)\(/)
            const className = labelMatch?.[1]
            const opName = labelMatch?.[2]
            const clsFromService = className ? service.getModel().findClassByName(className) : undefined
            const opFromService = clsFromService?.operations.find(o => o.name === opName)

            // service から取れた場合はそちらの ID を優先する
            const classId = clsFromService?.id ?? classes[params.classIndex]?.id ?? ''
            const operationId = opFromService?.id ?? classes[params.classIndex]?.operations[params.opIndex]?.id ?? ''

            if (!classId || !operationId) return
            setActiveOpRef({
                classIndex: params.classIndex, opIndex: params.opIndex,
                classId,
                operationId,
                label: params.label,
            })
            setEditorMode('workflow')
        },
        [classes, service],
    )

    // ── Undo / Redo ──
    const handleUndo = useCallback(() => {
        const res = commandHistory.undo()
        if (res?.model) service.replaceClassesFromArray(res.model.getClasses())
    }, [commandHistory, service])

    const handleRedo = useCallback(() => {
        const res = commandHistory.redo()
        if (res?.model) service.replaceClassesFromArray(res.model.getClasses())
    }, [commandHistory, service])

    useEffect(() => {
        commandHistory.setClasses(vsCodeState.classes)
    }, [vsCodeState.classes])

    const { selectedId, setSelectedId, saveJson, loadJson, loadDsl, generateCode, changePrimitiveTypes } = vsCodeState
    const relationships = useMemo(() => detectRelationships(classes), [classes])

    const handleMoveClass = useCallback((id: string, x: number, y: number) => {
        setClasses(prev => {
            const next = prev.map(c => c.id === id ? { ...c, x, y } : c)
            try { service.replaceClassesFromArray(next) } catch { }
            return next
        })
    }, [setClasses, service])

    const handleLanguageChange = useCallback((lang: string) => {
        setLanguage(lang); changePrimitiveTypes(lang)
    }, [changePrimitiveTypes])

    const handleGenerate = useCallback(() => generateCode(language), [generateCode, language])

    const handleExecuteCommand = useCallback((cmd: string) => {
        const action = parseCommand(cmd)
        if (!action) return
        if (action.type === 'UNDO') { handleUndo(); return }
        if (action.type === 'REDO') { handleRedo(); return }
        try {
            const result = commandHistory.executeCommand(action)
            if (result?.model) service.replaceClassesFromArray(result.model.getClasses())
        } catch (err) { console.error(err) }
    }, [commandHistory, service, handleUndo, handleRedo])

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
            // Ctrl+` で Spec DSL パネル開閉
            if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); setSpecPaneOpen(o => !o) }
        }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [handleUndo, handleRedo])

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden">

            {/* ── トップツールバー ── */}
            <Toolbar
                language={language} onLanguageChange={handleLanguageChange}
                onSaveJson={saveJson} onLoadJson={loadJson} onLoadDsl={loadDsl} onGenerate={handleGenerate}
                onUndo={handleUndo} onRedo={handleRedo}
                canUndo={commandHistory.canUndo} canRedo={commandHistory.canRedo}
                historyCount={commandHistory.history.length}
                specPaneOpen={specPaneOpen} onToggleSpecPane={() => setSpecPaneOpen(o => !o)}
            />

            {/* ── 上部エリア: サイドバー + エディタ ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                <ActivitySidebar
                    mode={editorMode} onModeChange={setEditorMode}
                    activeWorkflowLabel={activeOpRef?.label ?? null}
                />

                <div className="flex flex-1 min-h-0 min-w-0">
                    {editorMode === 'class-diagram' ? (
                        <>
                            <ClassEditorContainer
                                service={service} setGlobalClasses={setClasses}
                                selectedId={selectedId} onSelectClass={setSelectedId}
                            />
                            <div className="flex-1 min-w-0">
                                <DiagramCanvas
                                    classes={classes} relationships={relationships}
                                    selectedId={selectedId} onSelectClass={setSelectedId}
                                    onMoveClass={handleMoveClass} onOperationClick={handleOperationClick}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 min-w-0 min-h-0">
                            <WorkflowEditorPanel
                                opRef={activeOpRef} diagram={workflowDiagram} service={service}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ── 下部ペイン: Spec DSL エディタ ── */}
            {specPaneOpen && (
                <>
                    <ResizeHandle onDrag={handleResizeDrag} />
                    <div style={{ height: specPaneHeight, flexShrink: 0 }}>
                        <SpecEditorPanel
                            service={service}
                            classes={classes}
                            visible={specPaneOpen}
                            onCursorContext={ctx => {
                                if (!ctx.className) return
                                const model = service.getModel()
                                const cls = model.findClassByName(ctx.className)
                                if (!cls) return

                                if (ctx.operationName) {
                                    // メソッドブロック内 → ワークフロー図に切り替え
                                    // classes state は commandHistory 経由の更新のみ追従しており、
                                    // SpecEditorPanel が直接 service を書き換えたケースでは空になる。
                                    // そのため classIndex / opIndex の解決も含め service の最新モデルを使う。
                                    const allClasses = model.getClasses()
                                    const op = cls.operations.find(o => o.name === ctx.operationName)
                                    if (!op) return

                                    const classIndex = allClasses.findIndex(c => c.id === cls.id)
                                    const opIndex = cls.operations.findIndex(o => o.id === op.id)
                                    if (classIndex < 0 || opIndex < 0) return

                                    setActiveOpRef({
                                        classIndex,
                                        opIndex,
                                        classId: cls.id,
                                        operationId: op.id,
                                        label: `${cls.name}.${op.name}()`,
                                    })
                                    setEditorMode('workflow')
                                } else {
                                    // クラスブロック内（メソッド外）→ クラス図に切り替えて対象クラスを選択
                                    setSelectedId(cls.id)
                                    setEditorMode('class-diagram')
                                }
                            }}
                        />
                    </div>
                </>
            )}

            {/* ── CLI コマンドバー ── */}
            <CommandLine onExecute={handleExecuteCommand} classes={classes} />
        </div>
    )
}