
/**
 * Java用のASTパーサー
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
export class JavaAstParser implements IAstParser {
    private logger: Logger;
    private parser: any = null;
    private isInitialized = false;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * web-tree-sitterおよびJava言語モジュールを初期化する
     */
    private async initParser(): Promise<boolean> {
        if (this.isInitialized && this.parser) return true;

        try {
            const ParserClass = (Parser as any).Parser;
            await ParserClass.init({
                locateFile: () => {
                    try {
                        return require.resolve('web-tree-sitter/web-tree-sitter.wasm');
                    } catch (e) {
                        return path.join(__dirname, '../../../../../../node_modules/web-tree-sitter/web-tree-sitter.wasm');
                    }
                }
            });

            let wasmPath: string;
            try {
                // tree-sitter-javaパッケージ内のwasmファイルを解決
                wasmPath = require.resolve('tree-sitter-java/tree-sitter-java.wasm');
                this.logger.info(`Found wasm file at: ${wasmPath}`);
            } catch (e) {
                // フォールバック: 相対パスでの解決
                wasmPath = path.join(__dirname, '../../../../../node_modules/tree-sitter-java/tree-sitter-java.wasm');
                this.logger.info(`Using fallback wasm file at: ${wasmPath}`);
            }

            const language = await Parser.Language.load(wasmPath);
            this.parser = new ParserClass();
            this.parser.setLanguage(language);
            this.isInitialized = true;
            return true;
        } catch (error) {
            this.logger.error(`Failed to initialize web-tree-sitter for Java: ${error}`);
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
            this.logger.error(`Error parsing Java AST for ${uri.fsPath}: ${error}`);
            return [];
        }
    }
    public supports(languageId: string): boolean {
        return languageId === 'java';
    }


    /**
     * ASTノードを再帰的に走査してクラス情報を抽出する
     */
    private visitNode(node: Node, uri: vscode.Uri, classes: ClassInfo[]): void {

        if (node.type === 'class_declaration' || node.type === 'interface_declaration' || node.type === 'record_declaration') {
            classes.push(this.extractClassInfo(node, uri));
        } else if (node.type === 'enum_declaration') {
            classes.push(this.extractEnumInfo(node, uri));
        } else if (node.type === 'struct_declaration') {
            classes.push(this.extractStructInfo(node, uri));
        }

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.visitNode(child, uri, classes);
            }
        }
    }

    private extractClassInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const classInfo: ClassInfo = {
            name: nameNode ? nameNode.text : 'Anonymous',
            kind: this.determineKind(node),
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        // 継承関係の抽出
        const sc = node.childForFieldName('superclass');
        if (sc) {
            sc.descendantsOfType('type_identifier').forEach(t => {
                classInfo.baseClass = t.text;
            });
        }

        // インターフェースの抽出
        node.descendantsOfType('super_interfaces').forEach(superInterfaces => {
            superInterfaces.descendantsOfType('type_list').forEach(typeList => {
                typeList.descendantsOfType('type_identifier').forEach(typeIdentifier => {
                    this.logger.info(`Interface: ${typeIdentifier.text}`);
                    classInfo.interfaces.push(typeIdentifier.text);
                });
            });
        });


        this.extractMembers(node, classInfo);

        return classInfo;
    }

    private extractEnumInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        return {
            name: nameNode ? nameNode.text : 'AnonymousEnum',
            kind: 'enum',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };
    }

    private extractStructInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const classInfo: ClassInfo = {
            name: nameNode ? nameNode.text : 'AnonymousStruct',
            kind: 'struct',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        this.extractMembers(node, classInfo);
        return classInfo;
    }

    private determineKind(node: Node): 'class' | 'abstract' | 'interface' | 'struct' | 'enum' {
        if (node.type === 'interface_declaration') return 'interface';
        if (node.type === 'enum_declaration') return 'enum';
        if (node.type === 'struct_declaration') return 'struct';

        const modifiers = node.children.find(c => c.type === 'modifier_list');
        if (modifiers && modifiers.text.includes('abstract')) {
            return 'abstract';
        }

        return 'class';
    }

    private extractMembers(node: Node, classInfo: ClassInfo): void {
        // Positional Record parameters
        if (node.type === 'record_declaration') {
            const parameters = node.childForFieldName('parameters');
            if (parameters) {
                for (let i = 0; i < parameters.childCount; i++) {
                    const param = parameters.child(i)!;
                    if (param.type === 'parameter') {
                        const typeNode = param.childForFieldName('type');
                        const nameNode = param.childForFieldName('name');
                        if (nameNode) {
                            classInfo.attributes.push({
                                name: nameNode.text,
                                type: typeNode ? typeNode.text : 'object',
                                visibility: 'public', // Record parameters are public by default
                                modifiers: ['readonly'],
                                location: this.convertRange(param)
                            });
                        }
                    }
                }
            }
        }

        const body = node.childForFieldName('body');
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i)!;
                if (member.type === 'method_declaration') {
                    classInfo.operations.push(this.extractOperationInfo(member));
                } else if (member.type === 'field_declaration' || member.type === 'property_declaration') {
                    classInfo.attributes.push(this.extractAttributeInfo(member));
                }
            }
        }
    }

    private extractOperationInfo(node: Node): OperationInfo {
        const nameNode = node.childForFieldName('name');
        const typeNode = node.childForFieldName('type');
        const paramsNode = node.childForFieldName('parameters');

        return {
            name: nameNode ? nameNode.text : 'anonymous',
            returnType: typeNode ? typeNode.text : 'void',
            parameters: this.extractParameters(paramsNode),
            visibility: this.extractVisibility(node),
            modifiers: this.extractModifiers(node),
            location: this.convertRange(node)
        };
    }

    private extractAttributeInfo(member: Node): AttributeInfo {
        let typeNode = member.childForFieldName('type');
        let name = 'anonymous';
        this.logger.info(`Extracting attribute info: ${member.type}`);

        if (member.type === 'field_declaration') {
            const declarator = member.children.find(c => c.type === 'variable_declarator');
            if (declarator) {
                const nameNode = declarator.childForFieldName('name');
                this.logger.info(`Name node: ${nameNode ? nameNode.text : 'null'}`);
                if (nameNode) name = nameNode.text;
            }
        } else if (member.type === 'property_declaration') {
            const nameNode = member.childForFieldName('name');
            this.logger.info(`Name node: ${nameNode ? nameNode.text : 'null'}`);
            if (nameNode) name = nameNode.text;
        }

        return {
            name: name,
            type: typeNode ? typeNode.text : 'var',
            visibility: this.extractVisibility(member),
            modifiers: this.extractModifiers(member),
            location: this.convertRange(member)
        };
    }

    private extractParameters(node: Node | null): ParameterInfo[] {
        if (!node) return [];
        const parameters: ParameterInfo[] = [];
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)!;
            if (child.type === 'parameter') {
                const nameNode = child.childForFieldName('name');
                const typeNode = child.childForFieldName('type');
                parameters.push({
                    name: nameNode ? nameNode.text : 'param',
                    type: typeNode ? typeNode.text : 'object',
                    isOptional: child.children.some(c => c.text === '=')
                });
            }
        }
        return parameters;
    }

    private extractVisibility(node: Node): 'public' | 'protected' | 'private' | 'internal' {
        // Try modifier_list first (backward compatibility)
        const modifiersNode = node.children.find(c => c.type === 'modifier_list');
        if (modifiersNode) {
            const text = modifiersNode.text;
            if (text.includes('public')) return 'public';
            if (text.includes('protected')) return 'protected';
            if (text.includes('internal')) return 'internal';
            if (text.includes('private')) return 'private';
        }

        // Check direct children for 'modifier' nodes
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'modifier') {
                const text = child.text;
                if (text === 'public') return 'public';
                if (text === 'protected') return 'protected';
                if (text === 'internal') return 'internal';
                if (text === 'private') return 'private';
            }
        }

        return 'private';
    }

    private extractModifiers(node: Node): string[] {
        const mods: string[] = [];

        // Try modifier_list first
        const modifiersNode = node.children.find(c => c.type === 'modifier_list');
        if (modifiersNode) {
            for (let i = 0; i < modifiersNode.childCount; i++) {
                const mod = modifiersNode.child(i)!;
                const text = mod.text;
                if (['static', 'readonly', 'abstract', 'override', 'virtual', 'async'].includes(text)) {
                    mods.push(text);
                }
            }
        }

        // Check direct children
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'modifier') {
                const text = child.text;
                if (['static', 'readonly', 'abstract', 'override', 'virtual', 'async'].includes(text)) {
                    mods.push(text);
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
