/**
 * DomainModel.ts
 *
 * ============================================================
 * 🎯 目的
 * ------------------------------------------------------------
 * - UI (React) からドメイン状態を分離する
 * - ClassInfo[] の直接操作を禁止する
 * - 将来的な拡張（validate / snapshot / transaction / AI）に備える
 *
 * ============================================================
 * 🧠 設計方針
 * ------------------------------------------------------------
 * 1. 今は「薄いラッパー」に留める（過剰実装しない）
 * 2. イミュータブル前提（内部状態は外から変更できない）
 * 3. 将来の責務追加を見越した拡張ポイントを用意する
 * 4. React依存を絶対に持たない
 *
 * ============================================================
 * 🚀 将来拡張予定（今は未実装）
 * ------------------------------------------------------------
 * - validate(): ValidationResult
 * - apply(command: Command): DomainModel
 * - exportSnapshot(): Snapshot
 * - metrics(): ModelMetrics
 * - beginTransaction() / commit()
 * - event emission
 *
 * ============================================================
 */
import { ClassInfo } from './class-diagram-types';

/**
 * DomainModel
 *
 * ドメインの唯一の状態保持者。
 * UIはこのクラスを直接変更してはならない。
 */
export class DomainModel {
    /**
     * 内部状態
     * 直接参照されないよう private にする。
     */
    private readonly classes: ClassInfo[]

    /**
     * constructor は private にし、
     * 必ず factory 経由で生成させる。
     */
    private constructor(classes: ClassInfo[]) {
        // 配列をコピーして外部参照を防ぐ
        this.classes = [...classes]
    }

    // ============================================================
    // Factory Methods
    // ============================================================

    /**
     * 初期生成用ファクトリ
     */
    static createEmpty(): DomainModel {
        return new DomainModel([])
    }

    /**
     * 外部配列から生成
     * executeAction から呼ばれる想定
     */
    static from(classes: ClassInfo[]): DomainModel {
        return new DomainModel(classes)
    }

    // ============================================================
    // Query Methods (読み取り専用)
    // ============================================================

    /**
     * 現在のクラス一覧を取得
     *
     * 直接変更されないようコピーを返す。
     */
    getClasses(): ClassInfo[] {
        return [...this.classes]
    }

    /**
     * 内部件数取得（軽量API例）
     */
    getClassCount(): number {
        return this.classes.length
    }

    /**
     * 特定クラス取得
     */
    findClassByName(name: string): ClassInfo | undefined {
        return this.classes.find(c => c.name === name)
    }
    findClassById(id: string): ClassInfo | undefined {
        return this.classes.find(c => c.id === id);
    }

    /**
     * 複数のクラスをIDで取得
     */
    findClassesByIds(ids: string[]): ClassInfo[] {
        return this.classes.filter(c => ids.includes(c.id));
    }

    /**
     * クラスが存在するか確認
     */
    hasClass(id: string): boolean {
        return this.classes.some(c => c.id === id);
    }

    /**
     * 指定した kind のクラスのみ取得
     */
    getClassesByKind(kind: ClassInfo['kind']): ClassInfo[] {
        return this.classes.filter(c => c.kind === kind);
    }

    // ============================================================
    // Command Methods (状態変更 - 新しいインスタンスを返す)
    // ============================================================
    /**
         * クラスを追加した新しいモデルを返す
         */
    addClass(classInfo: ClassInfo): DomainModel {
        return new DomainModel([...this.classes, classInfo]);
    }

    /**
     * クラスを削除した新しいモデルを返す
     */
    removeClass(classId: string): DomainModel {
        return new DomainModel(
            this.classes.filter(c => c.id !== classId)
        );
    }
    /**
     * 名前でクラスを削除
     */
    removeClassByName(className: string): DomainModel {
        return new DomainModel(
            this.classes.filter(c => c.name !== className)
        );
    }
    /**
     * クラスを更新した新しいモデルを返す
     */
    updateClass(classId: string, updater: (c: ClassInfo) => ClassInfo): DomainModel {
        return new DomainModel(
            this.classes.map(c => c.id === classId ? updater(c) : c)
        );
    }

    /**
     * 名前でクラスを更新
     */
    updateClassByName(className: string, updater: (c: ClassInfo) => ClassInfo): DomainModel {
        return new DomainModel(
            this.classes.map(c => c.name === className ? updater(c) : c)
        );
    }

    /**
     * 複数クラスを一度に置き換え
     * （executeAction での複雑な操作用）
     */
    replaceClasses(newClasses: ClassInfo[]): DomainModel {
        return new DomainModel(newClasses);
    }

    // ============================================================
    // Utility Methods
    // ============================================================

    /**
     * 将来の変更検知用
     * （Undo/Redo最適化や差分検知に使える）
     */
    equals(other: DomainModel): boolean {
        // 参照が同じなら true（イミュータブルなので有効）
        if (this === other) return true;

        // 件数が違えば false
        if (this.classes.length !== other.classes.length) return false;

        // 簡易チェック（ID順序が同じかどうか）
        return this.classes.every((c, i) => c.id === other.classes[i]?.id);
    }
    /**
     * モデルが空かどうか
     */
    isEmpty(): boolean {
        return this.classes.length === 0;
    }
    /**
     * デバッグ用
     */
    toJSON(): ClassInfo[] {
        return this.getClasses()
    }

    /**
     * 統計情報を取得（将来拡張用の例）
     */
    getStats() {
        return {
            totalClasses: this.classes.length,
            classCount: this.classes.filter(c => c.kind === 'class').length,
            interfaceCount: this.classes.filter(c => c.kind === 'interface').length,
            structCount: this.classes.filter(c => c.kind === 'struct').length,
            totalMembers: this.classes.reduce((sum, c) => sum + (c.members?.length || 0), 0),
            totalOperations: this.classes.reduce((sum, c) => sum + (c.operations?.length || 0), 0),
        };
    }

    // ============================================================
    // Future Extension Points (コメントアウトで残す)
    // ============================================================

    /*
    validate(): ValidationResult {
        const errors: string[] = [];
        
        // 名前の重複チェック
        const names = this.classes.map(c => c.name);
        const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
        if (duplicates.length > 0) {
            errors.push(`Duplicate class names: ${duplicates.join(', ')}`);
        }

        // 循環継承チェック
        // TODO

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    exportSnapshot(): Snapshot {
        return {
            classes: this.classes,
            timestamp: Date.now(),
            version: '1.0'
        };
    }

    apply(command: Command): DomainModel {
        return command.execute(this);
    }
    */
}
