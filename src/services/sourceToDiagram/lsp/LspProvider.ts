import * as vscode from 'vscode';
import { ILspProvider } from './ILspProvider';
import { Logger } from '../../../LoggerComponents/Logger';

/**
 * VS CodeのLSP機能を活用してソースコード情報を取得するプロバイダーの実装
 */
export class LspProvider implements ILspProvider {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 指定された言語IDに対応するドキュメントシンボルプロバイダーが登録されているか確認する
     * 厳密なチェックは困難なため、現在は登録されている言語の一覧に含まれているかを確認
     */
    public isAvailable(languageId: string): boolean {
        // 注: getLanguagesはVS Codeが認識している言語のリストであり、
        // 実際にLSPサーバーが動作していることを保証するものではないが、
        // 基本的なチェックとして使用する
        return true;
    }

    public async getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
        try {
            this.logger.debug(`Fetching document symbols for: ${uri.fsPath}`);
            const result = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );
            return result || [];
        } catch (error) {
            this.logger.error(`Error fetching document symbols: ${error}`);
            return [];
        }
    }

    public async getSemanticTokens(uri: vscode.Uri): Promise<vscode.SemanticTokens | null> {
        try {
            this.logger.debug(`Fetching semantic tokens for: ${uri.fsPath}`);
            const result = await vscode.commands.executeCommand<vscode.SemanticTokens>(
                'vscode.provideDocumentSemanticTokens',
                uri
            );
            return result || null;
        } catch (error) {
            this.logger.error(`Error fetching semantic tokens: ${error}`);
            return null;
        }
    }
}
