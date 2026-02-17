/**
 * Main App component for the VSCode Class Diagram webview.
 *
 * Integrates view/ components (ClassEditorPanel, DiagramCanvas)
 * with the VSCode webview bridge and model adapter.
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { ClassEditorContainer } from '@/components/ClassEditorContainer'
import { ClassDiagramService } from '@/lib/application/ClassDiagramService'
import { ClassEditorPanel } from '@/components/class-editor'
import { DiagramCanvas } from '@/components/diagram-canvas'
import { detectRelationships } from '@/lib/detect-relationships'
import type { ClassInfo } from '@/lib/class-diagram-types'
import { createEmptyClass } from '@/lib/class-diagram-types'
import { GripVertical, Undo2, Redo2 } from 'lucide-react'
import { useVSCodeState } from './bridge/use-vscode'
import { getVSCodeApi, isVSCodeWebview } from './bridge/vscode-bridge'
import { CommandLine } from '@/components/command-line'
import { parseCommand, executeAction } from '@/lib/command-executor'
import { useCommandHistory } from '@/hooks/use-command-history' // 

// ==============================
// Toolbar for VSCode webview integration
// ==============================

function Toolbar({
    language,
    onLanguageChange,
    onSaveJson,
    onLoadJson,
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
    onGenerate: () => void
    onUndo: () => void
    onRedo: () => void
    canUndo: boolean
    canRedo: boolean
    historyCount: number
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
            {/* Undo/Redo buttons */}
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
                <span className="text-xs text-muted-foreground ml-1">
                    {historyCount}
                </span>
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
            <button
                onClick={onSaveJson}
                className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
            >
                Save JSON
            </button>
            <button
                onClick={onLoadJson}
                className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
            >
                Load JSON
            </button>
            <button
                onClick={onGenerate}
                className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
            >
                Generate
            </button>
        </div>
    )
}

// ==============================
// Main App
// ==============================

const MIN_PANEL_WIDTH = 360
const MAX_PANEL_WIDTH = 800
const DEFAULT_PANEL_WIDTH = 500

export function App({ service }: { service: ClassDiagramService }) {
    const vsCodeState = useVSCodeState(service)
    const [language, setLanguage] = useState('csharp')
    const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
    const isDragging = useRef(false)
    const lastX = useRef(0)
    // 履歴管理カスタムフック
    const commandHistory = useCommandHistory(vsCodeState.classes)

    // vsCodeState.classes の変更を commandHistory に同期
    useEffect(() => {
        commandHistory.setClasses(vsCodeState.classes);
    }, [vsCodeState.classes]);


    const {
        //classes,
        //setClasses,
        selectedId,
        setSelectedId,
        saveJson,
        loadJson,
        generateCode,
        changePrimitiveTypes,
    } = vsCodeState
    // commandHistory.classes を使用
    const classes = commandHistory.classes;
    const setClasses = commandHistory.setClasses;
    const relationships = useMemo(() => detectRelationships(classes), [classes])

    const handleUpdateClass = useCallback(
        (id: string, updated: ClassInfo) => {
            setClasses((prev) => prev.map((c) => (c.id === id ? updated : c)))
        },
        [setClasses],
    )

    const handleDeleteClass = useCallback(
        (id: string) => {
            setClasses((prev) =>
                prev
                    .filter((c) => c.id !== id)
                    .map((c) => ({
                        ...c,
                        interfaces: c.interfaces.filter((ifId) => ifId !== id),
                        baseClassId: c.baseClassId === id ? null : c.baseClassId,
                    })),
            )
            setSelectedId(null)
        },
        [setClasses, setSelectedId],
    )

    const handleAddClass = useCallback(() => {
        const newClass = createEmptyClass()
        setClasses((prev) => [...prev, newClass])
        setSelectedId(newClass.id)
    }, [setClasses, setSelectedId])

    const handleMoveClass = useCallback(
        (id: string, x: number, y: number) => {
            setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, x, y } : c)))
        },
        [setClasses],
    )

    const handleLanguageChange = useCallback(
        (lang: string) => {
            setLanguage(lang)
            changePrimitiveTypes(lang)
        },
        [changePrimitiveTypes],
    )

    const handleGenerate = useCallback(() => {
        generateCode(language)
    }, [generateCode, language])

    const handleExecuteCommand = useCallback((cmd: string) => {
        const action = parseCommand(cmd);
        if (action) {
            // 履歴管理側でモデルを更新し、その結果を使って shared service を一度だけ更新
            try {
                const result = commandHistory.executeCommand(action);
                if (result && result.model) {
                    service.replaceClassesFromArray(result.model.getClasses());
                }
            } catch (err) {
                console.error('Error applying command to shared service:', err);
            }
        }
    }, [commandHistory, service])
    // キーボードショートカット
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Z または Cmd+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                commandHistory.undo();
            }

            // Ctrl+Y, Ctrl+Shift+Z または Cmd+Shift+Z
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                commandHistory.redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [commandHistory]);

    const handlePanelResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault()
            isDragging.current = true
            lastX.current = e.clientX
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'

            const onMouseMove = (ev: MouseEvent) => {
                if (!isDragging.current) return
                const delta = ev.clientX - lastX.current
                lastX.current = ev.clientX
                setPanelWidth((prev) =>
                    Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, prev + delta)),
                )
            }

            const onMouseUp = () => {
                isDragging.current = false
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
                document.removeEventListener('mousemove', onMouseMove)
                document.removeEventListener('mouseup', onMouseUp)
            }

            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
        },
        [],
    )

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden">
            {/* Toolbar - matches media/ toolbar functionality */}
            <Toolbar
                language={language}
                onLanguageChange={handleLanguageChange}
                onSaveJson={saveJson}
                onLoadJson={loadJson}
                onGenerate={handleGenerate}
                onUndo={commandHistory.undo}
                onRedo={commandHistory.redo}
                canUndo={commandHistory.canUndo}
                canRedo={commandHistory.canRedo}
                historyCount={commandHistory.history.length}
            />

            {/* Main content area */}

            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left Panel - Editor */}
                <ClassEditorContainer service={service} setGlobalClasses={setClasses} />

                {/* Right Panel - Canvas */}
                <div className="flex-1 min-w-0">
                    <DiagramCanvas
                        classes={classes}
                        relationships={relationships}
                        selectedId={selectedId}
                        onSelectClass={setSelectedId}
                        onMoveClass={handleMoveClass}
                    />
                </div>
            </div>

            {/* CLI Command Bar */}
            <CommandLine onExecute={handleExecuteCommand} classes={classes} />
        </div>
    )
}
