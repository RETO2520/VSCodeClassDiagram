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

export interface ParsedDsl {
    classes: ParsedClass[];
    relations: ParsedRelation[];
}
// UI側(WorkflowEditorPanel)と構造を合わせたローカルインターフェース
// インポートせずに、このファイル内でのパース用に使用します
interface LocalWFNode { id: string; type: string; label: string; x: number; y: number; }
interface LocalWFEdge { from: string; to: string; }
interface LocalWorkflow { nodes: LocalWFNode[]; edges: LocalWFEdge[]; }
// ============================================================
// Public Types
// ============================================================

// ... 既存の型 ...

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

export interface ParsedDsl {
    classes: ParsedClass[];
    relations: ParsedRelation[];
    features: GherkinFeature[]; // ← 追加: パースされたGherkinフィーチャー群
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

    /**
     * DSL文字列をパースして ParsedDsl を返す。
     */
    parse(source: string, service: ClassDiagramService): ParsedDsl {
        const classes: ParsedClass[] = [];
        const relations: ParsedRelation[] = [];
        const features: GherkinFeature[] = [];
        // const lines = source
        //     .split("\n")
        //     .map((l) => l.trimEnd())
        //     .filter((l) => {
        //         // 空行・コメント行（// と #）を除外
        //         const trimmed = l.trim();
        //         return (
        //             trimmed !== "" &&
        //             !trimmed.startsWith("//") &&
        //             !trimmed.startsWith("#")
        //         );
        //     });

        let current: ParsedClass | null = null;
        let lastOp: ClassOperation | null = null; // IDだけでなくオブジェクトを保持すると扱いやすいです

        const lines = source.split("\n").map(l => l.trimEnd()); // filterは後で行うためここではsplitのみ

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

            // ---- クラス宣言 ----
            const classDecl = this.matchClassDecl(trimmed);
            if (classDecl) {
                if (current) classes.push(current);
                current = classDecl;
                lastOp = null;
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

            // ---- Gherkin Scenario / ステップ行はスキップ（Pass2で処理）----
            // Scenario: / シナリオ: 行と Given/When/Then 等のステップ行は
            // Pass1では無視する（matchMember/matchOperation にマッチしないので
            // 元々スルーされるが、明示的にcontinueして意図を明確にする）
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
                lastOp = operation;
                continue;
            }
        }

        if (current) classes.push(current);

