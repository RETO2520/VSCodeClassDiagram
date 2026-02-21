/**
 * React hooks for VSCode webview integration.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ClassInfo } from '@/lib/class-diagram-types'
import { ClassDiagramService } from '../../../view/lib/application/ClassDiagramService'
import { DomainModel } from '../../../view/lib/DomainModel'
import {
    postMessage,
    onMessage,
    type HostToWebviewMessage,
} from './vscode-bridge'
import { DslParser } from '../../../view/lib/DslParser'
import {
    mediaDiagramToView,
    viewDiagramToMedia,
    migrateMediaModel,
    modelForExport,
    type MediaDiagramModel,
} from '../adapters/model-adapter'
import { SpecDslParser } from '../../../view/lib/SpecDslParser'


/**
 * Hook to listen for messages from the extension host.
 * Handles loadedJson and changedPrimitiveTypes messages.
 */
export function useVSCodeMessages(callbacks: {
    onLoadedJson: (classes: ClassInfo[]) => void
    onPrimitiveTypes: (types: string[]) => void
    onDslLoaded: (dsl: string) => void
    onImportSpecDsl: (dsl: string) => void
}) {
    const callbacksRef = useRef(callbacks)
    callbacksRef.current = callbacks

    useEffect(() => {
        const cleanup = onMessage((msg: HostToWebviewMessage) => {
            switch (msg.command) {
                case 'loadedJson': {
                    // payload may be either { classes: [...] } or the classes array itself
                    const raw = (msg as any).payload
                    const mediaModelInput = Array.isArray(raw) ? { classes: raw } : raw
                    const mediaModel = migrateMediaModel(mediaModelInput as MediaDiagramModel)
                    const classes = mediaDiagramToView(mediaModel)
                    callbacksRef.current.onLoadedJson(classes)
                    break
                }
                case 'changedPrimitiveTypes': {
                    callbacksRef.current.onPrimitiveTypes(msg.primitiveTypes)
                    break
                }
                case 'dslLoaded': {
                    callbacksRef.current.onDslLoaded((msg as any).payload.dsl)
                    break
                }
                case 'specDslImported': {
                    callbacksRef.current.onImportSpecDsl((msg as any).payload.dsl)
                    break
                }
            }
        })
        return cleanup
    }, [])
}

/**
 * Hook that provides the full VSCode-integrated state and actions.
 */
export function useVSCodeState(service: ClassDiagramService) {
    const [classes, setClassesInternal] = useState<ClassInfo[]>([])
    const [primitiveTypes, setPrimitiveTypes] = useState<string[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Listen for messages from extension host
    useVSCodeMessages({
        onLoadedJson: (loadedClasses) => {
            // Replace model in service and let service notify listeners
            service.replaceClassesFromArray(loadedClasses)
            // local selectedId will be updated via service change listener below
        },
        onPrimitiveTypes: (types) => {
            setPrimitiveTypes(types)
        },
        onDslLoaded: (dsl) => {
            const parser = new DslParser()
            parser.parse(dsl, service)
            // Model updates are handled by the service listener
        },
        onImportSpecDsl: (dsl) => {

            const parser = new SpecDslParser()
            parser.parse(dsl, service)
            // Model updates are handled by the service listener
        }
    })

    // Subscribe to service model changes and request initial data on mount
    useEffect(() => {
        const listener = () => {
            const dm = service.getModel()
            const cls = dm.getClasses()
            setClassesInternal(cls)
            // Only auto-select if nothing is selected or the selected id is gone
            setSelectedId(current => {
                if (current && cls.some(c => c.id === current)) return current
                return cls.length > 0 ? cls[0].id : null
            })
        }
        service.onModelChanged(listener)
        // initialize local state from service
        listener()
        return () => service.offModelChanged(listener)
    }, [service])

    // Request initial data on mount
    useEffect(() => {
        postMessage({ command: 'requestWorkspaceDiagram' })
    }, [])

    // Actions
    const saveJson = useCallback(() => {
        const cls = service.getModel().getClasses()
        const mediaModel = viewDiagramToMedia(cls)
        postMessage({ command: 'saveJson', payload: mediaModel })
    }, [service])

    const loadJson = useCallback(() => {
        postMessage({ command: 'loadJson' })
    }, [])

    const loadDsl = useCallback(() => {
        postMessage({ command: 'loadDsl' })
    }, [])

    const importSpecDsl = useCallback(() => {
        postMessage({ command: 'importSpecDsl' })
    }, [])

    const generateCode = useCallback((language: string) => {
        const exportModel = modelForExport(service.getModel().getClasses())
        postMessage({
            command: 'generateCode',
            payload: { model: exportModel, language },
        })
    }, [service])

    const changePrimitiveTypes = useCallback((language: string) => {
        postMessage({ command: 'changedPrimitiveTypes', language })
    }, [])

    // wrapper setClasses that updates service -> service will notify and update local state
    const setClasses = useCallback((updater: ((prev: ClassInfo[]) => ClassInfo[]) | ClassInfo[]) => {
        const current = service.getModel().getClasses()
        const next = typeof updater === 'function' ? (updater as (p: ClassInfo[]) => ClassInfo[])(current) : updater
        service.replaceClassesFromArray(next)
    }, [service])

    return {
        classes,
        setClasses,
        selectedId,
        setSelectedId,
        primitiveTypes,
        saveJson,
        loadJson,
        loadDsl,
        importSpecDsl,
        generateCode,
        changePrimitiveTypes,
    }
}
