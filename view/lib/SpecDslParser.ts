import {
    ClassMember,
    ClassOperation,
    OperationParameter,
    ClassKind,
    Visibility,
    createId,
} from "./class-diagram-types";
import { ClassDiagramService } from "./application/ClassDiagramService";
import { DomainModel } from "./DomainModel";
import { postMessage } from "../../frontend/src/bridge/vscode-bridge";
import { RefactorSuggester } from "./RefactorSuggester";

// ============================================================
// Public Types
// ============================================================

export interface ParsedClass {
    name: string;
    kind: ClassKind;
    isAbstract: boolean;
    members: ClassMember[];
    operations: ClassOperation[];
    extendsName: string | null;
    implementsNames: string[];
}

export interface ParsedRelation {
    source: string;
    target: string;
    type: "generalization" | "realization" | "instantiation" | "association" | "aggregation" | "composition" | "dependency";
    label?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
}

// UI側(WorkflowEditorPanel)と構造を合わせたローカルインターフェース
// インポートせずに、このファイル内でのパース用に使用します
interface LocalWFNode { id: string; type: string; label: string; x: number; y: number; }
interface LocalWFEdge { from: string; to: string; }
interface LocalWorkflow { nodes: LocalWFNode[]; edges: LocalWFEdge[]; }

// ============================================================
// Gherkin Types
// ============================================================

export interface GherkinStep {
    keyword: string; // "Given", "When", "Then", "And", "But"
    text: string;
}

export interface GherkinScenario {
    name: string;
    steps: GherkinStep[];
}

export interface GherkinFeature {
    name: string;
    scenarios: GherkinScenario[];
}

// ============================================================
// Structured Constraint（制約の構造化）
// ============================================================

/**
 * 制約の種別
 * - range    : 以上/以下/未満/超過 などの範囲制約
 * - equality : 等しい/一致/である などの等値制約
 * - state    : 〜状態/〜済み などの状態制約
 * - existence: 存在する/nullでない などの存在制約
 * - custom   : 上記に当てはまらないカスタム制約
 */
export type ConstraintKind = 'range' | 'equality' | 'state' | 'existence' | 'custom';

export interface StructuredConstraint {
    kind: ConstraintKind;
    /** 制約の主語（「受注金額」「ユーザー」等） */
    subject: string;
    /** 演算子に相当するテキスト（「以上」「等しい」等） */
    operator: string;
    /** 値部分（「1000」「未確認」等）。取得できない場合は空文字 */
    value: string;
    /** パース元の原文 */
    raw: string;
}

// ============================================================
// Workflow Backref（ワークフロー逆参照）
// ============================================================

/**
 * DSL内のメンバ名・操作名が、どのワークフローノードで参照されているかを示す逆参照エントリ。
 * ParsedDsl.backrefIndex のキーは identifierName（メンバ名または操作名）。
 */
export interface WorkflowBackref {
    /** 参照しているワークフローノードのID */
    nodeId: string;
    /** 参照しているシナリオ名 */
    scenarioName: string;
    /** 参照しているクラス名 */
    className: string;
    /** 参照している操作名 */
    operationName: string;
    /** Gherkin ステップのキーワード（Given/When/Then 等） */
    stepKeyword: string;
    /** ステップ本文 */
    stepText: string;
}

// ============================================================
// CLI Suggestion（CLI提案）
// ============================================================

export type CliSuggestionKind =
    | 'add-member'        // メンバ追加が推奨される
    | 'add-state-machine' // 状態機械の追加が推奨される
    | 'generate-code'     // コード生成が推奨される
    | 'add-constraint'    // 制約の明示化が推奨される
    | 'add-relation';     // リレーション追加が推奨される

export interface CliSuggestion {
    kind: CliSuggestionKind;
    /** CLIへ直接貼り付け可能なコマンド文字列 */
    command: string;
    /** 提案の理由（UIのツールチップ等に使用） */
    reason: string;
    /** 関連するクラス名 */
    className?: string;
    /** 関連するメンバ・操作名 */
    identifierName?: string;
    /** 優先度（高いほど先に表示） */
    priority: number;
    /**
     * true のとき、コマンドラインへ渡す際に自動で "dry-run " を先頭に付与する。
     * refactor / add-relation 系など副作用が大きいコマンドはデフォルト true。
     * add-member など軽微な変更は false にしてプレビューなしで流せる。
     */
    dryRun?: boolean;
}

