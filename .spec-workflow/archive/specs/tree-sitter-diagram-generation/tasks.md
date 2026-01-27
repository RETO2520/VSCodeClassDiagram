# Tasks: tree-sitterを利用したdiagram.json構築

- [x] 1. 依存関係の追加
  - File: package.json
  - `tree-sitter` および主要言語の文法の追加 (`tree-sitter-typescript` 等)
  - Purpose: AST解析に必要なライブラリを導入する
  - _Requirements: 3.1_
  - _Prompt: Role: Node.js 依存関係管理のエキスパート | Task: tree-sitter および tree-sitter-typescript を package.json に追加し、npm install を実行する準備をします。 | Restrictions: 既存の依存関係と競合しないバージョンを選択する。 | Success: package.json に正しく追加され、インストール可能である。_

- [ ] 2. TreeSitterAstParser の実装
  - File: src/services/sourceToDiagram/ast/TreeSitterAstParser.ts
  - `IAstParser` インターフェースを実装し、tree-sitter を使用してパースを行う
  - Purpose: 汎用的な AST 解析エンジンを提供する
  - _Leverage: src/services/sourceToDiagram/ast/IAstParser.ts, src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts_
  - _Requirements: 1.1, 2.1_
  - _Prompt: Role: Tree-Sitter と TypeScript の専門知識を持つソフトウェアエンジニア | Task: IAstParser を実装した TreeSitterAstParser クラスを作成します。node-tree-sitter を使用してコードをパースし、基本的な Tree を生成するメソッドを実装してください。 | Restrictions: 既存の IAstParser 契約を遵守し、型安全性を確保する。 | Success: クラスが作成され、TypeScript ファイルのパースがエラーなく実行できる。_

- [ ] 3. クエリベースの情報抽出ロジックの実装
  - File: src/services/sourceToDiagram/ast/TreeSitterAstParser.ts
  - Tree-Sitter の Query を使用してクラス定義、プロパティ、メソッドを抽出する
  - `ClassInfo` 形式へのマッピングを行う
  - Purpose: 構文木から必要な情報を正確に取得する
  - _Requirements: 1.2_
  - _Prompt: Role: 構文解析と Tree-Sitter クエリのスペシャリスト | Task: TreeSitterAstParser 内に、Query を使用して ClassInfo (クラス名、属性、メソッド、継承関係) を抽出するロジックを実装します。 | Restrictions: 複雑な継承関係や可視性の修飾子も考慮に含める。 | Success: サンプルコードから正しい ClassInfo 配列が生成される。_

- [ ] 4. AstParserFactory の更新
  - File: src/services/sourceToDiagram/ast/AstParserFactory.ts
  - `TreeSitterAstParser` を登録し、適切な言語 ID で呼び出されるようにする
  - Purpose: 既存の解析パイプラインに新パーサーを統合する
  - _Leverage: src/services/sourceToDiagram/ast/AstParserFactory.ts_
  - _Requirements: 2.2_
  - _Prompt: Role: 設計パターンとリファクタリングの専門家 | Task: AstParserFactory.initialize メソッドを更新し、TreeSitterAstParser を登録します。既存の TypeScriptAstParser との優先順位を考慮して設定してください。 | Restrictions: 既存の機能を壊さず、拡張可能な形で実装する。 | Success: 指定した言語 ID に対して TreeSitterAstParser が適切に返される。_

- [ ] 5. 多言語サポートの初期実装 (TypeScript 以外への拡張準備)
  - File: src/services/sourceToDiagram/ast/TreeSitterAstParser.ts
  - 言語 ID に応じた文法とクエリの切り替え機構を実装する
  - Purpose: 将来的な多言語拡張を容易にする
  - _Requirements: 3.1, 3.2_
  - _Prompt: Role: マルチ言語アーキテクチャの専門家 | Task: TreeSitterAstParser に言語ごとの文法ロードおよびクエリファイル読み込みの仕組みを導入します。 | Restrictions: パフォーマンスへの影響を最小限に抑え、動的ロードに失敗した場合のフォールバックを考慮する。 | Success: TypeScript 以外の言語 ID を受け取った際の構造的な準備が整っている。_

- [ ] 6. 動作確認とテスト
  - File: src/test/services/sourceToDiagram/ast/TreeSitterAstParser.test.ts
  - 代表的な TypeScript ファイルを用いた単体テストの実装
  - `diagram.json` への変換確認
  - Purpose: 実装の正確性を保証し、デグレードを防ぐ
  - _Leverage: src/test/FileService.test.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: QA エンジニア | Task: TreeSitterAstParser の包括的な単体テストを作成します。様々なクラス構造、ネストされた定義、特殊な型が含まれるコードをテストケースとして扱ってください。 | Success: すべてのテストがパスし、期待通りの ClassInfo が抽出される。_
