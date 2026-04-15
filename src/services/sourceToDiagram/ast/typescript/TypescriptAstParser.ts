import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
import { IAstParser } from '../IAstParser';
import { ClassInfo, OperationInfo, AttributeInfo, ParameterInfo } from '../../types';
import { Logger } from '../../../../LoggerComponents/Logger';
import * as cdt from '../../../../../view/lib/class-diagram-types';
import { CommentParser } from '../CommentParser';

type Node = Parser.Node;

/**
 * TypeScriptおよびJavaScript用のASTパーサー
 * web-tree-sitterを使用してASTを構築し、クラス情報を抽出する
 * 
 * @alias "TS用ASTパーサー" as "TypeScriptAstParser"
 */
export class TypeScriptAstParser implements IAstParser {
    /** @needs "ASTを構築し、クラス情報を抽出する" */
    private readonly logger: Logger;
    private readonly extensionUri: vscode.Uri;
    /** @needs "パース済みのツリー構造データを保持するための実体" */
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
    /**
     * @scenario web-tree-sitterおよび言語モジュールを初期化する
     * @given web-tree-sitterおよび言語モジュールが初期化されていないこと
     * @when initParser()を呼び出す
     * @how web-tree-sitterおよび言語モジュールを初期化すること
     * @then web-tree-sitterおよび言語モジュールが初期化されること
     * @why web-tree-sitterおよび言語モジュールが初期化されていないとASTを構築できないため
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

    /**
     * @scenario ASTをパースしてクラス情報を抽出する
     * @given コードの文字列とURIが与えられていること
     * @when tree-sitterでパースを実行する
     * @how "指定された言語でWASMをロードしツリーを生成する"
     * @how "visitNodeを用いてASTを再帰的に走査し、クラスやメソッドを抽出する"
     * @then ClassInfo配列が生成されること
     * @why "クラス図として可視化するための基礎データ構造を作るため"
     */
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

    /**
     * @scenario クラス宣言を抽出する（通常）
     * @given class_declaration ノードが渡されたこと
     * @when extractClassInfo() を呼び出す
     * @then nameと attributes をもつ ClassInfo が返ること
     * @why 通常クラスの構造をグラフィカルに表現するため
     * 
     * @scenario 抽象クラスを抽出する
     * @given abstract 修飾子を持つノードが渡されたこと
     * @when extractClassInfo() を呼び出す
     * @then kind が "abstract" に設定されること
     * 
     * @scenario 継承とインターフェースのマッピング
     * @given extends や implements を持つノードであること
     * @when extractClassInfo() を呼び出す
     * @how "class_heritage を解析して baseClass と interfaces を特定する"
     * @then ClassInfo 内の依存関係が正しく設定されること
     */
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

        const classComment = this.extractPrecedingComments(node);
        if (classComment) {
            const parsedComment = CommentParser.parseClassComments(classComment);
            // 現在の仕様ではClassInfoの段階でaliasを持たせる場所がないため、
            // DSL生成側(DomainModel.toDSL等)が参照できるようにメタデータ等に含めるなどが必要ですが、
            // 取り急ぎ抽出のみ行います。 (alias適用は後続タスクで対応可能)
        }

        return classInfo;
    }

    private extractPrecedingComments(node: Node): string {
        let text = '';
        let prev = node.previousSibling;
        while (prev && prev.type === 'comment') {
            text = prev.text + '\n' + text;
            prev = prev.previousSibling;
        }
        return text;
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

        let workflowAst = bodyNode ? this.extractWorkflow(bodyNode) : undefined;
        const commentText = this.extractPrecedingComments(node);
        const commentWorkflow = CommentParser.parseOperationComments(commentText);

        // @id タグやハッシュをコメントから抽出して再現性を高める
        const idMatch = commentText.match(/@id\s+([^\s\*]+)/);
        const stableId = idMatch ? idMatch[1] : undefined;

        // AI生成用にGherkinタグが含まれる行だけを抽出して軽量化する
        const gherkinLines = commentText.split('\n')
            .filter(line => /@scenario|@given|@when|@how|@then|@why/.test(line))
            .map(line => line.trim().replace(/^\*+/g, '').trim())
            .join('\n');

        // commentText から @given/@when/@then の生テキストを抽出し、
        // 生成AIへのヒントとして利用可能な形で保持する
        return {
            name: nameNode ? nameNode.text : 'anonymous',
            returnType: this.extractTypeName(node.childForFieldName('return_type')),
            parameters: this.extractParameters(node.childForFieldName('parameters')),
            visibility: (accessibility ? accessibility.text : 'public') as any,
            modifiers: this.extractModifiers(node),
            location: this.convertRange(node),
            // コメント側のワークフロー定義（@scenarioなど）があれば AST 実装解析より優先する
            workflow: commentWorkflow || workflowAst,
            // AI生成用の最小限のヒントを保持
            additionalInfo: {
                gherkinRaw: gherkinLines,
                stableId: stableId
            } as any
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
                return { type: 'when', label: 'When: ' + (node.childForFieldName('condition')?.text || '条件') };
            case 'while_statement':
            case 'for_statement':
            case 'for_in_statement':
            case 'for_of_statement':
                return { type: 'loop', label: 'ループ' };
            case 'expression_statement':
                return { type: 'process', label: 'Process: ' + node.text.trim().split('\n')[0] };
            case 'return_statement':
                return { type: 'then', label: 'Then: ' + node.text.trim().split('\n')[0] };
            case 'variable_declaration':
            case 'lexical_declaration':
                return { type: 'process', label: 'Process: ' + node.text.trim().split('\n')[0] };
            default:
                return null;
        }
    }

    private extractAttributeInfo(node: Node): AttributeInfo {
        const nameNode = node.childForFieldName('name');
        const accessibility = node.children.find(c => c.type === 'accessibility_modifier');

        const attributeInfo: AttributeInfo = {
            name: nameNode ? nameNode.text : 'anonymous',
            type: this.extractTypeName(node.childForFieldName('type')),
            visibility: (accessibility ? accessibility.text : 'public') as any,
            modifiers: this.extractModifiers(node),
            location: this.convertRange(node)
        };

        const commentText = this.extractPrecedingComments(node);
        const needs = CommentParser.parseMemberComments(commentText);
        if (needs) {
            // AttributeInfoにneedsが含まれていないためanyキャスト等で保持させるか、
            // interface自体を拡張する形になります。ここではany拡張で保持します。
            (attributeInfo as any).needs = needs;
        }

        return attributeInfo;
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
