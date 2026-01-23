import * as vscode from 'vscode';

/**
 * ソースコード解析層と変換層の間で使用する中間データ構造
 * 既存のIObjectModelインターフェースへの変換を考慮した構造
 */

/**
 * クラス情報を表すインターフェース
 * 解析層から抽出されたクラス、インターフェース、抽象クラスなどの情報を含む
 */
export interface ClassInfo {
    /** クラス名 */
    name: string;
    /** クラスの種類 */
    kind: 'class' | 'interface' | 'abstract' | 'struct';
    /** 基底クラス名（継承がある場合） */
    baseClass?: string;
    /** 実装しているインターフェース名の配列 */
    interfaces: string[];
    /** ジェネリック型パラメータの配列（例: ['T', 'U']） */
    genericParameters?: string[];
    /** クラスが定義されている場所の情報 */
    location: {
        /** ファイルのURI */
        uri: vscode.Uri;
        /** クラス定義の範囲 */
        range: vscode.Range;
    };
    /** 属性（フィールド、プロパティ）の配列 */
    attributes: AttributeInfo[];
    /** 操作（メソッド）の配列 */
    operations: OperationInfo[];
}

/**
 * 属性情報を表すインターフェース
 * クラスのフィールド、プロパティなどの情報を含む
 */
export interface AttributeInfo {
    /** 属性名 */
    name: string;
    /** 属性の型 */
    type: string;
    /** 可視性 */
    visibility: 'public' | 'private' | 'protected' | 'internal';
    /** 修飾子の配列（例: ['static', 'readonly']） */
    modifiers: string[];
    /** 抽象属性かどうか */
    isAbstract?: boolean;
    /** 属性が定義されている場所の範囲 */
    location: vscode.Range;
}

/**
 * 操作情報を表すインターフェース
 * クラスのメソッドなどの情報を含む
 */
export interface OperationInfo {
    /** メソッド名 */
    name: string;
    /** 戻り値の型 */
    returnType: string;
    /** パラメータの配列 */
    parameters: ParameterInfo[];
    /** 可視性 */
    visibility: 'public' | 'private' | 'protected' | 'internal';
    /** 修飾子の配列（例: ['static', 'abstract', 'virtual']） */
    modifiers: string[];
    /** メソッドが定義されている場所の範囲 */
    location: vscode.Range;
}

/**
 * パラメータ情報を表すインターフェース
 * メソッドの引数の情報を含む
 */
export interface ParameterInfo {
    /** パラメータ名 */
    name: string;
    /** パラメータの型 */
    type: string;
    /** オプショナルパラメータかどうか */
    isOptional?: boolean;
    /** デフォルト値（文字列として表現） */
    defaultValue?: string;
}

