import * as vscode from 'vscode';

/**
 * Result of a file load operation
 */
export interface LoadResult {
    uri: vscode.Uri;
    content: string;
    parsed: unknown;
}

/**
 * Result of a file save operation
 */
export interface SaveResult {
    uri: vscode.Uri;
    filePath: string;
}

/**
 * Result of finding a workspace diagram
 */
export interface WorkspaceDiagramResult {
    uri: vscode.Uri;
    filePath: string;
    content: string;
    parsed: unknown;
}

/**
 * FileService provides common file operations for diagram files.
 * This centralizes file loading, saving, and workspace diagram discovery
 * to eliminate code duplication across different diagram handlers.
 */
export class FileService {
    private static readonly DEFAULT_FILENAME = 'diagram.json';
    private static readonly JSON_FILTER = { 'JSON': ['json'] };

    /**
     * Get the default URI for file operations based on workspace
     * @param filename Optional filename to use (defaults to 'diagram.json')
     * @returns Default URI or undefined if no workspace
     */
    public getDefaultUri(filename: string = FileService.DEFAULT_FILENAME): vscode.Uri | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return vscode.Uri.joinPath(workspaceFolders[0].uri, filename);
        }
        return undefined;
    }

    /**
     * Get the workspace root URI
     * @returns Workspace root URI or undefined
     */
    public getWorkspaceRoot(): vscode.Uri | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri;
        }
        return undefined;
    }

    /**
     * Find and load diagram.json from the workspace
     * @returns Parsed diagram content or null if not found
     */
    public async findWorkspaceDiagram(): Promise<WorkspaceDiagramResult | null> {
        try {
            const files = await vscode.workspace.findFiles(
                '**/diagram.json',
                '**/node_modules/**',
                1
            );

            if (files.length === 0) {
                return null;
            }

            const uri = files[0];
            const contentBytes = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder('utf8').decode(contentBytes);
            const parsed = JSON.parse(content);

            return {
                uri,
                filePath: uri.fsPath,
                content,
                parsed
            };
        } catch (error) {
            console.error('Error finding workspace diagram:', error);
            return null;
        }
    }

    /**
     * Show open dialog and load a JSON file
     * @param options Optional dialog options
     * @returns Loaded file content or null if cancelled
     */
    public async loadJson(options?: {
        defaultUri?: vscode.Uri;
        openLabel?: string;
        canSelectMany?: boolean;
    }): Promise<LoadResult | null> {
        const defaultUri = options?.defaultUri ?? this.getWorkspaceRoot();

        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: options?.canSelectMany ?? false,
            filters: FileService.JSON_FILTER,
            defaultUri,
            openLabel: options?.openLabel ?? 'Load JSON'
        });

        if (!uris || uris.length === 0) {
            return null;
        }

        const uri = uris[0];
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder('utf8').decode(bytes);
        const parsed = JSON.parse(content);

        return { uri, content, parsed };
    }

    /**
     * Show save dialog and save content to a JSON file
     * @param content Content to save (will be JSON stringified if object)
     * @param options Optional dialog options
     * @returns Save result or null if cancelled
     */
    public async saveJson(
        content: unknown,
        options?: {
            defaultUri?: vscode.Uri;
            saveLabel?: string;
        }
    ): Promise<SaveResult | null> {
        const defaultUri = options?.defaultUri ?? this.getDefaultUri();

        const uri = await vscode.window.showSaveDialog({
            filters: FileService.JSON_FILTER,
            defaultUri,
            saveLabel: options?.saveLabel ?? 'Save JSON'
        });

        if (!uri) {
            return null;
        }

        const contentStr = typeof content === 'string'
            ? content
            : JSON.stringify(content, null, 2);

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(contentStr));

        return {
            uri,
            filePath: uri.fsPath
        };
    }

    /**
     * Read a file directly without showing a dialog
     * @param uri URI of the file to read
     * @returns File content and parsed JSON
     */
    public async readFile(uri: vscode.Uri): Promise<LoadResult> {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder('utf8').decode(bytes);
        const parsed = JSON.parse(content);

        return { uri, content, parsed };
    }

    /**
     * Write content directly to a file without showing a dialog
     * @param uri URI of the file to write
     * @param content Content to write (will be JSON stringified if object)
     * @returns Save result
     */
    public async writeFile(uri: vscode.Uri, content: unknown): Promise<SaveResult> {
        const contentStr = typeof content === 'string'
            ? content
            : JSON.stringify(content, null, 2);

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(contentStr));

        return {
            uri,
            filePath: uri.fsPath
        };
    }

    /**
     * Show save dialog and save content to a Markdown file
     * @param content Markdown content to save
     * @param options Optional dialog options
     * @returns Save result or null if cancelled
     */
    public async saveMarkdown(
        content: string,
        options?: {
            defaultUri?: vscode.Uri;
            saveLabel?: string;
            defaultFileName?: string;
        }
    ): Promise<SaveResult | null> {
        const defaultUri = options?.defaultUri ??
            (options?.defaultFileName ? this.getDefaultUri(options.defaultFileName) : this.getDefaultUri('spec.md'));

        const uri = await vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'] },
            defaultUri,
            saveLabel: options?.saveLabel ?? 'Export Markdown'
        });

        if (!uri) {
            return null;
        }

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));

        return {
            uri,
            filePath: uri.fsPath
        };
    }

    /**
     * Show save dialog and save content to a DSL file
     * @param content DSL content to save
     * @param options Optional dialog options
     * @returns Save result or null if cancelled
     */
    public async saveDsl(
        content: string,
        options?: {
            defaultUri?: vscode.Uri;
            saveLabel?: string;
            defaultFileName?: string;
        }
    ): Promise<SaveResult | null> {
        const defaultUri = options?.defaultUri ??
            (options?.defaultFileName ? this.getDefaultUri(options.defaultFileName) : this.getDefaultUri('spec.dsl'));

        const uri = await vscode.window.showSaveDialog({
            filters: { 'DSL': ['dsl'] },
            defaultUri,
            saveLabel: options?.saveLabel ?? 'Export DSL'
        });

        if (!uri) {
            return null;
        }

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));

        return {
            uri,
            filePath: uri.fsPath
        };
    }
}
