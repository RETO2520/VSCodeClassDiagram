# タスクドキュメント

- [ ] 1. UIの更新: Structオプションと属性修飾子の追加
  - File: media/main.interactions.js, media/main.draw.js
  - クラスの種類に「Struct」を追加し、属性の修飾子に「Aggregation/Composition」を追加します。操作の修飾子からはこれらを除外または非表示にします。
  - Purpose: ユーザーがStructや集約/コンポジションを選択できるようにする。
  - _Leverage: media/main.interactions.js, media/main.draw.js_
  - _Requirements: 要件1, 要件2_
  - _Prompt: Role: フロントエンド開発者 | Task: main.interactions.jsを修正して「struct」オプションを追加し、main.draw.jsを修正して属性修飾子に「aggregation」「composition」を追加（操作修飾子からは除外）してください。 | Restrictions: 既存のイベントリスナーやUI構造を壊さないように注意すること。_

- [ ] 2. モデルの更新: IClassModelへのisStruct追加
  - File: src/CodeComponents/CodeGenerator.ts
  - IClassModelインターフェースに `isStruct?: boolean` プロパティを追加します。
  - Purpose: Structの状態をモデルとして保持する。
  - _Leverage: src/CodeComponents/CodeGenerator.ts_
  - _Requirements: 要件1_
  - _Prompt: Role: TypeScript開発者 | Task: IClassModelインターフェースにisStructフラグを追加してください。 | Restrictions: 既存のプロパティとの整合性を保つこと。_

- [ ] 3. TypeScriptジェネレータの更新
  - File: src/CodeComponents/TypeScriptBuilder.ts
  - Structの場合のクラス宣言生成、およびAggregation/Composition修飾子が付いた属性の生成ロジックを実装します。
  - Purpose: TypeScriptコード生成においてStructと所有権セマンティクスを反映させる。
  - _Leverage: src/CodeComponents/TypeScriptBuilder.ts_
  - _Requirements: 要件1, 要件3, 要件4, 要件5_
  - _Prompt: Role: TypeScriptジェネレータ開発者 | Task: isStructがtrueの場合はクラスとして生成し、属性のaggregation/composition修飾子（これらはTS構文上は標準プロパティだが）を適切に処理するロジックを実装してください。 | Restrictions: コンパイル可能な有効なTSコードを出力すること。_

- [ ] 4. Rustジェネレータの更新
  - File: src/CodeComponents/RustBuilder.ts
  - Struct（構造体）としての生成と、Aggregation（`Box<T>`）/ Composition（`T`）の型マッピングロジックを実装します。
  - Purpose: Rustコード生成において所有権モデルを正しく反映させる。
  - _Leverage: src/CodeComponents/RustBuilder.ts_
  - _Requirements: 要件1, 要件3, 要件4, 要件5_
  - _Prompt: Role: Rustジェネレータ開発者 | Task: RustBuilder.tsを更新し、Aggregation属性は `Box<T>`、Composition属性は `T` として生成するようにしてください。 | Restrictions: Rustの借用/所有権ルールに従ったコードを生成すること。_

- [ ] 5. C++ジェネレータの更新
  - File: src/CodeComponents/CppBuilder.ts
  - Struct（構造体）生成と、Aggregation（`T*`）/ Composition（`T`）のロジックを実装します。
  - Purpose: C++コード生成に所有権モデルを反映させる。
  - _Leverage: src/CodeComponents/CppBuilder.ts_
  - _Requirements: 要件1, 要件3, 要件4, 要件5_

- [ ] 6. C#ジェネレータの更新
  - File: src/CodeComponents/CSharpBuilder.ts
  - Struct（`struct`）生成をサポートします。
  - Purpose: C#コード生成に値型モデルを反映させる。
  - _Leverage: src/CodeComponents/CSharpBuilder.ts_
  - _Requirements: 要件1, 要件4_

- [ ] 7. Javaジェネレータの更新
  - File: src/CodeComponents/JavaBuilder.ts
  - Aggregation/Compositionの扱いは標準フィールドですが、一貫性のためにロジックを確認/更新します。
  - Purpose: 多言語サポートの整合性維持。
  - _Leverage: src/CodeComponents/JavaBuilder.ts_
  - _Requirements: 要件1_

- [ ] 8. 検証とクリーンアップ
  - File: (None)
  - 手動テストを行い、生成されたコードが要件を満たしているか確認します。
  - Purpose: 実装の品質保証。
  - _Leverage: (Manual Test)_
  - _Requirements: All_
  - _Prompt: Role: QAエンジニア | Task: UIでStructやAggregationを設定し、コード生成を行って出力が正しいか検証してください。_
