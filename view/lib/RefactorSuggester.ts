/**
 * RefactorSuggester.ts
 *
 * DSLのパース結果（ParsedClass / ParsedRelation）を静的解析し、
 * RefactorCommand で実行可能なリファクタリング提案を生成する。
 *
 * SpecDslParser.generateCliSuggestions() から委譲されて呼ばれる。
 * RefactorCommand 本体（RefactorCommand.ts）には依存しない純粋なアナライザ。
 */

import type { ParsedClass, ParsedRelation, CliSuggestion } from './SpecDslParser';

// ── 検出閾値定数 ────────────────────────────────────────────────
/** これ以上 public メソッドがあれば extract-interface を提案 */
const EXTRACT_INTERFACE_METHOD_THRESHOLD = 3;

/** これ以下のメンバ数なら inline-class を提案 */
const INLINE_CLASS_MEMBER_THRESHOLD = 2;

/** これ以上のメンバ数なら split-class を提案 */
const SPLIT_CLASS_MEMBER_THRESHOLD = 8;

/** extract-superclass: この数以上のクラスに共通メンバがあれば提案 */
const SHARED_MEMBER_MIN_CLASSES = 2;

// ────────────────────────────────────────────────────────────────

export class RefactorSuggester {
    suggest(
        classes: ParsedClass[],
        relations: ParsedRelation[],
    ): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [
            ...this.suggestExtractSuperclass(classes),
            ...this.suggestExtractInterface(classes),
            ...this.suggestInlineClass(classes, relations),
            ...this.suggestResolveCircular(relations),
            ...this.suggestSplitClass(classes),
            ...this.suggestInvertDependency(classes, relations),
        ];

