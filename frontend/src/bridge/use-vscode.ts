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
import {
    mediaDiagramToView,
    viewDiagramToMedia,
    migrateMediaModel,
    modelForExport,
    type MediaDiagramModel,
} from '../adapters/model-adapter'

/**
 * Hook to listen for messages from the extension host.
 * Handles loadedJson and changedPrimitiveTypes messages.
 */
export function useVSCodeMessages(callbacks: {
    onLoadedJson: (classes: ClassInfo[]) => void
    onPrimitiveTypes: (types: string[]) => void
}) {
    const callbacksRef = useRef(callbacks)
    callbacksRef.current = callbacks

    useEffect(() => {
        const cleanup = onMessage((msg: HostToWebviewMessage) => {
            switch (msg.command) {
                case 'loadedJson': {
                    const mediaModel = migrateMediaModel(msg.payload as MediaDiagramModel)
                    const classes = mediaDiagramToView(mediaModel)
                    callbacksRef.current.onLoadedJson(classes)
                    break
                }
                case 'changedPrimitiveTypes': {
                    callbacksRef.current.onPrimitiveTypes(msg.primitiveTypes)
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
    })

    // Subscribe to service model changes and request initial data on mount
    useEffect(() => {
        const listener = () => {
            const dm = service.getModel()
            const cls = dm.getClasses()
            setClassesInternal(cls)
            if (cls.length > 0) setSelectedId(cls[0].id)
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
        generateCode,
        changePrimitiveTypes,
    }
}
