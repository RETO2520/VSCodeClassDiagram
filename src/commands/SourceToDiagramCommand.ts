import * as vscode from 'vscode';
import { SourceAnalyzer } from '../services/SourceAnalyzer';
import { DiagramConverter } from '../services/sourceToDiagram/converter/DiagramConverter';
import { FileService } from '../services/FileService';
import { Logger } from '../LoggerComponents/Logger';
import { ClassInfo } from '../services/sourceToDiagram/types';

/**
 * Scope selection item for source analysis
 */
interface ScopeQuickPickItem extends vscode.QuickPickItem {
    id: 'file' | 'workspace';
}

/**
 * Command to analyze source code and generate diagram DSL
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
     * Execute command
     */
    public async execute(): Promise<void> {
        try {
            // 1. Select analysis scope
            const scope = await this.selectScope();
            if (!scope) return;

            let classes: ClassInfo[] = [];

            // 2. Analyze source
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating Class Diagram DSL',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Analyzing source code...' });

                if (scope === 'file') {
                    const activeEditor = vscode.window.activeTextEditor;
                    if (!activeEditor) {
                        throw new Error('No active editor found. Please open a file to analyze.');
                    }
                    classes = await this.analyzer.analyzeFile(activeEditor.document.uri);
                } else {
                    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                        throw new Error('No workspace folder found. Please open a folder to analyze the entire workspace.');
                    }

                    this.logger.info(`Starting workspace analysis for: ${vscode.workspace.workspaceFolders.map(f => f.name).join(', ')}`);

                    const config = vscode.workspace.getConfiguration('classDiagram');
                    const excludePatterns = config.get<string[]>('excludePatterns') || [];

                    classes = await this.analyzer.analyzeWorkspace({
                        excludePatterns
                    });
                    this.logger.info(`Analysis complete. Found ${classes.length} classes.`);
                }
            });

            this.logger.info(`Total classes found: ${classes.length}`);

            if (classes.length === 0) {
                vscode.window.showInformationMessage('No class information found in the selected scope.');
                return;
            }

            // 3. Source class info -> DomainModel -> DSL
            const domainModel = this.analyzer.toDomainModel(classes);
            const dsl = domainModel.toDSL();
            const saveResult = await this.fileService.saveDsl({
                dsl,
                fileName: 'diagram.dsl'
            }, {
                saveLabel: 'Generate DSL'
            });

            if (saveResult) {
                const action = await vscode.window.showInformationMessage(
                    `Successfully generated DSL: ${saveResult.filePath}`,
                    'Open DSL'
                );
                if (action === 'Open DSL') {
                    await vscode.window.showTextDocument(saveResult.uri);
                }
            }
        } catch (error) {
            this.logger.error(`Command execution failed: ${error}`);
            vscode.window.showErrorMessage(`Failed to generate DSL: ${error}`);
        }
    }

    private async selectScope(): Promise<'file' | 'workspace' | undefined> {
        const items: ScopeQuickPickItem[] = [
            {
                label: 'Current File',
                description: 'Analyze only the active source file',
                id: 'file'
            },
            {
                label: 'Entire Workspace',
                description: 'Analyze all supported source files in the workspace',
                id: 'workspace'
            }
        ];

        const selection = await vscode.window.showQuickPick<ScopeQuickPickItem>(items, {
            placeHolder: 'Select the scope for source code analysis'
        });

        return selection ? selection.id : undefined;
    }
}
