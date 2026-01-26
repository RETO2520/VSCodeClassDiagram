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

        let lspClasses: ClassInfo[] = [];
        const languageId = await this.getLanguageId(uri);

        // 1. LSPプロバイダーを使用して情報を取得
        if (this.lspProvider.isAvailable(languageId)) {
            try {
                const symbols = await this.lspProvider.getDocumentSymbols(uri);
                if (symbols && symbols.length > 0) {
                    lspClasses = DocumentSymbolConverter.convertSymbols(symbols, uri);

                    const tokens = await this.lspProvider.getSemanticTokens(uri);
                    if (tokens) {
                        SemanticTokensExtractor.extractAndApply(tokens, lspClasses);
                    }
                }
            } catch (error) {
                this.logger.error(`LSP analysis failed for ${uri.fsPath}: ${error}`);
            }
        }

        // 2. AST解析を実行（タスク8.3: 常にAST解析を行い、LSPの結果を補完する）
        let astClasses: ClassInfo[] = [];
        const astParser = AstParserFactory.getParser(languageId);
        if (astParser) {
            try {
                const content = await this.readFileContent(uri);
                astClasses = await astParser.parse(uri, content);
            } catch (error) {
                this.logger.error(`AST analysis failed for ${uri.fsPath}: ${error}`);
            }
        }

        // 3. 結果を統合
        return this.mergeResults(lspClasses, astClasses);
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

    /**
     * LSPとASTの結果を統合する
     * タスク8.3: LSPの結果にASTから得られた継承情報を統合する
     */
    private mergeResults(lspResults: ClassInfo[], astResults: ClassInfo[]): ClassInfo[] {
        if (lspResults.length === 0) return astResults;
        if (astResults.length === 0) return lspResults;

        // LSPの結果をベースに、ASTの結果から情報を補完する
        return lspResults.map(lspClass => {
            const astClass = astResults.find(ac => ac.name === lspClass.name);
            if (astClass) {
                // LSPで継承情報が不足している場合にASTで補完
                if (!lspClass.baseClass && astClass.baseClass) {
                    lspClass.baseClass = astClass.baseClass;
                }
                if ((!lspClass.interfaces || lspClass.interfaces.length === 0) && (astClass.interfaces && astClass.interfaces.length > 0)) {
                    lspClass.interfaces = astClass.interfaces;
                }
            }
            return lspClass;
        });
    }
}
