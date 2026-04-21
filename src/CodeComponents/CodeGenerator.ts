import console = require('node:console');
import * as vscode from 'vscode';
import { Logger } from '../LoggerComponents/Logger';
interface ILanguageTypeModel {
    csharp: string;
    typescript: string;
    java: string;
    cpp: string;
    rust: string;
}

export interface IObjectModel {
    classes: IClassModel[];
}

export interface IClassModel {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    baseClass: string;
    baseClassId: string;
    interfaces: string[];
    isAbstract: boolean;
    isInterface: boolean;
    isStruct?: boolean;
    attributes: IAttributeModel[];
    operations: IOperationModel[];
}
export interface IAttributeModel {
    name: string;
    type: string;
    visibility: string;
    modifier: string;
}
export interface IOperationModel {
    name: string;
    returnType: string;
    visibility: string;
    modifier: string;
    parameters: IParameterModel[];
    workflow?: IWorkflowModel;
    workflowAst?: WorkflowAst; // 新しく追加
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
        //classAttributes?: AttributeInfo[];
        /** メソッドが属するクラスの操作（メソッド）の配列 */
        //classOperations?: OperationInfo[];
        /** メソッドのシグネチャに含まれるジェネリック型パラメータの配列（例: ['T', 'U']） */
        methodGenericParameters?: string[];
        /** メソッドのシグネチャに含まれるジェネリック型パラメータの制約情報（例: { T: 'where T : class', U: 'where U : struct' }） */
        methodGenericParameterConstraints?: { [param: string]: string };
        /** メソッドのシグネチャに含まれるジェネリック型パラメータのデフォルト値の情報（例: { T: 'string', U: 'int' }） */
        methodDefaultValues?: { [param: string]: string };
        /** Gherkin形式の生データ */
        gherkinRaw?: string;
    }; // AI生成用のメタデータ
}

export interface IWorkflowModel {
    nodes: IWorkflowNode[];
    edges: IWorkflowEdge[];
}

export interface IWorkflowNode {
    id: string;
    // start, end, process, decision, loop, call
    type: string;
    label: string;
    x: number;
    y: number;
}

export interface IWorkflowEdge {
    from: string;
    to: string;
    /** シナリオ名 (startノードからのエッジに付く) */
    condition?: string | null;
    /** src: アノテーションによるトレーサビリティ参照 */
    srcs?: { label: string; url: string }[];
}

/**
 * 言語中立なワークフロー抽象構文木 (AST)
 */
export interface WorkflowAst {
    variables: IVariableModel[];
    body: WfAstNode[];
}

export interface IVariableModel {
    name: string;
    type: string;
    initialValue?: string;
}

export type WfAstNode =
    | IActionNode
    | IIfNode
    | IWhileNode
    | IReturnNode
    | ISequenceNode;

export interface IActionNode {
    type: 'action';
    statement: string; // 例: "count = count + 1"
    /** アクションの種類 (comment: コメント, code: 生コード, instruction: 実装指示) */
    kind?: 'comment' | 'code' | 'instruction';
}

export interface IIfNode {
    type: 'if';
    condition: string;
    then: WfAstNode[];
    else?: WfAstNode[];
}

export interface IWhileNode {
    type: 'while';
    condition: string;
    body: WfAstNode[];
}

export interface IReturnNode {
    type: 'return';
    value?: string;
}

export interface ISequenceNode {
    type: 'sequence';
    nodes: WfAstNode[];
}


export interface IParameterModel {
    name: string;
    type: string;
}

export interface ITypeModel {
    name: string;
    initial: string;
}

interface IPrimitiveTypeMap {
    [key: string]: ILanguageTypeModel;
}

export interface IGeneratorBuilder {
    Build(outputFolder: vscode.Uri): Promise<void>;
    generateImports(cls: IClassModel): string[];
    generateClassDeclaration(cls: IClassModel): string;
    generateAttributes(cls: IClassModel): string[];
    generateConstructor(cls: IClassModel): string[];
    generateOperations(cls: IClassModel): string[];
    generateWorkflow(ast: WorkflowAst): string[];
    getClassClosing(): string;
    getFileName(cls: IClassModel): string;
    getFileExtension(): string;
    generateTestFiles?(cls: IClassModel): IGeneratedFile[];
}

export interface IGeneratedFile {
    relativePath: string;
    content: string;
}

