/**
 * DslParser.ts
 *
 * DSL文字列を解析してClassDiagramServiceを通じてDomainModelを更新するパーサー。
 * DomainModelへの直接アクセスは行わず、すべてServiceのapplyFromCliメソッド経由で操作する。
 *
 * 対応DSL構文:
 *   class/interface/struct 定義
 *   extends / implements
 *   メンバ: [+/-/#] name: Type[multiplicity] [composition|aggregation]
 *   メソッド: [+/-/#] name(param: Type, ...): ReturnType
 */

import type { ClassMember, ClassOperation, OperationParameter, Visibility, MemberRelationshipType } from './class-diagram-types'
import { createId } from './class-diagram-types'
import { ClassDiagramService } from './application/ClassDiagramService'
import type { AddTypeInput, AddMemberInput, AddOperationInput, AddParameterInput, SetBaseInput, AddInterfaceImplInput } from './application/dtos'

/* ============================
   パースエラー
============================ */

export class DslParseError extends Error {
    constructor(
        message: string,
        public readonly line: number,
        public readonly source: string,
    ) {
        super(`[Line ${line}] ${message}\n  > ${source}`)
        this.name = 'DslParseError'
    }
}

/* ============================
   内部中間表現
============================ */

interface ParsedClass {
    name: string
    kind: 'class' | 'interface' | 'struct'
    baseClassName: string | null
    interfaceNames: string[]
    members: ParsedMember[]
    operations: ParsedOperation[]
}

interface ParsedMember {
    visibility: Visibility
    name: string
    type: string
    sourceMultiplicity: string
    targetMultiplicity: string
    relationship: MemberRelationshipType
}

interface ParsedOperation {
    visibility: Visibility
    name: string
    parameters: ParsedParameter[]
    returnType: string
}

interface ParsedParameter {
    name: string
    type: string
}

/* ============================
   パーサー本体
============================ */

export class DslParser {

    /**
     * DSL文字列を解析してClassDiagramServiceに適用する。
     * Serviceの既存モデルに対して差分で追加される。
     */
    parse(dsl: string, service: ClassDiagramService): void {
        const parsedClasses = this.parseText(dsl)
        this.applyToService(parsedClasses, service)
    }

    /* ----------------------------
       テキスト解析
    ---------------------------- */

    private parseText(dsl: string): ParsedClass[] {
        const lines = dsl.split('\n')
        const results: ParsedClass[] = []

        let i = 0
        while (i < lines.length) {
            const line = lines[i].trim()

            // コメント・空行スキップ
            if (!line || line.startsWith('//')) {
                i++
                continue
            }

            // class / interface / struct ブロックの開始
            const blockHeader = this.matchBlockHeader(line)
            if (blockHeader) {
                const { parsed, nextIndex } = this.parseBlock(lines, i, blockHeader)
                results.push(parsed)
                i = nextIndex
                continue
            }

            i++
        }

        return results
    }

    /**
     * "class Foo extends Bar implements Baz, Qux {" の形式にマッチ
     */
    private matchBlockHeader(line: string): Omit<ParsedClass, 'members' | 'operations'> | null {
        const pattern = /^(class|interface|struct)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/
        const match = line.match(pattern)
        if (!match) return null

        const kind = match[1] as 'class' | 'interface' | 'struct'
        const name = match[2]
        const baseClassName = match[3] ?? null
        const interfaceNames = match[4]
            ? match[4].split(',').map(s => s.trim()).filter(Boolean)
            : []

        return { name, kind, baseClassName, interfaceNames }
    }

    /**
     * ブロック内を解析してParsedClassを生成
     */
    private parseBlock(
        lines: string[],
        startIndex: number,
        header: Omit<ParsedClass, 'members' | 'operations'>
    ): { parsed: ParsedClass; nextIndex: number } {
        const members: ParsedMember[] = []
        const operations: ParsedOperation[] = []

        let i = startIndex + 1
        while (i < lines.length) {
            const line = lines[i].trim()

            if (line === '}') {
                return {
                    parsed: { ...header, members, operations },
                    nextIndex: i + 1,
                }
            }

            // コメント・空行スキップ
            if (!line || line.startsWith('//')) {
                i++
                continue
            }

            if (line.includes('(')) {
                const op = this.parseOperationLine(line)
                if (op) operations.push(op)
            } else {
                const member = this.parseMemberLine(line)
                if (member) members.push(member)
            }

            i++
        }

        // '}' なしで終了した場合もパース結果を返す
        return {
            parsed: { ...header, members, operations },
            nextIndex: i,
        }
    }

