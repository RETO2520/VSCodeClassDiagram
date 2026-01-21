# タスク一覧: ワークフロー変換エンジン

- [x] 1. src/CodeComponents/CodeGenerator.ts でのワークフロー AST インインターフェースの定義 <!-- id: 1 -->
  - File: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/CodeGenerator.ts
  - ワークフローデータ構造（`WorkflowAst`, `WfAstNode` など）の TypeScript インターフェースを定義する
  - `IIfNode`, `IWhileNode`, `IActionNode`, `IReturnNode`, `ISequenceNode` などの具体的なノード型を実装する
  - 目的: ワークフローロジックの実装における型安全性を確立する
  - _Leverage: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/CodeGenerator.ts_
  - _Requirements: 1_
  - _Prompt: Role: 型システムとインターフェースに特化したTypeScript開発者 | Task: design.md の設計に従い、CodeGenerator.ts にワークフロー AST インターフェースを定義してください。If, While, Action, Return, Sequence の各ノードタイプを網羅し、WorkflowAst への統合を行ってください。 | Restrictions: 既存の IClassModel や IOperationModel との整合性を維持し、エクスポートを適切に行ってください。 | Success: すべてのインターフェースがエラーなくコンパイルされ、設計通りのデータ構造が表現されていること。_

- [ ] 2. IGeneratorBuilder と CodeBuilder のワークフロー対応 <!-- id: 2 -->
- [x] 2. CodeGenerator.ts 内の IGeneratorBuilder と CodeBuilder の拡張 <!-- id: 2 -->
  - File: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/CodeGenerator.ts
  - `IGeneratorBuilder` に `generateWorkflow` メソッドを追加する
  - `CodeBuilder` 抽象クラスに、AST ノードを再帰的に処理するディスパッチャメソッドを追加する
  - 目的: 各言語ビルダーがワークフローを変換するための共通基盤を提供する
  - _Leverage: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/CodeGenerator.ts_
  - _Requirements: 2_
  - _Prompt: Role: バックエンド開発者 | Task: IGeneratorBuilder インターフェースと CodeBuilder 抽象クラスを更新して、ワークフロー生成メソッドを追加してください。CodeBuilder には、各 WfAstNode タイプを識別して言語固有のメソッドへ振り分ける再帰的なロジックを実装してください。 | Restrictions: 既存の Build メソッドのシグネチャを変更せず、新しい抽象メソッドを適切に配置してください。 | Success: インターフェースが更新され、CodeBuilder のサブクラスでワークフロー生成を容易に実装できるようになること。_

- [x] 3. TypeScriptBuilder でのワークフロー生成の実装 <!-- id: 3 -->
  - File: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/TypeScriptBuilder.ts
  - `generateWorkflow` を実装し、TypeScript 固有の制御構文（if, while 等）を出力する
  - インデント管理とセミコロンの付与を適切に行う
  - 目的: ワークフローから TypeScript ソースコードを生成可能にする
  - _Leverage: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/TypeScriptBuilder.ts_
  - _Requirements: 2, 3_
  - _Prompt: Role: TypeScript スペシャリスト | Task: TypeScriptBuilder で `generateWorkflow` と各ノード固有の生成メソッドを実装してください。TypeScript のコーディング規約（括弧の使用、インデント等）に従ったコードを出力してください。 | Success: 様々な WorkflowAst 入力に対して、有効な TypeScript ロジックが生成されること。_

- [ ] 4. RustBuilder でのワークフローコード生成の実装 <!-- id: 4 -->
  - File: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/RustBuilder.ts
  - Rust 固有の制御構文（条件式の括弧なし等）に合わせた `generateWorkflow` を実装する
  - Rust の命名規則やフォーマットを遵守する
  - 目的: ワークフローから Rust ソースコードを生成可能にする
  - _Leverage: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/RustBuilder.ts_
  - _Requirements: 2, 3_
  - _Prompt: Role: Rust 開発者 | Task: RustBuilder で `generateWorkflow` を実装してください。Rust の慣習（条件式に括弧を付けない、`snake_case` の使用等）に従い、正しい Rust 構文を出力してください。 | Success: WorkflowAst から Rust の慣習に則った正しいコードが生成されること。_

- [x] 5. CodeGenerator.generate ロジックの更新 <!-- id: 5 -->
  - File: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/CodeGenerator.ts
  - メインの `Build` ループ内で、各操作（Operation）がワークフローを持っているか確認するように更新する
  - ワークフローが存在する場合、ビルダーの `generateWorkflow` を呼び出してメソッドボディを生成する
  - 目的: ワークフロー変換エンジンを既存のコード生成プロセスに統合する
  - _Leverage: e:/Project/VSCodeExtensions/VSCodeClassDiagram/src/CodeComponents/CodeGenerator.ts_
  - _Requirements: すべて_
  - _Prompt: Role: システムインテグレーター | Task: CodeGenerator.ts の `Build` ループを更新し、IOperationModel が持つワークフローデータを AST へ変換（またはそのまま渡し）、ビルダーのワークフロー生成メソッドを呼び出すようにしてください。生成されたコードをメソッドのボディ部分に挿入してください。 | Restrictions: 既存のクラス図ベースの生成処理を壊さないように注意してください。 | Success: クラス図のメソッド定義内に、ワークフロー図由来のロジックが正しく出力されること。_
