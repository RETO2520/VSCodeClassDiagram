import * as vscode from 'vscode';
import { ClassInfo, AttributeInfo, OperationInfo, ParameterInfo } from '../types';

/**
 * vscode.DocumentSymbolをClassInfo形式に変換するユーティリティクラス
 */
export class DocumentSymbolConverter {
    /**
     * DocumentSymbolの配列をClassInfoの配列に変換する
     * @param symbols 変換対象のDocumentSymbol配列
     * @param uri ファイルのURI
     * @returns 変換されたClassInfo配列
     */
    public static convertSymbols(symbols: vscode.DocumentSymbol[], uri: vscode.Uri): ClassInfo[] {
        const classes: ClassInfo[] = [];
        this.traverseSymbols(symbols, uri, classes);
        return classes;
    }

    private static traverseSymbols(symbols: vscode.DocumentSymbol[], uri: vscode.Uri, result: ClassInfo[]): void {
        for (const symbol of symbols) {
            if (this.isClassLike(symbol)) {
                result.push(this.convertToClassInfo(symbol, uri));
            } else if (symbol.children && symbol.children.length > 0) {
                // 名前空間などの場合は再帰的に探索
                this.traverseSymbols(symbol.children, uri, result);
            }
        }
    }

    private static isClassLike(symbol: vscode.DocumentSymbol): boolean {
        return symbol.kind === vscode.SymbolKind.Class ||
            symbol.kind === vscode.SymbolKind.Interface ||
            symbol.kind === vscode.SymbolKind.Struct;
    }

    private static convertToClassInfo(symbol: vscode.DocumentSymbol, uri: vscode.Uri): ClassInfo {
        const classKind: 'class' | 'interface' | 'struct' | 'abstract' =
            symbol.kind === vscode.SymbolKind.Interface ? 'interface' :
                symbol.kind === vscode.SymbolKind.Struct ? 'struct' : 'class';

        const classInfo: ClassInfo = {
            name: symbol.name,
            kind: classKind,
            interfaces: [],
            location: {
                uri: uri,
                range: symbol.range
            },
            attributes: [],
            operations: []
        };

        if (symbol.children) {
            for (const child of symbol.children) {
                if (child.kind === vscode.SymbolKind.Property || child.kind === vscode.SymbolKind.Field) {
                    classInfo.attributes.push(this.convertToAttributeInfo(child));
                } else if (child.kind === vscode.SymbolKind.Method || child.kind === vscode.SymbolKind.Constructor || child.kind === vscode.SymbolKind.Function) {
                    classInfo.operations.push(this.convertToOperationInfo(child));
                }
            }
        }

        return classInfo;
    }

    private static convertToAttributeInfo(symbol: vscode.DocumentSymbol): AttributeInfo {
        return {
            name: symbol.name,
            type: 'any', // DocumentSymbolからは型情報が直接得られないため、後でSemanticTokens等で補完
            visibility: 'public', // デフォルト
            modifiers: [],
            location: symbol.range
        };
    }

    private static convertToOperationInfo(symbol: vscode.DocumentSymbol): OperationInfo {
        return {
            name: symbol.name,
            returnType: 'void', // デフォルト
            parameters: [],
            visibility: 'public', // デフォルト
            modifiers: [],
            location: symbol.range
        };
    }
}
