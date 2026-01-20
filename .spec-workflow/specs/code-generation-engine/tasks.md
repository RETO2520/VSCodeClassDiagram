# タスク - コード生成エンジン

- [x] 1. IGeneratorBuilder への名称統一と基盤整備
  - ファイル: `src/CodeComponents/CodeGenerator.ts`
  - `ICodeBuilder` を `IGeneratorBuilder` にリネームし、`CodeBuilder` 抽象クラスの各ステップ（`generateImports` 等）が IGeneratorBuilder の責務として明確になるよう調整する。
  - 目的: 設計ドキュメントとの用語の一致と、Builder パターンの形式化。

- [x] 2. TypeScriptBuilder の詳細実装
  - ファイル: `src/CodeComponents/TypeScriptBuilder.ts`
  - 現状の実装をベースに、インターフェース、抽象クラス、型変換（int -> number 等）が仕様通りに動作することを確認・修正する。
  - 目的: Requirement 1.1, 2.1 の達成。

- [x] 3. RustBuilder の詳細実装
  - ファイル: `src/CodeComponents/RustBuilder.ts`
  - Rust 固有の構文（snake_case のファイル名/フィールド名、struct, trait, impl）の実装を完了させる。
  - 目的: Requirement 1.1, 2.2 の達成。

- [ ] 4. ロギングの統合とエラーハンドリング（上書き確認）
  - ファイル: `src/LoggerComponents/Logger.ts`, `src/CodeComponents/CodeGenerator.ts`
  - 生成プロセスのログを「Class Diagram Editor Log」に出力し、ファイル上書き時のチェックロジック（Requirement 1.2）を検討・実装する。
  - 目的: 要求事項 1.2, 1.3 の達成。
