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
 *
 * ============================================================
 * 🔄 双方向同期アーキテクチャ
 * ============================================================
 *
 * 同期方向:
 *
 * 1. SpecEditorPanel → Canvas (クラス図)
 *    - SpecEditorPanel の applyDsl() が DSL をパースして ClassInfo[] を生成
 *    - service.setModel(domain) で service の状態を更新
 *    - service.onModelChanged() が emitted されて classes state を同期
 *    - DiagramCanvas に classes が反映される
 *
 * 2. Canvas → SpecEditorPanel
 *    - handleMoveClass / handleMoveClass で classes を更新
 *    - service.replaceClassesFromArray() で service の状態を同期
 *    - SpecEditorPanel の classes prop が更新される
 *
 * 3. .diagram フォルダとの同期（リアルタイムではなく手動）
 *    - Refresh ボタン: .diagram フォルダを読み込んで SpecEditorPanel に反映
 *    - Save ボタン: 現在の DSL をファイルに保存
 *    - ファイル削除時: dslファイル有無で警告判定
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
import { ComponentEditorContainer } from '@/components/ComponentEditorContainer'


import { DiagramCanvas } from '@/components/diagram-canvas'
import { ComponentDiagramCanvas } from '@/components/component-diagram-canvas'
import { detectRelationships } from '@/lib/detect-relationships'
import type { ClassInfo, Relationship } from '@/lib/class-diagram-types'
import type { ComponentInfo, ComponentRelationship, PortConnection } from '@/lib/component-diagram-types'
import { ComponentDomainModel } from '@/lib/ComponentDomainModel'
import { Undo2, Redo2, ChevronDown, ChevronUp } from 'lucide-react'
import { useVSCodeState } from './bridge/use-vscode'
import { CommandLine } from '@/components/command-line'
import { parseCommand } from '@/lib/command-executor'
import { useCommandHistory } from '@/hooks/use-command-history'

import { ActivitySidebar, EditorMode } from '@/components/ActivitySidebar'
import { WorkflowEditorPanel, WFOpRef } from '@/components/WorkflowEditorPanel'
import { SpecEditorPanel } from '@/components/SpecEditorPanel'
import { ComponentService } from '@/lib/application/ComponentService'
import { postMessage, onMessage } from './bridge/vscode-bridge'

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