// ============================================================
// ParsedDsl（統合型）
// ============================================================

export interface ParsedDsl {
    classes: ParsedClass[];
    relations: ParsedRelation[];
    features: GherkinFeature[];
    /**
     * identifierName → そのidentifierを参照しているワークフローノード群
     */
    backrefIndex: Map<string, WorkflowBackref[]>;
    /**
     * CLIやCodeLensに渡す提案リスト。優先度降順でソート済み。
     */
    cliSuggestions: CliSuggestion[];
    /**
     * DSL先頭のコメント行・alias宣言をそのまま保持したブロック。
     * toDSL() で生成した本体の前に差し込むことで、
     * コメントと alias が失われないようにする。
     */
    headerBlock: string;
}


// ============================================================
// SpecDslParser
// ============================================================

/**
 * SpecDslParser
 *
 * export-spec-dsl が出力するDSL形式のテキストをパースし、
 * ParsedDsl (クラス定義 + リレーション定義) に変換する。
 *
 * import-spec-dsl コマンドから利用されるほか、
 * テストやGUI側からも直接利用できるよう独立クラスとして提供する。
 */
export class SpecDslParser {
    private aliases: Map<string, string> = new Map();

    /**
     * 名詞正規化辞書（ドメインワード→正規形）
     * parse() のたびに動的に再構築される。
     */
    private nounDictionary: Map<string, string> = new Map();

    /**
     * 逆参照インデックス（identifierName → WorkflowBackref[]）
     * parseGherkinToWorkflow() 内で随時追記される。
     */
    private backrefIndex: Map<string, WorkflowBackref[]> = new Map();

    /**
     * CLI提案リスト。parse() の後半で生成される。
     */
    private cliSuggestions: CliSuggestion[] = [];

    /**
     * 最後に parse() した際に収集した alias マップを返す。
     * SpecEditorPanel が toDSL() に渡すために使用する。
     */
    getAliasMap(): Map<string, string> {
        return new Map(this.aliases);
    }