export function pascalCase(s: string) {
    if (!s) return 'Unnamed';
    return s.split(/[_\s-]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
export function camelCase(s: string) {
    if (!s) return 'unnamed';
    const parts = s.split(/[_\s-]+/).filter(p => p.length > 0).map(p => p.charAt(0).toUpperCase() + p.slice(1));
    if (parts.length === 0) return 'unnamed';
    const pascal = parts.join('');
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
export function snakeCase(s: string) {
    if (!s) return 'unnamed';
    // 非英数字をアンダースコアに置換し、先頭末尾のアンダースコアを削除、複数連続を1つにまとめて小文字化
    const out = s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_').toLowerCase();
    return out.length > 0 ? out : 'unnamed';
}
export function safeIdentifier(s: string) {
    if (!s) return 'Unnamed';
    let out = s.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!/^[a-zA-Z_]/.test(out)) out = '_' + out;
    return out;
}
export function typeName(t: string) {
    if (!t) return 'object';
    // primitive mapping quick
    const map: any = { 'int': 'int', 'string': 'string', 'bool': 'bool', 'void': 'void', 'double': 'double', 'float': 'float' };
    return map[t] || t;
}
export function shouldEmitModifier(mod: string) {
    if (!mod) return false;
    const v = mod.toLowerCase();
    return !(v === 'none' || v === 'aggregation' || v === 'composition');
}

// 共通ヘルパ：モデルから名→クラスマップ作成
export function buildClassMaps(model: IObjectModel) {
    const nameToClass: Record<string, IClassModel> = {};
    const idToClass: Record<string, IClassModel> = {};
    if (!model || !Array.isArray(model.classes)) return { nameToClass, idToClass };
    for (const c of model.classes) {
        if (c.name) nameToClass[c.name] = c;
        if (c.id) idToClass[c.id] = c;
    }
    return { nameToClass, idToClass };
}

export function opSignatureKey(op: IOperationModel) {
    const params = (op.parameters || []).map((p: any) => (p.type || 'any')).join(',');
    return `${op.name || 'unnamed'}(${params})`;
}

// ============================================================
// workflowToAst
//
// IWorkflowModel (nodes + edges) を WorkflowAst に変換する。
//
// 変換ルール:
//   - start ノードから出るエッジが 1本  → ステップ列をそのままフラットに展開
//   - start ノードから出るエッジが 2本以上 → if / else if / else に変換
//   - 各シナリオのステップ(Given/When/Then/And)は IActionNode のコメント文として出力
//   - src: アノテーションがあれば「// → label (url)」をコメントに付加
//   - Then/end ノードが return っぽい文言でも、ここでは throw new NotImplementedException() を末尾に生成
// ============================================================

/**
 * ワークフローの1シナリオ分のステップ列を IActionNode[] に変換する。
 * startId から endId までのパスを辿り、各ノードのラベルをコメント文にする。
 *
 * ノードの label は "Given: xxx" / "When: xxx" / "Then: xxx" 形式を想定。
 * Gherkin キーワードを保持してコメントに出力することで、
 * CommentParser が再パースできる形式を維持する。
 */
function scenarioStepsToActions(
    startId: string,
    workflow: IWorkflowModel,
): WfAstNode[] {
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const outEdges = new Map<string, IWorkflowEdge[]>();
    for (const e of workflow.edges) {
        if (!outEdges.has(e.from)) outEdges.set(e.from, []);
        outEdges.get(e.from)!.push(e);
    }

    // Gherkin キーワード → @タグ のマッピング（CommentParser 互換）
    const LABEL_TO_COMMENT: Record<string, string> = {
        'given': '@given',
        'when':  '@when',
        'then':  '@then',
        'and':   '@and',
        'but':   '@but',
        'how':   '@how',
        'why':   '@why',
        '前提':   '@given',
        'もし':   '@when',
        'ならば': '@then',
        'かつ':   '@and',
        'しかし': '@but',
    };

    const nodes: WfAstNode[] = [];
    const visited = new Set<string>();
    let cur: string | null = startId;

    while (cur) {
        if (visited.has(cur)) break;
        visited.add(cur);
        const node = nodeMap.get(cur);
        if (!node) break;

        // start/end ノードはコメントなし
        if (node.type !== 'start' && node.type !== 'end') {
            // "Keyword: text" → "// @keyword text" 形式に変換
            const colonIdx = node.label.indexOf(': ');
            let comment: string;
            if (colonIdx !== -1) {
                const kw = node.label.slice(0, colonIdx).toLowerCase();
                const tag = LABEL_TO_COMMENT[kw];
                const text = node.label.slice(colonIdx + 2);
                comment = tag ? `// ${tag} ${text}` : `// ${node.label}`;
            } else {
                comment = `// ${node.label}`;
            }
            nodes.push({ type: 'action', statement: comment });

            // How / Why メタデータもコメントとして出力
            const howSteps: string[] | undefined = (node as any).metadata?.howSteps;
            if (howSteps && howSteps.length > 0) {
                for (const s of howSteps) nodes.push({ type: 'action', statement: `// @how ${s}` });
            }
            const whyReason: string | undefined = (node as any).metadata?.whyReason;
            if (whyReason) nodes.push({ type: 'action', statement: `// @why ${whyReason}` });
        }

        // 次ノードへ（分岐がある場合は最初のエッジだけ辿る — シナリオ内では1本のパスのみ）
        const nexts: IWorkflowEdge[] = (outEdges.get(cur) ?? []).filter(e => e.condition == null);
        cur = nexts.length > 0 ? nexts[0].to : null;
    }

    // スタブ: 実装が必要であることを示す
    nodes.push({ type: 'action', statement: 'UNIMPLEMENTED_LOGIC', kind: 'instruction' });
    return nodes;
}

// ============================================================
// lintWorkflow
//
// IWorkflowModel のシナリオ順序を静的解析し、改善提案を返す。
// workflowToAst とは独立した純粋関数 — UI・コード生成どちらからでも使える。
//
// NOTE: フロントエンド (WebView) からは WorkflowLinter.ts を使うこと。
//       このファイルはホスト (Node.js拡張) 専用。
// ============================================================

export interface LintWarning {
    /** 警告の種別 */
    code: 'GUARD_LAST' | 'ERROR_BEFORE_SUCCESS' | 'MULTIPLE_SUCCESS';
    /** 人間向けメッセージ */
    message: string;
    /** 対象シナリオ名 */
    scenarioName: string;
    /** 推奨するシナリオ順序 (あれば) */
    suggestedOrder?: string[];
}

/** ガード節キーワード（null・空・未入力・不正など） */
const GUARD_KEYWORDS = [
    'null', 'nil', '空', '未入力', 'empty', '空欄', 'なし', 'ない',
    '不正', 'invalid', 'missing', '未定義', 'undefined', '0件', '存在しない',
];

/** 例外/失敗系キーワード */
const ERROR_KEYWORDS = [
    'エラー', '失敗', '間違い', '不一致', 'error', 'fail', 'wrong',
    'invalid', 'exception', '拒否', 'denied', '異常',
];

/** 正常/成功系キーワード */
const SUCCESS_KEYWORDS = [
    '成功', '完了', '正常', 'success', 'ok', 'valid', 'complete', '許可', '認証',
];

function classifyScenario(name: string, steps: string[]): 'guard' | 'error' | 'success' | 'unknown' {
    const text = [name, ...steps].join(' ').toLowerCase();
    if (GUARD_KEYWORDS.some(k => text.includes(k))) return 'guard';
    if (ERROR_KEYWORDS.some(k => text.includes(k))) return 'error';
    if (SUCCESS_KEYWORDS.some(k => text.includes(k))) return 'success';
    return 'unknown';
}

/**
 * シナリオ順序を静的解析して警告を返す。
 *
 * @param workflow  解析対象のワークフロー
 * @param opName    メッセージ用の操作名（例: "login()"）
 */
export function lintWorkflow(workflow: IWorkflowModel, opName: string): LintWarning[] {
    const warnings: LintWarning[] = [];
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) return warnings;

    const scenarioEdges = workflow.edges.filter(e => e.from === startNode.id);
    if (scenarioEdges.length < 2) return warnings; // 1本以下は順序問題なし

    // 各シナリオの名前 + ステップラベルを収集して分類
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const outEdges = new Map<string, IWorkflowEdge[]>();
    for (const e of workflow.edges) {
        if (!outEdges.has(e.from)) outEdges.set(e.from, []);
        outEdges.get(e.from)!.push(e);
    }

    type ScenarioInfo = { name: string; kind: 'guard' | 'error' | 'success' | 'unknown'; index: number };

    const scenarios: ScenarioInfo[] = scenarioEdges.map((edge, idx) => {
        const name = edge.condition ?? `シナリオ${idx + 1}`;
        // ステップのラベルを収集
        const stepLabels: string[] = [];
        const visited = new Set<string>();
        let cur: string | null = edge.to;
        while (cur) {
            if (visited.has(cur)) break;
            visited.add(cur);
            const node = nodeMap.get(cur);
            if (!node) break;
            if (node.type !== 'start' && node.type !== 'end') stepLabels.push(node.label);
            const nexts: IWorkflowEdge[] = outEdges.get(cur) ?? [];
            cur = nexts.length > 0 ? nexts[0].to : null;
        }
        return { name, kind: classifyScenario(name, stepLabels), index: idx };
    });

    const total = scenarios.length;
    const lastIdx = total - 1;

    // ── 検出1: ガード節が末尾にある ──────────────────────────
    // 推奨: ガード節は先頭に置く（早期return の前提）
    const guardsAtEnd = scenarios.filter(s => s.kind === 'guard' && s.index > 0);
    for (const g of guardsAtEnd) {
        const suggested = [
            ...scenarios.filter(s => s.kind === 'guard').map(s => s.name),
            ...scenarios.filter(s => s.kind === 'error').map(s => s.name),
            ...scenarios.filter(s => s.kind === 'success' || s.kind === 'unknown').map(s => s.name),
        ];
        warnings.push({
            code: 'GUARD_LAST',
            message: `[${opName}] "${g.name}" はガード節と推定されます。先頭に移動を検討してください。`,
            scenarioName: g.name,
            suggestedOrder: suggested,
        });
    }

    // ── 検出2: 失敗/例外系が成功系より前にある ───────────────
    const firstSuccessIdx = scenarios.find(s => s.kind === 'success')?.index ?? Infinity;
    const errorsBeforeSuccess = scenarios.filter(s => s.kind === 'error' && s.index < firstSuccessIdx);
    // ただしガード節より後ろにある場合のみ（ガード節の次は失敗系が来ることもある）
    // → 正常系より前に失敗系が来ている場合のみ警告
    if (errorsBeforeSuccess.length > 0 && firstSuccessIdx !== Infinity) {
        for (const e of errorsBeforeSuccess) {
            warnings.push({
                code: 'ERROR_BEFORE_SUCCESS',
                message: `[${opName}] "${e.name}" (失敗系) が成功系シナリオより前にあります。可読性のため成功系を先に書くことを検討してください。`,
                scenarioName: e.name,
            });
        }
    }

    // ── 検出3: 成功系が複数ある ──────────────────────────────
    const successScenarios = scenarios.filter(s => s.kind === 'success');
    if (successScenarios.length > 1) {
        warnings.push({
            code: 'MULTIPLE_SUCCESS',
            message: `[${opName}] 成功系シナリオが ${successScenarios.length} 本あります (${successScenarios.map(s => `"${s.name}"`).join(', ')})。設計の曖昧さがないか確認してください。`,
            scenarioName: successScenarios.map(s => s.name).join(', '),
        });
    }

    return warnings;
}

/**
 * IWorkflowModel → WorkflowAst 変換。
 *
 * 早期returnパターンでネストが最小になるよう生成する:
 *   - シナリオ 1本: if なしでフラット展開
 *   - シナリオ N本: 先頭 N-1 本を独立した if { ... } として並べ、
 *                   最後の1本だけ if なしでフラット展開（else 不要）
 *
 * 例（3シナリオ）:
 *   if (/* ログイン成功 *\/) { ... throw; }
 *
 *   if (/* パスワード間違い *\/) { ... throw; }
 *
 *   // Scenario: 未入力エラー   ← else なしでそのまま
 *   ... throw;
 */
export function workflowToAst(workflow: IWorkflowModel): WorkflowAst {
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) return { variables: [], body: [] };

    // start から出るエッジ = シナリオ分岐
    const scenarioEdges = workflow.edges.filter(e => e.from === startNode.id);
    if (scenarioEdges.length === 0) return { variables: [], body: [] };

    const body: WfAstNode[] = [];

    scenarioEdges.forEach((edge, idx) => {
        const scenarioName = edge.condition ?? `シナリオ${idx + 1}`;
        const srcSuffix = (edge.srcs && edge.srcs.length > 0)
            ? ' → ' + edge.srcs.map(s => `${s.label} (${s.url})`).join(', ')
            : '';
        const steps = scenarioStepsToActions(edge.to, workflow);
        const isLast = idx === scenarioEdges.length - 1;

        if (isLast) {
            // 最後のシナリオ: if なしでフラット展開（早期returnで到達するのでここが残り）
            body.push({ type: 'action', statement: `// Scenario: ${scenarioName}${srcSuffix}` });
            body.push(...steps);
        } else {
            // 先頭 N-1 本: 独立した if として並べる。空行で区切るためダミーの空コメントを後置
            body.push({
                type: 'if',
                condition: `true /* ${scenarioName}${srcSuffix} */`,
                then: steps,
            } as IIfNode);
            body.push({ type: 'action', statement: '' }); // 空行
        }
    });

    return { variables: [], body };
}

