import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TypeModel, CodeGenerator, IObjectModel } from '../CodeComponents/CodeGenerator';
import { Logger } from '../LoggerComponents/Logger';
import { FileService } from '../services/FileService';
import { MessageRouter, createClassDiagramRouter, MessageContext } from '../messaging/MessageRouter';
import { CSharpBuilder } from '../CodeComponents/CSharpBuilder';
import { TypeScriptBuilder } from '../CodeComponents/TypeScriptBuilder';
import { JavaBuilder } from '../CodeComponents/JavaBuilder';
import { CppBuilder } from '../CodeComponents/CppBuilder';
import { RustBuilder } from '../CodeComponents/RustBuilder';


export class ClassDiagramHandler {
    private panel: vscode.WebviewPanel | undefined;
    private readonly context: vscode.ExtensionContext;
    private readonly typeModel: TypeModel;
    private readonly logger: Logger;
    private readonly fileService: FileService;
    private readonly router: MessageRouter;
    private readonly viewType = 'classDiagram';

    constructor(context: vscode.ExtensionContext, typeModel: TypeModel, logger: Logger) {
        this.context = context;
        this.typeModel = typeModel;
        this.logger = logger;
        this.fileService = new FileService(this.logger);

        // Initialize MessageRouter with handlers
        this.router = createClassDiagramRouter()
            .register('requestWorkspaceDiagram', this.handleRequestWorkspaceDiagram.bind(this))
            .register('changedPrimitiveTypes', this.handleChangedPrimitiveTypes.bind(this))
            .register('showAlert', this.handleShowAlert.bind(this))
            .register('saveJson', this.handleSaveJson.bind(this))
            .register('saveDsl', this.handleSaveDsl.bind(this))
            .register('loadJson', this.handleLoadJson.bind(this))
            .register('loadDsl', this.handleLoadDsl.bind(this))
            .register('generateCode', this.handleGenerateCode.bind(this))
            .register('exportMarkdown', this.handleExportMarkdown.bind(this))
            .register('exportSpecDsl', this.handleExportSpecDsl.bind(this))
            .register('log', this.handleLog.bind(this))
            .register('requestDiagramFiles', this.handleRequestDiagramFiles.bind(this))
            .register('loadDiagramFile', this.handleLoadDiagramFile.bind(this))
            .register('loadDiagramFilesBulk', this.handleLoadDiagramFilesBulk.bind(this))
            .register('saveDiagramFile', this.handleSaveDiagramFile.bind(this))
            .register('createDiagramFolder', this.handleCreateDiagramFolder.bind(this))
            .register('createDiagramFile', this.handleCreateDiagramFile.bind(this))
            .register('ui.createFile', this.handleUiCreateFile.bind(this))
            .register('ui.createFolder', this.handleUiCreateFolder.bind(this))
            .register('ui.deleteEntry', this.handleUiDeleteEntry.bind(this))
            .register('ui.renameEntry', this.handleUiRenameEntry.bind(this))
            .register('loadComponentListJson', this.handleLoadComponentListJson.bind(this))
            .register('saveComponentListJson', this.handleSaveComponentListJson.bind(this))
            .register('deleteWithWarning', this.handleDeleteWithWarning.bind(this))
            ;
    }