    /**
     * DSL文字列をパースして ParsedDsl を返す。
     */
    parse(source: string, service: ClassDiagramService): ParsedDsl {
        const classes: ParsedClass[] = [];
        const relations: ParsedRelation[] = [];
        const features: GherkinFeature[] = [];
        this.aliases.clear();
        this.backrefIndex.clear();
        this.cliSuggestions = [];

        let current: ParsedClass | null = null;

        const lines = source.split("\n").map(l => l.trimEnd());

        // ── ヘッダブロック抽出 ─────────────────────────────────────
        // ファイル先頭から最初のクラス・リレーション宣言の直前までに存在する
        // コメント行（// # で始まる行）と alias 宣言をそのまま保持する。
        // toDSL() で生成した本体の前に差し込むことで紛失を防ぐ。
        const headerLines: string[] = [];
        for (const line of lines) {
            const t = line.trim();
            const isClassOrRelation =
                t.match(/^(abstract\s+)?(class|interface|struct)\b/) ||
                t.match(/^[+\-#~]/) ||
                ['->', '+>', '*>', '>|', '>/', '-/>', 'o>'].some(sym => t.includes(sym));
            if (isClassOrRelation) break;
            // コメント行・alias行・空行のみ保持
            if (!t || t.startsWith('//') || t.startsWith('#') || t.match(/^alias\s+/i)) {
                // toDSL() が自動生成するヘッダ行（# generated by ...）は除外
                if (!t.startsWith('# generated by') && !t.match(/^# \d{4}/)) {
                    headerLines.push(line);
                }
            }
        }
        // 末尾の空行を1つに正規化
        while (headerLines.length > 0 && headerLines[headerLines.length - 1].trim() === '') {
            headerLines.pop();
        }
        const headerBlock = headerLines.join('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

            // ---- Alias 宣言 ----
            // 書式: alias "受注金額" as "orderAmount"
            const aliasMatch = trimmed.match(/^alias\s+"([^"]+)"\s+as\s+"([^"]+)"$/i);
            if (aliasMatch) {
                this.aliases.set(aliasMatch[1], aliasMatch[2]);
                continue;
            }

            // ---- クラス宣言 ----
            const classDecl = this.matchClassDecl(trimmed);
            if (classDecl) {
                if (current) classes.push(current);
                current = classDecl;
                continue;
            }

            // ---- リレーション（クラス外でも内でも可）----
            const rel = this.matchRelation(trimmed);
            if (rel) {
                relations.push(rel);
                continue;
            }

            if (!current) continue;

            // ---- extends ----
            const extendsMatch = trimmed.match(/^extends\s+(\w+)$/);
            if (extendsMatch) {
                current.extendsName = extendsMatch[1];
                continue;
            }

            // ---- implements ----
            const implMatch = trimmed.match(/^implements\s+(.+)$/);
            if (implMatch) {
                current.implementsNames = implMatch[1]
                    .split(",").map(s => s.trim()).filter(Boolean);
                continue;
            }

            // ---- Gherkin Scenario / ステップ行は Pass2 で処理 ----
            if (trimmed.match(/^(?:Scenario|シナリオ):/i)) continue;
            if (trimmed.match(/^(?:Given|When|Then|And|But|前提|もし|ならば|かつ|しかし)\s/i)) continue;

            // ---- メンバ ----
            const member = this.matchMember(trimmed);
            if (member) {
                current.members.push(member);
                continue;
            }

            // ---- 操作 ----
            const operation = this.matchOperation(trimmed);
            if (operation) {
                current.operations.push(operation);
                continue;
            }
        }

        if (current) classes.push(current);

        // ── 名詞正規化辞書をDSLから動的構築 ─────────────────────────
        // クラス名・メンバ名・操作名をドメインワードとして登録する。
        // alias 宣言があれば「日本語表記→英語識別子」のマッピングも登録する。
        this.nounDictionary.clear();
        for (const cls of classes) {
            this.nounDictionary.set(cls.name, cls.name);
            for (const m of cls.members) this.nounDictionary.set(m.name, m.name);
            for (const op of cls.operations) this.nounDictionary.set(op.name, op.name);
        }
        for (const [alias, realName] of this.aliases.entries()) {
            this.nounDictionary.set(alias, realName);
        }

        // Pass 1: クラスを登録
        for (const cls of classes) {
            service.applyAddType({
                name: cls.name,
                kind: cls.kind,
                isAbstract: cls.isAbstract,
            });
        }

        // Pass 2: メンバ・操作を追加
        for (const cls of classes) {
            for (const member of cls.members) {
                service.applyAddMember({
                    className: cls.name,
                    member,
                });
            }
            const classInfo = service.getClassByName(cls.name);

            // クラス宣言行を特定して、Scenario検索をそのブロック内に限定する
            // （他クラスの同名メソッドを誤検出しないための措置）
            const classBlockStart = lines.findIndex(l =>
                new RegExp(`(abstract\\s+)?(class|interface|struct)\\s+${cls.name}\\b`).test(l.trim())
            );
            const classBlockEnd = lines.findIndex((l, idx) =>
                idx > classBlockStart &&
                /^(abstract\s+)?(class|interface|struct)\s+\w+/.test(l.trim())
            );
            const blockEnd = classBlockEnd === -1 ? lines.length : classBlockEnd;

            for (const operation of cls.operations) {
                // パラメータは matchOperation → parseParameters で既に operation に含まれており、
                // applyAddOperation 内で登録済み。applyAddParameter による二重登録は行わない。
                service.applyAddOperation({
                    className: cls.name,
                    operation,
                });

                if (classInfo) {
                    // クラスブロック内のみで操作行を検索
                    const opLineIndex = lines.findIndex((l, idx) =>
                        idx >= classBlockStart &&
                        idx < blockEnd &&
                        l.includes(`${operation.name}(`)
                    );

                    if (opLineIndex !== -1) {
                        for (let j = opLineIndex + 1; j < blockEnd; j++) {
                            const nextLine = lines[j].trim();
                            if (!nextLine) continue;
                            // 次のメンバ・操作宣言が来たらシナリオ探索を終了
                            if (nextLine.match(/^[+\-#~]/)) break;

                            if (nextLine.match(/^(?:Scenario|シナリオ):/i)) {
                                const c = service.getClassByName(cls.name);
                                if (!c) break;
                                const op = service.getOperationByName(cls.name, operation.name);
                                if (!op) break;

                                // 逆参照インデックスで操作名を使えるよう context に注入
                                const contextWithOp = { ...classInfo, _currentOperationName: operation.name };
                                const result = this.parseGherkinToWorkflow(lines, j, contextWithOp);
                                service.applyUpdateOperationWorkflow({
                                    classId: c.id,
                                    operationId: op.id,
                                    workflow: result.workflow,
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Pass 3: 継承・実装関係を設定
        for (const cls of classes) {
            if (cls.extendsName) {
                service.applySetBase({
                    className: cls.name,
                    baseClassName: cls.extendsName,
                });
            }
            for (const ifaceName of cls.implementsNames) {
                service.applyAddInterfaceImpl({
                    className: cls.name,
                    interfaceName: ifaceName,
                });
            }
        }

        // ── CLI提案の生成 ─────────────────────────────────────────
        this.cliSuggestions = this.generateCliSuggestions(classes, relations);

        return {
            classes,
            relations,
            features,
            backrefIndex: new Map(this.backrefIndex),
            cliSuggestions: [...this.cliSuggestions],
            headerBlock,
        };
    }

    // ============================================================
    // Line Matchers
    // ============================================================

    private matchClassDecl(line: string): ParsedClass | null {
        const m = line.match(
            /^(abstract\s+)?(class|interface|struct)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?$/
        );
        if (!m) return null;

        const implementsNames = m[5]
            ? m[5].split(',').map(s => s.trim()).filter(Boolean)
            : [];

        return {
            name: m[3],
            kind: m[2] as ClassKind,
            isAbstract: !!m[1],
            members: [],
            operations: [],
            extendsName: m[4] ?? null,
            implementsNames,
        };
    }

    private matchMember(line: string): ClassMember | null {
        if (line.includes("(")) return null;

        const m = line.match(
            /^([+\-#~])\s*(?:(s|a)\s+)?(\w+)\s*:\s*(.+)$/
        );
        if (!m) return null;

        return {
            id: createId(),
            name: m[3],
            type: m[4].trim(),
            visibility: this.parseVisibility(m[1]),
            isStatic: m[2] === "s",
            isAbstract: m[2] === "a",
            relationship: "auto",
            sourceMultiplicity: "1",
            targetMultiplicity: "1",
        };
    }

    private matchOperation(line: string): ClassOperation | null {
        const m = line.match(
            /^([+\-#~])\s*(?:(s|a)\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(.+))?$/
        );
        if (!m) return null;

        return {
            id: createId(),
            name: m[3],
            returnType: m[5]?.trim() ?? "void",
            visibility: this.parseVisibility(m[1]),
            parameters: this.parseParameters(m[4]),
            isStatic: m[2] === "s",
            isAbstract: m[2] === "a",
        };
    }

    private matchRelation(line: string): ParsedRelation | null {
        const symbolMap: Record<string, ParsedRelation["type"]> = {
            "-/>": "dependency",
            ">|": "generalization",
            ">/": "realization",
            "+>": "instantiation",
            "->": "association",
            "o>": "aggregation",
            "*>": "composition",
        };

        for (const [symbol, type] of Object.entries(symbolMap)) {
            if (!line.includes(symbol)) continue;

            const parts = line.split(symbol);
            if (parts.length < 2) continue;

            const source = parts[0].trim();
            const rest = parts[1].trim();

            const restMatch = rest.match(
                /^(\w+)(?:\s+:(\S+))?(?:\s+(\S+)\s+(\S+))?$/
            );
            if (!restMatch) continue;

            return {
                source,
                target: restMatch[1],
                type,
                label: restMatch[2],
                sourceMultiplicity: restMatch[3],
                targetMultiplicity: restMatch[4],
            };
        }

        return null;
    }


    // ============================================================
    // Helpers
    // ============================================================

    private parseVisibility(symbol: string): Visibility {
        switch (symbol) {
            case "+": return "public";
            case "-": return "private";
            case "#": return "protected";
            case "~": return "package";
            default: return "public";
        }
    }

    /**
     * Scenario 行から src: アノテーションをパースして除去したシナリオ名を返す。
     */
    private parseScenarioLine(raw: string): {
        name: string
        srcs: { label: string; url: string }[]
    } {
        const srcIdx = raw.search(/\bsrc:\s/)
        if (srcIdx === -1) return { name: raw.trim(), srcs: [] }

        const name = raw.slice(0, srcIdx).trim()
        const srcs: { label: string; url: string }[] = []

        const srcRe = /\bsrc:\s+(\S+)\s+(\S+)/g
        let m: RegExpExecArray | null
        while ((m = srcRe.exec(raw)) !== null) {
            srcs.push({ label: m[1], url: m[2] })
        }
        return { name, srcs }
    }

    private parseGherkinToWorkflow(lines: string[], startIndex: number, context?: any): {
        workflow: ClassOperation['workflow'],
        endIndex: number
    } {
        const nodes: NonNullable<ClassOperation['workflow']>['nodes'] = [];
        const edges: NonNullable<ClassOperation['workflow']>['edges'] = [];

        const STEP_Y = 100;
        let currentY = 50;
        let currentX = 200;
        const SCENARIO_WIDTH = 250;
        let lastNodeId: string | null = null;

        const firstScenarioLine = lines[startIndex]?.trim() ?? "";
        const firstParsed = this.parseScenarioLine(
            firstScenarioLine.replace(/^(?:Scenario|シナリオ):\s*/i, "")
        );
        let currentScenarioName = firstParsed.name;
        let currentSrcs = firstParsed.srcs;

        let i = startIndex + 1;

        const startId = createId();
        const endId = createId();
        nodes.push({ id: startId, type: 'start', label: '開始', x: 200, y: currentY });
        const endNode = { id: endId, type: 'end', label: '終了', x: 200, y: 0 };

        lastNodeId = startId;
        currentY += STEP_Y;
        let maxY = 0;

        while (i < lines.length) {
            const trimmed = lines[i].trim();

            if (trimmed === '') { i++; continue; }

            if (
                trimmed.match(/^(abstract\s+)?(class|interface|struct)\b/) ||
                trimmed.match(/^[+\-#~]/)
            ) break;

            if (trimmed.match(/^(?:Scenario|シナリオ):/i)) {
                if (lastNodeId && lastNodeId !== startId) {
                    edges.push({ from: lastNodeId, to: endId });
                }
                const parsed = this.parseScenarioLine(
                    trimmed.replace(/^(?:Scenario|シナリオ):\s*/i, "")
                );
                currentScenarioName = parsed.name;
                currentSrcs = parsed.srcs;
                lastNodeId = startId;
                currentY = 150;
                currentX += SCENARIO_WIDTH;
                i++;
                continue;
            }

            const stepMatch = trimmed.match(/^(Given|When|Then|And|But|前提|もし|ならば|かつ|しかし)\s+(.+)$/i);
            if (stepMatch) {
                const keyword = stepMatch[1];
                const text = stepMatch[2].trim();
                const nodeType = /^(When|もし)$/i.test(keyword) ? 'decision' : 'process';

                // Semantic Analysis
                const bindings = this.resolveIdentifiers(text, context);
                const isGiven = /^(Given|前提)$/i.test(keyword);
                const constraints = isGiven ? this.extractConstraints(text) : undefined;
                const inferredState = this.inferState(text);

                const newId = createId();
                nodes.push({
                    id: newId,
                    type: nodeType,
                    label: `${keyword}: ${text}`,
                    x: currentX,
                    y: currentY,
                    metadata: {
                        bindings: bindings.length > 0 ? bindings : undefined,
                        constraints: constraints && constraints.length > 0 ? constraints : undefined,
                        inferredState
                    }
                });

                // ── 逆参照インデックスの構築 ─────────────────────────
                // resolveIdentifiers で解決された識別子ごとに backrefIndex へ登録する。
                // context から className / operationName を取得できる場合のみ記録する。
                if (bindings.length > 0 && context) {
                    const className: string = context.name ?? '';
                    const operationName: string =
                        context._currentOperationName ?? context.operations?.[0]?.name ?? '';
                    for (const identifierName of bindings) {
                        const entry: WorkflowBackref = {
                            nodeId: newId,
                            scenarioName: currentScenarioName,
                            className,
                            operationName,
                            stepKeyword: keyword,
                            stepText: text,
                        };
                        const existing = this.backrefIndex.get(identifierName);
                        if (existing) {
                            existing.push(entry);
                        } else {
                            this.backrefIndex.set(identifierName, [entry]);
                        }
                    }
                }

                const isFirstStep = lastNodeId === startId;
                const edgeCondition = isFirstStep ? currentScenarioName : null;
                const edgeSrcs = isFirstStep && currentSrcs.length > 0 ? currentSrcs : undefined;
                edges.push({ from: lastNodeId!, to: newId, condition: edgeCondition, srcs: edgeSrcs });

                lastNodeId = newId;
                currentY += STEP_Y;
                if (currentY > maxY) maxY = currentY;
            }
            i++;
        }

        if (lastNodeId && lastNodeId !== startId) {
            edges.push({ from: lastNodeId, to: endId });
        }
        endNode.x = 200 + (currentX - 200) / 2;
        endNode.y = maxY + 20;
        nodes.push(endNode);

        return {
            workflow: { nodes, edges },
            endIndex: i - 1,
        };
    }

    private resolveIdentifiers(text: string, context?: any): string[] {
        const found: string[] = [];
        if (!context) return found;

        // メンバ名・操作名を収集
        const members = context.members?.map((m: any) => m.name) || [];
        const operations = context.operations?.map((op: any) => op.name) || [];
        const allIdentifiers = [...members, ...operations];

        // 正規化済みテキストでも検索（語尾変化を除去）
        const normalizedText = this.normalizeNoun(text);

        for (const id of allIdentifiers) {
            // 元テキスト、または正規化後テキストのどちらかにマッチすれば採用
            if (text.includes(id) || normalizedText.includes(id)) {
                found.push(id);
                continue;
            }
        }

        // エイリアス経由の解決（"受注金額" → "orderAmount" 等）
        for (const [alias, realName] of this.aliases.entries()) {
            if ((text.includes(alias) || normalizedText.includes(alias))
                && allIdentifiers.includes(realName)
                && !found.includes(realName)) {
                found.push(realName);
            }
        }

        // 名詞辞書経由の解決（ドメインワードの揺れを吸収）
        for (const [dictKey, realName] of this.nounDictionary.entries()) {
            if (dictKey === realName) continue; // 自己参照はスキップ
            if ((text.includes(dictKey) || normalizedText.includes(dictKey))
                && allIdentifiers.includes(realName)
                && !found.includes(realName)) {
                found.push(realName);
            }
        }

        return found;
    }

    /**
     * テキストから制約を構造化して抽出する。
     * 形態素解析の代わりにルールベースのパターンマッチを使用。
     */
    private extractConstraints(text: string): StructuredConstraint[] {
        const constraints: StructuredConstraint[] = [];

        // ── 範囲制約: 「〜は〜以上」「〜が〜未満」等 ──
        const rangePattern = /([^\s、。,]+(?:は|が))([^\s、。,]+)(?:の)?(以上|以下|未満|超|超過)/g;
        let m: RegExpExecArray | null;
        while ((m = rangePattern.exec(text)) !== null) {
            const subject = m[1].replace(/[はが]$/, '');
            constraints.push({
                kind: 'range',
                subject: this.normalizeNoun(subject),
                operator: m[3],
                value: m[2],
                raw: m[0],
            });
        }

        // ── 等値制約: 「〜が〜であること」「〜は〜と等しい」「〜に一致する」──
        const eqPattern = /([^\s、。,]+(?:は|が))([^\s、。,]+)(?:に|と)?(であること|等しい|一致する|である)/g;
        while ((m = eqPattern.exec(text)) !== null) {
            const subject = m[1].replace(/[はが]$/, '');
            constraints.push({
                kind: 'equality',
                subject: this.normalizeNoun(subject),
                operator: m[3],
                value: m[2],
                raw: m[0],
            });
        }

        // ── 状態制約: 「〜状態」「〜済み」「〜中」「〜完了」「〜待ち」──
        const statePattern = /([^\s、。,]+(?:が|は|の))([^\s、。,]+(?:状態|済み|中|完了|待ち))/g;
        while ((m = statePattern.exec(text)) !== null) {
            const subject = m[1].replace(/[がはの]$/, '');
            constraints.push({
                kind: 'state',
                subject: this.normalizeNoun(subject),
                operator: '状態',
                value: m[2],
                raw: m[0],
            });
        }

        // ── 存在制約: 「〜が存在する」「〜がnullでない」等 ──
        const existPattern = /([^\s、。,]+)(?:が|は)(存在する|nullでない|空でない|設定されている|登録済み)/g;
        while ((m = existPattern.exec(text)) !== null) {
            constraints.push({
                kind: 'existence',
                subject: this.normalizeNoun(m[1]),
                operator: m[2],
                value: '',
                raw: m[0],
            });
        }

        return constraints;
    }

    /**
     * テキストから状態名を推論する。
     * 「〜状態」「〜済み」「〜中」「〜完了」「〜待ち」のパターンを検出する。
     */
    private inferState(text: string): string | undefined {
        const stateMatch = text.match(/([^\s、。,]+(?:状態|済み|中|完了|待ち|確認済|未確認|保留))/);
        if (stateMatch) return stateMatch[1];

        // 英語キーワードも対応
        const engStateMatch = text.match(/\b(pending|confirmed|cancelled|processing|completed|draft|active|inactive)\b/i);
        return engStateMatch ? engStateMatch[1].toLowerCase() : undefined;
    }

    /**
     * 名詞の正規化（形態素解析の代替）。
     * 語尾変化パターン（する→、された→、されている→等）を除去し
     * 辞書形に近い形へ変換する。
     *
     * 優先度順:
     *   1. alias マップ直接マッチ（「受注金額」→「orderAmount」等）
     *   2. 名詞辞書マッチ（DSLから収集した識別子群）
     *   3. 語尾変化ルール（正規表現による除去）
     */
    private normalizeNoun(text: string): string {
        // Step 1: alias マップ直接置換
        for (const [alias, realName] of this.aliases.entries()) {
            if (text.includes(alias)) {
                text = text.replace(new RegExp(alias, 'g'), realName);
            }
        }

        // Step 2: 語尾変化ルールを適用
        const suffixRules: [RegExp, string][] = [
            [/する$/, ''],      // 注文する → 注文
            [/した$/, ''],      // 確認した → 確認
            [/された$/, ''],      // 処理された → 処理
            [/されている$/, ''],      // 登録されている → 登録
            [/している$/, ''],      // 処理している → 処理
            [/できる$/, ''],      // 注文できる → 注文
            [/できない$/, 'できない'], // 変更できない はそのまま保持
            [/である$/, ''],      // 有効である → 有効
            [/であった$/, ''],      // 有効であった → 有効
            [/ている$/, ''],      // 待っている → 待
            [/ている $/, ''],
        ];

        // Step 3: 句読点・助詞の除去（後続パターンマッチを助けるため）
        text = text
            .replace(/[、。,.！!？?]/g, ' ')
            .replace(/\b(は|が|を|に|で|と|の|も|から|まで|へ)\b/g, ' ')
            .trim();

        for (const [pattern, replacement] of suffixRules) {
            // テキスト全体の末尾に適用
            text = text.replace(pattern, replacement);
        }

        return text;
    }

    private parseParameters(raw: string): OperationParameter[] {
        if (!raw.trim()) return [];
        return raw
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => {
                const colonIdx = p.lastIndexOf(":");
                if (colonIdx === -1) {
                    return { id: createId(), name: p.trim(), type: "any" };
                }
                return {
                    id: createId(),
                    name: p.slice(0, colonIdx).trim(),
                    type: p.slice(colonIdx + 1).trim(),
                };
            });
    }

    // ============================================================
    // CLI Suggestion Generator
    // ============================================================

    /**
     * パース結果を元にCLI提案リストを生成する。
     *
     * 検出ルール:
     *   1. 操作の返却型が "any" または "void" で、かつ逆参照が多い → コード生成を提案
     *   2. Gherkin の Given 節で状態が推論されているのに、対応するメンバがない → メンバ追加を提案
     *   3. 操作がある一方で、対応するリレーションが存在しない → リレーション追加を提案
     *   4. backrefIndex に多数の参照があるクラス → コード生成の優先候補として提案
     *   5. 操作パラメータの型が "any" → 型の明示化を提案
     */
    private generateCliSuggestions(
        classes: ParsedClass[],
        relations: ParsedRelation[],
    ): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [];

        for (const cls of classes) {
            // ── 提案1: 逆参照数が多いクラスはコード生成優先候補 ──
            // generate-code は副作用なし（ファイル出力のみ）→ dryRun 不要
            let totalBackrefs = 0;
            for (const member of cls.members) {
                totalBackrefs += this.backrefIndex.get(member.name)?.length ?? 0;
            }
            for (const op of cls.operations) {
                totalBackrefs += this.backrefIndex.get(op.name)?.length ?? 0;
            }
            if (totalBackrefs >= 2) {
                suggestions.push({
                    kind: 'generate-code',
                    command: `generate-code --class ${cls.name}`,
                    reason: `${cls.name} は ${totalBackrefs} 件のシナリオから参照されています。コード生成の優先候補です。`,
                    className: cls.name,
                    priority: 80 + totalBackrefs,
                    dryRun: false,
                });
            }

            // ── 提案2: anyパラメータを持つ操作 → 型の明示化 ──
            // モデルを直接書き換えるため dryRun: true でプレビューを挟む
            for (const op of cls.operations) {
                const anyParams = op.parameters.filter((p: any) => p.type === 'any');
                for (const param of anyParams) {
                    suggestions.push({
                        kind: 'add-member',
                        command: `edit-param --class ${cls.name} --op ${op.name} --param ${param.name} --type <type>`,
                        reason: `${cls.name}.${op.name}() のパラメータ "${param.name}" の型が未指定です。`,
                        className: cls.name,
                        identifierName: op.name,
                        priority: 60,
                        dryRun: true,
                    });
                }
            }

            // ── 提案3: 状態名メンバが存在しない → add-member を提案 ──
            // メンバ追加はモデル変更なので dryRun: true
            const memberNames = new Set(cls.members.map(m => m.name));
            for (const [, backrefs] of this.backrefIndex.entries()) {
                const isForThisClass = backrefs.some(r => r.className === cls.name);
                if (!isForThisClass) continue;

                const stateBackrefs = backrefs.filter(r =>
                    r.stepKeyword.match(/^(Given|前提)$/i) &&
                    r.className === cls.name
                );
                for (const ref of stateBackrefs) {
                    const inferredState = this.inferState(ref.stepText);
                    if (inferredState && !memberNames.has('status') && !memberNames.has('state')) {
                        suggestions.push({
                            kind: 'add-member',
                            command: `add-member --class ${cls.name} --name status --type ${cls.name}Status`,
                            reason: `シナリオ "${ref.scenarioName}" で "${inferredState}" という状態が言及されていますが、statusメンバが存在しません。`,
                            className: cls.name,
                            priority: 70,
                            dryRun: true,
                        });
                        break;
                    }
                }
            }

            // ── 提案4: リレーション未定義 → add-relation を提案 ──
            // リレーション追加はモデル変更なので dryRun: true
            for (const op of cls.operations) {
                const returnType = op.returnType?.replace(/\[\]$/, '');
                if (!returnType || returnType === 'void' || returnType === 'any') continue;
                const targetExists = classes.some(c => c.name === returnType);
                if (!targetExists) continue;

                const hasRelation = relations.some(r =>
                    (r.source === cls.name && r.target === returnType) ||
                    (r.source === returnType && r.target === cls.name)
                );
                if (!hasRelation) {
                    suggestions.push({
                        kind: 'add-relation',
                        command: `add-relation --from ${cls.name} --to ${returnType} --type dependency`,
                        reason: `${cls.name}.${op.name}() が ${returnType} を返しますが、リレーションが定義されていません。`,
                        className: cls.name,
                        identifierName: op.name,
                        priority: 50,
                        dryRun: true,
                    });
                }
            }
        }

        // ── リファクタリング提案（RefactorSuggesterに委譲）──────────
        // refactor 系はすべて副作用大のため dryRun: true を付与してから追加
        const refactorSuggestions = new RefactorSuggester().suggest(classes, relations)
            .map(s => ({ ...s, dryRun: true }));
        suggestions.push(...refactorSuggestions);

        return suggestions.sort((a, b) => b.priority - a.priority);
    }
}