        // 既存モデルにマージするのではなく新規モデルとして構築
        ///const service = new ClassDiagramService(DomainModel.createEmpty());

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
            for (const operation of cls.operations) {
                // 操作の定義行を DSL から特定し、その直後の Scenario を探す
                const opLineIndex = lines.findIndex(l => l.includes(`${operation.name}(`));

                service.applyAddOperation({
                    className: cls.name,
                    operation,
                });
                if (opLineIndex !== -1) {
                    // 次の行から Scenario があるかチェック
                    for (let j = opLineIndex + 1; j < lines.length; j++) {
                        const nextLine = lines[j].trim();
                        if (!nextLine) continue;
                        // 別の定義が始まったら終了
                        if (nextLine.match(/^[+\-#~]|class|interface|struct/)) break;

                        if (nextLine.match(/^(?:Scenario|シナリオ):/i)) {
                            const c = service.getClassByName(cls.name);
                            if (!c) {
                                console.error(`[Parser] class not found: ${cls.name}`);
                                break;
                            }
                            const op = service.getOperationByName(cls.name, operation.name);
                            if (!op) {
                                console.error(`[Parser] operation not found: ${cls.name}.${operation.name}`);
                                break;
                            }
                            const result = this.parseGherkinToWorkflow(lines, j);
                            postMessage({ command: 'log', level: 'debug', text: `[Parser] applyUpdateOperationWorkflow: ${cls.name}.${operation.name} nodes=${result.workflow?.nodes?.length}` });
                            service.applyUpdateOperationWorkflow({
                                classId: c.id,
                                operationId: op.id,
                                workflow: result.workflow,
                            });
                            postMessage({ command: 'log', level: 'debug', text: `[Parser] done. op.workflow after update: ${cls.name}.${operation.name} nodes=${service.getOperationByName(cls.name, operation.name)?.workflow?.nodes?.length}` });
                            break;
                        }
                    }
                }
                //postMessage({ command: 'log', level: 'info', text: "operation:" + JSON.stringify(op) });




                for (const param of operation.parameters) {
                    service.applyAddParameter({
                        className: cls.name,
                        operationName: operation.name,
                        parameter: param,
                    });
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

        // Pass 4: 明示リレーションを追加
        for (const rel of relations) {
            // if (rel.type === "realization") {
            //     service.applyAddInterfaceImpl({
            //         className: rel.source,
            //         interfaceName: rel.target,
            //     });
            //     continue;
            // }

            // // それ以外は DesignGraphAggregate にエッジとして追加
            // const currentModel = service.getModel();
            // const srcClass = currentModel.findClassByName(rel.source);
            // const tgtClass = currentModel.findClassByName(rel.target);
            // if (!srcClass || !tgtClass) continue;

            // // ノードが未登録なら追加（ClassInfo.id をそのまま DesignNode.id として使う）
            // if (!graphModel.nodes[srcClass.id]) {
            //     switch (srcClass.kind) {
            //         case "class":
            //             graphModel = graphModel.addNode({ id: srcClass.id, kind: "class", name: srcClass.name });
            //             break;
            //         case "interface":
            //             graphModel = graphModel.addNode({ id: srcClass.id, kind: "interface", name: srcClass.name });
            //             break;
            //         case "struct":
            //             graphModel = graphModel.addNode({ id: srcClass.id, kind: "struct", name: srcClass.name });
            //             break;
            //     }
            // }
            // if (!graphModel.nodes[tgtClass.id]) {
            //     switch (tgtClass.kind) {
            //         case "class":
            //             graphModel = graphModel.addNode({ id: tgtClass.id, kind: "class", name: tgtClass.name });
            //             break;
            //         case "interface":
            //             graphModel = graphModel.addNode({ id: tgtClass.id, kind: "interface", name: tgtClass.name });
            //             break;
            //         case "struct":
            //             graphModel = graphModel.addNode({ id: tgtClass.id, kind: "struct", name: tgtClass.name });
            //             break;
            //     }
            // }
            // graphModel = graphModel.addEdge({
            //     id: `${srcClass.id}:${tgtClass.id}:${rel.type}`,
            //     from: srcClass.id,
            //     to: tgtClass.id,
            //     kind: RELATION_TO_EDGE_KIND[rel.type],
            //     metadata: {
            //         relationType: rel.type,
            //         label: rel.label,
            //         sourceMultiplicity: rel.sourceMultiplicity,
            //         targetMultiplicity: rel.targetMultiplicity,
            //     },
            // });
            // service.applyAddRelationship({
            //     sourceClassName: rel.source,
            //     targetClassName: rel.target,
            //     type: rel.type,
            //     label: rel.label,
            //     sourceMultiplicity: rel.sourceMultiplicity,
            //     targetMultiplicity: rel.targetMultiplicity,
            // });
        }

        return { classes, relations, features };
    }

    // ============================================================
    // Line Matchers
    // ============================================================

    private matchClassDecl(line: string): ParsedClass | null {
        // abstract class Foo / class Foo / interface Foo / struct Foo
        const m = line.match(
            /^(abstract\s+)?(class|interface|struct)\s+(\w+)$/
        );
        if (!m) return null;

        return {
            name: m[3],
            kind: m[2] as ClassKind,
            isAbstract: !!m[1],
            members: [],
            operations: [],
            extendsName: null,
            implementsNames: [],
        };
    }

    private matchMember(line: string): ClassMember | null {
        // +/-/#/~ [s|a] name: Type
        // 括弧を含む場合は操作として除外
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
        // +/-/#/~ [s|a] methodName(params): ReturnType
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
        // Source <symbol> Target [:label] [sourceMultiplicity targetMultiplicity]
        // CliParser と同じ記号セット。長いものを先に評価して誤マッチを防ぐ
        const symbolMap: Record<string, ParsedRelation["type"]> = {
            "-/>": "dependency",      // -/> を -> より先に評価
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

            // "Target :label 1 *" 形式
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
     *
     * 書式: Scenario: <name> src: <label> <url> [src: <label> <url> ...]
     * 例:   Scenario: ログイン成功 src: REQ-001 https://example.com/req#1
     *       Scenario: ログイン成功 src: REQ-001 ./docs/requirements.md#login
     */
    private parseScenarioLine(raw: string): {
        name: string
        srcs: { label: string; url: string }[]
    } {
        // src: 以降を切り出す
        const srcIdx = raw.search(/\bsrc:\s/)
        if (srcIdx === -1) return { name: raw.trim(), srcs: [] }

        const name = raw.slice(0, srcIdx).trim()
        const srcs: { label: string; url: string }[] = []

        // src: label url を繰り返しマッチ
        const srcRe = /\bsrc:\s+(\S+)\s+(\S+)/g
        let m: RegExpExecArray | null
        while ((m = srcRe.exec(raw)) !== null) {
            srcs.push({ label: m[1], url: m[2] })
        }
        return { name, srcs }
    }

    private parseGherkinToWorkflow(lines: string[], startIndex: number): {
        workflow: ClassOperation['workflow'],
        endIndex: number
    } {
        const nodes: NonNullable<ClassOperation['workflow']>['nodes'] = [];
        const edges: NonNullable<ClassOperation['workflow']>['edges'] = [];

        const STEP_Y = 80;
        let currentY = 60;
        let currentX = 200;
        const SCENARIO_WIDTH = 250;
        let lastNodeId: string | null = null;

        // startIndex 行は最初の "Scenario: ..." 行。
        // i = startIndex + 1 でその行自体をスキップするが、
        // スキップ前にシナリオ名と src: を取り出しておく。
        const firstScenarioLine = lines[startIndex]?.trim() ?? "";
        const firstParsed = this.parseScenarioLine(
            firstScenarioLine.replace(/^(?:Scenario|シナリオ):\s*/i, "")
        );
        let currentScenarioName = firstParsed.name;
        let currentSrcs = firstParsed.srcs;

        let i = startIndex + 1;

        // Start / End ノードを生成
        const startId = createId();
        const endId = createId();
        nodes.push({ id: startId, type: 'start', label: '開始', x: 200, y: currentY });
        const endNode = { id: endId, type: 'end', label: '終了', x: 200, y: 0 };

        lastNodeId = startId;
        currentY += STEP_Y;
        let maxY = 0;

        while (i < lines.length) {
            const trimmed = lines[i].trim();

            // 空行はスキップ
            if (trimmed === '') { i++; continue; }

            // ブロック終了条件: 次のクラス宣言 or 次のメンバ/操作定義
            if (
                trimmed.match(/^(abstract\s+)?(class|interface|struct)\b/) ||
                trimmed.match(/^[+\-#~]/)
            ) break;

            // 新しいシナリオの開始（英語・日本語両対応）
            if (trimmed.match(/^(?:Scenario|シナリオ):/i)) {
                // 前のシナリオの末尾を End に繋ぐ
                if (lastNodeId && lastNodeId !== startId) {
                    edges.push({ from: lastNodeId, to: endId });
                }
                const parsed = this.parseScenarioLine(
                    trimmed.replace(/^(?:Scenario|シナリオ):\s*/i, "")
                );
                currentScenarioName = parsed.name;
                currentSrcs = parsed.srcs;
                lastNodeId = startId;
                currentY = 140;
                currentX += SCENARIO_WIDTH;
                i++;
                continue;
            }

            // Gherkin ステップのパース
            const stepMatch = trimmed.match(/^(Given|When|Then|And|But|前提|もし|ならば|かつ|しかし)\s+(.+)$/i);
            if (stepMatch) {
                const keyword = stepMatch[1];
                const text = stepMatch[2].trim();
                const nodeType = /^(When|もし)$/i.test(keyword) ? 'decision' : 'process';

                const newId = createId();
                nodes.push({ id: newId, type: nodeType, label: `${keyword}: ${text}`, x: currentX, y: currentY });

                // start → 最初のステップ間のエッジに condition + srcs を付与
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

        // 最後のシナリオの末尾を End に繋ぐ
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
}