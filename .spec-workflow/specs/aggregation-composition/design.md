# 設計書

## 概要

この設計ドキュメントでは、VSCodeクラス図拡張機能における「Struct（構造体）」、「Aggregation（集約）」、「Composition（コンポジション）」のサポートに関する技術的な詳細を定義します。これには、UIでの入力、内部モデルへの保存、およびTypeScriptとRustへのコード生成ロジックが含まれます。

## 技術基準と整合性

### 技術基準 (tech.md)
- **TypeScript**: 既存のTypeScriptコードベースに従い、型安全性を維持します。
- **Rust生成**: Rustの推奨される所有権モデル（`Box<T>` vs `T`）に従います。

### プロジェクト構造 (structure.md)
- `media/` ディレクトリ内の既存のUIロジック（`main.draw.js`, `main.interactions.js`）を拡張します。
- `src/CodeComponents/` 内の既存のジェネレータロジック（`CodeGenerator.ts`, `TypeScriptBuilder.ts`, `RustBuilder.ts`）を拡張します。

## コード再利用分析

### 活用できる既存のコンポーネント
- **IClassModel / IAttributeModel**: 既存のインターフェースを拡張して、新しいフラグと修飾子をサポートします。
- **main.interactions.js**: 既存のドロップダウン生成ロジックを再利用し、新しいオプションを追加します。
- **CodeBuilder**: 基底クラスの構造を維持し、新しいロジックをサブクラスに実装します。

## コンポーネントとインターフェース

### 1. UIコンポーネント (media/)

#### main.interactions.js
- **目的**: ユーザーインタラクション（クラスタイプの変更）を処理する。
- **変更点**: `createNameBar` 関数内のクラス種類選択ドロップダウンに `struct` を追加。選択時に `cls.isStruct = true` を設定するロジックを追加。

#### main.draw.js
- **目的**: クラス図の描画と属性/操作の編集UIを提供する。
- **変更点**:
    - `createAttributesSection`: 修飾子ドロップダウンに `aggregation`, `composition` を追加。
    - `createOperationsSection`: 修飾子ドロップダウンから `aggregation`, `composition` を除外する（または含めないことを確認）。

### 2. データモデル (src/CodeComponents/CodeGenerator.ts)

#### IClassModel
- **変更**: `isStruct: boolean` プロパティを追加。

#### IAttributeModel
- **変更**: 既存の `modifier` 文字列フィールドを使用し、値として `'aggregation'`, `'composition'` を許容する。

### 3. コード生成ロジック (src/CodeComponents/)

#### TypeScriptBuilder
- **generateClassDeclaration**: `isStruct` が true の場合、クラスとして生成する（メソッドを持つ可能性があるため）。コメント等でStructであることを示唆してもよい。
- **analyzeAttribute / generateAttributes**:
    - `aggregation` (参照): 標準のプロパティとして生成。
    - `composition` (値): 標準のプロパティとして生成。
    - *注記*: TSでは構文上の区別が少ないため、型マッピングに重点を置く。

#### RustBuilder
- **generateClassDeclaration**: `struct` キーワードを使用（既存もstructだが、セマンティクスが変わる可能性がある）。
    - `composition`: `T` (直接型) として生成。
    - `None` (デフォルト):
        - ターゲットがClass/Interfaceの場合: `Box<T>` (参照)
        - ターゲットがStruct/Primitiveの場合: `T` (値)

#### CppBuilder
- **generateClassDeclaration**: `struct` キーワードを使用。
- **generateAttributes**:
    - `aggregation`: `T*` (Raw Pointer) として生成。
    - `composition`: `T` (直接埋め込み) として生成。

#### CSharpBuilder
- **generateClassDeclaration**: `struct` キーワードを使用。
- **generateAttributes**:
    - `aggregation`/`composition`: 標準のプロパティとして生成（C#のstructは値型なので、型定義に従う）。

#### JavaBuilder
- **generateClassDeclaration**: `class` キーワードを使用 (Javaではstructがないため)。
- **generateAttributes**:
    - `aggregation`/`composition`: 標準のフィールドとして生成。

## エラー処理

- **無効な組み合わせ**: UI側で操作に対するAggregation/Compositionの選択を防ぐことで、生成時のエラーを未然に防ぐ。万が一モデルに含まれていても、ジェネレータは安全なデフォルト（通常の参照/値）にフォールバックしてクラッシュを防ぐ。

## テスト戦略

### 手動検証
1.  **UI**: `.draw.js` ファイルを開き、Structへの切り替え、Aggregation/Compositionの選択ができるか確認。
2.  **生成**: コード生成を実行し、出力された `.rs` および `.ts` ファイルが期待通りの型（`Box<...>` など）になっているか目視確認。

### 自動テスト（将来的な拡張）
- `test/manual_codegen_test.ts` (一時的) を作成し、特定のモデル構成に対する生成出力を検証する。