    public open(): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            this.viewType,
            'Class Diagram Editor',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'frontend', 'dist')
                ]
            }
        );

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);

        // Setup message handling using MessageRouter
        const messageContext: MessageContext = {
            panel: this.panel,
            extensionContext: this.context
        };

        this.panel.webview.onDidReceiveMessage(
            this.router.createHandler(messageContext),
            null,
            this.context.subscriptions
        );

        // Initial setup
        this.sendPrimitiveTypes();
        this.sendInitialComponentListJson();
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const extensionUri = this.context.extensionUri;
        const distUri = vscode.Uri.joinPath(extensionUri, 'frontend', 'dist');

        // Read HTML built by Vite
        const htmlPath = path.join(extensionUri.fsPath, 'frontend', 'dist', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Base URI for resolving relative paths in the built HTML
        const baseUri = webview.asWebviewUri(distUri).toString();

        // Setup Content Security Policy
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; font-src ${webview.cspSource}; connect-src ${webview.cspSource}; worker-src 'self' blob:;">`;

        // Inject base href and CSP into <head>
        html = html.replace(/<head>/i, `<head><base href="${baseUri}/">${csp}`);

        return html;
    }

    private sendPrimitiveTypes(language: string = 'csharp'): void {
        if (this.panel) {
            const ptypes = this.typeModel.getTypesForLang(language);
            this.panel.webview.postMessage({
                command: 'changedPrimitiveTypes',
                primitiveTypes: ptypes
            });
        }
    }

    // --- Message Handlers ---
    private async handleLog(msg: any, ctx: MessageContext): Promise<void> {
        const level = msg.level || 'info';
        const text = msg.text || '';

        switch (level) {
            case 'debug':
                this.logger.debug(text);
                break;
            case 'warn':
                this.logger.warn(text);
                break;
            case 'error':
                this.logger.error(text);
                break;
            case 'info':
            default:
                this.logger.info(text);
                break;
        }
    }

    private async handleRequestWorkspaceDiagram(msg: any, ctx: MessageContext): Promise<void> {
        const result = await this.fileService.findWorkspaceDiagram();
        if (result) {
            ctx.panel.webview.postMessage({
                command: 'loadedJson',
                payload: result.parsed
            });
        }
    }

    private async handleChangedPrimitiveTypes(msg: any, ctx: MessageContext): Promise<void> {
        const ptypes = this.typeModel.getTypesForLang(msg.language);
        ctx.panel.webview.postMessage({
            command: 'changedPrimitiveTypes',
            primitiveTypes: ptypes
        });
    }

    private async handleShowAlert(msg: any, ctx: MessageContext): Promise<void> {
        vscode.window.showInformationMessage(msg.text);
    }

    private async handleSaveDsl(msg: any, ctx: MessageContext): Promise<void> {
        if (!msg.payload) return;

        const result = await this.fileService.saveDsl(msg.payload);
        if (result) {
            vscode.window.showInformationMessage('Saved diagram DSL');
        }
    }

    private async handleSaveJson(msg: any, ctx: MessageContext): Promise<void> {
        if (!msg.payload) return;

        const result = await this.fileService.saveJson(msg.payload);
        if (result) {
            vscode.window.showInformationMessage('Saved diagram JSON');
        }
    }

    private async handleSaveComponentListJson(msg: any, _ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const components = Array.isArray(payload.components) ? payload.components : [];
        const relationships = Array.isArray(payload.relationships) ? payload.relationships : [];
        const silent = !!payload.silent;

        const diagramRoot = this.fileService.getDiagramRootUri();
        if (!diagramRoot) {
            if (!silent) {
                vscode.window.showErrorMessage('Workspace is not open. Failed to save component list JSON.');
            }
            return;
        }

        try {
            await vscode.workspace.fs.createDirectory(diagramRoot);
            const targetUri = vscode.Uri.joinPath(diagramRoot, 'component-list.json');
            await this.fileService.writeFile(targetUri, {
                components,
                relationships,
                savedAt: new Date().toISOString(),
            });
            if (!silent) {
                vscode.window.showInformationMessage('Saved component list JSON (.diagram/component-list.json)');
            }
        } catch (e: any) {
            this.logger.error(`Failed to save component list JSON: ${e?.message || e}`);
            if (!silent) {
                vscode.window.showErrorMessage('Failed to save component list JSON.');
            }
        }
    }

    private async handleLoadComponentListJson(_msg: any, _ctx: MessageContext): Promise<void> {
        if (!this.panel) return;

        const diagramRoot = this.fileService.getDiagramRootUri();
        if (!diagramRoot) {
            vscode.window.showErrorMessage('Workspace is not open. Failed to load component list JSON.');
            return;
        }

        const targetUri = vscode.Uri.joinPath(diagramRoot, 'component-list.json');
        try {
            const loaded = await this.fileService.readFile(targetUri);
            const parsed: any = loaded.parsed ?? {};
            const components = Array.isArray(parsed.components) ? parsed.components : [];
            const relationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];

            this.panel.webview.postMessage({
                command: 'componentListJsonLoaded',
                payload: { components, relationships }
            });
            vscode.window.showInformationMessage('Loaded component list JSON (.diagram/component-list.json)');
        } catch (e: any) {
            this.logger.warn(`Failed to load component list JSON: ${e?.message || e}`);
            vscode.window.showWarningMessage('Could not load .diagram/component-list.json');
        }
    }

    private async sendInitialComponentListJson(): Promise<void> {
        if (!this.panel) return;

        const diagramRoot = this.fileService.getDiagramRootUri();
        if (!diagramRoot) return;

        const targetUri = vscode.Uri.joinPath(diagramRoot, 'component-list.json');
        let components: any[] = [];
        let relationships: any[] = [];
        try {
            const loaded = await this.fileService.readFile(targetUri);
            const parsed: any = loaded.parsed ?? {};
            components = Array.isArray(parsed.components) ? parsed.components : [];
            relationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];
        } catch {
            // component-list.json does not exist yet or invalid; send empty snapshot for initialization handshake
        }

        this.panel.webview.postMessage({
            command: 'componentListJsonLoaded',
            payload: { components, relationships }
        });
    }

    private async handleLoadJson(msg: any, ctx: MessageContext): Promise<void> {
        const result = await this.fileService.loadJson();
        if (result) {
            try {
                ctx.panel.webview.postMessage({
                    command: 'loadedJson',
                    payload: result.parsed
                });
                vscode.window.showInformationMessage('Loaded diagram JSON');
            } catch (e) {
                vscode.window.showErrorMessage(`Invalid JSON: ${e}`);
            }
        }
    }

    private async handleLoadDsl(msg: any, ctx: MessageContext): Promise<void> {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Load DSL',
            filters: {
                'DSL Files': ['dsl', 'txt'],
                'All Files': ['*']
            }
        });

        if (!fileUris || fileUris.length === 0) return;

        const fileUri = fileUris[0];
        try {
            const content = fs.readFileSync(fileUri.fsPath, 'utf8');
            ctx.panel.webview.postMessage({
                command: 'dslLoaded',
                payload: { dsl: content }
            });
            vscode.window.showInformationMessage(`Loaded DSL from ${path.basename(fileUri.fsPath)}`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to read DSL: ${e.message}`);
            this.logger.error(`Failed to read DSL: ${e.message}`);
        }
    }

    private async handleImportSpecDsl(msg: any, ctx: MessageContext): Promise<void> {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Load DSL',
            filters: {
                'DSL Files': ['dsl', 'txt'],
                'All Files': ['*']
            }
        });

        if (!fileUris || fileUris.length === 0) return;

        const fileUri = fileUris[0];
        try {
            const content = fs.readFileSync(fileUri.fsPath, 'utf8');
            ctx.panel.webview.postMessage({
                command: 'specDslImported',
                payload: { dsl: content }
            });
            vscode.window.showInformationMessage(`Loaded DSL from ${path.basename(fileUri.fsPath)}`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to read DSL: ${e.message}`);
            this.logger.error(`Failed to read DSL: ${e.message}`);
        }
    }

    private async handleExportMarkdown(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const markdown = payload.markdown || '';
        const validationContent = payload.validationContent || '';
        const fileName = payload.fileName || 'spec.md';

        if (!markdown) {
            vscode.window.showErrorMessage('No markdown content to export.');
            return;
        }

        const result = await this.fileService.saveMarkdown(markdown, validationContent, { defaultFileName: fileName });
        if (result) {
            vscode.window.showInformationMessage(`Exported specification to ${path.basename(result.filePath)}`);
        }
    }

    private async handleExportSpecDsl(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const dsl = payload.dsl || '';
        const fileName = payload.fileName || 'spec.dsl';

        if (!dsl) {
            vscode.window.showErrorMessage('No DSL content to export.');
            return;
        }

        const result = await this.fileService.saveDsl(dsl, { defaultFileName: fileName });
        if (result) {
            vscode.window.showInformationMessage(`Exported DSL to ${path.basename(result.filePath)}`);
        }
    }

    private async handleRequestDiagramFiles(msg: any, ctx: MessageContext): Promise<void> {
        const files = await this.fileService.getDiagramFiles();
        ctx.panel.webview.postMessage({
            command: 'diagramFilesLoaded',
            payload: { files }
        });
    }

    private async handleLoadDiagramFile(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const relativePath = payload.relativePath;
        if (!relativePath) return;

        const dsl = await this.fileService.readDiagramFile(relativePath);
        if (dsl !== null) {
            ctx.panel.webview.postMessage({
                command: 'diagramFileLoaded',
                payload: { relativePath, dsl }
            });
            vscode.window.showInformationMessage(`Loaded ${relativePath}`);
        } else {
            vscode.window.showErrorMessage(`Failed to load ${relativePath}`);
        }
    }

    private async handleLoadDiagramFilesBulk(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const relativePaths: unknown[] = Array.isArray(payload.relativePaths) ? payload.relativePaths : [];
        if (relativePaths.length === 0) {
            ctx.panel.webview.postMessage({
                command: 'diagramFilesBulkLoaded',
                payload: { files: [] }
            });
            return;
        }

        const uniquePaths: string[] = Array.from(
            new Set(relativePaths.filter((p): p is string => typeof p === 'string' && p.length > 0))
        );
        const files: Array<{ relativePath: string; dsl: string }> = [];

        for (const relativePath of uniquePaths) {
            const dsl = await this.fileService.readDiagramFile(relativePath);
            if (dsl !== null) {
                files.push({ relativePath, dsl });
            }
        }

        ctx.panel.webview.postMessage({
            command: 'diagramFilesBulkLoaded',
            payload: { files }
        });
    }

    private async handleSaveDiagramFile(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const relativePath = payload.relativePath;
        const dsl = payload.dsl;
        if (!relativePath || typeof dsl !== 'string') return;

        const success = await this.fileService.writeDiagramFile(relativePath, dsl);
        if (success) {
            vscode.window.showInformationMessage(`Saved ${relativePath}`);
        } else {
            vscode.window.showErrorMessage(`Failed to save ${relativePath}`);
        }
    }

    private async handleCreateDiagramFolder(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const relativePath = payload.relativePath;
        if (!relativePath) return;

        const success = await this.fileService.createDiagramFolder(relativePath);
        if (success) {
            vscode.window.showInformationMessage(`Created folder ${relativePath}`);
            // Refresh files
            const files = await this.fileService.getDiagramFiles();
            ctx.panel.webview.postMessage({
                command: 'diagramFilesLoaded',
                payload: { files }
            });
        } else {
            vscode.window.showErrorMessage(`Failed to create folder ${relativePath}`);
        }
    }

    private async handleCreateDiagramFile(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const relativePath = payload.relativePath;
        if (!relativePath) return;

        const success = await this.fileService.createDiagramFile(relativePath);
        if (success) {
            vscode.window.showInformationMessage(`Created file ${relativePath}`);
            // Refresh files
            const files = await this.fileService.getDiagramFiles();
            ctx.panel.webview.postMessage({
                command: 'diagramFilesLoaded',
                payload: { files }
            });
        } else {
            vscode.window.showErrorMessage(`Failed to create file ${relativePath}. It might already exist.`);
        }
    }

    private async handleUiCreateFile(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        let parentPath = payload.relativeParentPath || '';

        // Default to Application folder if root is selected
        if (!parentPath) {
            parentPath = this.fileService.getApplicationFolderName();
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter new file name (e.g. diagram.dsl)',
            value: 'new_diagram.dsl',
            placeHolder: 'filename.dsl'
        });

        if (!name) return;

        const relativePath = parentPath ? `${parentPath}/${name}` : name;
        const success = await this.fileService.createDiagramFile(relativePath);
        if (success) {
            vscode.window.showInformationMessage(`Created file ${relativePath}`);
            await this.handleRequestDiagramFiles({}, ctx);
        } else {
            vscode.window.showErrorMessage(`Failed to create file ${relativePath}. Files can only be created within component folders.`);
        }
    }

    private async handleUiCreateFolder(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        let parentPath = payload.relativeParentPath || '';

        // Default to Application folder if root is selected
        if (!parentPath) {
            parentPath = this.fileService.getApplicationFolderName();
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter new folder name',
            value: 'new_folder',
            placeHolder: 'folder_name'
        });

        if (!name) return;

        const relativePath = parentPath ? `${parentPath}/${name}` : name;
        const success = await this.fileService.createDiagramFolder(relativePath);
        if (success) {
            vscode.window.showInformationMessage(`Created folder ${relativePath}`);
            await this.handleRequestDiagramFiles({}, ctx);
        } else {
            vscode.window.showErrorMessage(`Failed to create folder ${relativePath}. Check hierarchy rules.`);
        }
    }

    private async handleUiDeleteEntry(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const relativePath = payload.relativePath;
        if (!relativePath) return;

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete '${relativePath}'?`,
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') return;

        const success = await this.fileService.deleteDiagramEntry(relativePath);
        if (success) {
            vscode.window.showInformationMessage(`Deleted ${relativePath}`);
            await this.handleRequestDiagramFiles({}, ctx);
        } else {
            vscode.window.showErrorMessage(`Failed to delete ${relativePath}`);
        }
    }

    private async handleUiRenameEntry(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const oldRelativePath = payload.oldRelativePath;
        const newName = payload.newName;
        if (!oldRelativePath || !newName) return;

        const success = await this.fileService.renameDiagramEntry(oldRelativePath, newName);
        if (success) {
            vscode.window.showInformationMessage(`Renamed to ${newName}`);
            await this.handleRequestDiagramFiles({}, ctx);
        } else {
            vscode.window.showErrorMessage(`Failed to rename to ${newName}`);
        }
    }

    private async handleGenerateCode(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const model = payload.model || payload; // backward compat
        const language = payload.language || 'csharp';

        const folderUris = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            openLabel: 'Select output folder'
        });

        if (!folderUris || folderUris.length === 0) return;

        const outFolder = folderUris[0];

        try {
            await this.generateCodeFiles(model, outFolder, language);
            vscode.window.showInformationMessage(`${language.toUpperCase()} Code generation completed.`);
        } catch (e: unknown) {
            if (e instanceof Error) {
                vscode.window.showErrorMessage('Generate failed: ' + e.message);
                this.logger.error('Generate failed: ' + e.message);
            }
            console.error(e);
        }
    }

    // Integrated code generation logic
    private async generateCodeFiles(model: IObjectModel, outFolder: vscode.Uri, language: string): Promise<void> {
        if (!model || !Array.isArray(model.classes)) {
            throw new Error('Invalid model');
        }

        let generator: CodeGenerator;

        switch ((language || 'csharp').toLowerCase()) {
            case 'csharp':
                generator = new CodeGenerator(new CSharpBuilder(model, this.typeModel, this.logger));
                break;
            case 'typescript':
                generator = new CodeGenerator(new TypeScriptBuilder(model, this.typeModel, this.logger));
                break;
            case 'java':
                generator = new CodeGenerator(new JavaBuilder(model, this.typeModel, this.logger));
                break;
            case 'cpp':
                generator = new CodeGenerator(new CppBuilder(model, this.typeModel, this.logger));
                break;
            case 'rust':
                generator = new CodeGenerator(new RustBuilder(model, this.typeModel, this.logger));
                break;
            default:
                throw new Error('Unsupported language: ' + language);
        }

        await generator.generate(outFolder);
    }

    // ── フォルダ削除時の警告ハンドラ ──────────────────────────────────
    private async handleDeleteWithWarning(msg: any, ctx: MessageContext): Promise<void> {
        const payload = msg.payload || {};
        const relativePath = payload.relativePath;
        if (!relativePath) return;

        // DSL ファイルがあるかどうかチェック
        const result = await this.fileService.deleteFolderWithWarning(relativePath);

        if (!result.success && result.warning) {
            // 警告メッセージを表示して確認
            const confirm = await vscode.window.showWarningMessage(
                result.warning,
                { modal: true },
                'Delete Anyway'
            );

            if (confirm === 'Delete Anyway') {
                // フォルダを強制削除
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.diagram', relativePath);
                    try {
                        await vscode.workspace.fs.delete(uri, { recursive: true });
                        ctx.panel.webview.postMessage({
                            command: 'diagramEntryDeleted',
                            payload: { relativePath, success: true }
                        });
                    } catch (e) {
                        this.logger.error(`Failed to force delete ${relativePath}: ${e}`);
                    }
                }
            }
        } else if (result.success) {
            // 削除成功
            ctx.panel.webview.postMessage({
                command: 'diagramEntryDeleted',
                payload: { relativePath, success: true }
            });
        }
    }
}