// collectInheritedMembers: 再帰的に base クラス → 親の属性・操作を集める
export function collectInheritedMembers(cls: IClassModel, model: IObjectModel, opts?: { nameToClass?: any, idToClass?: any }) {
    const { nameToClass, idToClass } = opts || buildClassMaps(model);
    const inheritedAttrs = new Map<string, IAttributeModel>(); // name -> attr
    const inheritedOps = new Map<string, { op: IOperationModel, originClass: IClassModel }>();   // signature -> op
    const visited = new Set<string>();

    function visit(c: any) {
        if (!c) return;
        if (!c.id && !c.name) return;
        const marker = c.id || c.name;
        if (visited.has(marker)) return;
        visited.add(marker);

        let base: IClassModel | null = null;


        if (c.id && idToClass[c.id]) {
            base = idToClass[c.id];
        }

        if (base) {

            visit(base);

            for (const a of (base.attributes || [])) {
                if (!inheritedAttrs.has(a.name)) inheritedAttrs.set(a.name, a);
            }
            for (const o of (base.operations || [])) {
                const k = opSignatureKey(o);
                if (!inheritedOps.has(k)) inheritedOps.set(k, { op: o, originClass: base });
            }
        }


        if (Array.isArray(c.interfaces)) {
            for (const ifaceRef of c.interfaces) {
                // ifaceRef may be name or id; try both maps
                const iface = nameToClass[ifaceRef] || idToClass[ifaceRef] || null;
                if (!iface) continue;

                visit(iface);
                for (const o of (iface.operations || [])) {
                    const k = opSignatureKey(o);
                    if (!inheritedOps.has(k)) inheritedOps.set(k, { op: o, originClass: iface });
                }
                // interfaces usually don't have attributes but if they do, treat similarly (optional)
                for (const a of (iface.attributes || [])) {
                    if (!inheritedAttrs.has(a.name)) inheritedAttrs.set(a.name, a);
                }
            }
        }
    }

    // clsの親から開始します。cls自身のメンバーを継承として含めたくないからです。
    let startParent: IClassModel | null = null;

    if (cls.baseClassId && idToClass[cls.baseClassId]) startParent = idToClass[cls.baseClassId];
    if (startParent) {
        visit(startParent);
    }
    // また、cls によって直接実装されたインターフェースも含めます (継承された抽象オペレーションとして扱われます)
    if (Array.isArray(cls.interfaces)) {
        for (const ifaceRef of cls.interfaces) {
            const iface = nameToClass[ifaceRef] || idToClass[ifaceRef] || null;
            if (!iface) continue;
            visit(iface);
        }
    }

    return {
        attributes: inheritedAttrs, // Map(name -> attr)
        operations: inheritedOps    // Map(sig -> {op, originClass})
    };
}

