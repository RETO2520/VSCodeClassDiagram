import { Command } from "./Command";
import { HandlerResult } from "../handler-registry";
import { DomainModel } from "../DomainModel";
import { CliCommandType } from "../CliParser";
import { ClassDiagramService } from "../application/ClassDiagramService";
import {
    ClassInfo,
    ClassMember,
    ClassOperation,
    Relationship,
    RelationshipType,
    visibilitySymbol,
} from "../class-diagram-types";
import { postMessage } from "../../../frontend/src/bridge/vscode-bridge";

/**
 * ExportSpecCommand
 *
 * 現在のクラス図モデルからMarkdown仕様書を生成するコマンド。
 *
 * Usage:
 *   export-spec [<outputPath>]
 *
 * Examples:
 *   export-spec                  → stdout に出力
 *   export-spec ./spec.md        → ファイルに保存
 */
export class ExportSpecCommand extends Command {
    readonly type: CliCommandType = "EXPORT_SPEC";

    /** 出力先ファイルパス (undefined = stdout) */
    readonly outputPath: string | undefined;

    constructor(raw: string, outputPath?: string) {
        super(raw);
        this.outputPath = outputPath;
    }

    execute(model: DomainModel): HandlerResult {
        const service = new ClassDiagramService(model);
        const currentModel = service.getModel();

        const markdown = generateMarkdown(currentModel);
        let validationContent = "";
        //const validationContent = generateValidationMarkdown(currentModel);

        if (this.outputPath) {
            postMessage({
                command: 'exportMarkdown',
                payload: {
                    markdown: markdown.markdown,
                    validationContent: markdown.validationContent,
                    fileName: this.outputPath
                }
            });
        } else {
            postMessage({ command: 'log', level: 'info', text: markdown.markdown });
        }

        const ev = { type: 'EXPORT_SPEC' };
        return { success: true, model: currentModel, events: [] };
    }
}

// ============================================================
// Markdown Generator
// ============================================================

function generateMarkdown(model: DomainModel): { markdown: string, validationContent: string } {
    const classes = model.getClasses();
    const relationships = model.detectRelationships();

    const lines: string[] = [];

    // ---- ヘッダ ----
    lines.push("# クラス仕様書");
    lines.push("");
    lines.push(`> 生成日時: ${new Date().toLocaleString("ja-JP")}  `);
    lines.push(
        `> クラス数: ${model.getStats().totalClasses}  ` +
        `(class: ${model.getStats().classCount}, ` +
        `interface: ${model.getStats().interfaceCount}, ` +
        `struct: ${model.getStats().structCount})`
    );
    lines.push("");

    // ---- 目次 ----
    lines.push("## 目次");
    lines.push("");
    lines.push("1. [クラス一覧](#クラス一覧)");
    lines.push("2. [リレーションシップ一覧](#リレーションシップ一覧)");
    lines.push("3. [クラス詳細](#クラス詳細)");
    lines.push("");

    // ---- クラス一覧 (サマリテーブル) ----
    lines.push("## クラス一覧");
    lines.push("");
    lines.push("| クラス名 | 種別 | 抽象 | メンバ数 | 操作数 |");
    lines.push("|----------|------|------|----------|--------|");
    for (const cls of classes) {
        const kind = kindLabel(cls);
        const isAbstract = cls.kind === "class" && cls.isAbstract ? "✔" : "-";
        lines.push(
            `| [${cls.name}](#${anchorId(cls.name)}) | ${kind} | ${isAbstract} | ${cls.members.length} | ${cls.operations.length} |`
        );
    }
    lines.push("");

    // ---- リレーションシップ一覧 ----
    lines.push("## リレーションシップ一覧");
    lines.push("");
    if (relationships.length === 0) {
        lines.push("_リレーションシップはありません。_");
    } else {
        lines.push("| 種別 | ソース | ターゲット | ラベル | 多重度 |");
        lines.push("|------|--------|------------|--------|--------|");
        for (const rel of relationships) {
            const src = model.findClassById(rel.sourceId);
            const tgt = model.findClassById(rel.targetId);
            const srcName = src?.name ?? rel.sourceId;
            const tgtName = tgt?.name ?? rel.targetId;
            const label = rel.label ?? "-";
            const multiplicity = formatMultiplicity(rel);
            lines.push(
                `| ${relationshipLabel(rel.type)} | ${srcName} | ${tgtName} | ${label} | ${multiplicity} |`
            );
        }
    }
    lines.push("");

    // ---- 依存グラフ ----
    lines.push("## 依存グラフ");
    lines.push("");
    lines.push(...renderDependencyGraph(classes, relationships, model));

    // ---- クラス詳細 ----
    lines.push("## クラス詳細");
    lines.push("");
    for (const cls of classes) {
        lines.push(...renderClass(cls, model));
    }

    const validationLines: string[] = [];

    // ---- バリデーション結果 ----
    validationLines.push("## バリデーション結果");
    validationLines.push("");
    validationLines.push(...renderValidation(model));

    return { markdown: lines.join("\n"), validationContent: validationLines.join("\n") };
}

