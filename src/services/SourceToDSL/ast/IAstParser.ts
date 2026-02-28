import * as vscode from 'vscode';
import { ClassInfo } from '../../../../../view/lib/class-diagram-types';

/**
 * Domain Model抽出用ASTパーサーの統一インターフェース
 */
export interface IAstParser {
    /**
     * 指定されたURIとコンテンツのソースコードをパースし、Domain Model仕様のクラス情報を抽出する
     * @param uri ソースファイルのURI
     * @param content ソースコードの文字列
     * @returns 抽出されたクラス情報の配列
     */
    parse(uri: vscode.Uri, content: string): Promise<ClassInfo[]>;

    /**
     * 指定された言語IDをこのパーサーがサポートしているかどうかをチェックする
     * @param languageId 言語ID（'csharp', 'java', 'rust', 'cpp'等）
     * @returns サポートしている場合はtrue
     */
    supports(languageId: string): boolean;
}
