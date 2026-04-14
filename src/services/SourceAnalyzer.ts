import * as vscode from 'vscode';
import { ILspProvider } from './sourceToDiagram/lsp/ILspProvider';
import { AstParserFactory } from './sourceToDiagram/ast/AstParserFactory';
import { ClassInfo, AnalyzeOptions } from './sourceToDiagram/types';
import { Logger } from '../LoggerComponents/Logger';
import { DocumentSymbolConverter } from './sourceToDiagram/lsp/DocumentSymbolConverter';
import { SemanticTokensExtractor } from './sourceToDiagram/lsp/SemanticTokensExtractor';
import * as cdt from "../../view/lib/class-diagram-types";
import { DomainModel } from '../../view/lib/DomainModel';
import { AstParserFactory as dslAstParserFactory } from './SourceToDSL/ast/AstParserFactory';

/**
 * ソースコード解析の統合エントリーポイント
 * LSPとAST解析を組み合わせてクラス情報を抽出する
 */
export class SourceAnalyzer {
    private lspProvider: ILspProvider;
    private logger: Logger;
    private initPromise: Promise<void>;

    constructor(lspProvider: ILspProvider, logger: Logger, extensionUri: vscode.Uri) {
        this.lspProvider = lspProvider;
        this.logger = logger;

        // 初期化（WASMのロード等）をPromiseとして保持し、実行前に待機できるようにする
        this.initPromise = (async () => {
            await AstParserFactory.initialize(logger, extensionUri);
            await dslAstParserFactory.initialize(logger, extensionUri);
            logger.info("AST Parser factories initialized successfully.");
        })();
    }

    /**
     * 単一ファイルを解析する
     * LSPを優先し、利用できない場合や不十分な場合はAST解析で補完する
     * 現時点では、LSPは利用していない
     */
    public async analyzeFile(uri: vscode.Uri): Promise<ClassInfo[]> {
        this.logger.info(`Analyzing file: ${uri.fsPath}`);

        // 解析前に必ず初期化の完了を待機する
        await this.initPromise;

        let lspClasses: ClassInfo[] = [];
        const languageId = await this.getLanguageId(uri);
        this.logger.info(`Language ID: ${languageId}`);

        // 1. LSPプロバイダーを使用して情報を取得
        // if (this.lspProvider.isAvailable(languageId)) {
        //     try {
        //         const symbols = await this.lspProvider.getDocumentSymbols(uri);
        //         if (symbols && symbols.length > 0) {
        //             lspClasses = DocumentSymbolConverter.convertSymbols(symbols, uri);

        //             const tokens = await this.lspProvider.getSemanticTokens(uri);
        //             if (tokens) {
        //                 SemanticTokensExtractor.extractAndApply(tokens, lspClasses);
        //             }
        //         }
        //     } catch (error) {
        //         this.logger.error(`LSP analysis failed for ${uri.fsPath}: ${error}`);
        //     }
        // }

        // 2. AST解析を実行（タスク8.3: 常にAST解析を行い、LSPの結果を補完する）
        let astClasses: ClassInfo[] = [];
        const astParser = AstParserFactory.getParser(languageId);
        if (astParser) {
            try {
                const content = await this.readFileContent(uri);
                this.logger.info(`Executing AST parse for: ${uri.fsPath} (Language: ${languageId}, Size: ${content.length})`);
                astClasses = await astParser.parse(uri, content);
                if (astClasses.length === 0 && content.length > 0) {
                    this.logger.warn(`AST parser returned empty result for non-empty file: ${uri.fsPath}. Check Tree-sitter queries or grammar support.`);
                }
            } catch (error) {
                this.logger.error(`AST analysis failed for ${uri.fsPath}: ${error}`);
            }
        } else {
            this.logger.warn(`No registered AST parser for languageId: ${languageId} (File: ${uri.fsPath})`);
        }

        this.logger.info(`LSP classes found: ${lspClasses.length}, AST classes found: ${astClasses.length}`);

        // 3. 結果を統合
        return this.mergeResults(lspClasses, astClasses);
    }