// ============================================================
// Class Renderer
// ============================================================

function renderClass(cls: ClassInfo, model: DomainModel): string[] {
    const lines: string[] = [];
    const stereotype = stereotypeLabel(cls);

    lines.push(`### ${cls.name}`);
    lines.push("");
    if (stereotype) {
        lines.push(`**種別:** ${stereotype}`);
        lines.push("");
    }

    if (cls.baseClassId) {
        const base = model.findClassById(cls.baseClassId);
        if (base) {
            lines.push(`**継承:** \`${base.name}\``);
            lines.push("");
        }
    }

    if (cls.interfaces.length > 0) {
        const ifaceNames = cls.interfaces
            .map((id) => {
                const iface = model.findClassById(id);
                return iface ? `\`${iface.name}\`` : id;
            })
            .join(", ");
        lines.push(`**実装インターフェース:** ${ifaceNames}`);
        lines.push("");
    }

    if (cls.members.length > 0) {
        lines.push("#### メンバ（属性）");
        lines.push("");
        lines.push("| 可視性 | 名前 | 型 | static | abstract | 多重度 | リレーション |");
        lines.push("|--------|------|----|--------|----------|--------|--------------|");
        for (const m of cls.members) {
            lines.push(renderMemberRow(m));
        }
        lines.push("");
    }

    if (cls.operations.length > 0) {
        lines.push("#### 操作（メソッド）");
        lines.push("");
        for (const op of cls.operations) {
            lines.push(...renderOperation(op));
        }
        lines.push("");
    }

    lines.push("---");
    lines.push("");

    return lines;
}

// ============================================================
// Member / Operation Renderers
// ============================================================

function renderMemberRow(m: ClassMember): string {
    const vis = visibilitySymbol(m.visibility);
    const isStatic = m.isStatic ? "✔" : "-";
    const isAbstract = m.isAbstract ? "✔" : "-";
    const multiplicity =
        m.sourceMultiplicity || m.targetMultiplicity
            ? `${m.sourceMultiplicity ?? ""}..${m.targetMultiplicity ?? ""}`
            : "-";
    const rel = m.relationship === "auto" ? "auto" : m.relationship;
    return `| \`${vis}\` | \`${m.name}\` | \`${m.type}\` | ${isStatic} | ${isAbstract} | ${multiplicity} | ${rel} |`;
}

function renderOperation(op: ClassOperation): string[] {
    const lines: string[] = [];
    const vis = visibilitySymbol(op.visibility);
    const modifiers: string[] = [];
    if (op.isStatic) modifiers.push("static");
    if (op.isAbstract) modifiers.push("abstract");
    const modStr = modifiers.length > 0 ? ` _(${modifiers.join(", ")})_` : "";

    const params = op.parameters.map((p) => `${p.name}: ${p.type}`).join(", ");
    lines.push(`- \`${vis} ${op.name}(${params}): ${op.returnType}\`${modStr}`);

    if (op.parameters.length > 0) {
        for (const p of op.parameters) {
            lines.push(`  - \`${p.name}\`: \`${p.type}\``);
        }
    }

    // 戻り値の型が指定されている場合
    if (op.returnType) {
        lines.push(`  - **戻り値:** \`${op.returnType}\``);
    }

    // workflow部分の出力
    if (op.workflow) {
        // nodeとedgeから振る舞いを復元する
        const workflow = restoreWorkflow(op.workflow);
        for (const wf of workflow) {
            lines.push(`${wf}`);
        }
    }

    return lines;
}

/**
 * 振る舞いを復元し、Markdown形式の文章を返す
 * @param workflow 
 * @returns 
 */
