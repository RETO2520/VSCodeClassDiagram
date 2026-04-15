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
    kind: 'class' | 'interface' | 'abstract' | 'struct' | 'enum';
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
    /** ワークフロー情報 */
    workflow?: {
        nodes: any[];
        edges: any[];
    };

    additionalInfo?: {
        stableId?: string; // AI生成用の安定ID
        /** メソッドがオーバーライドしているかどうか */
        isOverride?: boolean;
        /** メソッドが実装しているインターフェースの名前 */
        implementedInterface?: string;
        /** メソッドのシグネチャ（例: 'void DoSomething(int x, string y)'） */
        signature?: string;
        /** メソッドのドキュメントコメント */
        documentation?: string;
        /** メソッドの呼び出し元の情報（例: 呼び出し元のクラス名とメソッド名） */
        callers?: { className: string; methodName: string }[];
        /** メソッドの呼び出し先の情報（例: 呼び出し先のクラス名とメソッド名） */
        callees?: { className: string; methodName: string }[];
        /** メソッドが属するクラスの名前 */
        className?: string;
        /** メソッドが属するクラスの種類（class, interface, abstractなど） */
        classKind?: string;
        /** メソッドが属するクラスのジェネリック型パラメータ（例: ['T', 'U']） */
        classGenericParameters?: string[];
        /** メソッドが属するクラスの基底クラス名（継承がある場合） */
        classBaseClass?: string;
        /** メソッドが属するクラスの実装しているインターフェース名の配列 */
        classInterfaces?: string[];
        /** メソッドが属するクラスの属性（フィールド、プロパティ）の配列 */
        classAttributes?: AttributeInfo[];
        /** メソッドが属するクラスの操作（メソッド）の配列 */
        classOperations?: OperationInfo[];
        /** メソッドのシグネチャに含まれるジェネリック型パラメータの配列（例: ['T', 'U']） */
        methodGenericParameters?: string[];
        /** メソッドのシグネチャに含まれるジェネリック型パラメータの制約情報（例: { T: 'where T : class', U: 'where U : struct' }） */
        methodGenericParameterConstraints?: { [param: string]: string };
        /** メソッドのシグネチャに含まれるジェネリック型パラメータのデフォルト値の情報（例: { T: 'string', U: 'int' }） */
        methodDefaultValues?: { [param: string]: string };
        /** Gherkin形式の生データ */
        gherkinRaw?: string;
    }
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

/**
 * レイアウト情報を表すインターフェース
 * クラス図上のクラスの位置とサイズ情報を含む
 */
export interface LayoutInfo {
    /** クラスのID（diagram.jsonのIClassModel.idに対応） */
    classId: string;
    /** X座標 */
    x: number;
    /** Y座標 */
    y: number;
    /** 幅 */
    width: number;
    /** 高さ */
    height: number;
}

/**
 * 解析オプションを表すインターフェース
 * ソースコード解析時の設定を指定する
 */
export interface AnalyzeOptions {
    /** 解析対象に含めるファイルパターンの配列 */
    includePatterns?: string[];
    /** 解析対象から除外するファイルパターンの配列 */
    excludePatterns?: string[];
    /** LSPを使用するかどうか（デフォルト: true） */
    useLsp?: boolean;
    /** ASTを使用するかどうか（デフォルト: true） */
    useAst?: boolean;
    /** 最大ファイル数（パフォーマンス制限、未指定の場合は制限なし） */
    maxFiles?: number;
}

