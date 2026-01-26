import * as vscode from 'vscode';
import { SourceAnalyzer } from '../services/SourceAnalyzer';
import { DiagramConverter } from '../services/sourceToDiagram/converter/DiagramConverter';
import { FileService } from '../services/FileService';
import { Logger } from '../LoggerComponents/Logger';
import { ClassInfo } from '../services/sourceToDiagram/types';

/**
 * ソースコードからクラス図（diagram.json）を生成するコマンドクラス
 */
export class SourceToDiagramCommand {
    private analyzer: SourceAnalyzer;
    private converter: DiagramConverter;
    private fileService: FileService;
    private logger: Logger;

    constructor(
        analyzer: SourceAnalyzer,
        converter: DiagramConverter,
        fileService: FileService,
        logger: Logger
    ) {
        this.analyzer = analyzer;
        this.converter = converter;
        this.fileService = fileService;
        this.logger = logger;
    }

    /**
     * コマンドを実行する
     */
    public async execute(): Promise<void> {
        try {
            // 1. 解析対象を選択
            const scope = await this.selectScope();
            if (!scope) return;

            let classes: ClassInfo[] = [];

            // 2. 解析実行
            if (scope === 'file') {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    vscode.window.showErrorMessage('No active editor found.');
                    return;
                }
                classes = await this.analyzer.analyzeFile(activeEditor.document.uri);
            } else {
                classes = await this.analyzer.analyzeWorkspace();
            }

            if (classes.length === 0) {
                vscode.window.showInformationMessage('No class information found in the selected scope.');
                return;
            }

            // 3. 変換と保存
            const model = this.converter.convert(classes);
            const saveResult = await this.fileService.saveJson(model, {
                saveLabel: 'Generate Diagram'
            });

            if (saveResult) {
                const action = await vscode.window.showInformationMessage(
                    `Successfully generated diagram: ${saveResult.filePath}`,
                    'Open Diagram'
                );
                if (action === 'Open Diagram') {
                    await vscode.commands.executeCommand('classDiagram.open', saveResult.uri);
                }
            }
        } catch (error) {
            this.logger.error(`Command execution failed: ${error}`);
            vscode.window.showErrorMessage(`Failed to generate diagram: ${error}`);
        }
    }

    private async selectScope(): Promise<'file' | 'workspace' | undefined> {
        const items: vscode.QuickPickItem[] = [
            {
                label: 'Current File',
                description: 'Analyze only the active source file',
                id: 'file'
            } as any,
            {
                label: 'Entire Workspace',
                description: 'Analyze all supported source files in the workspace',
                id: 'workspace'
            } as any
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select the scope for source code analysis'
        });

        return selection ? (selection as any).id : undefined;
    }
}