function restoreWorkflow(workflow: {
    nodes: {
        id: string;
        type: string;
        label: string;
        x: number;
        y: number;
    }[];
    edges: {
        from: string;
        to: string;
        condition?: string | null | undefined;
        mid?: {
            x: number;
            y: number;
        } | undefined;
    }[]
}): string[] {
    const lines: string[] = [];
    const visitedNodes = new Set<string>(); // 出力済みノードの記録

    /**
     * ノードを起点にフローを文字列化する
     * @param nodeId 対象ノードID
     * @param depth インデントの深さ
     */
    function writeStory(nodeId: string, depth: number) {
        const node = workflow.nodes.find(n => n.id === nodeId);
        if (!node || visitedNodes.has(nodeId)) return; // 訪問済みなら抜ける

        visitedNodes.add(nodeId);
        const indent = "  ".repeat(depth);
        const outgoing = workflow.edges.filter(e => e.from === nodeId);

        // 1. まず自分自身のラベルを出す
        lines.push(`${indent}- **${node.label}**`);

        // 2. 次の行き先を探索
        for (const edge of outgoing) {
            const cond = edge.condition ? ` 【条件: ${edge.condition}】` : "";
            const targetNode = workflow.nodes.find(n => n.id === edge.to);

            if (targetNode) {
                // ここでは矢印と条件だけを出し、詳細は再帰先に任せる
                // lines.push(`${indent}  - →${cond} **${targetNode.label}**`); // ←ここを消すか、シンプルにする
                writeStory(edge.to, depth + 1);
            }
        }
    }

    function generateBehaviorTable(workflow: {
        nodes: {
            id: string;
            type: string;
            label: string;
            x: number;
            y: number;
        }[];
        edges: {
            from: string;
            to: string;
            condition?: string | null | undefined;
            mid?: { x: number; y: number } | undefined;
            srcs?: { label: string; url: string }[] | undefined;
        }[]
    }): string[] {
        const lines: string[] = [];

        // 1. ヘッダー
        lines.push("| No | 内容 (Step) | 条件 / 分岐 | 次のステップ |");
        lines.push("| --- | --- | --- | --- |");

        // ノードIDに番号を割り当て
        const nodeNum = new Map<string, number>();
        workflow.nodes.forEach((n: any, i: number) => nodeNum.set(n.id, i + 1));

        // 2. 各ノードの行を生成
        workflow.nodes.forEach((node: any) => {
            const currentNo = nodeNum.get(node.id);
            const outgoing = workflow.edges.filter((e: any) => e.from === node.id);

            if (outgoing.length === 0) {
                // 終端ノード
                lines.push(`| ${currentNo} | **${node.label}** | - | (終了) |`);
            } else {
                outgoing.forEach((edge: any, index: number) => {
                    const targetNo = nodeNum.get(edge.to) || "??";

                    // src: アノテーションがあればシナリオ名にMarkdownリンクを付与
                    let condition = edge.condition ? `${edge.condition}` : "-";
                    if (edge.condition && edge.srcs && edge.srcs.length > 0) {
                        const links = (edge.srcs as { label: string; url: string }[])
                            .map(s => `[${s.label}](${s.url})`)
                            .join(" ");
                        condition = `${edge.condition} ${links}`;
                    }

                    // 1つのノードから複数の分岐がある場合、2行目以降はNoとラベルを省略して見やすく
                    const displayNo = index === 0 ? currentNo : "";
                    const displayLabel = index === 0 ? `**${node.label}**` : " 〃 ";

                    lines.push(`| ${displayNo} | ${displayLabel} | ${condition} | ${targetNo} |`);
                });
            }
        });

        return lines;
    }

    const behaviorTable = generateBehaviorTable(workflow);
    lines.push("");
    lines.push("#### 振る舞い");
    lines.push("");
    lines.push(...behaviorTable);
    lines.push("");
    // 1. 開始地点（どこからも入ってこないノード）を特定
    // const startNodes = workflow.nodes.filter(n =>
    //     !workflow.edges.some(e => e.to === n.id)
    // );

    // if (startNodes.length === 0 && workflow.nodes.length > 0) {
    //     lines.push("> ⚠️ 循環構造のみで開始地点が見つかりません。");
    // }

    // // 2. ストーリー開始
    // for (const start of startNodes) {
    //     lines.push(`#### フロー開始: ${start.label}`);
    //     writeStory(start.id, 0);
    //     lines.push("---");
    // }
    // // ノードごとに処理
    // for (const node of workflow.nodes) {
    //     lines.push(`- **${node.label}**`);

    //     // このノードから出るエッジを抽出
    //     const outgoingEdges = workflow.edges.filter((e) => e.from === node.id);

    //     if (outgoingEdges.length === 0) {
    //         lines.push(`  - (終点)`);
    //     } else {
    //         for (const edge of outgoingEdges) {
    //             const targetNode = workflow.nodes.find((n) => n.id === edge.to);
    //             const targetLabel = targetNode ? targetNode.label : "不明";
    //             const condition = edge.condition ? ` [${edge.condition}]` : "";
    //             lines.push(`  - → **${targetLabel}**${condition}`);
    //         }
    //     }
    //     lines.push("");
    // }

    return lines;
}