export abstract class CodeBuilder implements IGeneratorBuilder {
    TypeModel: TypeModel;
    protected ObjectModel: IObjectModel;
    protected ClassMaps: { nameToClass: Record<string, IClassModel>, idToClass: Record<string, IClassModel> };
    protected AllClassNames: Set<string>;
    protected logger: Logger | null;
    constructor(model: IObjectModel, typeModel: TypeModel, logger: Logger | null = null) {
        this.ObjectModel = model;
        this.TypeModel = typeModel;
        this.logger = logger;
        this.ClassMaps = buildClassMaps(model);
        this.AllClassNames = new Set(Object.keys(this.ClassMaps.nameToClass));
    }


    async Build(outputFolder: vscode.Uri): Promise<void> {
        this.logger?.info(`Starting code generation for language in: ${outputFolder.fsPath}`);
        this.logger?.show(true);

        let overwriteAll = false;
        let skipAll = false;
        const generatedTests: IGeneratedFile[] = [];

        const shouldWriteFile = async (fileUri: vscode.Uri, displayName: string): Promise<boolean> => {
            let fileExists = false;
            try {
                await vscode.workspace.fs.stat(fileUri);
                fileExists = true;
            } catch {
                fileExists = false;
            }

            if (!fileExists) return true;
            if (skipAll) {
                this.logger?.info(`Skipping existing file (Skip All): ${displayName}`);
                return false;
            }

            if (!overwriteAll) {
                const result = await vscode.window.showWarningMessage(
                    `File '${displayName}' already exists. Overwrite?`,
                    { modal: true },
                    'Yes',
                    'Yes to All',
                    'No',
                    'No to All'
                );

                if (result === 'No') {
                    this.logger?.info(`User skipped file: ${displayName}`);
                    return false;
                } else if (result === 'No to All') {
                    skipAll = true;
                    this.logger?.info(`User skipped file and all subsequent existing files: ${displayName}`);
                    return false;
                } else if (result === 'Yes to All') {
                    overwriteAll = true;
                    this.logger?.info(`User opted to overwrite all remaining files.`);
                } else if (result === undefined) {
                    this.logger?.warn(`Generation cancelled for ${displayName}`);
                    return false;
                }
            }
            return true;
        };

        for (const cls of this.ObjectModel.classes) {
            const fileName = `${this.getFileName(cls)}${this.getFileExtension()}`;
            const fileUri = vscode.Uri.joinPath(outputFolder, fileName);
            if (!(await shouldWriteFile(fileUri, fileName))) continue;

            this.logger?.info(`Generating class: ${cls.name || 'Unnamed'} -> ${fileName}`);

            const imports = this.generateImports(cls);
            const classDeclaration = this.generateClassDeclaration(cls);
            const attributes = this.generateAttributes(cls);
            const constructor = this.generateConstructor(cls);
            const operations = this.generateOperations(cls);

            let sb: string[] = [];
            if (imports.length > 0) {
                sb.push(...imports);
                sb.push('');
            }
            sb.push(classDeclaration);
            sb.push(...attributes);
            sb.push(...constructor);
            sb.push(...operations);
            sb.push(this.getClassClosing());

            const text = sb.join('\n');
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(text, 'utf8'));
            this.logger?.info(`Successfully wrote: ${fileName}`);

            const testFiles = this.generateTestFiles(cls);
            if (testFiles.length > 0) generatedTests.push(...testFiles);
        }