        // 優先度降順でソート（呼び出し元の generateCliSuggestions と合流後に再ソートされる）
        return suggestions.sort((a, b) => b.priority - a.priority);
    }

    // ============================================================
    // extract-superclass: 共通メンバを持つクラス群を検出
    // ============================================================

    private suggestExtractSuperclass(classes: ParsedClass[]): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [];

        // メンバ名 → そのメンバを持つクラス名リスト を集計
        const memberToClasses = new Map<string, string[]>();
        for (const cls of classes) {
            // インターフェース・抽象クラスは対象外（既に抽象化済みとみなす）
            if (cls.kind !== 'class') continue;
            for (const m of cls.members) {
                const existing = memberToClasses.get(m.name) ?? [];
                existing.push(cls.name);
                memberToClasses.set(m.name, existing);
            }
        }

        // 2クラス以上に共通するメンバ名でグルーピング
        // 「同じクラス組み合わせ」をキーにして重複提案をまとめる
        const groupKey = (names: string[]) => [...names].sort().join(',');
        const grouped = new Map<string, Set<string>>(); // groupKey → shared member names

        for (const [memberName, classNames] of memberToClasses.entries()) {
            if (classNames.length < SHARED_MEMBER_MIN_CLASSES) continue;
            // 2クラスずつのペアでも提案（全組み合わせ爆発を防ぐためペアに限定）
            for (let i = 0; i < classNames.length; i++) {
                for (let j = i + 1; j < classNames.length; j++) {
                    const key = groupKey([classNames[i], classNames[j]]);
                    const set = grouped.get(key) ?? new Set();
                    set.add(memberName);
                    grouped.set(key, set);
                }
            }
        }

        for (const [key, sharedMembers] of grouped.entries()) {
            if (sharedMembers.size < 1) continue;
            const classNames = key.split(',');

            // 既に共通の親を持つ場合はスキップ
            const parents = classNames.map(n => classes.find(c => c.name === n)?.extendsName);
            const hasCommonParent = parents[0] !== null && parents.every(p => p === parents[0]);
            if (hasCommonParent) continue;

            const superName = this.inferSuperclassName(classNames, [...sharedMembers]);
            const sharedList = [...sharedMembers].join(', ');

            suggestions.push({
                kind: 'add-relation', // refactor系はkindをadd-relationで代用（将来的に'refactor'追加推奨）
                command: `refactor extract-superclass ${classNames.join(',')} ${superName} --sync`,
                reason: `${classNames.join(' と ')} が "${sharedList}" を共有しています。${superName} への引き上げを検討してください。`,
                className: classNames[0],
                priority: 65 + sharedMembers.size * 3,
            });
        }

        return suggestions;
    }

    // ============================================================
    // extract-interface: public メソッドが多いクラスを検出
    // ============================================================

    private suggestExtractInterface(classes: ParsedClass[]): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [];

        for (const cls of classes) {
            if (cls.kind !== 'class') continue;

            // 既に implements しているインターフェースがあればスキップ
            if (cls.implementsNames.length > 0) continue;

            const publicMethods = cls.operations.filter(
                op => op.visibility === 'public' && !op.isStatic && !op.isAbstract
            );
            if (publicMethods.length < EXTRACT_INTERFACE_METHOD_THRESHOLD) continue;

            const interfaceName = `I${cls.name}`;
            const methodList = publicMethods.slice(0, 3).map(op => op.name).join(', ');
            const more = publicMethods.length > 3 ? ` 他${publicMethods.length - 3}件` : '';

            suggestions.push({
                kind: 'add-relation',
                command: `refactor extract-interface ${cls.name} ${interfaceName} --sync`,
                reason: `${cls.name} は ${publicMethods.length} 件の public メソッド（${methodList}${more}）を持ちます。${interfaceName} の抽出を検討してください。`,
                className: cls.name,
                priority: 60 + publicMethods.length * 2,
            });
        }

        return suggestions;
    }

    // ============================================================
    // inline-class: メンバが極端に少ないクラスを検出
    // ============================================================

    private suggestInlineClass(
        classes: ParsedClass[],
        relations: ParsedRelation[],
    ): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [];

        for (const cls of classes) {
            // インターフェース・抽象クラスは対象外
            if (cls.kind !== 'class' || cls.isAbstract) continue;

            const total = cls.members.length + cls.operations.length;
            if (total > INLINE_CLASS_MEMBER_THRESHOLD) continue;

            // このクラスを参照している側（コンポジション・集約・関連）を探す
            const referencedBy = relations
                .filter(r =>
                    r.target === cls.name &&
                    (r.type === 'composition' || r.type === 'aggregation' || r.type === 'association')
                )
                .map(r => r.source);

            if (referencedBy.length === 0) continue;

            // 参照元が1つに絞れる場合だけ具体的なコマンドを出す
            const targetClass = referencedBy[0];

            suggestions.push({
                kind: 'add-member',
                command: `refactor inline-class ${cls.name} ${targetClass} --sync`,
                reason: `${cls.name} はメンバが ${total} 件のみです。${targetClass} へのインライン化を検討してください。`,
                className: cls.name,
                priority: 55,
            });
        }

        return suggestions;
    }

    // ============================================================
    // resolve-circular: 循環リレーションを検出
    // ============================================================

    private suggestResolveCircular(relations: ParsedRelation[]): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [];

        // A→B かつ B→A となるペアを検出（依存・関連・集約・コンポジション対象）
        const targetTypes = new Set(['dependency', 'association', 'aggregation', 'composition']);
        const edges = relations.filter(r => targetTypes.has(r.type));

        const seen = new Set<string>();

        for (const r of edges) {
            const reverse = edges.find(
                e => e.source === r.target && e.target === r.source
            );
            if (!reverse) continue;

            const key = [r.source, r.target].sort().join('<->');
            if (seen.has(key)) continue;
            seen.add(key);

            suggestions.push({
                kind: 'add-relation',
                command: `refactor resolve-circular ${r.source} ${r.target} --sync`,
                reason: `${r.source} と ${r.target} が相互依存しています。I${r.target} の導入で片方向化できます。`,
                className: r.source,
                priority: 75, // 循環依存は設計上のリスクが高いため優先度高め
            });
        }

        return suggestions;
    }

    // ============================================================
    // split-class: メンバ過多のクラスを検出
    // ============================================================

    private suggestSplitClass(classes: ParsedClass[]): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [];

        for (const cls of classes) {
            if (cls.kind !== 'class') continue;

            const total = cls.members.length + cls.operations.length;
            if (total <= SPLIT_CLASS_MEMBER_THRESHOLD) continue;

            // 分割名を推定: メンバ系と操作系に単純二分
            const coreName = `${cls.name}Core`;
            const serviceName = `${cls.name}Service`;

            suggestions.push({
                kind: 'add-member',
                command: `refactor split-class ${cls.name} ${coreName},${serviceName} --sync`,
                reason: `${cls.name} はメンバ・操作が計 ${total} 件あります。${coreName} と ${serviceName} への分割を検討してください。`,
                className: cls.name,
                priority: 58 + (total - SPLIT_CLASS_MEMBER_THRESHOLD) * 2,
            });
        }

        return suggestions;
    }

    // ============================================================
    // invert-dependency: 具象クラス同士の依存を検出
    // ============================================================

    private suggestInvertDependency(
        classes: ParsedClass[],
        relations: ParsedRelation[],
    ): CliSuggestion[] {
        const suggestions: CliSuggestion[] = [];

        // インターフェースと抽象クラスのセットを事前構築
        const abstractTypes = new Set(
            classes
                .filter(c => c.kind === 'interface' || c.isAbstract)
                .map(c => c.name)
        );

        // 具象クラス同士の依存リレーションを抽出
        const depRelations = relations.filter(r =>
            r.type === 'dependency' &&
            !abstractTypes.has(r.source) &&
            !abstractTypes.has(r.target)
        );

        // 既に循環として検出済みのペアと重複しないようにする
        const circularTargets = new Set(
            relations
                .filter(r => relations.some(e => e.source === r.target && e.target === r.source))
                .map(r => `${r.source}->${r.target}`)
        );

        for (const r of depRelations) {
            const key = `${r.source}->${r.target}`;
            if (circularTargets.has(key)) continue; // resolve-circular と重複しない

            suggestions.push({
                kind: 'add-relation',
                command: `refactor invert-dependency ${r.source} ${r.target} --sync`,
                reason: `${r.source} が具象クラス ${r.target} に直接依存しています。I${r.target} を導入して DIP を適用できます。`,
                className: r.source,
                priority: 52,
            });
        }

        return suggestions;
    }

    // ============================================================
    // Helpers
    // ============================================================

    /**
     * クラス名群と共通メンバ名から親クラス名を推定する。
     * 例: ["OrderItem", "CartItem"] → "Item"
     *     ["UserProfile", "UserSettings"] → "UserBase"
     */
    private inferSuperclassName(classNames: string[], sharedMembers: string[]): string {
        // 共通サフィックスを探す
        const suffix = this.longestCommonSuffix(classNames);
        if (suffix.length >= 3 && /^[A-Z]/.test(suffix)) return suffix;

        // 共通プレフィックスを探す
        const prefix = this.longestCommonPrefix(classNames);
        if (prefix.length >= 3) return `${prefix}Base`;

        // id/createdAt/updatedAt など Entity っぽいメンバが多ければ "Base" を付ける
        const entityLike = sharedMembers.some(m => ['id', 'createdAt', 'updatedAt'].includes(m));
        if (entityLike) return 'BaseEntity';

        return `${classNames[0]}Base`;
    }

    private longestCommonSuffix(words: string[]): string {
        if (words.length === 0) return '';
        let suffix = words[0];
        for (const w of words.slice(1)) {
            while (!w.endsWith(suffix) && suffix.length > 0) {
                suffix = suffix.slice(1);
            }
        }
        return suffix;
    }

    private longestCommonPrefix(words: string[]): string {
        if (words.length === 0) return '';
        let prefix = words[0];
        for (const w of words.slice(1)) {
            while (!w.startsWith(prefix) && prefix.length > 0) {
                prefix = prefix.slice(0, -1);
            }
        }
        return prefix;
    }
}