export function App({ service, componentService }: { service: ClassDiagramService, componentService: ComponentService }) {
    const vsCodeState = useVSCodeState(service)
    const [language, setLanguage] = useState('csharp')
    const commandHistory = useCommandHistory(vsCodeState.classes)

    // ── エディタモード ──
    const [editorMode, setEditorMode] = useState<EditorMode>('class-diagram')

    // ── ワークフロー ──
    const [activeOpRef, setActiveOpRef] = useState<WFOpRef | null>(null)

    // ── Component Diagram ──
    const [componentNodes, setComponentNodes] = useState<ComponentInfo[]>([])
    const [componentRels, setComponentRels] = useState<ComponentRelationship[]>([])
    const [portConnections, setPortConnections] = useState<PortConnection[]>([])
    const [componentRefreshToken, setComponentRefreshToken] = useState(0)
    const [componentDslFiles, setComponentDslFiles] = useState<string[]>([])
    const [dslContentByPath, setDslContentByPath] = useState<Record<string, string>>({})
    const componentListHydratedRef = useRef(false)

    const saveComponentListJson = useCallback((silent: boolean) => {
        if (!componentListHydratedRef.current) {
            return
        }
        try {
            const snapshotComponents = (componentService as any).componentDomain.getComponents?.() ?? componentNodes
            const snapshotRelationships = (componentService as any).componentDomain.getRelationships?.() ?? componentRels
            postMessage({
                command: 'saveComponentListJson',
                payload: {
                    components: snapshotComponents,
                    relationships: snapshotRelationships,
                    portConnections: (componentService as any).componentDomain.getPortConnections?.() ?? portConnections,
                    silent,
                },
            })
        } catch (err) {
            console.error('[App] saveComponentListJson error:', err)
        }
    }, [componentService, componentNodes, componentRels])

    const debouncedSaveComponentDSL = useCallback((nodes: ComponentInfo[]) => {
        if (!componentListHydratedRef.current) {
            return
        }
        if (componentUpdateDebounceRef.current) {
            clearTimeout(componentUpdateDebounceRef.current)
        }
        componentUpdateDebounceRef.current = setTimeout(() => {
            try {
                const snapshotComponents = nodes
                const snapshotRelationships = (componentService as any).componentDomain.getRelationships?.() ?? componentRels
                postMessage({
                    command: 'saveComponentListJson',
                    payload: {
                        components: snapshotComponents,
                        relationships: snapshotRelationships,
                        portConnections: (componentService as any).componentDomain.getPortConnections?.() ?? portConnections,
                        silent: true,
                    },
                })
            } catch (err) {
                console.error('[App] debouncedSaveComponentDSL error:', err)
            }
        }, 500) // 500ms debounce
    }, [componentService, componentRels])

    // ── Spec DSL 下部ペイン ──
    const [specPaneOpen, setSpecPaneOpen] = useState(true)
    const [specPaneHeight, setSpecPaneHeight] = useState(SPEC_PANE_DEFAULT_HEIGHT)

    const handleResizeDrag = useCallback((dy: number) => {
        setSpecPaneHeight(h =>
            Math.max(SPEC_PANE_MIN_HEIGHT, Math.min(SPEC_PANE_MAX_HEIGHT, h + dy))
        )
    }, [])

    // ── Component 変更通知のdebounce ──
    // FolderTree や SpecEditorPanel から onComponentsChanged が複数回呼ばれるのを防ぐ
    const componentUpdateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingComponentUpdateRef = useRef(false)

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
    const classRelationships = useMemo<Relationship[]>(() => detectRelationships(classes), [classes])
    const componentCanvasClasses = useMemo<ClassInfo[]>(() => {
        try {
            const domain = (componentService as any).classDomain
            if (domain?.getClasses) {
                return domain.getClasses()
            }
        } catch {
            // fall through to global classes
        }
        return classes
    }, [componentService, classes, componentNodes, componentRels, componentRefreshToken])
    const componentCanvasClassRelationships = useMemo<Relationship[]>(() => {
        try {
            const domain = (componentService as any).classDomain
            if (domain?.detectRelationships) {
                return domain.detectRelationships()
            }
        } catch {
            // fall through to local detection
        }
        return detectRelationships(componentCanvasClasses)
    }, [componentService, componentCanvasClasses, componentNodes, componentRels, componentRefreshToken])

    const handleMoveClass = useCallback((id: string, x: number, y: number) => {
        setClasses(prev => {
            const next = prev.map(c => c.id === id ? { ...c, x, y } : c)
            try { service.replaceClassesFromArray(next) } catch { }
            return next
        })
    }, [setClasses, service])

    const handleMoveComponent = useCallback((id: string, x: number, y: number) => {
        setComponentNodes(prev => {
            const next = prev.map(c => c.id === id ? { ...c, x, y } : c)
            try {
                const nextDomain = (componentService as any).componentDomain.updateComponentPosition(id, x, y)
                    ; (componentService as any).componentDomain = nextDomain
            } catch { }
            return next
        })
        debouncedSaveComponentDSL(componentNodes)
    }, [componentService, componentNodes])

    const handleResizeComponent = useCallback((id: string, width: number, height: number) => {
        setComponentNodes(prev => {
            const next = prev.map(c => c.id === id ? { ...c, width, height } : c)
            try {
                const nextDomain = (componentService as any).componentDomain.updateComponentSize(id, width, height)
                    ; (componentService as any).componentDomain = nextDomain
            } catch { }
            return next
        })
        debouncedSaveComponentDSL(componentNodes)
    }, [componentService, componentNodes])

    const handleSelectComponent = useCallback((id: string | null) => {
        setSelectedId(id)
    }, [setSelectedId])

    // ===============================
    // 手動ポートのハンドラー
    // ===============================
    const handleAddPort = useCallback((componentId: string, direction: 'input' | 'output') => {
        const newNodes = componentNodes.map(node => {
            if (node.id === componentId) {
                const existing = node.manualPorts || []
                const prefix = direction === 'input' ? 'in' : 'out'
                const used = new Set(existing.map(p => p.name))
                let nextIndex = existing.filter(p => p.direction === direction).length + 1
                let portName = `${prefix}-${nextIndex}`
                while (used.has(portName)) {
                    nextIndex += 1
                    portName = `${prefix}-${nextIndex}`
                }
                const id = `manual-${Date.now()}`
                return {
                    ...node,
                    manualPorts: [...existing, { id, name: portName, direction }]
                }
            }
            return node
        })
        setComponentNodes(newNodes)
        debouncedSaveComponentDSL(newNodes)
    }, [componentNodes, debouncedSaveComponentDSL])

    const handleDeletePort = useCallback((componentId: string, portId: string) => {
        const newNodes = componentNodes.map(node => {
            if (node.id === componentId) {
                return {
                    ...node,
                    manualPorts: (node.manualPorts || []).filter(p => p.id !== portId)
                }
            }
            return node
        })
        setComponentNodes(newNodes)
        debouncedSaveComponentDSL(newNodes)
    }, [componentNodes, debouncedSaveComponentDSL])

    const handleAddRelationship = useCallback((sourceComponentId: string, targetComponentId: string, label?: string) => {
        if (sourceComponentId === targetComponentId) return
        try {
            const domain = (componentService as any).componentDomain
            const existing = domain?.getRelationships?.() ?? componentRels
            const hasSameManual = existing.some((rel: ComponentRelationship) =>
                rel.sourceComponentId === sourceComponentId
                && rel.targetComponentId === targetComponentId
                && (rel.label ?? "") === (label ?? "")
                && rel.basedOnIds.length === 0
            )
            if (hasSameManual) return

            const nextDomain = domain.addRelationship(sourceComponentId, targetComponentId, label)
                ; (componentService as any).componentDomain = nextDomain
            const nextRels = nextDomain.getRelationships?.() ?? existing
            setComponentRels(nextRels)
            debouncedSaveComponentDSL(componentNodes)
        } catch (err) {
            console.error('[App] handleAddRelationship error:', err)
        }
    }, [componentService, componentRels, componentNodes, debouncedSaveComponentDSL])

    const handleAddPortConnection = useCallback((
        sourceComponentId: string, sourcePortId: string,
        targetComponentId: string, targetPortId: string,
        label?: string
    ) => {
        try {
            const domain = (componentService as any).componentDomain
            const nextDomain = domain.addPortConnection(sourceComponentId, sourcePortId, targetComponentId, targetPortId, label)
            ;(componentService as any).componentDomain = nextDomain
            setPortConnections(nextDomain.getPortConnections?.() ?? [])
            debouncedSaveComponentDSL(componentNodes)
        } catch (err) {
            console.error('[App] handleAddPortConnection error:', err)
        }
    }, [componentService, componentNodes, debouncedSaveComponentDSL])

    const handleDeletePortConnection = useCallback((connectionId: string) => {
        try {
            const domain = (componentService as any).componentDomain
            const nextDomain = domain.removePortConnection(connectionId)
            ;(componentService as any).componentDomain = nextDomain
            setPortConnections(nextDomain.getPortConnections?.() ?? [])
            debouncedSaveComponentDSL(componentNodes)
        } catch (err) {
            console.error('[App] handleDeletePortConnection error:', err)
        }
    }, [componentService, componentNodes, debouncedSaveComponentDSL])

    // ── classes が変更されたときに componentNodes を同期する ──
    // SpecEditorPanel や Canvas からの class 変更を検出して、
    // componentNodes 内のクラスIDがまだ有効かチェック
    useEffect(() => {
        console.debug('[App] classes changed, syncing componentNodes:', {
            classCount: classes.length,
            componentNodesCount: componentNodes.length,
            classNames: classes.map(c => c.name)
        })

        // TODO: かなりの頻度で実行されるので、パフォーマンスを考慮する必要がある
        setComponentNodes(prev => {
            // classes から削除されたクラスを特定
            const currentClassIds = new Set(classes.map(c => c.id))
            const prevClassIds = new Set(prev.flatMap(comp => comp.classIds))

            // 削除されたクラスを含むコンポーネントをチェック
            const deletedClassIds = Array.from(prevClassIds).filter(id => !currentClassIds.has(id))

            if (deletedClassIds.length === 0) {

                postMessage({ command: 'log', level: 'debug', text: '[App] No deleted classes detected' });
                return prev
            }


            postMessage({ command: 'log', level: 'debug', text: '[App] Detected deleted classes: ' + deletedClassIds.join(', ') });
            // 削除されたクラスをコンポーネントから除去
            const next = prev.map(comp => ({
                ...comp,
                classIds: comp.classIds.filter(id => currentClassIds.has(id))
            })).filter(comp => {
                // classIds が空になった component を削除するかは要件次第
                // ここでは保持する
                return comp.kind !== 'component' || comp.classIds.length > 0 || comp.childComponentIds.length > 0
            })

            postMessage({ command: 'log', level: 'debug', text: '[App] Updated componentNodes next: ' + JSON.stringify(next) });
            postMessage({ command: 'log', level: 'debug', text: '[App] Updated componentNodes prev: ' + JSON.stringify(prev) });

            return next
        })
    }, [classes])

    const commitComponentChanges = useCallback(() => {
        // ── コンポーネント変更を .diagram フォルダに反映 ──
        // componentNodes と componentRels の状態を保存する必要がある場合、
        // ここで postMessage を送信して拡張機能に通知する。
        // 例：
        // postMessage({
        //   command: 'syncComponentModel',
        //   payload: { components: componentNodes, relationships: componentRels }
        // })
        setComponentRefreshToken(t => t + 1)
    }, [])

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

    useEffect(() => {
        const cleanup = onMessage((msg) => {
            if (msg.command === 'componentListJsonLoaded') {
                const rawComponents = Array.isArray(msg.payload?.components) ? msg.payload.components : []
                const rawRelationships = Array.isArray(msg.payload?.relationships) ? msg.payload.relationships : []
                const rawPortConnections = Array.isArray(msg.payload?.portConnections) ? msg.payload.portConnections : []
                const components = rawComponents as ComponentInfo[]
                const relationships = rawRelationships as ComponentRelationship[]
                const pcs = rawPortConnections as PortConnection[]
                componentListHydratedRef.current = true

                try {
                    const restoredDomain = ComponentDomainModel.from(components, relationships, pcs)
                    ; (componentService as any).componentDomain = restoredDomain
                    setComponentNodes(restoredDomain.getComponents())
                    setComponentRels(restoredDomain.getRelationships())
                    setPortConnections(restoredDomain.getPortConnections())
                    setComponentRefreshToken((prev) => prev + 1)
                } catch (err) {
                    console.error('[App] Failed to restore component-list.json:', err)
                }
                return
            }

            if (msg.command === 'diagramFilesLoaded') {
                const files = Array.isArray(msg.payload?.files) ? msg.payload.files : []
                const dslFiles = files
                    .filter((f: unknown): f is { path: string; isDirectory: boolean } => {
                        return !!f
                            && typeof (f as any).path === 'string'
                            && typeof (f as any).isDirectory === 'boolean'
                    })
                    .filter((f) => !f.isDirectory)
                    .map((f) => f.path)
                    .filter((p) => p.toLowerCase().endsWith('.dsl') || p.toLowerCase().endsWith('.txt'))
                    .sort((a, b) => a.localeCompare(b, 'en'))
                setComponentDslFiles(dslFiles)
                return
            }

            if (msg.command === 'diagramFilesBulkLoaded') {
                const files = Array.isArray(msg.payload?.files) ? msg.payload.files : []
                setDslContentByPath((prev) => {
                    const next = { ...prev }
                    for (const file of files) {
                        const relativePath = (file as any)?.relativePath
                        const dsl = (file as any)?.dsl
                        if (typeof relativePath === 'string' && typeof dsl === 'string') {
                            next[relativePath] = dsl
                        }
                    }
                    return next
                })
                return
            }

            if (msg.command === 'diagramFileLoaded') {
                const relativePath = (msg.payload as any)?.relativePath
                const dsl = (msg.payload as any)?.dsl
                if (typeof relativePath === 'string' && typeof dsl === 'string') {
                    setDslContentByPath((prev) => ({
                        ...prev,
                        [relativePath]: dsl,
                    }))
                }
            }
        })

        return cleanup
    }, [componentService])

    useEffect(() => {
        postMessage({ command: 'requestDiagramFiles' })
    }, [])

    useEffect(() => {
        const neededPaths = Array.from(new Set(
            componentNodes
                .filter((c) => c.kind === 'component' && typeof c.dslPath === 'string' && c.dslPath.length > 0)
                .map((c) => c.dslPath as string)
        ))

        if (neededPaths.length === 0) return
        const missing = neededPaths.filter((p) => !dslContentByPath[p])
        if (missing.length === 0) return

        postMessage({ command: 'loadDiagramFilesBulk', payload: { relativePaths: missing } })
    }, [componentNodes, dslContentByPath])

    useEffect(() => {
        const saveOnClose = () => saveComponentListJson(true)
        window.addEventListener('beforeunload', saveOnClose)
        window.addEventListener('pagehide', saveOnClose)
        return () => {
            saveOnClose()
            window.removeEventListener('beforeunload', saveOnClose)
            window.removeEventListener('pagehide', saveOnClose)
        }
    }, [saveComponentListJson])

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
                                    classes={classes} relationships={classRelationships}
                                    selectedId={selectedId} onSelectClass={setSelectedId}
                                    onMoveClass={handleMoveClass} onOperationClick={handleOperationClick}
                                />
                            </div>
                        </>
                    ) : editorMode === 'component-diagram' ? (
                        <>
                            <ComponentEditorContainer
                                service={componentService}
                                availableDslFiles={componentDslFiles}
                                selectedId={selectedId}
                                onSelectComponent={setSelectedId}
                                setGlobalComponents={setComponentNodes}
                                setGlobalRelationships={setComponentRels}
                                refreshToken={componentRefreshToken}
                            />
                            <div className="flex-1 min-w-0">
                                <ComponentDiagramCanvas
                                    components={componentNodes}
                                    relationships={componentRels}
                                    classRelationships={componentCanvasClassRelationships}
                                    classes={componentCanvasClasses}
                                    dslContentByPath={dslContentByPath}
                                    selectedId={selectedId}
                                    onSelectComponent={handleSelectComponent}
                                    onMoveComponent={handleMoveComponent}
                                    onResizeComponent={handleResizeComponent}
                                    onAddPort={handleAddPort}
                                    onDeletePort={handleDeletePort}
                                    onAddRelationship={handleAddRelationship}
                                    onAddPortConnection={handleAddPortConnection}
                                    onDeletePortConnection={handleDeletePortConnection}
                                    portConnections={portConnections}
                                    onCommit={() => { debouncedSaveComponentDSL(componentNodes) }}
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
                            componentService={componentService}
                            onComponentsChanged={() => {
                                console.debug('[App] onComponentsChanged called, debouncing component update');
                                // Pending フラグを立てて、前のdebounce をクリア
                                pendingComponentUpdateRef.current = true
                                if (componentUpdateDebounceRef.current) {
                                    clearTimeout(componentUpdateDebounceRef.current)
                                }
                                // 300ms 待機してから実行
                                componentUpdateDebounceRef.current = setTimeout(() => {
                                    if (pendingComponentUpdateRef.current) {
                                        pendingComponentUpdateRef.current = false
                                        console.debug('[App] Executing debounced component update from componentService');
                                        try {
                                            const components = (componentService as any).componentDomain.getComponents?.()
                                            if (components) {
                                                setComponentNodes(components)
                                                // ComponentEditorContainer の リスト更新トリガー
                                                setComponentRefreshToken(prev => prev + 1)
                                            }
                                        } catch (e) {
                                            console.error('[App] Error syncing componentNodes:', e)
                                        }
                                    }
                                }, 300)
                            }}
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
            {/* <CommandLine onExecute={handleExecuteCommand} classes={classes} /> */}
        </div>
    )
}