// ============================================================
// Dependency Graph Renderer
// ============================================================

function renderDependencyGraph(
    classes: ClassInfo[],
    relationships: Relationship[],
    model: DomainModel
): string[] {
    const lines: string[] = [];

    // クラスごとに「依存先」と「被依存元」を集計
    const dependsOn = new Map<string, Set<string>>();   // このクラスが依存しているクラス
    const dependedBy = new Map<string, Set<string>>();  // このクラスに依存しているクラス

    for (const cls of classes) {
        dependsOn.set(cls.id, new Set());
        dependedBy.set(cls.id, new Set());
    }

    for (const rel of relationships) {
        dependsOn.get(rel.sourceId)?.add(rel.targetId);
        dependedBy.get(rel.targetId)?.add(rel.sourceId);
    }

    lines.push("| クラス名 | 依存先（uses） | 被依存元（used by） |");
    lines.push("|----------|----------------|---------------------|");

    for (const cls of classes) {
        const uses = [...(dependsOn.get(cls.id) ?? [])]
            .map((id) => model.findClassById(id)?.name ?? id)
            .join(", ") || "-";
        const usedBy = [...(dependedBy.get(cls.id) ?? [])]
            .map((id) => model.findClassById(id)?.name ?? id)
            .join(", ") || "-";
        lines.push(`| \`${cls.name}\` | ${uses} | ${usedBy} |`);
    }

    lines.push("");
    return lines;
}

// ============================================================
// Validation Renderer
// ============================================================

function renderValidation(model: DomainModel): string[] {
    const lines: string[] = [];
    const result = model.validate();

    const status = result.isValid ? "✅ **OK** — エラーなし" : "❌ **NG** — エラーあり";
    lines.push(status);
    lines.push("");

    if (result.errors.length > 0) {
        lines.push("### エラー");
        lines.push("");
        for (const err of result.errors) {
            lines.push(`- 🔴 ${err}`);
        }
        lines.push("");
    }

    if (result.warnings && result.warnings.length > 0) {
        lines.push("### 警告");
        lines.push("");
        for (const warn of result.warnings) {
            lines.push(`- 🟡 ${warn}`);
        }
        lines.push("");
    }

    if (result.errors.length === 0 && (!result.warnings || result.warnings.length === 0)) {
        lines.push("_問題は検出されませんでした。_");
        lines.push("");
    }

    return lines;
}

// ============================================================
// Helpers
// ============================================================

function kindLabel(cls: ClassInfo): string {
    switch (cls.kind) {
        case "class": return cls.isAbstract ? "Abstract Class" : "Class";
        case "interface": return "Interface";
        case "struct": return "Struct";
    }
}

function stereotypeLabel(cls: ClassInfo): string | null {
    if (cls.kind === "interface") return "«interface»";
    if (cls.kind === "struct") return "«struct»";
    if (cls.kind === "class" && cls.isAbstract) return "«abstract»";
    return null;
}

function relationshipLabel(type: RelationshipType): string {
    const map: Record<RelationshipType, string> = {
        association: "関連",
        aggregation: "集約",
        composition: "コンポジション",
        dependency: "依存",
        realization: "実現（implements）",
        generalization: "汎化（extends）",
    };
    return map[type] ?? type;
}

function formatMultiplicity(rel: Relationship): string {
    const src = rel.sourceMultiplicity;
    const tgt = rel.targetMultiplicity;
    if (!src && !tgt) return "-";
    return `${src ?? ""}..${tgt ?? ""}`;
}

function anchorId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, "-");
}