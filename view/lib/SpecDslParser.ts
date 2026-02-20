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
    type: "association" | "aggregation" | "composition" | "dependency";
    label?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
}

export interface ParsedDsl {
    classes: ParsedClass[];
    relations: ParsedRelation[];
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

        const lines = source
            .split("\n")
            .map((l) => l.trimEnd())
            .filter((l) => {
                // 空行・コメント行（// と #）を除外
                const trimmed = l.trim();
                return (
                    trimmed !== "" &&
                    !trimmed.startsWith("//") &&
                    !trimmed.startsWith("#")
                );
            });

        let current: ParsedClass | null = null;

        for (const line of lines) {
            const trimmed = line.trim();

            // ---- クラス宣言 ----
            const classDecl = this.matchClassDecl(trimmed);
            if (classDecl) {
                if (current) classes.push(current);
                current = classDecl;
                continue;
            }

            // ---- リレーション（クラス定義の外でも内でも受け付ける）----
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
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                continue;
            }

            // ---- メンバ or 操作 ----
            const member = this.matchMember(trimmed);
            if (member) {
                current.members.push(member);
                continue;
            }

            const operation = this.matchOperation(trimmed);
            if (operation) {
                current.operations.push(operation);
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
                service.applyAddOperation({
                    className: cls.name,
                    operation,
                });
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
            // service.applyAddRelationship({
            //     sourceClassName: rel.source,
            //     targetClassName: rel.target,
            //     type: rel.type,
            //     label: rel.label,
            //     sourceMultiplicity: rel.sourceMultiplicity,
            //     targetMultiplicity: rel.targetMultiplicity,
            // });
        }

        return { classes, relations };
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
        const symbolMap: Record<string, ParsedRelation["type"]> = {
            "-/>": "dependency",  // 長いものを先に評価
            "->": "association",
            "+>": "aggregation",
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