    /**
     * ワークスペース全体を解析する
     */
    public async analyzeWorkspace(options?: AnalyzeOptions): Promise<ClassInfo[]> {
        const includes = options?.includePatterns?.filter(p => !!p) || [];
        const includePattern = includes.length > 0
            ? (includes.length > 1 ? `{${includes.join(',')}}` : includes[0])
            : '**/*.{ts,tsx,js,jsx,cs,java,rs,cpp,hpp}';

        const excludes = options?.excludePatterns?.filter(p => !!p) || [];
        const excludePattern = excludes.length > 0
            ? (excludes.length > 1 ? `{${excludes.join(',')}}` : excludes[0])
            : '**/node_modules/**';

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

                // 属性情報の補完 (型がanyの場合や、可視性がデフォルトの場合にASTの情報を使用)
                lspClass.attributes = (lspClass.attributes ?? []).map(lspAttr => {
                    const astAttr = (astClass.attributes ?? []).find(aa => aa.name === lspAttr.name);
                    if (astAttr) {
                        return {
                            ...lspAttr,
                            type: astAttr.type,
                            visibility: lspAttr.visibility === 'public' && astAttr.visibility !== 'public' ? astAttr.visibility : lspAttr.visibility,
                            modifiers: (lspAttr.modifiers?.length ?? 0) === 0 ? astAttr.modifiers : lspAttr.modifiers
                        };
                    }
                    return lspAttr;
                });

                // 操作情報の補完
                lspClass.operations = (lspClass.operations ?? []).map(lspOp => {
                    const astOp = (astClass.operations ?? []).find(ao => ao.name === lspOp.name);
                    if (astOp) {
                        return {
                            ...lspOp,
                            returnType: lspOp.returnType === 'void' || lspOp.returnType === 'any' ? astOp.returnType : lspOp.returnType,
                            visibility: lspOp.visibility === 'public' && astOp.visibility !== 'public' ? astOp.visibility : lspOp.visibility,
                            parameters: (lspOp.parameters?.length ?? 0) === 0 ? astOp.parameters : lspOp.parameters,
                            modifiers: (lspOp.modifiers?.length ?? 0) === 0 ? astOp.modifiers : lspOp.modifiers,
                            workflow: astOp.workflow
                        };
                    }
                    return lspOp;
                });
            }
            return lspClass;
        });
    }

    /**
     * 抽出されたクラス情報をDomainModelに変換する
     */
    public toDomainModel(sourceClasses: ClassInfo[]): DomainModel {
        const idMap = new Map<string, string>();
        for (const sc of sourceClasses) {
            idMap.set(sc.name, cdt.createId());
        }

        const domainClasses: cdt.ClassInfo[] = sourceClasses.map(sc => {
            let kind: cdt.ClassKind = 'class';
            if (sc.kind === 'interface') kind = 'interface';
            if (sc.kind === 'struct') kind = 'struct';
            if (sc.kind === 'enum') kind = 'class';

            return {
                id: idMap.get(sc.name) || cdt.createId(),
                name: sc.name,
                kind: kind,
                isAbstract: sc.kind === 'abstract',
                members: (sc.attributes ?? []).map(a => ({
                    id: cdt.createId(),
                    name: a.name,
                    type: a.type,
                    visibility: (a.visibility === 'internal' ? 'package' : a.visibility) as any,
                    isStatic: (a.modifiers ?? []).includes('static'),
                    isAbstract: !!a.isAbstract || (a.modifiers ?? []).includes('abstract'),
                    relationship: 'auto',
                    sourceMultiplicity: '1',
                    targetMultiplicity: '1'
                })),
                operations: (sc.operations ?? []).map(o => ({
                    id: cdt.createId(),
                    name: o.name,
                    returnType: o.returnType,
                    visibility: (o.visibility === 'internal' ? 'package' : o.visibility) as any,
                    isStatic: (o.modifiers ?? []).includes('static'),
                    isAbstract: (o.modifiers ?? []).includes('abstract'),
                    parameters: (o.parameters ?? []).map(p => ({
                        id: cdt.createId(),
                        name: p.name,
                        type: p.type
                    })),
                    workflow: o.workflow
                })),
                interfaces: (sc.interfaces ?? []).map(i => idMap.get(i) || i),
                baseClassId: sc.baseClass ? (idMap.get(sc.baseClass) || sc.baseClass) : null,
                x: 0,
                y: 0,
                componentIds: [],
            };
        });

        return DomainModel.from(domainClasses);
    }

    /**
     * ソースコードから直接ドメインモデルを抽出する
     */
    public async analyzeDomainModel(uri: vscode.Uri): Promise<cdt.ClassInfo[]> {
        const languageId = await this.getLanguageId(uri);
        const parser = dslAstParserFactory.getParser(languageId);
        if (parser) {
            try {
                const content = await this.readFileContent(uri);
                return await parser.parse(uri, content);
            } catch (error) {
                this.logger.error(`Domain model extraction failed for ${uri.fsPath}: ${error}`);
            }
        }
        return [];
    }
}
