/**
 * ===============================================
 * Design Graph Model
 * ===============================================
 * 目的:
 * - 型関係グラフ、依存関係グラフ、委譲/所有関係グラフを表現する
 * - パターン適用を「グラフ変換」として扱うための基盤である
 * 
 * 設計思想:
 * - JSONが単一の真実
 * - すべての構造はノードとエッジで表現する
 * - ノードは設計要素（class, method 等）
 * - エッジは設計関係（inherits, calls 等）
 * - Aggregate Rootは不変（Immutable）
 * - 整合性(Invariant)はAggregate内部で保証する
 *
 * このモデルはパターン適用を
 * 「グラフ変換」として扱うための基盤である。
 * ===============================================
 */

/** 
 * ===============================================
 * Node
 * =============================================== */

/**
 * ノード種別
 */
export type NodeKind =
    | "class"
    | "interface"
    | "method"
    | "field"
    | "parameter";

/**
 * ノード
 */
export interface DesignNode {
    /**
     * 永続的な識別子
     * - UUIDを使用
     * - 一度生成したら変更しない
     */
    readonly id: string;

    /**
     * ノード種別
     */
    readonly kind: NodeKind;

    /**
     * 表示名（同一性とは無関係）
     */
    readonly name: string;

    /**
     * 親ノードID（所有関係）
     * - class -> method
     * - method -> parameter
     * など
     * 
     * ※ 親子関係はエッジではなくツリーで管理する
     */
    readonly parentId?: string;

    /**
     * 拡張用メタデータ
     * 将来的な言語差分や修飾子を格納
     */
    readonly metadata?: Record<string, unknown>;
}

/**
 * ===============================================
 * Edge
 * =============================================== */

/**
 * エッジ種別
 */
export type EdgeKind =
    | "inherits" /** 継承責務 */
    | "implements" /** 実装責務 */
    | "instantiates" /** 生成責務 */
    | "references" /** 参照責務 */
    | "calls" /** 呼び出し責務 */
    | "delegates" /** 委譲責務 */;

/**
 * エッジ
 */
export interface DesignEdge {
    /**
     * 永続的な識別子（UUID）
     */
    readonly id: string;

    /**
     * 依存元ノードID
     */
    readonly from: string;

    /**
     * 依存先ノードID
     */
    readonly to: string;

    /**
     * 関係種別
     */
    readonly kind: EdgeKind;

    /**
     * 将来的な条件や制約用
     */
    readonly metadata?: Record<string, unknown>;
}

/**
 * ===============================================
 * Aggregate Root
 * =============================================== */

/**
 * 設計グラフ状態
 */
export interface DesignGraphState {
    readonly nodes: Readonly<Record<string, DesignNode>>;
    readonly edges: Readonly<Record<string, DesignEdge>>;
}

/**
 * DesignGraphAggregate
 *
 * - 唯一の設計状態
 * - 不変オブジェクト
 * - 変更は新インスタンスを返す
 * - 整合性検証は内部で行う
 */
export class DesignGraphAggregate {
    private readonly state: DesignGraphState;

    constructor(state: DesignGraphState) {
        this.validate(state);
        this.state = state;
    }

    get nodes() {
        return this.state.nodes;
    }

    get edges() {
        return this.state.edges;
    }

    /**
     * ノード追加
     */
    addNode(node: DesignNode): DesignGraphAggregate {
        if (this.state.nodes[node.id]) {
            throw new Error(`Node with id ${node.id} already exists.`);
        }

        const newState: DesignGraphState = {
            nodes: {
                ...this.state.nodes,
                [node.id]: node,
            },
            edges: this.state.edges,
        };

        return new DesignGraphAggregate(newState);
    }

    /**
     * エッジ追加
     */
    addEdge(edge: DesignEdge): DesignGraphAggregate {
        if (!this.state.nodes[edge.from] || !this.state.nodes[edge.to]) {
            throw new Error("Edge references non-existing node.");
        }

        const newState: DesignGraphState = {
            nodes: this.state.nodes,
            edges: {
                ...this.state.edges,
                [edge.id]: edge,
            },
        };

        return new DesignGraphAggregate(newState);
    }

    /**
     * エッジ削除
     */
    removeEdge(edgeId: string): DesignGraphAggregate {
        if (!this.state.edges[edgeId]) {
            throw new Error(`Edge with id ${edgeId} does not exist.`);
        }

        const { [edgeId]: _, ...remainingEdges } = this.state.edges;

        const newState: DesignGraphState = {
            nodes: this.state.nodes,
            edges: remainingEdges,
        };

        return new DesignGraphAggregate(newState);
    }

    /**
     * 整合性検証
     *
     * - 存在しないノード参照禁止
     * - 自己循環検出（必要なら拡張）
     * - 重複エッジ禁止
     */
    private validate(state: DesignGraphState): void {
        for (const edge of Object.values(state.edges)) {
            if (!state.nodes[edge.from] || !state.nodes[edge.to]) {
                throw new Error("Invalid edge: references unknown node.");
            }

            if (edge.from === edge.to) {
                throw new Error("Self-referencing edge is not allowed.");
            }
        }
    }
}
