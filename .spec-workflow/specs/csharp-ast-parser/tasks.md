# Tasks Document

- [x] 1. C#パーサーの基本クラス作成
  - File: src/services/sourceToDiagram/ast/csharp/CsharpAstParser.ts
  - IAstParserインターフェースを実装するCsharpAstParserクラスを作成する
  - Purpose: C#の解析をシステムに統合する
  - _Leverage: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: TypeScriptとC#の相互運用に詳しい開発者 | Task: IAstParserインターフェースを実装するCsharpAstParserクラスのスケルトンを作成します。src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts の構造を参考にし、C#言語識別子（'csharp'）をサポートするように構成してください。 | Restrictions: プロジェクトのディレクトリ構造 (.ast/csharp/) を守ること。 | Success: クラスが定義され、プロジェクト全体のビルドが通ること。_

- [x] 2. Tree-sitter-c-sharpを用いた解析基盤の実装
  - File: src/services/sourceToDiagram/ast/csharp/CsharpAstParser.ts
  - tree-sitter-c-sharpを使用してソースをパースし、ASTトラバーサルを行う
  - Purpose: C#ソースコードを機械的に読み取る
  - _Leverage: web-tree-sitter, tree-sitter-c-sharp.wasm_
  - _Requirements: 全要件_
  - _Prompt: Role: Tree-sitterのエキスパート | Task: CsharpAstParserに、tree-sitter-c-sharpを使用してASTノードを再帰的に走査するロジックを実装します。class_declaration や interface_declaration などの主要なノードを捕捉できるようにしてください。 | Restrictions: 大型ファイルでもメモリ効率良く処理できるよう、非同期処理を適切に扱うこと。 | Success: C#コードを入力として受け取り、構文木をエラーなく走査できること。_

- [x] 3. クラス、インターフェース、継承関係の抽出
  - File: src/services/sourceToDiagram/ast/csharp/CsharpAstParser.ts
  - クラス、インターフェース、レコードの定義とそれらの継承関係を抽出する
  - Purpose: クラス図の主要なエンティティと関係を定義する
  - _Requirements: 全要件_
  - _Prompt: Role: C#言語仕様のエキスパート | Task: C#のクラス、インターフェース、レコード定義から名称とベースクラス・インターフェースリストを抽出するロジックを実装します。完全修飾名（名前空間）の考慮も開始してください。 | Restrictions: 複数のベースタイプ（1つのクラスと複数のインターフェース）の混在を正しく処理すること。 | Success: 正しいエンティティ名、タイプ（kind）、基底クラス、インターフェースがClassInfoにマッピングされること。_

- [x] 4. プロパティ・フィールドおよびメソッドの抽出
  - File: src/services/sourceToDiagram/ast/csharp/CsharpAstParser.ts
  - メンバ情報（Property, Field, Method）を抽出し、AttributeInfo/OperationInfoに変換する
  - Purpose: クラスの詳細情報をダイアグラムに反映する
  - _Requirements: 全要件_
  - _Prompt: Role: C#バックエンド開発者 | Task: C#のプロパティ（get/set）、フィールド、およびメソッド定義を解析し、名称、型、引数、アクセス修飾子を取得するロジックを実装します。static, override 等の属性も取得してください。 | Restrictions: C#特有の get; set; 自動プロパティも正しく属性として処理すること。 | Success: クラスのメンバが完全なシグネチャとともに出力されること。_

- [x] 5. C# ASTパーサーの単体テスト作成
  - File: src/test/suite/ast/CsharpAstParser.test.ts
  - C#ソースコードに対するパース結果を検証する
  - Purpose: 実装の正確性を保証する
  - _Leverage: src/test/suite/ast/TypescriptAstParser.test.ts_
  - _Requirements: 全要件_
  - _Prompt: Role: QAエンジニア | Task: CsharpAstParserの各種ケース（Record型、Partial Class、複雑な継承等）を網羅する単体テストを作成します。 | Restrictions: 既存のテストフレームワーク（Mocha/Jest）に適合させること。 | Success: すべてのテストケースをパスすること。_
