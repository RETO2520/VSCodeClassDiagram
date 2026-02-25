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
    private aliases: Map<string, string> = new Map();

    /**
     * DSL文字列をパースして ParsedDsl を返す。
     */
    parse(source: string, service: ClassDiagramService): ParsedDsl {
        const classes: ParsedClass[] = [];
        const relations: ParsedRelation[] = [];
        const features: GherkinFeature[] = [];
        this.aliases.clear();

        let current: ParsedClass | null = null;

        const lines = source.split("\n").map(l => l.trimEnd());

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

            for (const operation of cls.operations) {
                const opLineIndex = lines.findIndex(l => l.includes(`${operation.name}(`));

                service.applyAddOperation({
                    className: cls.name,
                    operation,
                });
                if (opLineIndex !== -1 && classInfo) {
                    for (let j = opLineIndex + 1; j < lines.length; j++) {
                        const nextLine = lines[j].trim();
                        if (!nextLine) continue;
                        if (nextLine.match(/^[+\-#~]|class|interface|struct/)) break;

                        if (nextLine.match(/^(?:Scenario|シナリオ):/i)) {
                            const c = service.getClassByName(cls.name);
                            if (!c) break;
                            const op = service.getOperationByName(cls.name, operation.name);
                            if (!op) break;

                            const result = this.parseGherkinToWorkflow(lines, j, classInfo);
                            service.applyUpdateOperationWorkflow({
                                classId: c.id,
                                operationId: op.id,
                                workflow: result.workflow,
                            });
                            break;
                        }
                    }
                }

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

        return { classes, relations, features };
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

        // メンバ名を収集
        const members = context.members?.map((m: any) => m.name) || [];
        const operations = context.operations?.map((op: any) => op.name) || [];
        const allIdentifiers = [...members, ...operations];

        // エイリアスを考慮してテキスト内を検索
        for (const id of allIdentifiers) {
            if (text.includes(id)) {
                found.push(id);
            }
        }

        for (const [alias, realName] of this.aliases.entries()) {
            if (text.includes(alias) && allIdentifiers.includes(realName)) {
                if (!found.includes(realName)) {
                    found.push(realName);
                }
            }
        }

        return found;
    }

    private extractConstraints(text: string): string[] {
        const constraints: string[] = [];
        // 「～が～であること」「～は～以上」などのパターンを抽出（簡易実装）
        const pattern = /([^\s、。]+(?:が|は)[^\s、。]+(?:であること|以上|以下|未満|等しい|一致))/g;
        let m;
        while ((m = pattern.exec(text)) !== null) {
            constraints.push(m[1]);
        }
        return constraints;
    }

    private inferState(text: string): string | undefined {
        // 「～状態」「～済み」「～中」などのキーワードから状態を推論
        const stateMatch = text.match(/([^\s、。]+(?:状態|済み|中|完了|待ち))/);
        return stateMatch ? stateMatch[1] : undefined;
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