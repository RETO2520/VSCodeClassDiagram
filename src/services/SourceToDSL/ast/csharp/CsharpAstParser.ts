import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
type Tree = Parser.Tree;
type Node = Parser.Node;
import { IAstParser } from '../IAstParser';
import { ClassInfo, ClassKind, ClassMember, ClassOperation, OperationParameter, Visibility, createId } from '../../../../../view/lib/class-diagram-types';
import { Logger } from '../../../../LoggerComponents/Logger';

/**
 * C#用のDomain Model ASTパーサー
 * web-tree-sitterを使用してASTを構築し、ドメインモデル仕様のクラス情報を抽出する
 */
export class CsharpAstParser implements IAstParser {
    private readonly logger: Logger;
    private readonly extensionUri: vscode.Uri;
    private parser: any = null;
    private isInitialized = false;

    constructor(logger: Logger, extensionUri: vscode.Uri) {
        this.logger = logger;
        this.extensionUri = extensionUri;
    }

    /**
     * web-tree-sitterおよびC#言語モジュールを初期化する
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

            const wasmUri = vscode.Uri.joinPath(wasmBaseDir, 'tree-sitter-c_sharp.wasm');
            const wasmPath = wasmUri.fsPath;

            this.logger.info(`Loading C# language wasm from: ${wasmPath}`);
            if (!wasmPath) {
                throw new Error("Resolved wasmPath is empty");
            }

            const language = await LanguageClass.load(wasmPath);
            this.parser = new ParserClass();
            this.parser.setLanguage(language);
            this.isInitialized = true;
            return true;
        } catch (error) {
            this.logger.error(`Failed to initialize web-tree-sitter for C#: ${error}`);
            if (error instanceof Error && error.stack) {
                this.logger.error(`Stack trace: ${error.stack}`);
            }
            console.error(error);
            return false;
        }
    }

    public supports(languageId: string): boolean {
        return languageId === 'csharp';
    }

    public async parse(uri: vscode.Uri, content: string): Promise<ClassInfo[]> {
        if (!(await this.initParser()) || !this.parser) return [];

        try {
            const tree = this.parser.parse(content);
            if (!tree) return [];
            const classes: ClassInfo[] = [];
            this.visitNode(tree.rootNode, classes);

            // 内部のID解決 (名前からIDへのマッピング)
            const idMap = new Map<string, string>();
            for (const cls of classes) {
                idMap.set(cls.name, cls.id);
            }

            for (const cls of classes) {
                if (cls.baseClassId) {
                    cls.baseClassId = idMap.get(cls.baseClassId) || cls.baseClassId;
                }
                cls.interfaces = cls.interfaces.map((i: string) => idMap.get(i) || i);
            }

            return classes;
        } catch (error) {
            this.logger.error(`Error parsing C# AST for ${uri.fsPath}: ${error}`);
            return [];
        }
    }

    /**
     * ASTノードを再帰的に走査してクラス情報を抽出する
     */
    private visitNode(node: Node, classes: ClassInfo[]): void {
        if (node.type === 'class_declaration' || node.type === 'interface_declaration' || node.type === 'record_declaration') {
            classes.push(this.extractClassInfo(node));
        } else if (node.type === 'enum_declaration') {
            classes.push(this.extractEnumInfo(node));
        } else if (node.type === 'struct_declaration') {
            classes.push(this.extractStructInfo(node));
        }

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.visitNode(child, classes);
            }
        }
    }

    private extractClassInfo(node: Node): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const kind = this.determineKind(node);
        const isAbstract = this.extractModifiers(node).includes('abstract');

        const classInfo: ClassInfo = {
            id: createId(),
            name: nameNode ? nameNode.text : 'Anonymous',
            kind: kind,
            isAbstract: isAbstract,
            interfaces: [],
            baseClassId: null,
            members: [],
            operations: [],
            x: 0,
            y: 0,
            componentIds: [],
        };

        // 継承関係の抽出
        let baseList = node.childForFieldName('base_list');
        if (!baseList) {
            baseList = node.children.find(c => c.type === 'base_list') || null;
        }

        if (baseList) {
            const types = baseList.children.filter(c =>
                c.type === 'identifier' ||
                c.type === 'type_identifier' ||
                c.type === 'qualified_name' ||
                c.type === 'generic_name'
            );
            if (types.length > 0) {
                classInfo.baseClassId = types[0].text;
                classInfo.interfaces = types.slice(1).map(t => t.text);
            }
        }

        this.extractMembers(node, classInfo);

        return classInfo;
    }

    private extractEnumInfo(node: Node): ClassInfo {
        const nameNode = node.childForFieldName('name');
        return {
            id: createId(),
            name: nameNode ? nameNode.text : 'AnonymousEnum',
            kind: 'class',
            isAbstract: false,
            interfaces: [],
            baseClassId: null,
            members: [],
            operations: [],
            x: 0,
            y: 0,
            componentIds: [],
        };
    }

    private extractStructInfo(node: Node): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const classInfo: ClassInfo = {
            id: createId(),
            name: nameNode ? nameNode.text : 'AnonymousStruct',
            kind: 'struct',
            isAbstract: false,
            interfaces: [],
            baseClassId: null,
            members: [],
            operations: [],
            x: 0,
            y: 0,
            componentIds: [],
        };

        this.extractMembers(node, classInfo);
        return classInfo;
    }

    private determineKind(node: Node): ClassKind {
        if (node.type === 'interface_declaration') return 'interface';
        if (node.type === 'struct_declaration') return 'struct';
        return 'class';
    }

    private extractMembers(node: Node, classInfo: ClassInfo): void {
        // Positional Record parameters
        if (node.type === 'record_declaration') {
            const parameters = node.childForFieldName('parameters');
            if (parameters) {
                for (let i: number = 0; i < parameters.childCount; i++) {
                    const param = parameters.child(i)!;
                    if (param.type === 'parameter') {
                        const typeNode = param.childForFieldName('type');
                        const nameNode = param.childForFieldName('name');
                        if (nameNode) {
                            classInfo.members.push({
                                id: createId(),
                                name: nameNode.text,
                                type: typeNode ? typeNode.text : 'object',
                                visibility: 'public',
                                isStatic: false,
                                isAbstract: false,
                                relationship: 'auto',
                                sourceMultiplicity: '1',
                                targetMultiplicity: '1'
                            });
                        }
                    }
                }
            }
        }

        const body = node.childForFieldName('body');
        if (body) {
            for (let i: number = 0; i < body.childCount; i++) {
                const member = body.child(i)!;
                if (member.type === 'method_declaration') {
                    classInfo.operations.push(this.extractOperationInfo(member));
                } else if (member.type === 'field_declaration' || member.type === 'property_declaration') {
                    classInfo.members.push(this.extractAttributeInfo(member));
                }
            }
        }
    }

    private extractOperationInfo(node: Node): ClassOperation {
        const nameNode = node.childForFieldName('name');
        const typeNode = node.childForFieldName('type');
        const paramsNode = node.childForFieldName('parameters');
        const modifiers = this.extractModifiers(node);

        return {
            id: createId(),
            name: nameNode ? nameNode.text : 'anonymous',
            returnType: typeNode ? typeNode.text : 'void',
            parameters: this.extractParameters(paramsNode),
            visibility: this.extractVisibility(node),
            isStatic: modifiers.includes('static'),
            isAbstract: modifiers.includes('abstract')
        };
    }

    private extractAttributeInfo(member: Node): ClassMember {
        let typeNode = member.childForFieldName('type');
        let name = 'anonymous';

        if (member.type === 'field_declaration') {
            const variableDeclaration = member.children.find(c => c.type === 'variable_declaration');
            if (variableDeclaration) {
                if (!typeNode) {
                    typeNode = variableDeclaration.childForFieldName('type');
                }

                const declarator = variableDeclaration.children.find(c => c.type === 'variable_declarator');
                if (declarator) {
                    const nameNode = declarator.childForFieldName('name');
                    if (nameNode) name = nameNode.text;
                }
            }
        } else if (member.type === 'property_declaration') {
            const nameNode = member.childForFieldName('name');
            if (nameNode) name = nameNode.text;
        }

        const modifiers = this.extractModifiers(member);

        return {
            id: createId(),
            name: name,
            type: typeNode ? typeNode.text : 'var',
            visibility: this.extractVisibility(member),
            isStatic: modifiers.includes('static'),
            isAbstract: modifiers.includes('abstract'),
            relationship: 'auto',
            sourceMultiplicity: '1',
            targetMultiplicity: '1'
        };
    }

    private extractParameters(node: Node | null): OperationParameter[] {
        if (!node) return [];
        const parameters: OperationParameter[] = [];
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)!;
            if (child.type === 'parameter') {
                const nameNode = child.childForFieldName('name');
                const typeNode = child.childForFieldName('type');
                parameters.push({
                    id: createId(),
                    name: nameNode ? nameNode.text : 'param',
                    type: typeNode ? typeNode.text : 'object'
                });
            }
        }
        return parameters;
    }

    private extractVisibility(node: Node): Visibility {
        let vis = 'private'; // default

        // Try modifier_list first
        const modifiersNode = node.children.find(c => c.type === 'modifier_list');
        if (modifiersNode) {
            const text = modifiersNode.text;
            if (text.includes('public')) vis = 'public';
            else if (text.includes('protected')) vis = 'protected';
            else if (text.includes('internal')) vis = 'package';
            else if (text.includes('private')) vis = 'private';
        } else {
            // Check direct children
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child && child.type === 'modifier') {
                    const text = child.text;
                    if (text === 'public') vis = 'public';
                    else if (text === 'protected') vis = 'protected';
                    else if (text === 'internal') vis = 'package';
                    else if (text === 'private') vis = 'private';
                }
            }
        }

        return vis as Visibility;
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
}
