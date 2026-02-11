
/**
 * C++用のASTパーサー
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

export class CppAstParser implements IAstParser {
    private readonly logger: Logger;
    private readonly extensionUri: vscode.Uri;
    private parser: any = null;
    private isInitialized = false;

    constructor(logger: Logger, extensionUri: vscode.Uri) {
        this.logger = logger;
        this.extensionUri = extensionUri;
    }

    /**
     * web-tree-sitterおよびC++言語モジュールを初期化する
     */
    private async initParser(): Promise<boolean> {
        if (this.isInitialized && this.parser) return true;

        try {
            const ParserClass = (Parser as any).Parser;
            const wasmBaseDir = vscode.Uri.joinPath(this.extensionUri, 'out');

            await ParserClass.init({
                locateFile: (file: string) => {
                    if (file === 'web-tree-sitter.wasm') {
                        return vscode.Uri.joinPath(wasmBaseDir, 'web-tree-sitter.wasm').fsPath;
                    }
                    return file;
                }
            });

            const wasmPath = vscode.Uri.joinPath(wasmBaseDir, 'tree-sitter-cpp.wasm').fsPath;
            this.logger.info(`Loading wasm file from: ${wasmPath}`);

            const language = await Parser.Language.load(wasmPath);
            this.parser = new ParserClass();
            this.parser.setLanguage(language);
            this.isInitialized = true;
            return true;
        } catch (error) {
            this.logger.error(`Failed to initialize web-tree-sitter for C++: ${error}`);
            console.error(error);
            return false;
        }
    }

    public async parse(uri: vscode.Uri, content: string): Promise<ClassInfo[]> {
        if (!(await this.initParser()) || !this.parser) return [];

        try {
            const tree = this.parser.parse(content);
            if (!tree) return [];

            const classes: ClassInfo[] = [];
            this.visitNode(tree.rootNode, uri, classes);
            return classes;
        } catch (error) {
            this.logger.error(`Error parsing C++ AST for ${uri.fsPath}: ${error}`);
            return [];
        }
    }

    public supports(languageId: string): boolean {
        return languageId === 'cpp' || languageId === 'c';
    }

    /**
     * ASTノードを再帰的に走査してクラス情報を抽出する
     */
    private visitNode(node: Node, uri: vscode.Uri, classes: ClassInfo[]): void {
        if (node.type === 'class_specifier') {
            const classInfo = this.extractClassInfo(node, uri);
            if (classInfo) {
                classes.push(classInfo);
            }
        } else if (node.type === 'struct_specifier') {
            const structInfo = this.extractStructInfo(node, uri);
            if (structInfo) {
                classes.push(structInfo);
            }
        } else if (node.type === 'enum_specifier') {
            const enumInfo = this.extractEnumInfo(node, uri);
            if (enumInfo) {
                classes.push(enumInfo);
            }
        }

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.visitNode(child, uri, classes);
            }
        }
    }

    /**
     * class_specifierからClassInfoを抽出
     */
    private extractClassInfo(node: Node, uri: vscode.Uri): ClassInfo | null {
        const nameNode = node.childForFieldName('name');
        // 無名クラスをスキップ（前方宣言など）
        if (!nameNode) return null;

        const className = nameNode.text;

        const classInfo: ClassInfo = {
            name: className,
            kind: 'class',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        // 継承関係の抽出
        const baseClause = this.findChildByType(node, 'base_class_clause');
        if (baseClause) {
            this.extractBaseClasses(baseClause, classInfo);
        }

        // メンバーの抽出
        const body = node.childForFieldName('body');
        if (body && body.type === 'field_declaration_list') {
            this.extractMembers(body, classInfo);
        }

        return classInfo;
    }

    /**
     * struct_specifierからClassInfoを抽出
     */
    private extractStructInfo(node: Node, uri: vscode.Uri): ClassInfo | null {
        const nameNode = node.childForFieldName('name');
        // 無名構造体をスキップ
        if (!nameNode) return null;

        const structName = nameNode.text;

        const classInfo: ClassInfo = {
            name: structName,
            kind: 'struct',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        // 継承関係の抽出
        const baseClause = this.findChildByType(node, 'base_class_clause');
        if (baseClause) {
            this.extractBaseClasses(baseClause, classInfo);
        }

        // メンバーの抽出
        const body = node.childForFieldName('body');
        if (body && body.type === 'field_declaration_list') {
            this.extractMembers(body, classInfo);
        }

        return classInfo;
    }

    /**
     * enum_specifierからClassInfoを抽出
     */
    private extractEnumInfo(node: Node, uri: vscode.Uri): ClassInfo | null {
        const nameNode = node.childForFieldName('name');
        // 無名列挙型をスキップ
        if (!nameNode) return null;

        const enumName = nameNode.text;

        const classInfo: ClassInfo = {
            name: enumName,
            kind: 'enum',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        // 列挙値の抽出
        const body = node.childForFieldName('body');
        if (body && body.type === 'enumerator_list') {
            for (let i = 0; i < body.childCount; i++) {
                const enumerator = body.child(i);
                if (enumerator && enumerator.type === 'enumerator') {
                    const enumeratorNameNode = enumerator.childForFieldName('name');
                    if (enumeratorNameNode) {
                        classInfo.attributes.push({
                            name: enumeratorNameNode.text,
                            type: 'enumerator',
                            visibility: 'public',
                            modifiers: [],
                            location: this.convertRange(enumerator)
                        });
                    }
                }
            }
        }

        return classInfo;
    }

    /**
     * 継承関係を抽出
     */
    private extractBaseClasses(baseClause: Node, classInfo: ClassInfo): void {
        for (let i = 0; i < baseClause.childCount; i++) {
            const child = baseClause.child(i);
            if (child && child.type === 'base_type_clause') {
                // アクセス指定子を持つ場合
                const typeIdentifier = this.findChildByType(child, 'type_identifier');
                if (typeIdentifier) {
                    // 最初の基底クラスをbaseClassに設定
                    if (!classInfo.baseClass) {
                        classInfo.baseClass = typeIdentifier.text;
                    } else {
                        classInfo.interfaces.push(typeIdentifier.text);
                    }
                }
            } else if (child && child.type === 'type_identifier') {
                // 直接type_identifierの場合
                if (!classInfo.baseClass) {
                    classInfo.baseClass = child.text;
                } else {
                    classInfo.interfaces.push(child.text);
                }
            }
        }
    }

    /**
     * クラス/構造体のメンバーを抽出
     */
    private extractMembers(body: Node, classInfo: ClassInfo): void {
        let currentVisibility: 'public' | 'protected' | 'private' | 'internal' =
            classInfo.kind === 'struct' ? 'public' : 'private';

        for (let i = 0; i < body.childCount; i++) {
            const member = body.child(i);
            if (!member) continue;

            // アクセス指定子の変更を検出
            if (member.type === 'access_specifier') {
                const specifierText = member.text.replace(':', '').trim();
                if (specifierText === 'public') {
                    currentVisibility = 'public';
                } else if (specifierText === 'protected') {
                    currentVisibility = 'protected';
                } else if (specifierText === 'private') {
                    currentVisibility = 'private';
                }
                continue;
            }

            // フィールド宣言
            if (member.type === 'field_declaration') {
                const attribute = this.extractFieldDeclaration(member, currentVisibility);
                if (attribute) {
                    classInfo.attributes.push(attribute);
                }
            }

            // 関数定義（インライン）
            if (member.type === 'function_definition') {
                const operation = this.extractFunctionDefinition(member, currentVisibility);
                if (operation) {
                    classInfo.operations.push(operation);
                }
            }

            // 関数宣言
            if (member.type === 'declaration') {
                const operation = this.extractFunctionDeclaration(member, currentVisibility);
                if (operation) {
                    classInfo.operations.push(operation);
                }
            }
        }
    }

    /**
     * field_declarationからAttributeInfoを抽出
     */
    private extractFieldDeclaration(node: Node, visibility: 'public' | 'protected' | 'private' | 'internal'): AttributeInfo | null {
        const typeNode = node.childForFieldName('type');
        const declaratorNode = node.childForFieldName('declarator');

        if (!declaratorNode) return null;

        // 関数ポインタなどをスキップ
        if (declaratorNode.type === 'function_declarator') return null;

        let fieldName = '';
        if (declaratorNode.type === 'identifier') {
            fieldName = declaratorNode.text;
        } else if (declaratorNode.type === 'pointer_declarator' ||
            declaratorNode.type === 'reference_declarator') {
            // ポインタや参照の場合、最終的なidentifierを探す
            const identifier = this.findDescendantByType(declaratorNode, 'identifier');
            if (identifier) {
                fieldName = identifier.text;
            }
        } else if (declaratorNode.type === 'array_declarator') {
            const identifier = declaratorNode.childForFieldName('declarator');
            if (identifier) {
                fieldName = identifier.text;
            }
        }

        if (!fieldName) return null;

        return {
            name: fieldName,
            type: typeNode ? typeNode.text : 'auto',
            visibility: visibility,
            modifiers: this.extractFieldModifiers(node),
            location: this.convertRange(node)
        };
    }

    /**
     * function_definitionからOperationInfoを抽出
     */
    private extractFunctionDefinition(node: Node, visibility: 'public' | 'protected' | 'private' | 'internal'): OperationInfo | null {
        const declarator = node.childForFieldName('declarator');
        if (!declarator || declarator.type !== 'function_declarator') return null;

        const funcNameNode = declarator.childForFieldName('declarator');
        const paramsNode = declarator.childForFieldName('parameters');
        const typeNode = node.childForFieldName('type');

        if (!funcNameNode) return null;

        return {
            name: funcNameNode.text,
            returnType: typeNode ? typeNode.text : 'void',
            parameters: this.extractParameters(paramsNode),
            visibility: visibility,
            modifiers: this.extractFunctionModifiers(node),
            location: this.convertRange(node)
        };
    }

    /**
     * declaration（関数宣言）からOperationInfoを抽出
     */
    private extractFunctionDeclaration(node: Node, visibility: 'public' | 'protected' | 'private' | 'internal'): OperationInfo | null {
        const declarator = node.childForFieldName('declarator');
        if (!declarator || declarator.type !== 'function_declarator') return null;

        const funcNameNode = declarator.childForFieldName('declarator');
        const paramsNode = declarator.childForFieldName('parameters');
        const typeNode = node.childForFieldName('type');

        if (!funcNameNode) return null;

        return {
            name: funcNameNode.text,
            returnType: typeNode ? typeNode.text : 'void',
            parameters: this.extractParameters(paramsNode),
            visibility: visibility,
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

            if (child.type === 'parameter_declaration') {
                const typeNode = child.childForFieldName('type');
                const declarator = child.childForFieldName('declarator');

                let paramName = 'param';
                if (declarator) {
                    if (declarator.type === 'identifier') {
                        paramName = declarator.text;
                    } else {
                        // ポインタや参照の場合
                        const identifier = this.findDescendantByType(declarator, 'identifier');
                        if (identifier) {
                            paramName = identifier.text;
                        }
                    }
                }

                // デフォルト引数のチェック
                const defaultValue = child.childForFieldName('default_value');

                parameters.push({
                    name: paramName,
                    type: typeNode ? typeNode.text : 'auto',
                    isOptional: defaultValue !== null
                });
            } else if (child.type === 'variadic_parameter_declaration') {
                // 可変引数（...）
                parameters.push({
                    name: '...',
                    type: 'variadic',
                    isOptional: true
                });
            }
        }
        return parameters;
    }

    /**
     * フィールドの修飾子を抽出
     */
    private extractFieldModifiers(node: Node): string[] {
        const mods: string[] = [];

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (!child) continue;

            if (child.type === 'storage_class_specifier') {
                const text = child.text;
                if (['static', 'extern', 'mutable', 'thread_local'].includes(text)) {
                    mods.push(text);
                }
            } else if (child.type === 'type_qualifier') {
                const text = child.text;
                if (['const', 'volatile', 'constexpr'].includes(text)) {
                    mods.push(text);
                }
            }
        }

        return mods;
    }

    /**
     * 関数の修飾子を抽出
     */
    private extractFunctionModifiers(node: Node): string[] {
        const mods: string[] = [];

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (!child) continue;

            if (child.type === 'storage_class_specifier') {
                const text = child.text;
                if (['static', 'extern', 'inline'].includes(text)) {
                    mods.push(text);
                }
            } else if (child.type === 'type_qualifier') {
                const text = child.text;
                if (['const', 'constexpr'].includes(text)) {
                    mods.push(text);
                }
            } else if (child.type === 'virtual_specifier' || child.text === 'virtual') {
                mods.push('virtual');
            } else if (child.type === 'virtual_function_specifier') {
                const text = child.text;
                if (['final', 'override'].includes(text)) {
                    mods.push(text);
                }
            }
        }

        // pure virtual (= 0) のチェック
        const declarator = node.childForFieldName('declarator');
        if (declarator) {
            const pureSpecifier = this.findChildByType(declarator, 'pure_virtual_clause');
            if (pureSpecifier) {
                if (!mods.includes('virtual')) {
                    mods.push('virtual');
                }
                mods.push('pure');
            }
        }

        return mods;
    }

    /**
     * 特定のタイプの直接の子ノードを検索
     */
    private findChildByType(node: Node, type: string): Node | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === type) {
                return child;
            }
        }
        return null;
    }

    /**
     * 特定のタイプのノードを子孫から検索（再帰的）
     */
    private findDescendantByType(node: Node, type: string): Node | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (!child) continue;

            if (child.type === type) {
                return child;
            }

            const found = this.findDescendantByType(child, type);
            if (found) return found;
        }
        return null;
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
