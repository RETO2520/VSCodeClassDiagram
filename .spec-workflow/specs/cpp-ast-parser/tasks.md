# Tasks Document

- [ ] 1. C++パーサーの基本クラス作成
  - File: src/services/sourceToDiagram/ast/cpp/CppAstParser.ts
  - IAstParserインターフェースを実装するCppAstParserクラスを作成する
  - Purpose: C++の解析をシステムに統合する
  - _Leverage: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts_
  - _Requirements: 1.1, 2.1_
  - _Prompt: Role: TypeScriptとコンパイラ理論の専門家 | Task: IAstParserインターフェースを実装するCppAstParserクラスのスケルトンを作成します。src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts の構造を参考にし、C++言語識別子（'cpp'）をサポートするように構成してください。 | Restrictions: 既存のインターフェース契約を遵守し、ロギングコンポーネントを適切に注入すること。 | Success: クラスが正しく定義され、空のparseメソッドが定義され、プロジェクトのビルドが通ること。_

- [ ] 2. Tree-sitterを用いたASTトラバーサルの実装
  - File: src/services/sourceToDiagram/ast/cpp/CppAstParser.ts
  - tree-sitter-cppを使用してC++ソースコードをパースし、ASTを走査するロジックを実装する
  - Purpose: ソースコードから構造的な情報を抽出する
  - _Leverage: web-tree-sitter, tree-sitter-cpp.wasm_
  - _Requirements: 1.1, 2.1_
  - _Prompt: Role: AST解析とweb-tree-sitterに精通した開発者 | Task: CppAstParserクラスに、web-tree-sitterを使用してASTを走査する visitNode メソッドを実装します。class_specifier や struct_specifier ノードを識別し、基本的なクラス情報を抽出できる基盤を作成してください。WASMのロードと初期化処理も含める必要があります。 | Restrictions: Tree-sitterの型定義を正しく使用し、不完全なコードでもクラッシュしないように例外処理を含めること。 | Success: コンテンツをパースして、ネストされたノードを再帰的に訪問できること。_

- [ ] 3. クラス・構造体および継承関係の抽出
  - File: src/services/sourceToDiagram/ast/cpp/CppAstParser.ts
  - クラス名、構造体名、および基底クラスの情報を抽出してClassInfoにマッピングする
  - Purpose: クラス図の主要なエンティティと関係を特定する
  - _Requirements: 1.1_
  - _Prompt: Role: C++言語仕様の専門家 | Task: C++のクラス・構造体定義から、名称と継承関係（base_class_clause）を抽出するロジックを実装します。アクセス修飾子（public, protected, private）も考慮し、ClassInfoオブジェクトに変換してください。 | Restrictions: 多重継承やテンプレート引数を含むクラス名も可能な限り適切に取得すること。 | Success: 指定したソースからクラス名と継承先が正しく抽出され、ClassInfo配列として返されること。_

- [ ] 4. 属性（メンバ変数）の抽出
  - File: src/services/sourceToDiagram/ast/cpp/CppAstParser.ts
  - クラス内のフィールド宣言を解析し、AttributeInfoに変換する
  - Purpose: クラスのデータ構造をダイアグラムに反映する
  - _Requirements: 2.1_
  - _Prompt: Role: C++バックエンド開発者 | Task: field_declaration ノードを解析し、変数名、型名、およびアクセス修飾子を抽出してAttributeInfoの配列に格納するロジックを実装します。static 修飾子の有無も記録してください。 | Restrictions: ポインタや参照を含む複雑な型宣言を適切に文字列化すること。 | Success: クラス内のメンバ変数が正しい型と名称で抽出されること。_

- [ ] 5. 操作（メソッド）の抽出
  - File: src/services/sourceToDiagram/ast/cpp/CppAstParser.ts
  - クラス内の関数宣言・定義を解析し、OperationInfoに変換する
  - Purpose: クラスの振る舞いをダイアグラムに反映する
  - _Requirements: 2.2_
  - _Prompt: Role: C++バックエンド開発者 | Task: function_definition や field_declaration（関数ポインタや宣言のみの場合）を解析し、メソッド名、戻り値の型、引数リスト、アクセス修飾子を抽出してOperationInfoの配列に格納します。virtual や static 修飾子も反映してください。 | Restrictions: 引数の型と名称の両方を正確に取得すること。親クラスのメソッドのオーバーライドなどは修飾子で判断すること。 | Success: クラス内のメソッドが完全なシグネチャとともに抽出されること。_

- [ ] 6. C++ ASTパーサーの単体テスト作成
  - File: src/test/suite/ast/CppAstParser.test.ts
  - 様々なC++ソースコードの構成に対するパース結果を検証するテストコードを作成する
  - Purpose: 解析ロジックの正確性と回帰防止を確保する
  - _Leverage: src/test/suite/ast/TypescriptAstParser.test.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: QAエンジニア | Task: CppAstParserをテストするための包括的なテストスイートを作成します。標準的なクラス、継承関係、アクセス修飾子が異なるメンバ、テンプレートクラスなど、複数のテストケースを含めてください。 | Restrictions: 外部依存を可能な限り排除するか、適切にモック化すること。 | Success: すべてのテストケースが成功し、期待通りのClassInfoが生成されることが確認されること。_
