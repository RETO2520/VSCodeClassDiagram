/**
 * App.tsx — クラス図 + ワークフロー図 統合エディタ
 *
 * 構成:
 *   [ActivitySidebar] | [ClassEditorContainer] [DiagramCanvas]
 *                     または
 *   [ActivitySidebar] | [WorkflowEditorPanel]
 *
 * フロー:
 *   1. クラス図キャンバス上の operation 行をクリック
 *      → App が onOperationClick を受け取る
 *      → editorMode を 'workflow' に切り替え
 *      → WorkflowEditorPanel に opRef を渡す
 *   2. サイドバーのアイコンで手動切り替えも可能
 *   3. WorkflowEditorPanel 内の「Save Workflow」
 *      → onDiagramChange で diagram を受け取り service に同期
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
import { createEmptyClass } from '@/lib/class-diagram-types'
import { Undo2, Redo2 } from 'lucide-react'
import { useVSCodeState } from './bridge/use-vscode'
import { CommandLine } from '@/components/command-line'
import { parseCommand } from '@/lib/command-executor'
import { useCommandHistory } from '@/hooks/use-command-history'

import { ActivitySidebar, EditorMode } from '@/components/ActivitySidebar'
import { WorkflowEditorPanel, WFOpRef } from '@/components/WorkflowEditorPanel'

// ==============================
// Toolbar
// ==============================

function Toolbar({
    language,
    onLanguageChange,
    onSaveJson,
    onLoadJson,
    onLoadDsl,
    onGenerate,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    historyCount,
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
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-1 border-r pr-2">
                <button
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Undo2 className="h-4 w-4" />
                </button>
                <button
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Y)"
                    className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Redo2 className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground ml-1">{historyCount}</span>
            </div>

            <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
            >
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

    // ── エディタモード切り替え ──
    const [editorMode, setEditorMode] = useState<EditorMode>('class-diagram')

    // ── ワークフロー: 現在選択中の operation 参照 ──
    const [activeOpRef, setActiveOpRef] = useState<WFOpRef | null>(null)

    // ── ワークフロー: diagram データ (WorkflowEditorPanel が期待する形式) ──
    // ClassInfo の operations.workflow / workflowAst を正式フィールドとして参照する。
    const workflowDiagram = useMemo<{ classes: any[] }>(() => {
        return {
            classes: commandHistory.classes.map((cls) => ({
                id: cls.id,
                name: cls.name,
                isInterface: cls.kind === 'interface',
                isAbstract: cls.isAbstract,
                x: cls.x,
                y: cls.y,
                baseClassId: cls.baseClassId,
                interfaces: cls.interfaces,
                attributes: cls.members.map((m) => ({
                    name: m.name,
                    type: m.type,
                    visibility: m.visibility,
                    isStatic: m.isStatic,
                    isAbstract: m.isAbstract,
                })),
                operations: cls.operations.map((op) => ({
                    name: op.name,
                    returnType: op.returnType,
                    visibility: op.visibility,
                    modifier: op.isAbstract ? 'abstract' : op.isStatic ? 'static' : 'None',
                    parameters: op.parameters,
                    // ClassOperation の正式フィールドとして参照（as any 不要）
                    workflow: op.workflow,
                    workflowAst: op.workflowAst,
                })),
            })),
        }
    }, [commandHistory.classes])



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

    const {
        selectedId,
        setSelectedId,
        saveJson,
        loadJson,
        loadDsl,
        generateCode,
        changePrimitiveTypes,
    } = vsCodeState

    const classes = commandHistory.classes
    const setClasses = commandHistory.setClasses
    const relationships = useMemo(() => detectRelationships(classes), [classes])

    const handleMoveClass = useCallback(
        (id: string, x: number, y: number) => {
            setClasses((prev) => {
                const next = prev.map((c) => (c.id === id ? { ...c, x, y } : c))
                try { service.replaceClassesFromArray(next) } catch (e) { console.warn(e) }
                return next
            })
        },
        [setClasses, service],
    )

    // WorkflowEditorPanel が「Save Workflow」したとき →
    // service.applyUpdateOperationWorkflow() 経由で DomainModel が更新される。
    // App 側で diagram の書き戻しは不要（service の notifyModelChanged が React state を更新する）。

    // ── DiagramCanvas の operation クリックハンドラ ──
    // classId / operationId を ClassInfo から取得して WFOpRef に含める
    const handleOperationClick = useCallback(
        (params: { classIndex: number; opIndex: number; label: string }) => {
            const cls = classes[params.classIndex]
            const op = cls?.operations[params.opIndex]
            if (!cls || !op) return

            setActiveOpRef({
                classIndex: params.classIndex,
                opIndex: params.opIndex,
                classId: cls.id,
                operationId: op.id,
                label: params.label,
            })
            setEditorMode('workflow')
        },
        [classes],
    )
    const handleLanguageChange = useCallback(
        (lang: string) => {
            setLanguage(lang)
            changePrimitiveTypes(lang)
        },
        [changePrimitiveTypes],
    )

    const handleGenerate = useCallback(
        () => generateCode(language),
        [generateCode, language],
    )

    const handleExecuteCommand = useCallback((cmd: string) => {
        const action = parseCommand(cmd)
        if (!action) return
        if (action.type === 'UNDO') { handleUndo(); return }
        if (action.type === 'REDO') { handleRedo(); return }
        try {
            const result = commandHistory.executeCommand(action)
            if (result?.model) service.replaceClassesFromArray(result.model.getClasses())
        } catch (err) {
            console.error('Error applying command:', err)
        }
    }, [commandHistory, service, handleUndo, handleRedo])

    // キーボードショートカット
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault(); handleUndo()
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault(); handleRedo()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleUndo, handleRedo])

    // サイドバーバッジ用
    const activeWorkflowLabel = activeOpRef?.label ?? null

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden">
            {/* ── トップツールバー ── */}
            <Toolbar
                language={language}
                onLanguageChange={handleLanguageChange}
                onSaveJson={saveJson}
                onLoadJson={loadJson}
                onLoadDsl={loadDsl}
                onGenerate={handleGenerate}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={commandHistory.canUndo}
                canRedo={commandHistory.canRedo}
                historyCount={commandHistory.history.length}
            />

            {/* ── メイン: サイドバー + エディタ ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* 左端アクティビティサイドバー */}
                <ActivitySidebar
                    mode={editorMode}
                    onModeChange={setEditorMode}
                    activeWorkflowLabel={activeWorkflowLabel}
                />

                {/* エディタ本体 */}
                <div className="flex flex-1 min-h-0 min-w-0">

                    {editorMode === 'class-diagram' ? (
                        /* ── クラス図エディタ ── */
                        <>
                            <ClassEditorContainer
                                service={service}
                                setGlobalClasses={setClasses}
                                selectedId={selectedId}
                                onSelectClass={setSelectedId}
                            />
                            <div className="flex-1 min-w-0">
                                <DiagramCanvas
                                    classes={classes}
                                    relationships={relationships}
                                    selectedId={selectedId}
                                    onSelectClass={setSelectedId}
                                    onMoveClass={handleMoveClass}
                                    onOperationClick={handleOperationClick}
                                />
                            </div>
                        </>
                    ) : (
                        /* ── ワークフロー図エディタ ── */
                        <div className="flex-1 min-w-0 min-h-0">
                            <WorkflowEditorPanel
                                opRef={activeOpRef}
                                diagram={workflowDiagram}
                                service={service}
                            />
                        </div>
                    )}

                </div>
            </div>

            {/* ── CLI コマンドバー ── */}
            <CommandLine onExecute={handleExecuteCommand} classes={classes} />
        </div>
    )
}