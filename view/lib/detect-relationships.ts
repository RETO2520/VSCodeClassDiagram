import type { ClassInfo, Relationship, RelationshipType } from "./class-diagram-types"
import { createId, isReferenceType } from "./class-diagram-types"

/**
 * クラス情報の配列からリレーションシップを自動検出する。
 *
 * ルール:
 * 1. メンバ（属性）のデータ型が他クラス名と一致する場合:
 *    - メンバにrelationship指定がある場合はそれを使用
 *    - "auto"の場合: 対象クラスが参照型 → 集約, 値型 → コンポジション
 *    - 多重度はメンバの sourceMultiplicity / targetMultiplicity を使用
 *
 * 2. 操作（メソッド）のパラメータのデータ型が他クラス名と一致する場合:
 *    → 依存 (dependency)
 *
 * 3. クラスの interfaces 配列に他クラスIDが含まれる場合:
 *    → 実現 (realization)
 *
 * 4. クラスの baseClassId が設定されている場合:
 *    → 汎化 (generalization / 継承)
 */
export function detectRelationships(classes: ClassInfo[]): Relationship[] {
  const relationships: Relationship[] = []
  const classNameMap = new Map<string, ClassInfo>()

  for (const cls of classes) {
    classNameMap.set(cls.name, cls)
  }

  const seen = new Set<string>()

  function addRelationship(
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    label?: string,
    sourceMultiplicity?: string,
    targetMultiplicity?: string,
  ) {
    const key = `${sourceId}-${targetId}-${type}-${label || ""}`
    if (seen.has(key)) return
    seen.add(key)

    relationships.push({
      id: createId(),
      type,
      sourceId,
      targetId,
      label,
      sourceMultiplicity,
      targetMultiplicity,
    })
  }

  for (const cls of classes) {
    // --- 1. メンバの型による関連検出 ---
    for (const member of cls.members) {
      const typeName = extractBaseType(member.type)
      const targetClass = classNameMap.get(typeName)

      if (targetClass && targetClass.id !== cls.id) {
        let relType: RelationshipType

        if (member.relationship === "auto") {
          // 自動判定: 対象クラスの種別に基づく
          relType = isReferenceType(targetClass.kind) ? "aggregation" : "composition"
        } else {
          relType = member.relationship
        }

        addRelationship(
          cls.id,
          targetClass.id,
          relType,
          member.name,
          member.sourceMultiplicity,
          member.targetMultiplicity,
        )
      }
    }

    // --- 2. 操作パラメータ・戻り値の型による依存検出 ---
    for (const op of cls.operations) {
      // 戻り値の型による検出
      const returnTypeName = extractBaseType(op.returnType)
      const returnTargetClass = classNameMap.get(returnTypeName)

      if (returnTargetClass && returnTargetClass.id !== cls.id) {
        addRelationship(
          cls.id,
          returnTargetClass.id,
          "dependency",
          `${op.name}(): ${op.returnType}`,
        )
      }

      // パラメータの型による検出
      for (const param of op.parameters) {
        const typeName = extractBaseType(param.type)
        const targetClass = classNameMap.get(typeName)

        if (targetClass && targetClass.id !== cls.id) {
          addRelationship(
            cls.id,
            targetClass.id,
            "dependency",
            `${op.name}(${param.name})`,
          )
        }
      }
    }

    // --- 3. インターフェース実現検出 ---
    for (const ifId of cls.interfaces) {
      const targetClass = classes.find((c) => c.id === ifId)
      if (targetClass) {
        addRelationship(cls.id, targetClass.id, "realization")
      }
    }

    // --- 4. 継承(汎化)検出 ---
    if (cls.baseClassId) {
      const baseClass = classes.find((c) => c.id === cls.baseClassId)
      if (baseClass) {
        addRelationship(cls.id, baseClass.id, "generalization")
      }
    }
  }

  return relationships
}

/**
 * "List<Customer>" → "Customer",  "Customer[]" → "Customer" のように
 * ジェネリクスや配列表記からベースの型名を抽出する。
 */
function extractBaseType(type: string): string {
  let cleaned = type.replace(/\[\]/g, "").trim()
  const genericMatch = cleaned.match(/<(.+)>/)
  if (genericMatch) {
    cleaned = genericMatch[1].trim()
  }
  return cleaned
}
