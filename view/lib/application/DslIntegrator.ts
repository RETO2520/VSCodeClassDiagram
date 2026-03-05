/**
 * DslIntegrator.ts
 *
 * ============================================================
 * 🎯 目的
 * ------------------------------------------------------------
 * - 複数の DSL ファイルを統合解析し、各コンポーネントへのクラス
 *   自動アサインとコンポーネント間依存関係の自動導出を行う。
 *
 * ============================================================
 * 🧠 設計方針
 * ------------------------------------------------------------
 * 1. 全クリア方式: DSL統合時に既存のクラスアサインを全てクリアし、
 *    DSLの解析結果から再構築する（syncFromDiagramFiles と同方針）
 * 2. SpecDslParser を利用してDSLをパースし、ClassDiagramService
 *    経由で DomainModel にクラスを登録する
 * 3. 各 DSL に含まれるクラスを、その DSL を参照するコンポーネント
 *    へ自動アサインする
 * 4. ComponentService.deriveAllRelationships() で依存を連鎖導出
 * 5. React依存を持たない純粋なドメインサービス
 *
 * ============================================================
 */

import { DomainModel } from '../DomainModel'
import { ComponentDomainModel } from '../ComponentDomainModel'
import { ComponentService, DeriveRelationshipsResult } from './ComponentService'
import { ClassDiagramService } from './ClassDiagramService'
import { SpecDslParser } from '../SpecDslParser'

// ============================================================
// 入力・出力型
// ============================================================

/** DSLファイルの内容を保持するエントリ */
export interface DslContentEntry {
    /** コンポーネントの dslPath に対応する相対パス */
    dslPath: string
    /** DSLファイルのテキスト内容 */
    content: string
}

/** DSL統合の結果 */
export interface IntegrationResult extends DeriveRelationshipsResult {
    /** DSL統合後のクラスドメインモデル */
    classDomain: DomainModel
    /** DSL統合後のコンポーネントドメインモデル */
    componentDomain: ComponentDomainModel
    /** 各DSLから抽出されたクラス名のマップ（デバッグ・表示用） */
    classNamesByDslPath: Map<string, string[]>
    /** 全層の孤立した根拠 */
    subsystemOrphaned: Array<{ relationshipId: string; orphanedIds: string[] }>
    applicationOrphaned: Array<{ relationshipId: string; orphanedIds: string[] }>
}

// ============================================================
// DslIntegrator
// ============================================================

export class DslIntegrator {

    /**
     * 複数 DSL ファイルの内容を統合解析し、コンポーネントへの
     * クラス自動アサインと依存関係の連鎖導出を行う。
     *
     * 処理フロー:
     * 1. 新規の ClassDiagramService + DomainModel を構築
     * 2. 各 DSL を SpecDslParser でパースし、クラスを DomainModel に登録
     * 3. dslPath が一致するコンポーネントを特定し、classIds にアサイン
     * 4. ComponentService.deriveAllRelationships() で依存を連鎖導出
     *
     * @param componentDomain 現在のコンポーネント階層モデル
     * @param dslContents DSLファイルの内容一覧
     * @returns 統合結果（新しいドメインモデルペア + 依存関係 + メタ情報）
     */
    static integrate(
        componentDomain: ComponentDomainModel,
        dslContents: DslContentEntry[]
    ): IntegrationResult {
        // Step 1: 新規の DomainModel と ClassDiagramService を構築
        const freshDomain = DomainModel.createEmpty()
        const service = new ClassDiagramService(freshDomain)
        const parser = new SpecDslParser()

        // Step 2: 各 DSL をパースし、パース前後のクラス名を記録
        const classNamesByDslPath = new Map<string, string[]>()

        for (const entry of dslContents) {
            const classesBefore = new Set(service.getModel().getClasses().map(c => c.name))

            // パース: ClassDiagramService のモデルにクラスが追加される
            parser.parse(entry.content, service)

            // パース後に追加されたクラス名を記録
            const classesAfter = service.getModel().getClasses()
            const newClassNames = classesAfter
                .filter(c => !classesBefore.has(c.name))
                .map(c => c.name)

            classNamesByDslPath.set(entry.dslPath, newClassNames)
        }

        // Step 3: コンポーネントの dslPath に基づいてクラスを自動アサイン
        let updatedClassDomain = service.getModel()
        let updatedComponentDomain = componentDomain

        // まず既存のクラスアサインを全クリア
        for (const comp of updatedComponentDomain.getComponents()) {
            if (comp.classIds.length > 0) {
                updatedComponentDomain = updatedComponentDomain.updateComponent({
                    ...comp,
                    classIds: [],
                })
            }
        }

        // DSL パスに基づいてクラスをアサイン
        for (const comp of updatedComponentDomain.getComponents()) {
            if (!comp.dslPath) continue

            const classNames = classNamesByDslPath.get(comp.dslPath)
            if (!classNames || classNames.length === 0) continue

            for (const className of classNames) {
                const classInfo = updatedClassDomain.findClassByName(className)
                if (!classInfo) continue

                const svc = ComponentService.create(updatedClassDomain, updatedComponentDomain)
                try {
                    const result = svc.assignClassToComponent(classInfo.id, comp.id)
                    updatedClassDomain = result.classDomain
                    updatedComponentDomain = result.componentDomain
                } catch {
                    // アサインに失敗した場合はスキップ（ログのみ）
                    console.warn(
                        `[DslIntegrator] Failed to assign class "${className}" to component "${comp.name}"`
                    )
                }
            }
        }

        // Step 4: 依存関係を連鎖導出
        const deriveSvc = ComponentService.create(updatedClassDomain, updatedComponentDomain)
        const deriveResult = deriveSvc.deriveAllRelationships()

        return {
            classDomain: deriveResult.classDomain,
            componentDomain: deriveResult.componentDomain,
            derived: deriveResult.derived,
            orphaned: deriveResult.orphaned,
            subsystemOrphaned: deriveResult.subsystemOrphaned,
            applicationOrphaned: deriveResult.applicationOrphaned,
            classNamesByDslPath,
        }
    }

    /**
     * コンポーネントモデルから、DSLが設定されているコンポーネントの
     * dslPath 一覧を取得する（IPC呼び出しのため）。
     */
    static collectDslPaths(componentDomain: ComponentDomainModel): string[] {
        const paths = new Set<string>()
        for (const comp of componentDomain.getComponents()) {
            if (comp.dslPath && comp.dslPath.length > 0) {
                paths.add(comp.dslPath)
            }
        }
        return Array.from(paths)
    }
}
