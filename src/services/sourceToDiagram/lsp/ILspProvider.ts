import * as vscode from 'vscode';

/**
 * LSPプロバイダーの統一インターフェース
 * VS CodeのLSP連携機能（DocumentSymbol, Semantic Tokens）を抽象化し、
 * 解析層からのアクセスを統一する
 */
export interface ILspProvider {
    /**
     * 指定されたURIのドキュメントシンボルを取得する
     * @param uri ドキュメントのURI
     * @returns ドキュメントシンボルの配列。取得できない場合は空配列を返す
     */
    getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]>;

    /**
     * 指定されたURIのSemantic Tokensを取得する
     * @param uri ドキュメントのURI
     * @returns Semantic Tokens。取得できない場合はnullを返す
     */
    getSemanticTokens(uri: vscode.Uri): Promise<vscode.SemanticTokens | null>;

    /**
     * 指定された言語IDに対してLSPプロバイダーが利用可能かどうかをチェックする
     * @param languageId 言語ID（'typescript', 'csharp'等）
     * @returns 利用可能な場合はtrue
     */
    isAvailable(languageId: string): boolean;
}
