import { Command } from "./Command";
import { HandlerResult } from "../handler-registry";
import { DomainModel } from "../DomainModel";
import { CliCommandType } from "../CliParser";
import { postMessage } from "../../../frontend/src/bridge/vscode-bridge";

/**
 * ImportSpecDslCommand
 *
 * DSLファイル (.md) からクラス図モデルを生成するコマンド。
 * export-spec で出力したMarkdownをそのまま読み戻すことも、
 * 独自DSLを書くことも可能。
 *
 * Usage:
 *   import-spec-dsl <inputPath>
 *
 * Examples:
 *   import-spec-dsl ./spec.md
 *
 * DSL文法:
 *   class ClassName
 *   abstract class ClassName
 *   interface ClassName
 *   struct ClassName
 *     - fieldName: Type          # private メンバ
 *     + fieldName: Type          # public メンバ
 *     # fieldName: Type          # protected メンバ
 *     ~ fieldName: Type          # package メンバ
 *     + methodName(): ReturnType # public メソッド
 *     + methodName(param: Type): ReturnType
 *     extends BaseClassName
 *     implements InterfaceName, OtherInterface
 *
 *   # リレーション (クラス定義の外側に記述)
 *   SourceClass -> TargetClass
 *   SourceClass +> TargetClass   # 生成責務
 *   SourceClass *> TargetClass   # コンポジション
 */
export class ImportSpecDslCommand extends Command {
    readonly type: CliCommandType = "IMPORT_SPEC_DSL";

    constructor(raw: string) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {
        postMessage({ command: 'importSpecDsl' });
        //const source = fs.readFileSync(this.inputPath, "utf-8");

        //const parsed = parseDsl(source);



        const ev = { type: "IMPORT_SPEC_DSL" };
        return { model: model, events: [ev] } as any;
    }
}

// // ============================================================
// // DSL Parser
// // ============================================================

// interface ParsedClass {
//     name: string;
//     kind: ClassKind;
//     isAbstract: boolean;
//     members: ClassMember[];
//     operations: ClassOperation[];
//     extendsName: string | null;
//     implementsNames: string[];
// }

// interface ParsedRelation {
//     source: string;
//     target: string;
//     type: "association" | "aggregation" | "composition" | "dependency";
//     label?: string;
//     sourceMultiplicity?: string;
//     targetMultiplicity?: string;
// }

// interface ParsedDsl {
//     classes: ParsedClass[];
//     relations: ParsedRelation[];
// }

// function parseDsl(source: string): ParsedDsl {
//     const classes: ParsedClass[] = [];
//     const relations: ParsedRelation[] = [];

//     const lines = source
//         .split("\n")
//         .map((l) => l.trimEnd())
//         .filter((l) => {
//             // コメント行・空行・Markdownの仕様書セクション見出しは除外
//             const trimmed = l.trim();
//             return (
//                 trimmed !== "" &&
//                 !trimmed.startsWith("//") &&
//                 !trimmed.startsWith("#")
//             );
//         });

//     let current: ParsedClass | null = null;

//     for (const line of lines) {
//         const trimmed = line.trim();

//         // ---- クラス宣言 ----
//         const classDecl = matchClassDecl(trimmed);
//         if (classDecl) {
//             if (current) classes.push(current);
//             current = classDecl;
//             continue;
//         }

//         // ---- リレーション（クラス定義外でも内でも受け付ける）----
//         const rel = matchRelation(trimmed);
//         if (rel) {
//             relations.push(rel);
//             continue;
//         }

//         if (!current) continue;

//         // ---- extends ----
//         const extendsMatch = trimmed.match(/^extends\s+(\w+)$/);
//         if (extendsMatch) {
//             current.extendsName = extendsMatch[1];
//             continue;
//         }

//         // ---- implements ----
//         const implMatch = trimmed.match(/^implements\s+(.+)$/);
//         if (implMatch) {
//             current.implementsNames = implMatch[1]
//                 .split(",")
//                 .map((s) => s.trim())
//                 .filter(Boolean);
//             continue;
//         }

//         // ---- メンバ or 操作 ----
//         const member = matchMember(trimmed);
//         if (member) {
//             current.members.push(member);
//             continue;
//         }

