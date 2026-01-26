import * as vscode from 'vscode';
import { ClassInfo } from '../types';

/**
 * vscode.SemanticTokensを解析し、修飾子や型情報を抽出するユーティリティクラス
 */
export class SemanticTokensExtractor {
    /**
     * Semantic Tokensを解析して、既存のClassInfo配列を補完する
     * @param tokens Semantic Tokens
     * @param classes 補完対象のClassInfo配列
     * @param legend セマンティックトークンの凡例（本来はプロバイダーから取得する必要がある）
     */
    public static extractAndApply(tokens: vscode.SemanticTokens, classes: ClassInfo[], legend?: vscode.SemanticTokensLegend): void {
        if (!tokens || !tokens.data) return;

        const data = tokens.data;
        let currentLine = 0;
        let currentChar = 0;

        for (let i = 0; i < data.length; i += 5) {
            const deltaLine = data[i];
            const deltaStartChar = data[i + 1];
            const length = data[i + 2];
            const tokenType = data[i + 3];
            const tokenModifiers = data[i + 4];

            currentLine += deltaLine;
            if (deltaLine === 0) {
                currentChar += deltaStartChar;
            } else {
                currentChar = deltaStartChar;
            }

            const range = new vscode.Range(currentLine, currentChar, currentLine, currentChar + length);

            // このトークンがどのクラス、メソッド、プロパティに関連するかを特定し、情報を更新する
            this.applyTokenToClasses(range, tokenType, tokenModifiers, classes, legend);
        }
    }

    private static applyTokenToClasses(range: vscode.Range, typeIdx: number, modIdx: number, classes: ClassInfo[], legend?: vscode.SemanticTokensLegend): void {
        // 注: legendがない場合は、一般的なTypeScript/C#のインデックスに基づいたフォールバックが必要
        // ここでは、可視性や修飾子の抽出ロジックを実装する

        for (const cls of classes) {
            // クラス自体の修飾子（abstractなど）
            if (cls.location.range.contains(range.start)) {
                this.updateMemberInfo(cls, range, typeIdx, modIdx, legend);
            }

            // メソッドやプロパティ
            for (const op of cls.operations) {
                if (op.location.contains(range.start)) {
                    this.updateOperationInfo(op, range, typeIdx, modIdx, legend);
                }
            }

            for (const attr of cls.attributes) {
                if (attr.location.contains(range.start)) {
                    this.updateAttributeInfo(attr, range, typeIdx, modIdx, legend);
                }
            }
        }
    }

    private static updateMemberInfo(cls: ClassInfo, range: vscode.Range, typeIdx: number, modIdx: number, legend?: vscode.SemanticTokensLegend): void {
        // 修飾子のデコード
        if (this.hasModifier(modIdx, 'abstract', legend)) {
            cls.kind = 'abstract';
        }
    }

    private static updateOperationInfo(op: any, range: vscode.Range, typeIdx: number, modIdx: number, legend?: vscode.SemanticTokensLegend): void {
        if (this.hasModifier(modIdx, 'static', legend)) {
            if (!op.modifiers.includes('static')) op.modifiers.push('static');
        }
        if (this.hasModifier(modIdx, 'abstract', legend)) {
            if (!op.modifiers.includes('abstract')) op.modifiers.push('abstract');
        }
        if (this.hasModifier(modIdx, 'async', legend)) {
            if (!op.modifiers.includes('async')) op.modifiers.push('async');
        }
    }

    private static updateAttributeInfo(attr: any, range: vscode.Range, typeIdx: number, modIdx: number, legend?: vscode.SemanticTokensLegend): void {
        if (this.hasModifier(modIdx, 'static', legend)) {
            if (!attr.modifiers.includes('static')) attr.modifiers.push('static');
        }
        if (this.hasModifier(modIdx, 'readonly', legend)) {
            if (!attr.modifiers.includes('readonly')) attr.modifiers.push('readonly');
        }
    }

    private static hasModifier(modIdx: number, name: string, legend?: vscode.SemanticTokensLegend): boolean {
        if (legend) {
            const idx = legend.tokenModifiers.indexOf(name);
            return idx !== -1 && (modIdx & (1 << idx)) !== 0;
        }

        // フォールバック（一般的なインデックス）
        const commonMap: { [key: string]: number } = {
            'readonly': 2,
            'static': 3,
            'abstract': 5,
            'async': 6
        };
        const idx = commonMap[name];
        return idx !== undefined && (modIdx & (1 << idx)) !== 0;
    }
}
