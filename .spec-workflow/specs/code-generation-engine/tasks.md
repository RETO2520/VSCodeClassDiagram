# タスク - コード生成エンジン

- [ ] 1. IGeneratorBuilder インターフェースの定義
  - ファイル: `src/CodeComponents/CodeGenerator.ts`
  - `getFileName`, `buildClassHeader`, `buildAttribute`, `buildOperation`, `buildClassFooter` などのメソッドを定義する。
  - 目的: 言語固有の Builder のためのコントラクト（規約）を形式化する。
  - _活用: CodeGenerator パターン_
  - _要件: 非機能要件 (アーキテクチャ)_
  - _プロンプト: Role: TypeScript アーキテクト | Task: CodeGenerator.ts 内で、異なる言語のソースコード構築ステップを抽象化する堅牢な IGeneratorBuilder インターフェースを定義してください。 | Success: インターフェースが定義され、CodeGenerator クラスで正しく使用されている。_

- [ ] 2. TypeScriptBuilder の実装
  - ファイル: `src/CodeComponents/TypeScriptBuilder.ts`
  - TypeScript 構文用の `IGeneratorBuilder` を実装したクラスを作成する。
  - 目的: ターゲット言語として TypeScript をサポートする。
  - _活用: TS 用の `TypeModel` マッピング_
  - _要件: 1.1, 2.1_
  - _プロンプト: Role: TypeScript 開発者 | Task: TypeScriptBuilder.ts で IGeneratorBuilder インターフェースを実装してください。クラス、インターフェース、メソッドが TypeScript の慣習に従うようにしてください。 | Success: Builder が .ts ファイルを正しく生成する。_

- [ ] 3. RustBuilder の実装
  - ファイル: `src/CodeComponents/RustBuilder.ts`
  - Rust 構文（structs, traits, impls）用の `IGeneratorBuilder` を実装したクラスを作成する。
  - 目的: ターゲット言語として Rust をサポートする。
  - _活用: Rust 用の `TypeModel` マッピング_
  - _要件: 1.1, 2.2_
  - _プロンプト: Role: Rust 開発者 | Task: RustBuilder.ts で IGeneratorBuilder インターフェースを実装してください。UML クラスを Rust の struct と trait にマッピングしてください。'impl' ブロックの生成も処理してください。 | Success: Builder が .rs ファイルを正しく生成する。_

- [ ] 4. 出力チャネルロガーの統合
  - ファイル: `src/LoggerComponents/Logger.ts`, `src/extension.ts`
  - すべての生成の進捗と警告が "Class Diagram Editor Log" に送信されるようにする。
  - 目的: 長時間実行されるタスクの間、ユーザーに透明性を提供する。
  - _活用: VS Code `OutputChannel` API_
  - _要件: 1.3_
  - _プロンプト: Role: VS Code 拡張機能開発者 | Task: Logger クラスを CodeGenerator ワークフローに統合し、ファイル作成ステータスや変換警告を記録してください。 | Success: ユーザーが出力タブで生成の進捗を確認できる。_