//         const operation = matchOperation(trimmed);
//         if (operation) {
//             current.operations.push(operation);
//         }
//     }

//     if (current) classes.push(current);

//     return { classes, relations };
// }

// // ============================================================
// // Line Matchers
// // ============================================================

// function matchClassDecl(line: string): ParsedClass | null {
//     // abstract class Foo / class Foo / interface Foo / struct Foo
//     const m = line.match(
//         /^(abstract\s+)?(class|interface|struct)\s+(\w+)$/
//     );
//     if (!m) return null;

//     const isAbstract = !!m[1];
//     const kindRaw = m[2] as "class" | "interface" | "struct";

//     return {
//         name: m[3],
//         kind: kindRaw,
//         isAbstract,
//         members: [],
//         operations: [],
//         extendsName: null,
//         implementsNames: [],
//     };
// }

// function matchMember(line: string): ClassMember | null {
//     // +/-/#/~ [s|a] name: Type
//     // メソッドシグネチャ（括弧あり）は操作として除外
//     const m = line.match(
//         /^([+\-#~])\s*(?:(s|a)\s+)?(\w+)\s*:\s*(.+)$/
//     );
//     if (!m) return null;
//     if (line.includes("(")) return null; // 操作はmatchOperationへ

//     return {
//         id: createId(),
//         name: m[3],
//         type: m[4].trim(),
//         visibility: parseVisibility(m[1]),
//         isStatic: m[2] === "s",
//         isAbstract: m[2] === "a",
//         relationship: "auto",
//         sourceMultiplicity: "1",
//         targetMultiplicity: "1",
//     };
// }

// function matchOperation(line: string): ClassOperation | null {
//     // +/-/#/~ [s|a] methodName(params): ReturnType
//     const m = line.match(
//         /^([+\-#~])\s*(?:(s|a)\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(.+))?$/
//     );
//     if (!m) return null;

//     const parameters = parseParameters(m[4]);

//     return {
//         id: createId(),
//         name: m[3],
//         returnType: m[5]?.trim() ?? "void",
//         visibility: parseVisibility(m[1]),
//         parameters,
//         isStatic: m[2] === "s",
//         isAbstract: m[2] === "a",
//     };
// }

// function matchRelation(line: string): ParsedRelation | null {
//     // Source <symbol> Target [:label] [sourceMultiplicity targetMultiplicity]
//     const symbolMap: Record<string, ParsedRelation["type"]> = {
//         "->": "association",
//         "+>": "aggregation",
//         "*>": "composition",
//         "-/>": "dependency",
//     };

//     for (const [symbol, type] of Object.entries(symbolMap)) {
//         if (!line.includes(symbol)) continue;

//         const parts = line.split(symbol);
//         if (parts.length < 2) continue;

//         const source = parts[0].trim();
//         const rest = parts[1].trim();

//         // label と多重度のパース: "Target :label 1 *" など
//         const restMatch = rest.match(
//             /^(\w+)(?:\s+:(\S+))?(?:\s+(\S+)\s+(\S+))?$/
//         );
//         if (!restMatch) continue;

//         return {
//             source,
//             target: restMatch[1],
//             type,
//             label: restMatch[2],
//             sourceMultiplicity: restMatch[3],
//             targetMultiplicity: restMatch[4],
//         };
//     }

//     return null;
// }

// // ============================================================
// // Helpers
// // ============================================================

// function parseVisibility(symbol: string): Visibility {
//     switch (symbol) {
//         case "+": return "public";
//         case "-": return "private";
//         case "#": return "protected";
//         case "~": return "package";
//         default: return "public";
//     }
// }

// function parseParameters(raw: string): OperationParameter[] {
//     if (!raw.trim()) return [];
//     return raw
//         .split(",")
//         .map((p) => p.trim())
//         .filter(Boolean)
//         .map((p) => {
//             const colonIdx = p.lastIndexOf(":");
//             if (colonIdx === -1) {
//                 return { id: createId(), name: p.trim(), type: "any" };
//             }
//             return {
//                 id: createId(),
//                 name: p.slice(0, colonIdx).trim(),
//                 type: p.slice(colonIdx + 1).trim(),
//             };
//         });
// }