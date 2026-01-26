import * as vscode from 'vscode';
import { ILspProvider } from './sourceToDiagram/lsp/ILspProvider';
import { AstParserFactory } from './sourceToDiagram/ast/AstParserFactory';
import { ClassInfo, AnalyzeOptions } from './sourceToDiagram/types';
import { Logger } from '../LoggerComponents/Logger';
import { DocumentSymbolConverter } from './sourceToDiagram/lsp/DocumentSymbolConverter';
import { SemanticTokensExtractor } from './sourceToDiagram/lsp/SemanticTokensExtractor';

/**
 * ソースコード解析の統合エントリーポイント
 * LSPとAST解析を組み合わせてクラス情報を抽出する
 */
export class SourceAnalyzer {
    private lspProvider: ILspProvider;
    private logger: Logger;

    constructor(lspProvider: ILspProvider, logger: Logger) {
        this.lspProvider = lspProvider;
        this.logger = logger;
        AstParserFactory.initialize(logger);
    }

    /**
     * 単一ファイルを解析する
     * LSPを優先し、利用できない場合や不十分な場合はAST解析で補完する
     */
    public async analyzeFile(uri: vscode.Uri): Promise<ClassInfo[]> {
        this.logger.info(`Analyzing file: ${uri.fsPath}`);

        let classes: ClassInfo[] = [];
        const languageId = await this.getLanguageId(uri);

        // 1. LSPプロバイダーを使用して情報を取得
        if (this.lspProvider.isAvailable(languageId)) {
            try {
                const symbols = await this.lspProvider.getDocumentSymbols(uri);
                if (symbols && symbols.length > 0) {
                    classes = DocumentSymbolConverter.convertSymbols(symbols, uri);

                    const tokens = await this.lspProvider.getSemanticTokens(uri);
                    if (tokens) {
                        SemanticTokensExtractor.extractAndApply(tokens, classes);
                    }
                }
            } catch (error) {
                this.logger.error(`LSP analysis failed for ${uri.fsPath}: ${error}`);
            }
        }

        // 2. LSPで情報が取得できない、または補完が必要な場合はAST解析を実行
        // 現状はLSPで取得できてもASTで補完する方針（または完全にフォールバック）
        if (classes.length === 0) {
            const astParser = AstParserFactory.getParser(languageId);
            if (astParser) {
                try {
                    const content = await this.readFileContent(uri);
                    const astClasses = await astParser.parse(uri, content);
                    classes = this.mergeResults(classes, astClasses);
                } catch (error) {
                    this.logger.error(`AST analysis failed for ${uri.fsPath}: ${error}`);
                }
            }
        }

        return classes;
    }

    /**
     * ワークスペース全体を解析する
     */
    public async analyzeWorkspace(options?: AnalyzeOptions): Promise<ClassInfo[]> {
        const includePattern = options?.includePatterns?.[0] || '**/*.{ts,js,cs,java}';
        const excludePattern = options?.excludePatterns?.[0] || '**/node_modules/**';

        const files = await vscode.workspace.findFiles(includePattern, excludePattern, options?.maxFiles);
        this.logger.info(`Found ${files.length} files to analyze.`);

        const allResults: ClassInfo[] = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing workspace source code",
            cancellable: true
        }, async (progress, token) => {
            for (let i = 0; i < files.length; i++) {
                if (token.isCancellationRequested) break;

                const file = files[i];
                progress.report({
                    message: `Processing ${file.fsPath}`,
                    increment: (1 / files.length) * 100
                });

                const fileResults = await this.analyzeFile(file);
                allResults.push(...fileResults);
            }
        });

        return allResults;
    }

    private async getLanguageId(uri: vscode.Uri): Promise<string> {
        const document = await vscode.workspace.openTextDocument(uri);
        return document.languageId;
    }

    private async readFileContent(uri: vscode.Uri): Promise<string> {
        const document = await vscode.workspace.openTextDocument(uri);
        return document.getText();
    }

    private mergeResults(lspResults: ClassInfo[], astResults: ClassInfo[]): ClassInfo[] {
        // 基本的にはLSPがある場合はそれを優先し、ASTはフォールバックとして扱う
        return lspResults.length > 0 ? lspResults : astResults;
    }
}
