import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
import { IAstParser } from '../IAstParser';
import { ClassInfo, OperationInfo, AttributeInfo, ParameterInfo } from '../../types';
import { Logger } from '../../../../LoggerComponents/Logger';
import * as cdt from '../../../../../view/lib/class-diagram-types';

type Node = Parser.Node;

/**
 * TypeScriptおよびJavaScript用のASTパーサー
 * web-tree-sitterを使用してASTを構築し、クラス情報を抽出する
 */
export class TypeScriptAstParser implements IAstParser {
    private readonly logger: Logger;
    private readonly extensionUri: vscode.Uri;
    private parser: any = null;
    private tsLanguage: any = null;
    private jsLanguage: any = null;
    private isInitialized = false;

    constructor(logger: Logger, extensionUri: vscode.Uri) {
        this.logger = logger;
        this.extensionUri = extensionUri;
    }

    /**
     * web-tree-sitterおよび言語モジュールを初期化する
     */
    private async initParser(languageId: string): Promise<boolean> {
        if (this.isInitialized && this.parser) {
            this.updateLanguage(languageId);
            return true;
        }

        try {
            const ParserClass = (Parser as any).Parser;
            const LanguageClass = (Parser as any).Language;

            const wasmBaseDir = vscode.Uri.joinPath(this.extensionUri, 'out');

            await ParserClass.init({
                locateFile: (file: string) => {
                    if (file === 'web-tree-sitter.wasm') {
                        return vscode.Uri.joinPath(wasmBaseDir, 'web-tree-sitter.wasm').fsPath;
                    }
                    return file;
                }
            });

            const tsWasmPath = vscode.Uri.joinPath(wasmBaseDir, 'tree-sitter-typescript.wasm').fsPath;
            const jsxWasmPath = vscode.Uri.joinPath(wasmBaseDir, 'tree-sitter-javascript.wasm').fsPath;

            this.tsLanguage = await LanguageClass.load(tsWasmPath);
            this.jsLanguage = await LanguageClass.load(jsxWasmPath);

            this.parser = new ParserClass();
            this.updateLanguage(languageId);

            this.isInitialized = true;
            return true;
        } catch (error) {
            this.logger.error(`Failed to initialize web-tree-sitter for TypeScript: ${error}`);
            return false;
        }
    }

    private updateLanguage(languageId: string): void {
        if (!this.parser) return;
        const isJs = languageId === 'javascript' || languageId === 'javascriptreact';
        this.parser.setLanguage(isJs ? this.jsLanguage : this.tsLanguage);
    }

    public supports(languageId: string): boolean {
        return languageId === 'typescript' || languageId === 'javascript' ||
            languageId === 'typescriptreact' || languageId === 'javascriptreact';
    }

    public async parse(uri: vscode.Uri, content: string): Promise<ClassInfo[]> {
        const languageId = await this.detectLanguageId(uri);
        if (!(await this.initParser(languageId)) || !this.parser) return [];

        try {
            const tree = this.parser.parse(content);
            if (!tree) return [];

            const classes: ClassInfo[] = [];
            this.visitNode(tree.rootNode, uri, classes);
            return classes;
        } catch (error) {
            this.logger.error(`Error parsing TypeScript AST for ${uri.fsPath}: ${error}`);
            return [];
        }
    }

