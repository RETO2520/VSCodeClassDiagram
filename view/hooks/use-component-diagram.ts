/**
 * use-component-diagram.ts — コンポーネント図の状態管理カスタムフック
 *
 * ============================================================
 * 🎯 目的
 * ------------------------------------------------------------
 * - App.tsx からコンポーネント図関連の state, handler, message listener を分離
 * - ComponentService の公開 API を通じて操作を行い、`as any` キャストを排除
 * - React state と ComponentService のドメイン状態を自動同期
 *
 * ============================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClassInfo, Relationship } from '../lib/class-diagram-types'
import type { ComponentInfo, ComponentRelationship, PortConnection } from '../lib/component-diagram-types'
import type { ComponentService } from '../lib/application/ComponentService'
import { ComponentDomainModel } from '../lib/ComponentDomainModel'
import { detectRelationships } from '../lib/detect-relationships'
import { postMessage, onMessage } from '../../frontend/src/bridge/vscode-bridge'

// ============================================================
// 戻り値の型
// ============================================================

export interface UseComponentDiagramResult {
    // ── State ──
    componentNodes: ComponentInfo[]
    componentRels: ComponentRelationship[]
    portConnections: PortConnection[]
    componentDslFiles: string[]
    dslContentByPath: Record<string, string>
    componentRefreshToken: number
    isHydrated: boolean

    // ── 派生データ ──
    componentCanvasClasses: ClassInfo[]
    componentCanvasClassRelationships: Relationship[]

    // ── Canvas ハンドラ ──
    handleMoveComponent: (id: string, x: number, y: number) => void
    handleResizeComponent: (id: string, width: number, height: number) => void
    handleSelectComponent: (id: string | null) => void
    handleAddPort: (componentId: string, direction: 'input' | 'output') => void
    handleDeletePort: (componentId: string, portId: string) => void
    handleRenamePort: (componentId: string, portId: string, nextName: string) => void
    handleAddRelationship: (src: string, tgt: string, label?: string) => void
    handleAddPortConnection: (srcComp: string, srcPort: string, tgtComp: string, tgtPort: string, label?: string) => void
    handleDeletePortConnection: (connectionId: string) => void

    // ── 保存 ──
    saveComponentListJson: (silent: boolean) => void
    debouncedSaveComponentDSL: () => void

    // ── コンポーネントエディタ向け ──
    setComponentNodes: React.Dispatch<React.SetStateAction<ComponentInfo[]>>
    setComponentRels: React.Dispatch<React.SetStateAction<ComponentRelationship[]>>
    commitComponentChanges: () => void
}

// ============================================================
// Hook 本体
// ============================================================

export function useComponentDiagram(
    componentService: ComponentService,
    classes: ClassInfo[],
    setSelectedId: (id: string | null) => void,
): UseComponentDiagramResult {

    // ── React State ──
    const [componentNodes, setComponentNodes] = useState<ComponentInfo[]>([])
    const [componentRels, setComponentRels] = useState<ComponentRelationship[]>([])
    const [portConnections, setPortConnections] = useState<PortConnection[]>([])
    const [componentRefreshToken, setComponentRefreshToken] = useState(0)
    const [componentDslFiles, setComponentDslFiles] = useState<string[]>([])
    const [dslContentByPath, setDslContentByPath] = useState<Record<string, string>>({})
    const componentListHydratedRef = useRef(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingComponentUpdateRef = useRef(false)

    // ── State を ComponentService と同期するヘルパー ──
    const syncFromService = useCallback(() => {
        const snap = componentService.getSnapshot()
        setComponentNodes(snap.components)
        setComponentRels(snap.relationships)
        setPortConnections(snap.portConnections)
    }, [componentService])

    // ── 保存 ──
    const saveComponentListJson = useCallback((silent: boolean) => {
        if (!componentListHydratedRef.current) return
        try {
            const snap = componentService.getSnapshot()
            postMessage({
                command: 'saveComponentListJson',
                payload: {
                    components: snap.components,
                    relationships: snap.relationships,
                    portConnections: snap.portConnections,
                    silent,
                },
            })
        } catch (err) {
            console.error('[useComponentDiagram] saveComponentListJson error:', err)
        }
    }, [componentService])

    const debouncedSaveComponentDSL = useCallback(() => {
        if (!componentListHydratedRef.current) return
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            saveComponentListJson(true)
        }, 500)
    }, [saveComponentListJson])

    // ── 派生データ ──
    const componentCanvasClasses = useMemo<ClassInfo[]>(() => {
        try {
            const domain = componentService.getClassDomain()
            if (domain?.getClasses) return domain.getClasses()
        } catch { /* fall through */ }
        return classes
    }, [componentService, classes, componentNodes, componentRels, componentRefreshToken])

    const componentCanvasClassRelationships = useMemo<Relationship[]>(() => {
        try {
            const domain = componentService.getClassDomain()
            if (domain?.detectRelationships) return domain.detectRelationships()
        } catch { /* fall through */ }
        return detectRelationships(componentCanvasClasses)
    }, [componentService, componentCanvasClasses, componentNodes, componentRels, componentRefreshToken])

    // ── Canvas ハンドラ ──

    const handleMoveComponent = useCallback((id: string, x: number, y: number) => {
        try {
            componentService.moveComponent(id, x, y)
        } catch { /* ignore */ }
        setComponentNodes(prev => prev.map(c => c.id === id ? { ...c, x, y } : c))
        debouncedSaveComponentDSL()
    }, [componentService, debouncedSaveComponentDSL])

    const handleResizeComponent = useCallback((id: string, width: number, height: number) => {
        try {
            componentService.resizeComponent(id, width, height)
        } catch { /* ignore */ }
        setComponentNodes(prev => prev.map(c => c.id === id ? { ...c, width, height } : c))
        debouncedSaveComponentDSL()
    }, [componentService, debouncedSaveComponentDSL])

    const handleSelectComponent = useCallback((id: string | null) => {
        setSelectedId(id)
    }, [setSelectedId])

    const handleAddPort = useCallback((componentId: string, direction: 'input' | 'output') => {
        try {
            componentService.addPort(componentId, direction)
            syncFromService()
            debouncedSaveComponentDSL()
        } catch (err) {
            console.error('[useComponentDiagram] handleAddPort error:', err)
        }
    }, [componentService, syncFromService, debouncedSaveComponentDSL])

    const handleDeletePort = useCallback((componentId: string, portId: string) => {
        try {
            componentService.deletePort(componentId, portId)
            syncFromService()
            debouncedSaveComponentDSL()
        } catch (err) {
            console.error('[useComponentDiagram] handleDeletePort error:', err)
        }
    }, [componentService, syncFromService, debouncedSaveComponentDSL])

    const handleRenamePort = useCallback((componentId: string, portId: string, nextName: string) => {
        try {
            componentService.renamePort(componentId, portId, nextName)
            syncFromService()
            debouncedSaveComponentDSL()
        } catch (err) {
            console.error('[useComponentDiagram] handleRenamePort error:', err)
        }
    }, [componentService, syncFromService, debouncedSaveComponentDSL])

    const handleAddRelationship = useCallback((sourceComponentId: string, targetComponentId: string, label?: string) => {
        try {
            componentService.addManualRelationship(sourceComponentId, targetComponentId, label)
            syncFromService()
            debouncedSaveComponentDSL()
        } catch (err) {
            console.error('[useComponentDiagram] handleAddRelationship error:', err)
        }
    }, [componentService, syncFromService, debouncedSaveComponentDSL])

    const handleAddPortConnection = useCallback((
        sourceComponentId: string, sourcePortId: string,
        targetComponentId: string, targetPortId: string,
        label?: string
    ) => {
        try {
            componentService.addPortConnectionMut(
                sourceComponentId, sourcePortId,
                targetComponentId, targetPortId,
                label
            )
            syncFromService()
            debouncedSaveComponentDSL()
        } catch (err) {
            console.error('[useComponentDiagram] handleAddPortConnection error:', err)
        }
    }, [componentService, syncFromService, debouncedSaveComponentDSL])

    const handleDeletePortConnection = useCallback((connectionId: string) => {
        try {
            componentService.removePortConnectionMut(connectionId)
            syncFromService()
            debouncedSaveComponentDSL()
        } catch (err) {
            console.error('[useComponentDiagram] handleDeletePortConnection error:', err)
        }
    }, [componentService, syncFromService, debouncedSaveComponentDSL])

    const commitComponentChanges = useCallback(() => {
        setComponentRefreshToken(t => t + 1)
    }, [])

    // ── classes 変更時にコンポーネントの classIds を同期 ──
    useEffect(() => {
        console.debug('[useComponentDiagram] classes changed, syncing componentNodes:', {
            classCount: classes.length,
            componentNodesCount: componentNodes.length,
            classNames: classes.map(c => c.name)
        })

        setComponentNodes(prev => {
            const currentClassIds = new Set(classes.map(c => c.id))
            const prevClassIds = new Set(prev.flatMap(comp => comp.classIds))
            const deletedClassIds = Array.from(prevClassIds).filter(id => !currentClassIds.has(id))

            if (deletedClassIds.length === 0) {
                postMessage({ command: 'log', level: 'debug', text: '[useComponentDiagram] No deleted classes detected' })
                return prev
            }

            postMessage({ command: 'log', level: 'debug', text: '[useComponentDiagram] Detected deleted classes: ' + deletedClassIds.join(', ') })

            const next = prev.map(comp => ({
                ...comp,
                classIds: comp.classIds.filter(id => currentClassIds.has(id))
            })).filter(comp => {
                return comp.kind !== 'component' || comp.classIds.length > 0 || comp.childComponentIds.length > 0
            })

            postMessage({ command: 'log', level: 'debug', text: '[useComponentDiagram] Updated componentNodes next: ' + JSON.stringify(next) })
            postMessage({ command: 'log', level: 'debug', text: '[useComponentDiagram] Updated componentNodes prev: ' + JSON.stringify(prev) })

            return next
        })
    }, [classes])

    // ── メッセージハンドラ ──
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
                    componentService.setComponentDomain(restoredDomain)
                    setComponentNodes(restoredDomain.getComponents())
                    setComponentRels(restoredDomain.getRelationships())
                    setPortConnections(restoredDomain.getPortConnections())
                    setComponentRefreshToken((prev) => prev + 1)
                } catch (err) {
                    console.error('[useComponentDiagram] Failed to restore component-list.json:', err)
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

    // ── 初回: .diagram フォルダのファイル一覧をリクエスト ──
    useEffect(() => {
        postMessage({ command: 'requestDiagramFiles' })
    }, [])

    // ── 不足している DSL ファイルの読み込み要求 ──
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

    // ── beforeunload / pagehide で自動保存 ──
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

    return {
        componentNodes,
        componentRels,
        portConnections,
        componentDslFiles,
        dslContentByPath,
        componentRefreshToken,
        isHydrated: componentListHydratedRef.current,

        componentCanvasClasses,
        componentCanvasClassRelationships,

        handleMoveComponent,
        handleResizeComponent,
        handleSelectComponent,
        handleAddPort,
        handleDeletePort,
        handleRenamePort,
        handleAddRelationship,
        handleAddPortConnection,
        handleDeletePortConnection,

        saveComponentListJson,
        debouncedSaveComponentDSL,

        setComponentNodes,
        setComponentRels,
        commitComponentChanges,
    }
}