    /**
     * フィールド行をパース
     * [+/-/#] name: Type[multiplicity] [composition|aggregation]
     */
    private parseMemberLine(line: string): ParsedMember | null {
        const { visibility, rest } = this.extractVisibility(line)

        let relationship: MemberRelationshipType = 'auto'
        let body = rest

        if (body.endsWith('composition')) {
            relationship = 'composition'
            body = body.slice(0, -'composition'.length).trim()
        } else if (body.endsWith('aggregation')) {
            relationship = 'aggregation'
            body = body.slice(0, -'aggregation'.length).trim()
        }

        const colonIdx = body.indexOf(':')
        if (colonIdx === -1) return null

        const name = body.slice(0, colonIdx).trim()
        const typeWithMult = body.slice(colonIdx + 1).trim()

        // Type[multiplicity] の形式
        const multMatch = typeWithMult.match(/^(.+?)\[([^\]]+)\]$/)
        let type: string
        let targetMultiplicity: string
        let sourceMultiplicity: string

        if (multMatch) {
            type = multMatch[1].trim()
            targetMultiplicity = multMatch[2].trim()
            sourceMultiplicity = '1'
        } else {
            type = typeWithMult
            targetMultiplicity = '1'
            sourceMultiplicity = '1'
        }

        return { visibility, name, type, sourceMultiplicity, targetMultiplicity, relationship }
    }

    /**
     * メソッド行をパース
     * [+/-/#] name(param: Type, ...): ReturnType
     */
    private parseOperationLine(line: string): ParsedOperation | null {
        const { visibility, rest } = this.extractVisibility(line)

        const pattern = /^(\w+)\(([^)]*)\)\s*:\s*(.+)$/
        const match = rest.match(pattern)
        if (!match) return null

        const name = match[1]
        const paramsRaw = match[2].trim()
        const returnType = match[3].trim()

        const parameters: ParsedParameter[] = []
        if (paramsRaw) {
            for (const param of paramsRaw.split(',')) {
                const parts = param.trim().split(':')
                if (parts.length !== 2) continue
                parameters.push({
                    name: parts[0].trim(),
                    type: parts[1].trim(),
                })
            }
        }

        return { visibility, name, parameters, returnType }
    }

    /**
     * 可視性プレフィックスを抽出
     */
    private extractVisibility(line: string): { visibility: Visibility; rest: string } {
        const visibilityMap: Record<string, Visibility> = {
            '+': 'public',
            '-': 'private',
            '#': 'protected',
            '~': 'package',
        }
        if (visibilityMap[line[0]]) {
            return { visibility: visibilityMap[line[0]], rest: line.slice(1).trim() }
        }
        return { visibility: 'public', rest: line.trim() }
    }

    /* ----------------------------
       ServiceへのApply
    ---------------------------- */

    private applyToService(parsedClasses: ParsedClass[], service: ClassDiagramService): void {
        // --- Pass 1: クラス本体・メンバ・メソッドの登録 ---
        for (const pc of parsedClasses) {
            // クラス登録（getOrCreateCliで既存クラスも安全に扱える）
            const addTypeInput: AddTypeInput = {
                name: pc.name,
                kind: pc.kind,
            }
            service.addTypeFromCli(addTypeInput)

            // メンバ追加
            for (const pm of pc.members) {
                const member: ClassMember = {
                    id: createId(),
                    name: pm.name,
                    type: pm.type,
                    visibility: pm.visibility,
                    isStatic: false,
                    isAbstract: false,
                    relationship: pm.relationship,
                    sourceMultiplicity: pm.sourceMultiplicity,
                    targetMultiplicity: pm.targetMultiplicity,
                }
                const addMemberInput: AddMemberInput = {
                    className: pc.name,
                    member,
                }
                service.addMemberFromCli(addMemberInput)
            }

            // オペレーション追加（パラメータなしで先に登録）
            for (const po of pc.operations) {
                const operation: ClassOperation = {
                    id: createId(),
                    name: po.name,
                    returnType: po.returnType,
                    visibility: po.visibility,
                    isStatic: false,
                    isAbstract: false,
                    parameters: [],
                }
                const addOpInput: AddOperationInput = {
                    className: pc.name,
                    operation,
                }
                service.applyAddOperation(addOpInput)

                // パラメータ追加
                for (const pp of po.parameters) {
                    const parameter: OperationParameter = {
                        id: createId(),
                        name: pp.name,
                        type: pp.type,
                    }
                    const addParamInput: AddParameterInput = {
                        className: pc.name,
                        operationName: po.name,
                        parameter,
                    }
                    service.applyAddParameter(addParamInput)
                }
            }
        }

        // --- Pass 2: 継承・実装関係の解決 ---
        // すべてのクラスが登録された後に名前解決する
        for (const pc of parsedClasses) {
            // extends
            if (pc.baseClassName) {
                const setBaseInput: SetBaseInput = {
                    className: pc.name,
                    baseClassName: pc.baseClassName,
                }
                service.setBaseFromCli(setBaseInput)
            }

            // implements
            for (const ifName of pc.interfaceNames) {
                const addIfaceInput: AddInterfaceImplInput = {
                    className: pc.name,
                    interfaceName: ifName,
                }
                service.addInterfaceImplFromCli(addIfaceInput)
            }
        }
    }
}