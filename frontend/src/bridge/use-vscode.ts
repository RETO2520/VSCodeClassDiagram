/**
 * React hooks for VSCode webview integration.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ClassInfo } from '@/lib/class-diagram-types'
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
export function useVSCodeState() {
    const [classes, setClasses] = useState<ClassInfo[]>([])
    const [primitiveTypes, setPrimitiveTypes] = useState<string[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Listen for messages from extension host
    useVSCodeMessages({
        onLoadedJson: (loadedClasses) => {
            setClasses(loadedClasses)
            if (loadedClasses.length > 0) {
                setSelectedId(loadedClasses[0].id)
            }
        },
        onPrimitiveTypes: (types) => {
            setPrimitiveTypes(types)
        },
    })

    // Request initial data on mount
    useEffect(() => {
        postMessage({ command: 'requestWorkspaceDiagram' })
    }, [])

    // Actions
    const saveJson = useCallback(() => {
        const mediaModel = viewDiagramToMedia(classes)
        postMessage({ command: 'saveJson', payload: mediaModel })
    }, [classes])

    const loadJson = useCallback(() => {
        postMessage({ command: 'loadJson' })
    }, [])

    const generateCode = useCallback((language: string) => {
        const exportModel = modelForExport(classes)
        postMessage({
            command: 'generateCode',
            payload: { model: exportModel, language },
        })
    }, [classes])

    const changePrimitiveTypes = useCallback((language: string) => {
        postMessage({ command: 'changedPrimitiveTypes', language })
    }, [])

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
