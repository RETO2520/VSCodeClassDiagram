import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * クラス図の要素に対して一意かつ安定したIDを生成するユーティリティ
 */
export class IdGenerator {
    /**
     * クラス名とファイルのURIに基づいて一意のIDを生成する
     * 同じクラス名かつ同じURIであれば常に同じIDを返す
     * @param className クラス名
     * @param uri ファイルのURI
     * @returns 生成されたID
     */
    public static generateClassId(className: string, uri: vscode.Uri): string {
        const input = `${uri.toString()}:${className}`;
        return crypto.createHash('md5').update(input).digest('hex');
    }

    /**
     * ランダムなIDを生成する（フォールバック用）
     * @returns ランダムなID
     */
    public static generateRandomId(): string {
        return crypto.randomBytes(16).toString('hex');
    }
}