        const testsFolderUri = vscode.Uri.joinPath(outputFolder, 'tests');
        await vscode.workspace.fs.createDirectory(testsFolderUri);
        this.logger?.info(`Ensured tests directory: ${testsFolderUri.fsPath}`);

        for (const testFile of generatedTests) {
            const normalizedPath = testFile.relativePath.replace(/\\/g, '/');
            const pathParts = normalizedPath.split('/').filter(Boolean);
            if (pathParts.length === 0) continue;

            const fileName = pathParts[pathParts.length - 1];
            const dirParts = pathParts.slice(0, -1);

            let targetDir = testsFolderUri;
            for (const dirPart of dirParts) {
                targetDir = vscode.Uri.joinPath(targetDir, dirPart);
            }
            if (dirParts.length > 0) {
                await vscode.workspace.fs.createDirectory(targetDir);
            }

            const fileUri = vscode.Uri.joinPath(targetDir, fileName);
            const displayName = `tests/${normalizedPath}`;
            if (!(await shouldWriteFile(fileUri, displayName))) continue;

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(testFile.content, 'utf8'));
            this.logger?.info(`Successfully wrote test: ${displayName}`);
        }
        this.logger?.info('Code generation completed.');
    }
    // 抽象メソッド: 言語固有の実装をサブクラスで定義
    public abstract generateImports(cls: IClassModel): string[];
    public abstract generateClassDeclaration(cls: IClassModel): string;
    public abstract generateAttributes(cls: IClassModel): string[];
    public abstract generateConstructor(cls: IClassModel): string[];
    public abstract generateOperations(cls: IClassModel): string[];
    public abstract getClassClosing(): string;
    public abstract getFileName(cls: IClassModel): string;
    public abstract getFileExtension(): string;
    public generateTestFiles(_cls: IClassModel): IGeneratedFile[] {
        return [];
    }

    protected getAttributes() {

    }

    protected existsClassName(className: string): boolean {
        return this.AllClassNames.has(className);
    }

    protected findClassById(id: string): IClassModel | undefined {
        return this.ObjectModel.classes.find(x => x.id === id);
    }

    protected findBaseClass(cls: IClassModel): IClassModel | null {
        if ('baseClassId' in cls && cls.baseClassId) {
            const l = this.ObjectModel.classes.find(x => x.id === cls.baseClassId);
            return l ?? null;
        }

        if (cls.baseClass) {
            const byName = this.ClassMaps.nameToClass[cls.baseClass];
            if (byName) return byName;
        }

        return null;
    }

    protected makeParamName(base: string, used: Set<string>) {
        let s = safeIdentifier(base || 'param');
        s = s.charAt(0).toLowerCase() + s.slice(1);
        if (!/^[a-zA-Z_]/.test(s)) s = '_' + s;
        let out = s;
        let i = 1;
        while (used.has(out)) {
            out = `${s}_${i++}`;
        }
        used.add(out);
        return out;
    }

    protected buildParamListForAttributes(attrs: Array<IAttributeModel>, language: string, usedNames: Set<string>) {
        const params: Array<{ propName: string, paramName: string, typeName: string }> = [];
        for (const a of attrs || []) {
            const propName = a.name || 'unnamed';
            const paramName = this.makeParamName(propName, usedNames);
            const typeName = this.TypeModel.mapTypeForLang(a.type || (language === 'csharp' ? 'object' : 'any'), language).name;
            params.push({ propName, paramName, typeName });
        }
        return params;
    }

    // 共通ヘルパ: クラス図上、抽象メンバであるか
    protected isAbstractMember(member: IAttributeModel | IOperationModel): boolean {
        if (!member) return false;
        const modVal = (member.modifier || '').toLowerCase();
        if (modVal.includes('abstract')) return true;
        return false;

    }

    // 共通ヘルパ: クラス図上、仮想メンバであるか
    protected isVirtualMember(member: IAttributeModel | IOperationModel): boolean {
        if (!member) return false;
        const modVal = (member.modifier || '').toLowerCase();
        if (modVal.includes('virtual')) return true;
        return false;

    }

    // 共通ヘルパ: private識別子で、かつvirtualまたはabstract識別子のメンバであるか
    protected isPrivateVirtualAbstractMember(member: IAttributeModel | IOperationModel): boolean {
        if (!member) return false;
        const modVal = (member.modifier || '').toLowerCase();

        const isPrivateAndVirtual = (member.visibility === 'private' && modVal.includes('virtual'));
        if (isPrivateAndVirtual) {
            this.logger?.warn(`Warning: member ${member.name} is private and virtual; skipping.`);
            return true;
        }

        const isPrivateAndAbstract = (member.visibility === 'private' && modVal.includes('abstract'));
        if (isPrivateAndAbstract) {
            this.logger?.warn(`Warning: member ${member.name} is private and abstract; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 抽象クラス内の属性区画がprivateであるか
    protected isPrivateAttributeInAbstractClass(member: IAttributeModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        if (cls.isAbstract && member.visibility === 'private') {
            this.logger?.warn(`Warning: member ${member.name} is private in abstract class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 抽象クラス内の操作区画がprivateであるか
    protected isPrivateOperationInAbstractClass(member: IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        if (cls.isAbstract && member.visibility === 'private') {
            this.logger?.warn(`Warning: member ${member.name} is private in abstract class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 抽象クラス内のprivateメンバであるか
    protected isPrivateMemberInAbstractClass(member: IAttributeModel | IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        if (cls.isAbstract && member.visibility === 'private') {
            this.logger?.warn(`Warning: member ${member.name} is private in abstract class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 具象クラスの抽象メンバであるか
    protected isAbstractMemberInConcreteClass(member: IAttributeModel | IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        const modVal = (member.modifier || 'None').toLowerCase();
        if (!cls.isAbstract && modVal.includes('abstract')) {
            this.logger?.warn(`Warning: member ${member.name} is abstract in concrete class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    public abstract generateWorkflow(ast: WorkflowAst): string[];

    /**
     * 再帰的にワークフローノードを処理するためのディスパッチャ
     * 各言語固有のビルダーで、具体的なノード生成メソッドを実装する際に利用する
     */
    protected buildWfNodes(nodes: WfAstNode[], indent: number): string[] {
        let lines: string[] = [];
        for (const node of nodes) {
            lines = lines.concat(this.buildWfNode(node, indent));
        }
        return lines;
    }

    protected buildWfNode(node: WfAstNode, indent: number): string[] {
        switch (node.type) {
            case 'action':
                return this.generateAction(node, indent);
            case 'if':
                return this.generateIf(node, indent);
            case 'while':
                return this.generateWhile(node, indent);
            case 'return':
                return this.generateReturn(node, indent);
            case 'sequence':
                return this.buildWfNodes(node.nodes, indent);
            default:
                return [];
        }
    }

    protected abstract generateAction(node: IActionNode, indent: number): string[];
    protected abstract generateIf(node: IIfNode, indent: number): string[];
    protected abstract generateWhile(node: IWhileNode, indent: number): string[];
    protected abstract generateReturn(node: IReturnNode, indent: number): string[];

    protected getIndent(level: number): string {
        return '    '.repeat(level);
    }
}


export class TypeModel {
    private _primitiveTypes: IPrimitiveTypeMap = {};
    constructor() {
        this.addPrimitiveType('int', {
            csharp: 'int',
            typescript: 'number',
            java: 'int',
            cpp: 'int',
            rust: 'i32'
        });
        this.addPrimitiveType('string', {
            csharp: 'string',
            typescript: 'string',
            java: 'String',
            cpp: 'std::string',
            rust: 'String'
        });
        this.addPrimitiveType('bool', {
            csharp: 'bool',
            typescript: 'boolean',
            java: 'boolean',
            cpp: 'bool',
            rust: 'bool'
        });
        this.addPrimitiveType('float', {
            csharp: 'float',
            typescript: 'number',
            java: 'float',
            cpp: 'float',
            rust: 'f32'
        });
        this.addPrimitiveType('double', {
            csharp: 'double',
            typescript: 'number',
            java: 'double',
            cpp: 'double',
            rust: 'f64'
        });
        this.addPrimitiveType('void', {
            csharp: 'void',
            typescript: 'void',
            java: 'void',
            cpp: 'void',
            rust: '()'
        });
        this.addPrimitiveType('char', {
            csharp: 'char',
            typescript: 'string',
            java: 'char',
            cpp: 'char',
            rust: 'String'
        });
        this.addPrimitiveType('object', {
            csharp: 'object',
            typescript: 'object',
            java: 'Object',
            cpp: 'auto',
            rust: '()'
        });

    }
    addPrimitiveType(primitiveName: string, typeModel: ILanguageTypeModel) {
        this._primitiveTypes[primitiveName] = typeModel;
    }
    getType(primitiveName: string, language: string): string {
        const m = this._primitiveTypes[primitiveName];
        return m[language as keyof ILanguageTypeModel];
    }
    getTypesForLang(language: string): string[] {
        const types: string[] = [];
        if (!language) {
            return types;
        }
        const langKeyMap: Record<string, keyof ILanguageTypeModel> = {
            csharp: 'csharp',
            typescript: 'typescript',
            java: 'java',
            cpp: 'cpp',
            rust: 'rust'
        };

        const prop = langKeyMap[language];
        if (!prop) return types;

        const vals = Object.values(this._primitiveTypes)
            .map(m => m[prop])
            .filter(v => typeof v === 'string' && v.length > 0);


        return Array.from(new Set(vals));
    }

    mapTypeForLang(typeName: string, language: string): ITypeModel {
        const t = typeName.trim();
        if (!typeName) {
            switch (language) {
                case 'typescript':
                    return { name: 'any', initial: 'null' };
                case 'java':
                    return { name: 'Object', initial: 'null' };
                case 'cpp':
                    return { name: 'auto', initial: 'null' };
                default:
                    return { name: 'object', initial: 'null' };
            }
        }
        const low = t.toLowerCase();
        if (this._primitiveTypes[low]) {
            const typeName = this.getType(low, language);
            // primitive型に応じて initalを定める
            let initText = '';
            switch (typeName) {
                case 'number':
                    initText = '0';
                    break;
                case 'string':
                    initText = `''`;
                    break;
                default:
                    initText = 'null'
                    break;
            }
            return { name: typeName, initial: initText };
        }
        switch (language) {
            case 'csharp':
                return { name: t, initial: 'null' };
            case 'typescript':
                return { name: t.replace(/</g, '<').replace(/>/g, '>'), initial: 'null' };
            case 'java':
                return { name: t.replace(/</g, '<').replace(/>/g, '>'), initial: 'null' };
            case 'cpp':
                if (t.startsWith('List<')) {
                    const inner = t.slice(5, -1);
                    return { name: `std::vector<${this.mapTypeForLang(inner, 'cpp').name}>`, initial: 'null' };
                }
                return { name: t, initial: 'null' };
            default:
                return { name: t, initial: 'null' };
        }

    }
}


export class CodeGenerator {


    private _builder: IGeneratorBuilder | null = null;
    constructor(builder: IGeneratorBuilder | null = null) {
        this._builder = builder;

    }

    async generate(outputFolder: vscode.Uri) {
        if (!this._builder) {
            return null;
        }
        await this._builder.Build(outputFolder);
    }



}
