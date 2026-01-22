import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../LoggerComponents/Logger';
import { FileService } from '../services/FileService';
import { MessageRouter, createWorkflowRouter, MessageContext } from '../messaging/MessageRouter';

export class WorkflowDiagramHandler {
    private panel: vscode.WebviewPanel | undefined;
    private readonly context: vscode.ExtensionContext;
    private readonly logger: Logger;
    private readonly fileService: FileService;
    private readonly router: MessageRouter;
    private readonly viewType = 'workflow';

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.context = context;
        this.logger = logger;
        this.fileService = new FileService();

        // Initialize MessageRouter with handlers (uses 'type' key)
        this.router = createWorkflowRouter()
            .register('alert', this.handleAlert.bind(this))
            .register('requestWorkspaceDiagram', this.handleRequestWorkspaceDiagram.bind(this))
            .register('openFile', this.handleOpenFile.bind(this))
            .register('saveFile', this.handleSaveFile.bind(this));
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
            'Workflow Diagram',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media.workflow')
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
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const extensionUri = this.context.extensionUri;
        const mediaPath = path.join(extensionUri.fsPath, 'media.workflow');
        const indexPath = path.join(mediaPath, 'index.html');

        let html = fs.readFileSync(indexPath, { encoding: 'utf8' });

        const styleUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(mediaPath, 'style.css'))
        );

        // Inject base for relative module imports
        const baseUri = webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();
        html = html.replace(/<head>/i, `<head><base href="${baseUri}/">`);

        // CSP
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">`;

        // Replace placeholders
        html = html.replace(/__STYLE_URI__/g, styleUri.toString());
        html = html.replace(/__CSP_SOURCE__/g, csp);

        return html;
    }

    // --- Message Handlers ---

    private async handleAlert(msg: any, ctx: MessageContext): Promise<void> {
        vscode.window.showInformationMessage(msg.text);
        this.logger.info(msg.text);
    }

    private async handleRequestWorkspaceDiagram(msg: any, ctx: MessageContext): Promise<void> {
        const result = await this.fileService.findWorkspaceDiagram();
        if (result) {
            ctx.panel.webview.postMessage({
                type: 'fileLoaded',
                filePath: result.filePath,
                content: result.content
            });
        } else {
            // Return empty structure if not found
            ctx.panel.webview.postMessage({
                type: 'fileLoaded',
                filePath: null,
                content: JSON.stringify({ classes: [] }, null, 2)
            });
        }
    }

    private async handleOpenFile(msg: any, ctx: MessageContext): Promise<void> {
        const result = await this.fileService.loadJson({
            canSelectMany: false,
            openLabel: 'Load JSON'
        });

        if (result) {
            ctx.panel.webview.postMessage({
                type: 'fileLoaded',
                filePath: result.uri.fsPath,
                content: result.content
            });
        } else {
            ctx.panel.webview.postMessage({
                type: 'openCanceled'
            });
        }
    }

    private async handleSaveFile(msg: any, ctx: MessageContext): Promise<void> {
        const defaultUri = this.fileService.getDefaultUri();
        const contentStr = msg.content || '{}';

        // Use FileService.saveJson logic roughly, but we need to pass content.
        // FileService takes content object/string.
        // We want to reuse FileService logic but check return logic.

        const result = await this.fileService.saveJson(contentStr, {
            defaultUri,
            saveLabel: 'Save JSON'
        });

        if (result) {
            ctx.panel.webview.postMessage({
                type: 'saveCompleted',
                filePath: result.filePath
            });
        } else {
            ctx.panel.webview.postMessage({
                type: 'saveCanceled'
            });
        }
    }
}
