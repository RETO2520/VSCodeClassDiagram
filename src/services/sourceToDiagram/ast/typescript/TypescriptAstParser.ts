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
     * メソッド本体のASTからワークフロー情報を抽出する。
     *
     * 改善点:
     *   1. 先頭の変数宣言群を「Given: 初期変数を準備する」に集約してノード数を削減
     *   2. 末尾の return 文を「Then: xxx を返す」に集約
     *   3. 中間のステートメントは意図ベースで And: / When: / But: に変換
     *   4. 全ステートメントがスキップされた場合は undefined を返す（空ワークフローを防ぐ）
     */
    private extractWorkflow(bodyNode: Node): { nodes: any[], edges: any[] } | undefined {
        if (!bodyNode || bodyNode.childCount === 0) return undefined;

        // ボディのステートメント一覧（括弧・空白を除外）
        const stmts: Node[] = [];
        for (let i = 0; i < bodyNode.childCount; i++) {
            const child = bodyNode.child(i);
            if (!child || child.type === '{' || child.type === '}') continue;
            stmts.push(child);
        }
        if (stmts.length === 0) return undefined;

        // ── 先頭の変数宣言群を Given ブロックとして集約 ──────────────
        let givenEnd = 0;
        while (
            givenEnd < stmts.length &&
            (stmts[givenEnd].type === 'lexical_declaration' ||
                stmts[givenEnd].type === 'variable_declaration')
        ) {
            givenEnd++;
        }

        // ── 末尾の return 文を特定 ─────────────────────────────────
        const lastStmt = stmts[stmts.length - 1];
        const hasReturn = lastStmt?.type === 'return_statement';
        const middleStmts = stmts.slice(givenEnd, hasReturn ? stmts.length - 1 : stmts.length);

        // ── 有意なノードが1つも生成されないメソッドは省略 ──────────
        const hasGiven = givenEnd > 0;
        const middleNodes = middleStmts
            .map(s => this.mapStatementToWorkflowNode(s))
            .filter(Boolean);
        if (!hasGiven && !hasReturn && middleNodes.length === 0) return undefined;

        // ── ノード・エッジ構築 ──────────────────────────────────────
        const nodes: any[] = [];
        const edges: any[] = [];

        const startId = cdt.createId();
        nodes.push({ id: startId, type: 'start', label: '開始', x: 200, y: 50 });
        let currentY = 150;
        let lastNodeId = startId;

        const push = (type: string, label: string) => {
            const id = cdt.createId();
            nodes.push({ id, type, label, x: 200, y: currentY });
            edges.push({ from: lastNodeId, to: id, condition: lastNodeId === startId ? '振る舞い' : undefined });
            lastNodeId = id;
            currentY += 100;
        };

        // Given 集約ブロック
        if (hasGiven) {
            // 宣言している変数名を最大3つ収集してラベルに含める
            const varNames = stmts.slice(0, givenEnd).flatMap(s => {
                const names: string[] = [];
                for (let i = 0; i < s.childCount; i++) {
                    const c = s.child(i);
                    if (c?.type === 'variable_declarator') {
                        const n = c.childForFieldName('name');
                        if (n) names.push(n.text);
                    }
                }
                return names;
            }).slice(0, 3);

            const label = varNames.length > 0
                ? `Given: ${varNames.join(', ')} を初期化する`
                : 'Given: 変数を初期化する';
            push('given', label);
        }

        // 中間ステートメント
        for (const mapped of middleNodes) {
            if (mapped) push(mapped.type, mapped.label);
        }

        // Then: return
        if (hasReturn) {
            const retExpr = lastStmt.children.find(c => c.type !== 'return' && c.type !== ';');
            const summary = retExpr ? this.summarizeReturnExpr(retExpr) : '結果';
            push('then', `Then: ${summary}を返す`);
        }

        // Endノード
        const endId = cdt.createId();
        nodes.push({ id: endId, type: 'end', label: '終了', x: 200, y: currentY });
        edges.push({ from: lastNodeId, to: endId });

        return { nodes, edges };
    }

    /**
     * ASTステートメントノードをワークフローノードの「意図記述」にマッピングする。
     *
     * 設計方針:
     *   - コードの「HOW（実装詳細）」ではなく「WHAT（意図・目的）」を出力する
     *   - 変数宣言は原則スキップ（Given集約ブロックで別途扱う）
     *   - ループは「何を繰り返すか」をASTから読み取って記述する
     *   - ガード節（early return / throw）は But: として表現する
     *   - return は Then: として表現する
     *   - 副作用のある式文（メソッド呼び出し・代入）のみ And: として出力する
     */
    private mapStatementToWorkflowNode(node: Node): { type: string, label: string } | null {
        switch (node.type) {

            // ── 条件分岐 ──────────────────────────────────────────────
            case 'if_statement': {
                const condText = node.childForFieldName('condition')?.text ?? '';
                const consequence = node.childForFieldName('consequence');

                // ガード節判定: 本体が return / throw / break のみで構成されている
                const isGuard = consequence ? this.isGuardBody(consequence) : false;

                if (isGuard) {
                    // ガード節 → But: （前提を満たさない場合のアーリーリターン）
                    const reason = this.summarizeCondition(condText);
                    return { type: 'process', label: `But: ${reason}の場合は早期終了` };
                } else {
                    // 通常の分岐 → When:
                    const summary = this.summarizeCondition(condText);
                    return { type: 'when', label: `When: ${summary}` };
                }
            }

            // ── ループ ────────────────────────────────────────────────
            case 'while_statement': {
                const cond = node.childForFieldName('condition')?.text ?? '';
                const summary = this.summarizeCondition(cond);
                return { type: 'loop', label: `And: ${summary}の間、繰り返す` };
            }
            case 'for_statement': {
                // 初期化から繰り返し対象を推測する
                const init = node.childForFieldName('initializer')?.text ?? '';
                const target = this.extractLoopTarget(init);
                return { type: 'loop', label: `And: ${target}をカウントアップしながら繰り返す` };
            }
            case 'for_in_statement':
            case 'for_of_statement': {
                // for (x of collection) → "collection を走査する"
                const right = node.childForFieldName('right')?.text
                    ?? node.child(node.childCount - 2)?.text
                    ?? '';
                const left = node.childForFieldName('left')?.text
                    ?? node.child(1)?.text
                    ?? '';
                const collection = this.summarizeIdentifier(right);
                const item = this.summarizeIdentifier(left.replace(/^(const|let|var)\s+/, ''));
                return { type: 'loop', label: `And: ${collection}の各${item}を処理する` };
            }

            // ── return 文 ─────────────────────────────────────────────
            case 'return_statement': {
                const retExpr = node.children.find(c =>
                    c.type !== 'return' && c.type !== ';'
                );
                if (!retExpr) {
                    return { type: 'then', label: 'Then: 処理を終了する' };
                }
                const summary = this.summarizeReturnExpr(retExpr);
                return { type: 'then', label: `Then: ${summary}を返す` };
            }

            // ── throw 文 ─────────────────────────────────────────────
            case 'throw_statement': {
                const errExpr = node.children.find(c => c.type !== 'throw' && c.type !== ';');
                const errText = errExpr ? this.summarizeIdentifier(errExpr.text) : 'エラー';
                return { type: 'process', label: `But: ${errText}をスローする` };
            }

            // ── 式文（副作用のある呼び出し・代入）────────────────────
            case 'expression_statement': {
                const exprNode = node.firstChild;
                if (!exprNode) return null;

                // 代入式
                if (exprNode.type === 'assignment_expression') {
                    const left = exprNode.childForFieldName('left')?.text ?? '';
                    const right = exprNode.childForFieldName('right')?.text ?? '';
                    const leftSummary = this.summarizeIdentifier(left);
                    const rightSummary = this.summarizeIdentifier(right);
                    return { type: 'process', label: `And: ${leftSummary}に${rightSummary}を設定する` };
                }

                // 呼び出し式（メソッド呼び出し）
                if (exprNode.type === 'call_expression' || exprNode.type === 'await_expression') {
                    const callNode = exprNode.type === 'await_expression'
                        ? exprNode.firstChild
                        : exprNode;
                    if (!callNode) return null;
                    const funcNode = callNode.childForFieldName?.('function') ?? callNode.firstChild;
                    const funcName = funcNode?.text ?? '';
                    const summary = this.summarizeCallExpression(funcName);
                    return { type: 'process', label: `And: ${summary}` };
                }

                // その他の式（インクリメント等）はスキップ
                return null;
            }

            // ── 変数宣言はスキップ（Given集約ブロックで扱う）────────
            case 'variable_declaration':
            case 'lexical_declaration':
                return null;

            default:
                return null;
        }
    }

    /**
     * ブロック本体がガード節（early return / throw のみ）か判定する。
     */
    private isGuardBody(node: Node): boolean {
        const stmts = node.children.filter(c => c.type !== '{' && c.type !== '}' && c.type.trim() !== '');
        if (stmts.length === 0) return false;
        return stmts.every(s =>
            s.type === 'return_statement' ||
            s.type === 'throw_statement' ||
            s.type === 'break_statement' ||
            s.type === 'continue_statement'
        );
    }

    /**
     * 条件式テキストを「何を確認しているか」の自然文に変換する。
     * 例: "!m" → "mが未設定", "classes.length === 0" → "classesが空"
     */
    private summarizeCondition(raw: string): string {
        const t = raw.trim();

        // 否定パターン: !x, !x.y
        const notMatch = t.match(/^!([\w.]+)$/);
        if (notMatch) {
            return `${this.summarizeIdentifier(notMatch[1])}が未設定`;
        }

        // length === 0 / length < 1
        const emptyMatch = t.match(/([\w.]+)\.length\s*(?:===?\s*0|<\s*1)/);
        if (emptyMatch) {
            return `${this.summarizeIdentifier(emptyMatch[1])}が空`;
        }

        // null/undefined チェック: x === null, x == null, x === undefined
        const nullMatch = t.match(/([\w.]+)\s*(?:===?|!==?)\s*(?:null|undefined)/);
        if (nullMatch) {
            return `${this.summarizeIdentifier(nullMatch[1])}がnull`;
        }

        // 正規表現マッチ: x.match(...)  / regex.test(x)
        const matchExpr = t.match(/([\w.]+)\.match\(/);
        if (matchExpr) {
            return `${this.summarizeIdentifier(matchExpr[1])}がパターンに一致`;
        }

        // 識別子だけ（真偽値チェック）
        const identOnly = t.match(/^([\w.]+)$/);
        if (identOnly) {
            return `${this.summarizeIdentifier(identOnly[1])}が有効`;
        }

        // その他: 長すぎる場合は左辺のみ抽出
        const lhsMatch = t.match(/^([\w.]+)\s*[=!<>]/);
        if (lhsMatch) {
            return this.summarizeIdentifier(lhsMatch[1]);
        }

        // フォールバック: 先頭40文字
        return t.length > 40 ? t.slice(0, 40) + '…' : t;
    }

    /**
     * for文の初期化節からループ対象を推測する。
     * 例: "let i = 0" → "i"
     */
    private extractLoopTarget(init: string): string {
        const m = init.match(/(?:let|const|var)\s+(\w+)/);
        return m ? m[1] : 'インデックス';
    }

    /**
     * 識別子名を「LLMにとって読みやすい」形に整形する。
     * - キャメルケース/スネークケースを分解して日本語向けに読みやすくする
     * - this.xxx → xxx
     * - 長すぎる式は省略する
     */
    private summarizeIdentifier(raw: string): string {
        if (!raw) return '値';
        let t = raw.trim();

        // this. を除去
        t = t.replace(/^this\./, '');

        // メソッド呼び出し括弧以降を除去
        t = t.replace(/\([^)]*\).*$/, '');

        // 配列アクセス省略
        t = t.replace(/\[.*\]/, '');

        // プロパティチェーンは末尾2段まで
        const parts = t.split('.');
        t = parts.slice(-2).join('.');

        // 長すぎる場合は先頭30文字
        if (t.length > 30) t = t.slice(0, 30) + '…';

        return t;
    }

    /**
     * return式を「何を返しているか」の要約に変換する。
     * 例: "{ classes, relations }" → "classes, relations"
     *     "new Map(this.aliases)" → "Map(aliases)"
     */
    private summarizeReturnExpr(node: Node): string {
        const raw = node.text.trim();

        // オブジェクトリテラル: { a, b, c } → "a, b, c"
        const objMatch = raw.match(/^\{([^}]+)\}$/);
        if (objMatch) {
            return objMatch[1].split(',').map(s => s.trim()).slice(0, 3).join(', ');
        }

        // new XxxClass(...) → "XxxClass"
        const newMatch = raw.match(/^new\s+([\w<>]+)/);
        if (newMatch) {
            return newMatch[1];
        }

        // 配列リテラル
        if (raw.startsWith('[')) {
            return '配列';
        }

        // null / undefined
        if (raw === 'null' || raw === 'undefined') {
            return 'null';
        }

        return this.summarizeIdentifier(raw);
    }

    /**
     * 呼び出し式の関数名から「何をしているか」の要約に変換する。
     * 例: "service.applyAddType" → "applyAddType を呼び出す"
     *     "this.parseGherkinToWorkflow" → "parseGherkinToWorkflow を呼び出す"
     */
    private summarizeCallExpression(funcName: string): string {
        const cleaned = funcName.replace(/^this\./, '');
        const parts = cleaned.split('.');
        const method = parts[parts.length - 1];
        const receiver = parts.length > 1 ? parts[parts.length - 2] : '';
        if (receiver) {
            return `${this.summarizeIdentifier(receiver)} の ${method} を呼び出す`;
        }
        return `${method} を呼び出す`;
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
