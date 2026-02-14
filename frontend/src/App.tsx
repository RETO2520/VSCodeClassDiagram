/**
 * Main App component for the VSCode Class Diagram webview.
 *
 * Integrates view/ components (ClassEditorPanel, DiagramCanvas)
 * with the VSCode webview bridge and model adapter.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react'
import { ClassEditorPanel } from '@/components/class-editor'
import { DiagramCanvas } from '@/components/diagram-canvas'
import { detectRelationships } from '@/lib/detect-relationships'
import type { ClassInfo } from '@/lib/class-diagram-types'
import { createEmptyClass } from '@/lib/class-diagram-types'
import { GripVertical } from 'lucide-react'
import { useVSCodeState } from './bridge/use-vscode'
import { isVSCodeWebview } from './bridge/vscode-bridge'
import { CommandLine } from '@/components/command-line'
import { parseCommand, executeAction } from '@/lib/command-executor'

// ==============================
// Toolbar for VSCode webview integration
// ==============================

function Toolbar({
    language,
    onLanguageChange,
    onSaveJson,
    onLoadJson,
    onGenerate,
}: {
    language: string
    onLanguageChange: (lang: string) => void
    onSaveJson: () => void
    onLoadJson: () => void
    onGenerate: () => void
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
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

export function App() {
    const vsCodeState = useVSCodeState()
    const [language, setLanguage] = useState('csharp')
    const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
    const isDragging = useRef(false)
    const lastX = useRef(0)

    const {
        classes,
        setClasses,
        selectedId,
        setSelectedId,
        saveJson,
        loadJson,
        generateCode,
        changePrimitiveTypes,
    } = vsCodeState

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
        const action = parseCommand(cmd)
        if (action) {
            executeAction(action, setClasses)
        }
    }, [setClasses])

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
            />

            {/* Main content area */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left Panel - Editor */}
                <div className="flex-shrink-0" style={{ width: panelWidth }}>
                    <ClassEditorPanel
                        classes={classes}
                        selectedId={selectedId}
                        onSelectClass={setSelectedId}
                        onUpdateClass={handleUpdateClass}
                        onDeleteClass={handleDeleteClass}
                        onAddClass={handleAddClass}
                    />
                </div>

                {/* Resize handle */}
                <div
                    onMouseDown={handlePanelResizeStart}
                    className="flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-muted/50 transition-colors hover:bg-accent active:bg-accent"
                    role="separator"
                    aria-orientation="vertical"
                >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

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