    private async detectLanguageId(uri: vscode.Uri): Promise<string> {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            return doc.languageId;
        } catch {
            return uri.fsPath.endsWith('tsx') ? 'typescriptreact' : 'typescript';
        }
    }

    private visitNode(node: Node, uri: vscode.Uri, classes: ClassInfo[]): void {
        if (!node) return;

        if (node.type === 'class_declaration' || node.type === 'class_expression' || node.type === 'enum_declaration') {
            classes.push(this.extractClassInfo(node, uri));
        } else if (node.type === 'interface_declaration') {
            classes.push(this.extractInterfaceInfo(node, uri));
        }

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) this.visitNode(child, uri, classes);
        }
    }

    private extractClassInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const isAbstract = node.children.some(c => c.text === 'abstract');

        const classInfo: ClassInfo = {
            name: nameNode ? nameNode.text : 'AnonymousClass',
            kind: isAbstract ? 'abstract' : 'class',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        const heritage = node.children.find(c => c.type === 'class_heritage');
        if (heritage) {
            const extendsClause = heritage.children.find(c => c.type === 'extends_clause');
            if (extendsClause) {
                const baseType = extendsClause.children.find(c => c.type === 'type_identifier' || c.type === 'identifier');
                if (baseType) classInfo.baseClass = baseType.text;
            }

            const implementsClause = heritage.children.find(c => c.type === 'implements_clause');
            if (implementsClause) {
                classInfo.interfaces = implementsClause.children
                    .filter(c => c.type === 'type_identifier' || c.type === 'identifier')
                    .map(c => c.text);
            }
        }

        const body = node.childForFieldName('body');
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i);
                if (member && (member.type === 'method_definition' || member.type === 'public_field_definition')) {
                    this.extractMemberInfo(member, classInfo);
                }
            }
        }

        return classInfo;
    }

    private extractInterfaceInfo(node: Node, uri: vscode.Uri): ClassInfo {
        const nameNode = node.childForFieldName('name');
        const classInfo: ClassInfo = {
            name: nameNode ? nameNode.text : 'UnknownInterface',
            kind: 'interface',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node)
            },
            attributes: [],
            operations: []
        };

        const body = node.childForFieldName('body');
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const member = body.child(i);
                if (!member) continue;
                if (member.type === 'property_signature') {
                    classInfo.attributes.push(this.extractAttributeInfo(member));
                } else if (member.type === 'method_signature') {
                    classInfo.operations.push(this.extractOperationInfo(member));
                }
            }
        }

        return classInfo;
    }

    private extractMemberInfo(node: Node, classInfo: ClassInfo): void {
        if (node.type === 'method_definition') {
            classInfo.operations.push(this.extractOperationInfo(node));
        } else if (node.type === 'public_field_definition') {
            classInfo.attributes.push(this.extractAttributeInfo(node));
        }
    }

    private extractOperationInfo(node: Node): OperationInfo {
        const nameNode = node.childForFieldName('name');
        const accessibility = node.children.find(c => c.type === 'accessibility_modifier');
        const bodyNode = node.childForFieldName('body');
        this.logger.debug(`Extracting operation: ${nameNode ? nameNode.text : 'anonymous'} with accessibility: ${accessibility ? accessibility.text : 'public'}`);
        this.logger.debug(`Operation body: ${bodyNode ? bodyNode.text : 'No body'}`);
        return {
            name: nameNode ? nameNode.text : 'anonymous',
            returnType: this.extractTypeName(node.childForFieldName('return_type')),
            parameters: this.extractParameters(node.childForFieldName('parameters')),
            visibility: (accessibility ? accessibility.text : 'public') as any,
            modifiers: this.extractModifiers(node),
            location: this.convertRange(node),
            // @ts-ignore: OperationInfo に workflow プロパティを追加することを想定
            workflow: bodyNode ? this.extractWorkflow(bodyNode) : undefined
        };
    }

    /**
     * メソッド本体のASTからワークフロー情報を抽出する
     */
    private extractWorkflow(bodyNode: Node): { nodes: any[], edges: any[] } | undefined {
        if (!bodyNode || bodyNode.childCount === 0) return undefined;

        const nodes: any[] = [];
        const edges: any[] = [];

        // 1. Startノード
        const startId = cdt.createId();
        nodes.push({ id: startId, type: 'start', label: 'Start', x: 200, y: 50 });

        let currentY = 150;
        let lastNodeId = startId;

        // 2. ステートメントを解析してノード化
        for (let i = 0; i < bodyNode.childCount; i++) {
            const child = bodyNode.child(i);
            if (!child || child.type === '{' || child.type === '}') continue;

            const wfNodeData = this.mapStatementToWorkflowNode(child);
            if (wfNodeData) {
                const nodeId = cdt.createId();
                nodes.push({
                    id: nodeId,
                    type: wfNodeData.type,
                    label: wfNodeData.label,
                    x: 200,
                    y: currentY
                });
                edges.push({
                    from: lastNodeId,
                    to: nodeId
                });
                lastNodeId = nodeId;
                currentY += 100;
            }
        }

        // 3. Endノード
        const endId = cdt.createId();
        nodes.push({ id: endId, type: 'end', label: 'End', x: 200, y: currentY });
        edges.push({ from: lastNodeId, to: endId });

        return { nodes, edges };
    }

    private mapStatementToWorkflowNode(node: Node): { type: string, label: string } | null {
        switch (node.type) {
            case 'if_statement':
                return { type: 'when', label: 'もし: ' + (node.childForFieldName('condition')?.text || '条件') };
            case 'while_statement':
            case 'for_statement':
            case 'for_in_statement':
            case 'for_of_statement':
                return { type: 'loop', label: 'ループ' };
            case 'expression_statement':
                return { type: 'process', label: '処理: ' + node.text.trim().split('\n')[0] };
            case 'return_statement':
                return { type: 'then', label: 'ならば: (戻す) ' + node.text.trim().split('\n')[0] };
            case 'variable_declaration':
            case 'lexical_declaration':
                return { type: 'process', label: '宣言: ' + node.text.trim().split('\n')[0] };
            default:
                return null;
        }
    }

    private extractAttributeInfo(node: Node): AttributeInfo {
        const nameNode = node.childForFieldName('name');
        const accessibility = node.children.find(c => c.type === 'accessibility_modifier');

        return {
            name: nameNode ? nameNode.text : 'anonymous',
            type: this.extractTypeName(node.childForFieldName('type')),
            visibility: (accessibility ? accessibility.text : 'public') as any,
            modifiers: this.extractModifiers(node),
            location: this.convertRange(node)
        };
    }

    private extractParameters(node: Node | null): ParameterInfo[] {
        if (!node) return [];
        const params: ParameterInfo[] = [];
        for (let i = 0; i < node.childCount; i++) {
            const p = node.child(i);
            if (p && (p.type === 'required_parameter' || p.type === 'optional_parameter')) {
                const nameNode = p.childForFieldName('pattern');
                params.push({
                    name: nameNode ? nameNode.text : 'param',
                    type: this.extractTypeName(p.childForFieldName('type')),
                    isOptional: p.type === 'optional_parameter'
                });
            }
        }
        return params;
    }

    private extractTypeName(node: Node | null): string {
        if (!node) return 'any';
        return node.text.replace(/^:/, '').trim();
    }

    private extractModifiers(node: Node): string[] {
        const mods: string[] = [];
        if (node.children.some(c => c.text === 'static')) mods.push('static');
        if (node.children.some(c => c.text === 'readonly')) mods.push('readonly');
        if (node.children.some(c => c.text === 'abstract')) mods.push('abstract');
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
