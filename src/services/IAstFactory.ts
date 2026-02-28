import * as vscode from 'vscode';
import { ClassInfo } from '../../view/lib/class-diagram-types';

/**
 * ASTパーサーの統一インターフェース
 * 言語固有のAST解析ロジックを抽象化し、
 * 解析層からのアクセスを統一する
 */
export interface IAstFactory {
    /**
     * 指定されたURIとコンテンツのソースコードをパースし、クラス情報を抽出する
     * @param uri ソースファイルのURI
     * @param content ソースコードの文字列
     * @returns 抽出されたクラス情報の配列
     */
    parse(uri: vscode.Uri, content: string): Promise<ClassInfo[]>;

    /**
     * 指定された言語IDをこのパーサーがサポートしているかどうかをチェックする
     * @param languageId 言語ID（'typescript', 'javascript', 'csharp'等）
     * @returns サポートしている場合はtrue
     */
    supports(languageId: string): boolean;
}
