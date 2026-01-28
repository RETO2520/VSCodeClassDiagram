# Tasks Document

- [ ] 1. Rustパーサーの基本クラス作成
  - File: src/services/sourceToDiagram/ast/rust/RustAstParser.ts
  - IAstParserインターフェースを実装するRustAstParserクラスを作成する
  - Purpose: Rustの解析をシステムに統合する
  - _Leverage: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: TypeScriptとRustに詳しいエンジニア | Task: IAstParserを実装するRustAstParserのスケルトンを作成します。Rust言語識別子（'rust'）をサポートし、tree-sitter-rustのロードが可能な構造にしてください。 | Restrictions: 抽象インターフェース IAstParser の契約を遵守すること。 | Success: クラスがエラーなく定義され、ビルドが通ること。_

- [ ] 2. Tree-sitter-rustを用いた解析基盤の実装
  - File: src/services/sourceToDiagram/ast/rust/RustAstParser.ts
  - tree-sitter-rustを使用してASTを走査し、Rust構造を識別する
  - Purpose: Rustのソースコードを解析する
  - _Leverage: web-tree-sitter, tree-sitter-rust.wasm_
  - _Requirements: 全要件_
  - _Prompt: Role: AST解析のスペシャリスト | Task: tree-sitter-rustを使用してRustソースをパースし、struct_item, trait_item, impl_item などのノードを捕捉するトラバーサルロジックを実装します。 | Restrictions: Rust特有のマクロ展開などは深追いせず、定義レベルを確実に捉えること。 | Success: Rustの構文木をエラーなく走査でき、主要ノードを分類できること。_

- [ ] 3. エンティティ（Struct, Trait, Enum）と関係の抽出
  - File: src/services/sourceToDiagram/ast/rust/RustAstParser.ts
  - 構造体、トレイト、列挙型の基本情報を抽出し、それらの依存・実装関係を特定する
  - Purpose: Rustのデータと振る舞いの構造をダイアグラム化する
  - _Requirements: 全要件_
  - _Prompt: Role: Rust言語仕様の専門家 | Task: struct, trait, enum の名称を取得し、ClassInfoにマッピングするロジックを実装します。特に impl Trait for Struct の形式から、インターフェースの実装関係を抽出してください。 | Restrictions: implブロックが複数に分かれている場合でも、情報を集約できるように工夫すること。 | Success:Rust特有の構造が、クラス図の概念（クラス、インターフェース）に正しく変換されること。_

- [ ] 4. フィールドおよびメソッド（implブロック）の抽出
  - File: src/services/sourceToDiagram/ast/rust/RustAstParser.ts
  - 構造体のフィールド、およびimplブロック内の関数をメンバ情報として抽出する
  - Purpose: Rustのメンバ詳細をダイアグラムに反映する
  - _Requirements: 全要件_
  - _Prompt: Role: Rustシステム開発者 | Task: 構造体のフィールド（名称、型）と、implブロック内のメソッド（名称、戻り値、引数）を解析し、AttributeInfo/OperationInfoに変換します。pub 修飾子による公開範囲も考慮してください。 | Restrictions: セルフ参照（self, &self, &mut self）を適切に引数リストから処理するか、特別なフラグとして扱うこと。 | Success: メソッドが対応する構造体に正しく紐づけられ、属性とともに抽出されること。_

- [ ] 5. Rust ASTパーサーの単体テスト作成
  - File: src/test/suite/ast/RustAstParser.test.ts
  - Rustソースコードに対するパース結果を検証する
  - Purpose: 解析エンジンの信頼性を確保する
  - _Leverage: src/test/suite/ast/TypescriptAstParser.test.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: QAエンジニア | Task: RustAstParserのためのテストスイートを作成します。複数のimplブロック、トレイトの実装、複雑な列挙型、ジェネリクス等を含むRustコードでのパースをテストしてください。 | Restrictions: 既存のテスト環境と整合性を保つこと。 | Success: すべてのRustテストケースが期待通りに成功すること。_
