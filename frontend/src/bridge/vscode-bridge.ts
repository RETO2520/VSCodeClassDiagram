/**
 * VSCode webview API bridge.
 *
 * Provides type-safe wrappers around acquireVsCodeApi() for use
 * in the React frontend running inside a VSCode webview.
 */

// ==============================
// Types for VSCode <-> Webview messages
// ==============================

/** Messages sent FROM the webview TO the extension host */
export type WebviewToHostMessage =
    | { command: 'requestWorkspaceDiagram' }
    | { command: 'changedPrimitiveTypes'; language: string }
    | { command: 'saveJson'; payload: object }
    | { command: 'saveDsl'; payload: object }
    | { command: 'loadJson' }
    | { command: 'loadDsl' }
    | { command: 'generateCode'; payload: { model: object; language: string } }
    | { command: 'exportMarkdown'; payload: { markdown: string; validationContent: string, fileName?: string } }
    | { command: 'importSpecDsl' }
    | { command: 'exportSpecDsl'; payload: { dsl: string; fileName?: string } }
    | { command: 'showAlert'; text: string }
    | { command: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; text: string }
    | { command: 'requestDiagramFiles' }
    | { command: 'loadDiagramFile'; payload: { relativePath: string } }
    | { command: 'saveDiagramFile'; payload: { relativePath: string; dsl: string } }
    | { command: 'createDiagramFolder'; payload: { relativePath: string } }
    | { command: 'createDiagramFile'; payload: { relativePath: string } }
    | { command: 'ui.createFile'; payload: { relativeParentPath: string } }
    | { command: 'ui.createFolder'; payload: { relativeParentPath: string } }
    | { command: 'ui.deleteEntry'; payload: { relativePath: string } }
    | { command: 'ui.renameEntry'; payload: { oldRelativePath: string; newName: string } }

/** Messages sent FROM the extension host TO the webview */
export type HostToWebviewMessage =
    | { command: 'loadedJson'; payload: unknown }
    | { command: 'dslLoaded'; payload: unknown }
    | { command: 'specDslImported'; payload: unknown }
    | { command: 'changedPrimitiveTypes'; primitiveTypes: string[] }
    | { command: 'diagramFilesLoaded'; payload: { files: string[] } }
    | { command: 'diagramFileLoaded'; payload: { relativePath: string; dsl: string } }

// ==============================
// VSCode API singleton
// ==============================

interface VSCodeApi {
    postMessage(message: WebviewToHostMessage): void
    getState(): unknown
    setState(state: unknown): void
}

// Declare the global function injected by VSCode webview
declare function acquireVsCodeApi(): VSCodeApi

let vscodeApi: VSCodeApi | null = null

/**
 * Get or initialize the VSCode API instance.
 * Returns null if not running inside a VSCode webview.
 */
export function getVSCodeApi(): VSCodeApi | null {
    if (vscodeApi) return vscodeApi
    try {
        vscodeApi = acquireVsCodeApi()
        return vscodeApi
    } catch {
        // Not running inside a VSCode webview (e.g. standalone dev mode)
        console.warn('acquireVsCodeApi not available — running in standalone mode')
        return null
    }
}

/**
 * Check if we are running inside a VSCode webview
 */
export function isVSCodeWebview(): boolean {
    return getVSCodeApi() !== null
}

/**
 * Send a message to the extension host
 */
export function postMessage(message: WebviewToHostMessage): void {
    const api = getVSCodeApi()
    if (api) {
        api.postMessage(message)
    } else {
        console.log('[standalone] postMessage:', message)
    }
}

/**
 * Register a listener for messages from the extension host.
 * Returns a cleanup function to remove the listener.
 */
export function onMessage(handler: (msg: HostToWebviewMessage) => void): () => void {
    const listener = (event: MessageEvent) => {
        const data = event.data
        if (data && data.command) {
            handler(data as HostToWebviewMessage)
        }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
}
