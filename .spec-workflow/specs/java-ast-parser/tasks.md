# Tasks Document

- [ ] 1. Javaパーサーの基本クラス作成
  - File: src/services/sourceToDiagram/ast/java/JavaAstParser.ts
  - IAstParserインターフェースを実装するJavaAstParserクラスを作成する
  - Purpose: Javaの解析をシステムに統合する
  - _Leverage: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: TypeScriptとJavaの知識を持つ開発者 | Task: IAstParserインターフェースを実装するJavaAstParserクラスのスケルトンを作成します。TypeScriptAstParserを参考にし、Java言語識別子（'java'）への対応、および必要なTree-sitterライブラリのロードを構成してください。 | Restrictions: ディレクトリ構造と命名規則を遵守すること。 | Success: クラスが定義され、プロジェクトのビルドがエラーなく完了すること。_

- [ ] 2. Tree-sitter-javaを用いた解析ロジックの実装
  - File: src/services/sourceToDiagram/ast/java/JavaAstParser.ts
  - tree-sitter-javaを使用してASTを走査し、Java構造を捕捉する
  - Purpose: Javaの構文木を解析する
  - _Leverage: web-tree-sitter, tree-sitter-java.wasm_
  - _Requirements: 全要件_
  - _Prompt: Role: Tree-sitterの経験豊富な開発者 | Task: tree-sitter-javaを使用して、Javaソースをパースし、ASTノードを再帰的に走査するロジックを実装します。class_declaration や interface_declaration などを識別する visitor メソッドを含めてください。 | Restrictions: Javaのアノテーション等、名前の前に来る修飾子をスキップして正しいエンティティ名を取得すること。 | Success: Javaコードを読み込み、主要な構造ノードを捕捉できること。_

- [ ] 3. Javaエンティティ（Class, Interface, Enum, Record）の抽出
  - File: src/services/sourceToDiagram/ast/java/JavaAstParser.ts
  - 各種定義、およびextends/implementsによる継承関係を抽出する
  - Purpose: クラス図の階層構造を構築する
  - _Requirements: 全要件_
  - _Prompt: Role: Java言語仕様の専門家 | Task: Javaのクラス、インターフェース、列挙型、レコード定義から名称と継承関係を抽出するロジックを実装します。extends や implements キーワードに基づく基底クラス・インターフェースのリストを取得してください。 | Restrictions: パッケージ名やインポートを考慮し、可能な限り完全な型情報を取得すること。 | Success: ClassInfoオブジェクトの配列に、正しいkindと継承関係が格納されること。_

- [ ] 4. メンバ（Field, Method）の抽出
  - File: src/services/sourceToDiagram/ast/java/JavaAstParser.ts
  - クラス内のフィールド（属性）とメソッド（操作）の情報を抽出する
  - Purpose: クラスの詳細情報をダイアグラムに反映する
  - _Requirements: 全要件_
  - _Prompt: Role: Javaバックエンド開発者 | Task: Javaのフィールド宣言とメソッド宣言を解析し、属性名、型、アクセス修飾子、メソッド名、戻り値の型、引数リストを取得します。static、final、abstract 等の修飾子も抽出してください。 | Restrictions: オーバーロードされたメソッドを同一クラス内で区別して保持すること。 | Success: Javaクラスの全メンバがAttributeInfo/OperationInfoとして正しくマッピングされること。_

- [ ] 5. Java ASTパーサーの単体テスト作成
  - File: src/test/suite/ast/JavaAstParser.test.ts
  - Javaソースコードに対するパース結果を検証する
  - Purpose: 信頼性の高い解析を保証する
  - _Leverage: src/test/suite/ast/TypescriptAstParser.test.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: QAエンジニア | Task: JavaAstParserのためのテストスイートを作成します。アノテーションが含まれるクラス、ジェネリクスを使用するクラス、多重継承を行うインターフェースなど、様々なJavaコードでのテストを実施してください。 | Restrictions: テスト用ソースコードをテストファイル内で完結させるか、外部リソースとして管理すること。 | Success: すべてのJavaテストケースが成功すること。_
