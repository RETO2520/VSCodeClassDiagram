
/**
 * Rust用のASTパーサー
 * web-tree-sitterを使用してASTを構築し、クラス情報を抽出する
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as Parser from 'web-tree-sitter';
type Language = Parser.Language;
type Tree = Parser.Tree;
type Node = Parser.Node;
import { IAstParser } from "../IAstParser";
import { ClassInfo, OperationInfo, AttributeInfo, ParameterInfo } from '../../types';
import { Logger } from '../../../../LoggerComponents/Logger';

export class RustAstParser implements IAstParser {
    private readonly logger: Logger;
    private readonly extensionUri: vscode.Uri;
    private parser: any = null;
    private isInitialized = false;
    // struct/enumとそれに対応するimplから抽出したメソッドをマッピング
    private implMethods: Map<string, OperationInfo[]> = new Map();
    // struct/enumとそれに対応するトレイト実装をマッピング
    private implTraits: Map<string, string[]> = new Map();

    constructor(logger: Logger, extensionUri: vscode.Uri) {
        this.logger = logger;
        this.extensionUri = extensionUri;
    }

    /**
     * web-tree-sitterおよびRust言語モジュールを初期化する
     */
    private async initParser(): Promise<boolean> {
        if (this.isInitialized && this.parser) return true;

        try {
            const ParserClass = (Parser as any).Parser;
            const LanguageClass = (Parser as any).Language;

            if (!this.extensionUri) {
                throw new Error("extensionUri is undefined");
            }

            const wasmBaseDir = vscode.Uri.joinPath(this.extensionUri, 'out');

            await ParserClass.init({
                locateFile: (file: string) => {
                    if (file === 'web-tree-sitter.wasm') {
                        return vscode.Uri.joinPath(wasmBaseDir, 'web-tree-sitter.wasm').fsPath;
                    }
                    return file;
                }
            });

            const wasmUri = vscode.Uri.joinPath(wasmBaseDir, 'tree-sitter-rust.wasm');
            const wasmPath = wasmUri.fsPath;

            this.logger.info(`Loading Rust language wasm from: ${wasmPath}`);
            if (!wasmPath) {
                throw new Error("Resolved wasmPath is empty");
            }

            const language = await LanguageClass.load(wasmPath);
            this.parser = new ParserClass();
            this.parser.setLanguage(language);
            this.isInitialized = true;
            return true;
        } catch (error) {
            this.logger.error(`Failed to initialize web-tree-sitter for Rust: ${error}`);
            if (error instanceof Error && error.stack) {
                this.logger.error(`Stack trace: ${error.stack}`);
            }
            console.error(error);
            return false;
        }
    }

    public async parse(uri: vscode.Uri, content: string): Promise<ClassInfo[]> {
        if (!(await this.initParser()) || !this.parser) return [];

        try {
            const tree = this.parser.parse(content);
            if (!tree) return [];

            // マッピングをリセット
            this.implMethods.clear();
            this.implTraits.clear();

            const classes: ClassInfo[] = [];

            // 第1パス: implブロックからメソッドとトレイト情報を抽出
            this.collectImplInfo(tree.rootNode);

            // 第2パス: struct, enum, traitを抽出し、implからのメソッドをマージ
            this.visitNode(tree.rootNode, uri, classes);

            return classes;
        } catch (error) {
            this.logger.error(`Error parsing Rust AST for ${uri.fsPath}: ${error}`);
            return [];
        }
    }

    public supports(languageId: string): boolean {
        return languageId === 'rust';
    }

    /**
     * implブロックからメソッドとトレイト情報を収集する（第1パス）
     */
    private collectImplInfo(node: Node): void {
        if (node.type === 'impl_item') {
            this.processImplItem(node);
        }

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.collectImplInfo(child);
            }
        }
    }

    /**
     * impl_itemを処理してメソッドとトレイト情報を抽出
     */
    private processImplItem(node: Node): void {
        // impl対象の型を取得
        const typeNode = node.childForFieldName('type');
        if (!typeNode) return;

        const typeName = this.extractTypeName(typeNode);
        if (!typeName) return;

        // トレイト実装かどうかを確認
        const traitNode = node.childForFieldName('trait');
        if (traitNode) {
            const traitName = this.extractTypeName(traitNode);
            if (traitName) {
                const traits = this.implTraits.get(typeName) || [];
                traits.push(traitName);
                this.implTraits.set(typeName, traits);
            }
        }

        // メソッドを抽出
        const body = node.childForFieldName('body');
        if (body) {
            const methods: OperationInfo[] = [];
            for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i);
                if (member && member.type === 'function_item') {
                    methods.push(this.extractOperationInfo(member));
                }
            }
            const existingMethods = this.implMethods.get(typeName) || [];
            this.implMethods.set(typeName, [...existingMethods, ...methods]);
        }
    }

    /**
     * 型ノードから型名を抽出
     */
    private extractTypeName(node: Node): string | null {
        if (node.type === 'type_identifier') {
            return node.text;
        }
        if (node.type === 'generic_type') {
            const typeNode = node.childForFieldName('type');
            if (typeNode) {
                return typeNode.text;
            }
        }
        if (node.type === 'scoped_type_identifier') {
            const nameNode = node.childForFieldName('name');
            if (nameNode) {
                return nameNode.text;
            }
        }
        // フォールバック: 最初のtype_identifierを探す
        const typeIdentifier = node.descendantsOfType('type_identifier')[0];
        if (typeIdentifier) {
            return typeIdentifier.text;
        }
        return null;
    }

    /**
     * ASTノードを再帰的に走査してクラス情報を抽出する（第2パス）
     */
    private visitNode(node: Node, uri: vscode.Uri, classes: ClassInfo[]): void {
        if (node.type === 'struct_item') {
            classes.push(this.extractStructInfo(node, uri));
        } else if (node.type === 'enum_item') {
            classes.push(this.extractEnumInfo(node, uri));
        } else if (node.type === 'trait_item') {
            classes.push(this.extractTraitInfo(node, uri));
        }
        // impl_itemは第1パスで処理済みなのでスキップ

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.visitNode(child, uri, classes);
            }
        }
    }

    /**
     * struct_itemからClassInfoを抽出
     */
    private extractStructInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const structName = nameNode ? nameNode.text : 'AnonymousStruct';

        const classInfo: ClassInfo = {
            name: structName,
            kind: 'struct',
            interfaces: this.implTraits.get(structName) || [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: this.implMethods.get(structName) || []
        };

        // フィールドを抽出
        const body = node.childForFieldName('body');
        if (body && body.type === 'field_declaration_list') {
            for (let i = 0; i < body.childCount; i++) {
                const field = body.child(i);
                if (field && field.type === 'field_declaration') {
                    classInfo.attributes.push(this.extractFieldDeclaration(field));
                }
            }
        }

        return classInfo;
    }

    /**
     * enum_itemからClassInfoを抽出
     */
    private extractEnumInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const enumName = nameNode ? nameNode.text : 'AnonymousEnum';

        const classInfo: ClassInfo = {
            name: enumName,
            kind: 'enum',
            interfaces: this.implTraits.get(enumName) || [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: this.implMethods.get(enumName) || []
        };

        // バリアントを抽出
        const body = node.childForFieldName('body');
        if (body && body.type === 'enum_variant_list') {
            for (let i = 0; i < body.childCount; i++) {
                const variant = body.child(i);
                if (variant && variant.type === 'enum_variant') {
                    const variantNameNode = variant.childForFieldName('name');
                    if (variantNameNode) {
                        classInfo.attributes.push({
                            name: variantNameNode.text,
                            type: 'variant',
                            visibility: this.extractVisibility(variant),
                            modifiers: [],
                            location: this.convertRange(variant)
                        });
                    }
                }
            }
        }

        return classInfo;
    }

    /**
     * trait_itemからClassInfoを抽出
     */
    private extractTraitInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const traitName = nameNode ? nameNode.text : 'AnonymousTrait';

        const classInfo: ClassInfo = {
            name: traitName,
            kind: 'interface',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        // スーパートレイト（bounds）を抽出
        const boundsNode = node.childForFieldName('bounds');
        if (boundsNode) {
            // trait_boundsからスーパートレイトを抽出
            const typeIdentifiers = boundsNode.descendantsOfType('type_identifier');
            for (const typeId of typeIdentifiers) {
                classInfo.interfaces.push(typeId.text);
            }
        }

        // メソッドシグネチャを抽出
        const body = node.childForFieldName('body');
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i);
                if (member) {
                    if (member.type === 'function_item' || member.type === 'function_signature_item') {
                        classInfo.operations.push(this.extractOperationInfo(member));
                    }
                }
            }
        }

        return classInfo;
    }

    /**
     * field_declarationからAttributeInfoを抽出
     */
    private extractFieldDeclaration(node: Node): AttributeInfo {
        const nameNode = node.childForFieldName('name');
        const typeNode = node.childForFieldName('type');

        return {
            name: nameNode ? nameNode.text : 'anonymous',
            type: typeNode ? typeNode.text : 'unknown',
            visibility: this.extractVisibility(node),
            modifiers: [],
            location: this.convertRange(node)
        };
    }

    /**
     * function_item/function_signature_itemからOperationInfoを抽出
     */
    private extractOperationInfo(node: Node): OperationInfo {
        const nameNode = node.childForFieldName('name');
        const paramsNode = node.childForFieldName('parameters');
        const returnTypeNode = node.childForFieldName('return_type');

        return {
            name: nameNode ? nameNode.text : 'anonymous',
            returnType: returnTypeNode ? returnTypeNode.text : '()',
            parameters: this.extractParameters(paramsNode),
            visibility: this.extractVisibility(node),
            modifiers: this.extractFunctionModifiers(node),
            location: this.convertRange(node)
        };
    }

    /**
     * パラメータリストからParameterInfo[]を抽出
     */
    private extractParameters(node: Node | null): ParameterInfo[] {
        if (!node) return [];
        const parameters: ParameterInfo[] = [];

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (!child) continue;

            if (child.type === 'parameter') {
                const pattern = child.childForFieldName('pattern');
                const typeNode = child.childForFieldName('type');
                parameters.push({
                    name: pattern ? pattern.text : 'param',
                    type: typeNode ? typeNode.text : 'unknown',
                    isOptional: false
                });
            } else if (child.type === 'self_parameter') {
                // self, &self, &mut selfなど
                parameters.push({
                    name: 'self',
                    type: child.text,
                    isOptional: false
                });
            }
        }
        return parameters;
    }

    /**
     * Rustの可視性修飾子を抽出
     */
    private extractVisibility(node: Node): 'public' | 'protected' | 'private' | 'internal' {
        // 直接の子ノードからvisibility_modifierを探す
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'visibility_modifier') {
                const text = child.text;
                if (text === 'pub') {
                    return 'public';
                }
                if (text.startsWith('pub(crate)') || text.startsWith('pub(super)') || text.startsWith('pub(in')) {
                    return 'internal';
                }
            }
        }

        // Rustではデフォルトはprivate
        return 'private';
    }

    /**
     * 関数の修飾子を抽出
     */
    private extractFunctionModifiers(node: Node): string[] {
        const mods: string[] = [];

        // function_modifiersを探す
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'function_modifiers') {
                for (let j = 0; j < child.childCount; j++) {
                    const mod = child.child(j);
                    if (mod) {
                        const text = mod.text;
                        if (['async', 'unsafe', 'const', 'extern'].includes(text)) {
                            mods.push(text);
                        }
                    }
                }
            }
            // 個別の修飾子キーワードもチェック
            if (child && (child.text === 'async' || child.text === 'unsafe' || child.text === 'const')) {
                if (!mods.includes(child.text)) {
                    mods.push(child.text);
                }
            }
        }

        return mods;
    }

    private convertRange(node: Node): vscode.Range {
        return new vscode.Range(
            node.startPosition.row,
            node.startPosition.column,
            node.endPosition.row,
            node.endPosition.column
        );
    }
}
