/**
 * DslLinter.ts
 *
 * DSLのクラス構造に対する静的解析モジュール。
 *
 * WorkflowLinter.ts がシナリオ順序を解析するのに対し、
 * こちらはクラス定義の構造的な問題を検出する。
 *
 * vscode / Node.js 固有 API への依存なし。フロントエンドから直接使用可能。
 *
 * Usage:
 *   import { lintDsl } from '@/lib/DslLinter'
 *   import type { DslLintWarning } from '@/lib/DslLinter'
 */

// ============================================================
// 型定義（ParsedClass の最小構造）
// ============================================================

/** DslLinter が必要とする ParsedClass の最小構造 */
export interface LintClass {
    name: string
    kind: 'class' | 'interface' | 'struct'
    isAbstract: boolean
    extendsName: string | null
    implementsNames: string[]
}

// ============================================================
// 警告型
// ============================================================

export interface DslLintWarning {
    /** 警告の種別 */
    code:
    | 'UNKNOWN_EXTENDS'       // extends で存在しないクラスを参照
    | 'UNKNOWN_IMPLEMENTS'    // implements で存在しないインターフェースを参照
    | 'CIRCULAR_INHERITANCE'  // 循環継承 (extends チェーン)
    | 'CIRCULAR_IMPLEMENTS'   // 循環実装 (implements チェーン)
    /** 人間向けメッセージ */
    message: string
    /** 警告の主体となるクラス名 */
    className: string
    /** 参照先の型名（存在しない型参照の場合） */
    refName?: string
    /** 循環のパス（循環継承の場合）例: ["A", "B", "C", "A"] */
    cycle?: string[]
}

// ============================================================
// lintDsl
// ============================================================

/**
 * DSL のクラス定義群を静的解析して警告を返す。
 *
 * 検出パターン:
 *   UNKNOWN_EXTENDS      — extends で DSL 内に存在しないクラスを参照
 *   UNKNOWN_IMPLEMENTS   — implements で DSL 内に存在しないインターフェースを参照
 *   CIRCULAR_INHERITANCE — extends チェーンにサイクルがある
 *   CIRCULAR_IMPLEMENTS  — implements チェーンにサイクルがある（インターフェース間）
 */
export function lintDsl(classes: LintClass[]): DslLintWarning[] {
    const warnings: DslLintWarning[] = []
    const nameSet = new Set(classes.map(c => c.name))

    // ── 検出1 & 2: 存在しない型参照 ──────────────────────────
    for (const cls of classes) {
        // extends
        if (cls.extendsName) {
            if (!nameSet.has(cls.extendsName)) {
                warnings.push({
                    code: 'UNKNOWN_EXTENDS',
                    message: `"${cls.name}" が存在しないクラス "${cls.extendsName}" を extends しています。`,
                    className: cls.name,
                    refName: cls.extendsName,
                })
            }
        }

        // implements
        for (const iName of cls.implementsNames) {
            if (!nameSet.has(iName)) {
                warnings.push({
                    code: 'UNKNOWN_IMPLEMENTS',
                    message: `"${cls.name}" が存在しないインターフェース "${iName}" を implements しています。`,
                    className: cls.name,
                    refName: iName,
                })
            }
        }
    }

    // ── 検出3: 循環継承（extends チェーン）────────────────────
    // 各クラスを起点に extends チェーンを辿り、自分に戻ってくるか確認する
    const extendsMap = new Map<string, string>()
    for (const cls of classes) {
        if (cls.extendsName && nameSet.has(cls.extendsName)) {
            extendsMap.set(cls.name, cls.extendsName)
        }
    }

    const checkedForCycle = new Set<string>()
    for (const cls of classes) {
        if (checkedForCycle.has(cls.name)) continue

        const path: string[] = []
        const visited = new Set<string>()
        let cur: string | null = cls.name

        while (cur && !visited.has(cur)) {
            visited.add(cur)
            path.push(cur)
            cur = extendsMap.get(cur) ?? null
        }

        if (cur && path.includes(cur)) {
            // cur がサイクルの入り口 — cycle はそこから始まる部分だけ切り出す
            const cycleStart = path.indexOf(cur)
            const cycle = [...path.slice(cycleStart), cur]

            // サイクルに含まれる全クラスを checkedForCycle に追加（重複警告を防ぐ）
            for (const name of cycle) checkedForCycle.add(name)

            warnings.push({
                code: 'CIRCULAR_INHERITANCE',
                message: `循環継承が検出されました: ${cycle.join(' → ')}`,
                className: cycle[0],
                cycle,
            })
        } else {
            for (const name of path) checkedForCycle.add(name)
        }
    }

    // ── 検出4: 循環実装（インターフェース間の extends チェーン）─
    // インターフェースが別のインターフェースを extends する場合のサイクル
    // （クラスの implements は非循環前提なので interface → interface のみ対象）
    const ifExtendsMap = new Map<string, string>()
    for (const cls of classes) {
        if (cls.kind === 'interface' && cls.extendsName && nameSet.has(cls.extendsName)) {
            ifExtendsMap.set(cls.name, cls.extendsName)
        }
    }

    const checkedIfCycle = new Set<string>()
    for (const cls of classes) {
        if (cls.kind !== 'interface') continue
        if (checkedIfCycle.has(cls.name)) continue

        const path: string[] = []
        const visited = new Set<string>()
        let cur: string | null = cls.name

        while (cur && !visited.has(cur)) {
            visited.add(cur)
            path.push(cur)
            cur = ifExtendsMap.get(cur) ?? null
        }

        if (cur && path.includes(cur)) {
            const cycleStart = path.indexOf(cur)
            const cycle = [...path.slice(cycleStart), cur]
            for (const name of cycle) checkedIfCycle.add(name)

            warnings.push({
                code: 'CIRCULAR_IMPLEMENTS',
                message: `インターフェース間の循環継承が検出されました: ${cycle.join(' → ')}`,
                className: cycle[0],
                cycle,
            })
        } else {
            for (const name of path) checkedIfCycle.add(name)
        }
    }

    return warnings
}