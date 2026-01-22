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
        this.fileService = new FileService();

        // Initialize MessageRouter with handlers
        this.router = createClassDiagramRouter()
            .register('requestWorkspaceDiagram', this.handleRequestWorkspaceDiagram.bind(this))
            .register('changedPrimitiveTypes', this.handleChangedPrimitiveTypes.bind(this))
            .register('showAlert', this.handleShowAlert.bind(this))
            .register('saveJson', this.handleSaveJson.bind(this))
            .register('loadJson', this.handleLoadJson.bind(this))
            .register('generateCode', this.handleGenerateCode.bind(this));
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
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
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
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const extensionUri = this.context.extensionUri;
        const mediaPath = (p: string) => vscode.Uri.joinPath(extensionUri, 'media', p);

        // Read HTML directly from file
        const htmlPath = path.join(extensionUri.fsPath, 'media', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Resources
        const styleUri = webview.asWebviewUri(mediaPath('style.css'));
        const mainUri = webview.asWebviewUri(mediaPath('main.js'));
        const baseUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media')).toString();

        // Setup Content Security Policy
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">`;

        // Replace placeholders
        html = html.replace(/<head>/i, `<head><base href="${baseUri}/">`);
        html = html.replace(/%STYLE_CSS%/g, styleUri.toString());
        html = html.replace(/%MAIN_JS%/g, mainUri.toString());
        html = html.replace(/%CSP%/g, csp);

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

    private async handleSaveJson(msg: any, ctx: MessageContext): Promise<void> {
        if (!msg.payload) return;

        const result = await this.fileService.saveJson(msg.payload);
        if (result) {
            vscode.window.showInformationMessage('Saved diagram JSON');
        }
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
}
