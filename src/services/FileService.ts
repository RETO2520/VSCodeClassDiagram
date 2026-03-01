import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../LoggerComponents/Logger';

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
 * Entry in the diagram folder
 */
export interface FileEntry {
    path: string;
    isDirectory: boolean;
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
    private readonly logger?: Logger;


    constructor(logger?: Logger) {
        this.logger = logger;
    }

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
            this.logger?.info('No file selected');
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
            this.logger?.info('No file selected');
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
        validationContent: string,
        options?: {
            defaultUri?: vscode.Uri;
            saveLabel?: string;
            defaultFileName?: string;
        }
    ): Promise<SaveResult | null> {

        const validationUri = this.getDefaultUri('spec.validation.md');

        const defaultUri = options?.defaultUri ??
            (options?.defaultFileName ? this.getDefaultUri(options.defaultFileName) : this.getDefaultUri('spec.md'));



        if (!defaultUri) {
            this.logger?.info('No default URI found');
            return null;
        }

        if (!validationUri) {
            this.logger?.info('No validation URI found');
            return null;
        }

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(defaultUri, encoder.encode(content));
        await vscode.workspace.fs.writeFile(validationUri, encoder.encode(validationContent));

        return {
            uri: defaultUri,
            filePath: defaultUri.fsPath
        };
    }

    /**
     * Show save dialog and save content to a DSL file
     * @param content DSL content to save
     * @param options Optional dialog options
     * @returns Save result or null if cancelled
     */
    public async saveDsl(
        content: {
            dsl: string;
            fileName: string;
        },
        options?: {
            defaultUri?: vscode.Uri;
            saveLabel?: string;
            defaultFileName?: string;
        }
    ): Promise<SaveResult | null> {
        const defaultUri = options?.defaultUri ??
            (options?.defaultFileName ? this.getDefaultUri(content.fileName) : this.getDefaultUri('spec.dsl'));

        const uri = await vscode.window.showSaveDialog({
            filters: { 'DSL': ['dsl'] },
            defaultUri,
            saveLabel: options?.saveLabel ?? 'Export DSL'
        });

        if (!uri) {
            return null;
        }

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content.dsl));

        return {
            uri,
            filePath: uri.fsPath
        };
    }

    /**
     * Get all DSL files and folders under the .diagram folder
     */
    public async getDiagramFiles(): Promise<FileEntry[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const diagramFolder = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram');

        try {
            await vscode.workspace.fs.stat(diagramFolder);
        } catch {
            try {
                await vscode.workspace.fs.createDirectory(diagramFolder);
            } catch (e) {
                this.logger?.error(`Failed to create .diagram folder: ${e}`);
                return [];
            }
        }

        const results: FileEntry[] = [];

        const collect = async (currentUri: vscode.Uri, relativePath: string) => {
            const entries = await vscode.workspace.fs.readDirectory(currentUri);
            for (const [name, type] of entries) {
                const entryRelativePath = relativePath ? `${relativePath}/${name}` : name;
                const entryUri = vscode.Uri.joinPath(currentUri, name);

                if (type === vscode.FileType.Directory) {
                    results.push({ path: entryRelativePath, isDirectory: true });
                    await collect(entryUri, entryRelativePath);
                } else if (type === vscode.FileType.File) {
                    if (name.endsWith('.dsl') || name.endsWith('.txt')) {
                        results.push({ path: entryRelativePath, isDirectory: false });
                    }
                }
            }
        };

        try {
            await collect(diagramFolder, '');
            return results;
        } catch (e) {
            this.logger?.error(`Failed to get diagram files: ${e}`);
            return [];
        }
    }

    /**
     * Create a new folder inside the .diagram directory
     */
    public async createDiagramFolder(relativePath: string): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', relativePath);
        try {
            await vscode.workspace.fs.createDirectory(uri);
            return true;
        } catch (e) {
            this.logger?.error(`Failed to create diagram folder ${relativePath}: ${e}`);
            return false;
        }
    }

    /**
     * Create a new DSL file inside the .diagram directory
     */
    public async createDiagramFile(relativePath: string): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', relativePath);
        try {
            // Check if file already exists
            try {
                await vscode.workspace.fs.stat(uri);
                return false; // Already exists
            } catch {
                // Not exists, proceed
            }

            const encoder = new TextEncoder();
            // Default content for new file
            const content = `// ${path.basename(relativePath)}\n\nclass NewClass\n  + field: string\n`;
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            return true;
        } catch (e) {
            this.logger?.error(`Failed to create diagram file ${relativePath}: ${e}`);
            return false;
        }
    }

    /**
     * Read a specific DSL file from the .diagram folder
     */
    public async readDiagramFile(relativePath: string): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', relativePath);
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            return new TextDecoder('utf8').decode(bytes);
        } catch (e) {
            this.logger?.error(`Failed to read diagram file ${relativePath}: ${e}`);
            return null;
        }
    }

    /**
     * Write a specific DSL file to the .diagram folder
     */
    public async writeDiagramFile(relativePath: string, content: string): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', relativePath);
        try {
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            return true;
        } catch (e) {
            this.logger?.error(`Failed to write diagram file ${relativePath}: ${e}`);
            return false;
        }
    }

    /**
     * Delete a specific file or folder from the .diagram folder
     */
    public async deleteDiagramEntry(relativePath: string): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', relativePath);
        try {
            await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
            return true;
        } catch (e) {
            this.logger?.error(`Failed to delete diagram entry ${relativePath}: ${e}`);
            return false;
        }
    }

    /**
     * Rename a specific file or folder in the .diagram folder
     */
    public async renameDiagramEntry(oldRelativePath: string, newName: string): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const oldUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', oldRelativePath);
        const parentDir = path.dirname(oldRelativePath);
        const newRelativePath = (parentDir === '.' || parentDir === '') ? newName : `${parentDir}/${newName}`;
        const newUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', newRelativePath);

        try {
            await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
            return true;
        } catch (e) {
            this.logger?.error(`Failed to rename diagram entry ${oldRelativePath} to ${newName}: ${e}`);
            return false;
        }
    }
}
