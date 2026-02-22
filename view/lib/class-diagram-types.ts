// ==============================
// UML Class Diagram Data Model
// ==============================

/** クラスの種別 */
export type ClassKind = "class" | "interface" | "struct"

/** アクセス修飾子 */
export type Visibility = "public" | "private" | "protected" | "package"

/** リレーションシップの種別 */
export type RelationshipType =
  | "association"    // 関連 (デフォルト)
  | "aggregation"    // 集約 (参照型: Class / Interface)
  | "composition"    // コンポジション (値型: Struct)
  | "dependency"     // 依存 (操作パラメータ経由)
  | "realization"    // 実現 (インターフェース実装)
  | "generalization" // 汎化 (継承)

/** メンバに指定可能なリレーションシップ */
export type MemberRelationshipType =
  | "auto"           // 自動判定 (デフォルト: 種別に基づく)
  | "association"
  | "aggregation"
  | "composition"

/** 多重度 (自由入力テキスト) */
export type Multiplicity = string

/** 操作のパラメータ */
export interface OperationParameter {
  id: string
  name: string
  type: string
}

/** メンバ（属性） */
export interface ClassMember {
  id: string
  name: string
  type: string
  visibility: Visibility
  isStatic: boolean
  isAbstract: boolean
  /** メンバ固有のリレーションシップ指定 (auto = 自動判定) */
  relationship: MemberRelationshipType
  /** ソース側の多重度 */
  sourceMultiplicity: Multiplicity
  /** ターゲット側の多重度 */
  targetMultiplicity: Multiplicity
}

/** ワークフロー図データ */
export interface OperationWorkflow {
  id: string
  name: string
  description: string
  nodes: Array<{
    id: string
    type: string
    label: string
    x: number
    y: number
  }>
  edges: Array<{
    from: string
    to: string
    condition?: string | null
    mid?: { x: number; y: number }
  }>
}

/** 操作（メソッド） */
export interface ClassOperation {
  id: string
  name: string
  returnType: string
  visibility: Visibility
  parameters: OperationParameter[]
  isStatic: boolean
  isAbstract: boolean
  /**
   * このオペレーションに紐づくワークフロー図データ。
   * WorkflowEditorPanel が保存したノード/エッジグラフ。
   */

  workflow?: {
    nodes: Array<{
      id: string
      type: string
      label: string
      x: number
      y: number
    }>
    edges: Array<{
      from: string
      to: string
      condition?: string | null
      mid?: { x: number; y: number }
    }>
  }
  /**
   * workflow から生成された抽象構文木。
   * コード生成に使用する。
   */
  workflowAst?: {
    variables: Array<{ name: string; type: string; initialValue?: string }>
    body: unknown[]
  }
}

/** クラス情報 */
export interface ClassInfo {
  id: string
  name: string
  kind: ClassKind
  /** Classの場合のみ: abstractであるか */
  isAbstract: boolean
  members: ClassMember[]
  operations: ClassOperation[]
  /** 実装するインターフェースのID一覧 */
  interfaces: string[]
  /** 基底クラスのID (単一継承) */
  baseClassId: string | null
  /** キャンバス上の位置 */
  x: number
  y: number
}

/** 自動検出されたリレーションシップ */
export interface Relationship {
  id: string
  type: RelationshipType
  sourceId: string
  targetId: string
  /** 関連の根拠となるメンバ名またはパラメータ名 */
  label?: string
  /** ソース側多重度 */
  sourceMultiplicity?: string
  /** ターゲット側多重度 */
  targetMultiplicity?: string
  /** 関連の起点となるメンバ/操作のID */
  sourceMemberId?: string
  /** 関連の終点となるメンバ/操作のID */
  targetMemberId?: string
}

// ==============================
// Helper Functions
// ==============================

export function visibilitySymbol(v: Visibility): string {
  switch (v) {
    case "public": return "+"
    case "private": return "-"
    case "protected": return "#"
    case "package": return "~"
  }
}

export function classKindLabel(k: ClassKind): string {
  switch (k) {
    case "class": return "Class"
    case "interface": return "Interface"
    case "struct": return "Struct"
  }
}

export function classKindStereotype(info: ClassInfo): string | null {
  if (info.kind === "interface") return "\u00ABinterface\u00BB"
  if (info.kind === "struct") return "\u00ABstruct\u00BB"
  if (info.kind === "class" && info.isAbstract) return "\u00ABabstract\u00BB"
  return null
}

/** 参照型かどうか (Class, Interface) */
export function isReferenceType(k: ClassKind): boolean {
  return k === "class" || k === "interface"
}

/** 値型かどうか (Struct) */
export function isValueType(k: ClassKind): boolean {
  return k === "struct"
}

export function createId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function createEmptyClass(): ClassInfo {
  return {
    id: createId(),
    name: "NewClass",
    kind: "class",
    isAbstract: false,
    members: [],
    operations: [],
    interfaces: [],
    baseClassId: null,
    x: 100 + Math.random() * 200,
    y: 100 + Math.random() * 200,
  }
}

export function createEmptyMember(): ClassMember {
  return {
    id: createId(),
    name: "field",
    type: "string",
    visibility: "private",
    isStatic: false,
    isAbstract: false,
    relationship: "auto",
    sourceMultiplicity: "1",
    targetMultiplicity: "1",
  }
}

export function createEmptyOperation(): ClassOperation {
  return {
    id: createId(),
    name: "method",
    returnType: "void",
    visibility: "public",
    parameters: [],
    isStatic: false,
    isAbstract: false
  }
}

export function createEmptyParameter(): OperationParameter {
  return {
    id: createId(),
    name: "param",
    type: "string",
  }
}

export const MEMBER_RELATIONSHIP_OPTIONS: { value: MemberRelationshipType; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "association", label: "Association" },
  { value: "aggregation", label: "Aggregation" },
  { value: "composition", label: "Composition" },
]

/**
 * 型名からベースの型名を抽出する。
 * "Customer[]" → "Customer", "List<Customer>" → "Customer", "Customer" → "Customer"
 */
export function extractBaseTypeName(type: string): string {
  let cleaned = type.replace(/\[\]/g, "").trim()
  const listMatch = cleaned.match(/^List<(.+)>$/i)
  if (listMatch) {
    cleaned = listMatch[1].trim()
  }
  const genericMatch = cleaned.match(/<(.+)>/)
  if (genericMatch) {
    cleaned = genericMatch[1].trim()
  }
  return cleaned
}

/**
 * 多重度に応じて型表現を更新する。
 * - "1" or "0..1" → "TypeName" (単体)
 * - 純粋な数値(2, 3 等) → "TypeName[N]" (固定長配列)
 * - それ以外 ("0..*", "1..*", "*", "n" 等) → "TypeName[]" (動的配列)
 */
export function computeTypeFromMultiplicity(baseType: string, multiplicity: string): string {
  const trimmed = multiplicity.trim()
  if (!trimmed || trimmed === "1" || trimmed === "0..1") {
    return baseType
  }
  // 純粋な整数なら固定長配列表記
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10)
    if (n <= 1) return baseType
    return `${baseType}[]`
  }
  // それ以外はすべて動的配列
  return `${baseType}[]`
}