# Tasks Document - ソースコードからdiagram.json構築

## フェーズ1: データモデルとインターフェース定義

- [x] 1.1. 基本データ型インターフェースを定義する
  - File: src/services/sourceToDiagram/types.ts
  - ClassInfo、AttributeInfo、OperationInfo、ParameterInfoの基本インターフェースを定義する
  - Purpose: 解析層と変換層の間のデータ受け渡しに使用する基本型を提供する
  - _Leverage: src/CodeComponents/CodeGenerator.ts（IObjectModel等の既存インターフェースを参照）_
  - _Requirements: 要件3, 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript型システムの専門知識を持つ開発者 | Task: 要件3と要件5に従って、src/services/sourceToDiagram/types.tsにClassInfo、AttributeInfo、OperationInfo、ParameterInfoの基本インターフェースを定義します。VS Code API（vscode.Uri、vscode.Range）を適切に使用し、既存のIObjectModelインターフェース（src/CodeComponents/CodeGenerator.ts）への変換を考慮した構造にします。 | Restrictions: 既存のIObjectModelインターフェースを変更せず、下位互換性を維持する。型安全性を確保する | Success: すべての基本インターフェースはエラーなくコンパイルされ、VS Code APIを正しく使用し、型安全性が確保されています。_

- [x] 1.2. AnalyzeOptionsとLayoutInfoインターフェースを定義する
  - File: src/services/sourceToDiagram/types.ts（タスク1.1から継続）
  - AnalyzeOptions（解析オプション）とLayoutInfo（レイアウト情報）のインターフェースを追加する
  - Purpose: 解析時の設定とレイアウト情報の型定義を提供する
  - _Leverage: src/services/sourceToDiagram/types.ts（タスク1.1で作成したファイル）_
  - _Requirements: 要件1, 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript型システムの専門知識を持つ開発者 | Task: 要件1と要件5に従って、src/services/sourceToDiagram/types.tsにAnalyzeOptionsとLayoutInfoインターフェースを追加します。AnalyzeOptionsにはincludePatterns、excludePatterns、useLsp、useAst、maxFilesなどのオプションを含めます。LayoutInfoにはclassId、x、y、width、heightを含めます。 | Restrictions: オプショナルフィールドを適切に使用し、デフォルト値が設定可能な構造にする | Success: AnalyzeOptionsとLayoutInfoインターフェースが正しく定義され、エラーなくコンパイルされます。_

- [x] 1.3. ILspProviderインターフェースを定義する
  - File: src/services/sourceToDiagram/lsp/ILspProvider.ts
  - LSPプロバイダーの統一インターフェースを定義する
  - Purpose: LSP連携機能の抽象化とテスト容易性を提供する
  - _Leverage: VS Code API（vscode.languages.*）、src/services/sourceToDiagram/types.ts_
  - _Requirements: 要件1, 要件2_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: インターフェース設計の専門知識を持つ開発者 | Task: 要件1と要件2に従って、src/services/sourceToDiagram/lsp/ILspProvider.tsにLSPプロバイダーの統一インターフェースを定義します。getDocumentSymbols、getSemanticTokens、isAvailableメソッドを含めます。 | Restrictions: インターフェースは明確で拡張可能にし、エラーハンドリングを考慮する | Success: ILspProviderインターフェースが明確に定義され、実装クラスで実装可能な構造になっています。_

- [x] 1.4. IAstParserインターフェースを定義する
  - File: src/services/sourceToDiagram/ast/IAstParser.ts
  - ASTパーサーの統一インターフェースを定義する
  - Purpose: 言語固有のASTパーサーの抽象化とテスト容易性を提供する
  - _Leverage: src/services/sourceToDiagram/types.ts_
  - _Requirements: 要件3, 要件4_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: インターフェース設計の専門知識を持つ開発者 | Task: 要件3と要件4に従って、src/services/sourceToDiagram/ast/IAstParser.tsにASTパーサーの統一インターフェースを定義します。parseメソッド（uri、contentを受け取り、ClassInfo[]を返す）とsupportsメソッド（languageIdを受け取り、booleanを返す）を含めます。 | Restrictions: インターフェースは明確で拡張可能にし、エラーハンドリングを考慮する | Success: IAstParserインターフェースが明確に定義され、実装クラスで実装可能な構造になっています。_

- [x] 1.5. IDiagramConverterインターフェースを定義する
  - File: src/services/sourceToDiagram/converter/IDiagramConverter.ts
  - diagram.json変換機能の統一インターフェースを定義する
  - Purpose: 変換ロジックの抽象化とテスト容易性を提供する
  - _Leverage: src/services/sourceToDiagram/types.ts、src/CodeComponents/CodeGenerator.ts（IObjectModel）_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: インターフェース設計の専門知識を持つ開発者 | Task: 要件5に従って、src/services/sourceToDiagram/converter/IDiagramConverter.tsにdiagram.json変換機能の統一インターフェースを定義します。convertメソッド（ClassInfo[]を受け取り、IObjectModelを返す）とgenerateLayoutメソッド（ClassInfo[]を受け取り、LayoutInfo[]を返す）を含めます。 | Restrictions: 既存のIObjectModelインターフェースに準拠した結果を返すことを保証する | Success: IDiagramConverterインターフェースが明確に定義され、実装クラスで実装可能な構造になっています。_

## フェーズ2: LSP連携実装

- [x] 2.1. LspProviderクラスの基本構造を実装する
  - File: src/services/sourceToDiagram/lsp/LspProvider.ts
  - LspProviderクラスを作成し、ILspProviderインターフェースを実装する。コンストラクタとisAvailableメソッドを実装する
  - Purpose: LSPプロバイダーの基本構造を確立する
  - _Leverage: src/services/sourceToDiagram/lsp/ILspProvider.ts、src/LoggerComponents/Logger.ts_
  - _Requirements: 要件1, 要件2_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extension APIの専門知識を持つ開発者 | Task: 要件1と要件2に従って、src/services/sourceToDiagram/lsp/LspProvider.tsにLspProviderクラスを作成します。ILspProviderインターフェースを実装し、コンストラクタでLoggerを受け取り、isAvailableメソッドでvscode.languages.getLanguages()を使用してLSPプロバイダーの利用可能性をチェックします。 | Restrictions: エラーをスローせず、利用できない場合はfalseを返す。既存のLoggerパターンに従う | Success: LspProviderクラスが正しく作成され、isAvailableメソッドが正しく動作し、エラーなくコンパイルされます。_

- [x] 2.2. getDocumentSymbolsメソッドを実装する
  - File: src/services/sourceToDiagram/lsp/LspProvider.ts（タスク2.1から継続）
  - vscode.languages.getDocumentSymbolsを使用してDocumentSymbolを取得する機能を実装する
  - Purpose: LSPプロバイダーからクラス、インターフェース、メソッド、プロパティの基本構造を取得する
  - _Leverage: VS Code API（vscode.languages.getDocumentSymbols）、src/LoggerComponents/Logger.ts_
  - _Requirements: 要件1_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extension APIとLanguage Server Protocolの専門知識を持つ開発者 | Task: 要件1に従って、LspProviderクラスにgetDocumentSymbolsメソッドを実装します。vscode.languages.getDocumentSymbolsを使用してDocumentSymbolを取得し、エラーが発生した場合はLoggerに記録して空配列を返します。LSPプロバイダーが利用できない場合はnullを返します。 | Restrictions: エラーをスローせず、常に適切な値を返す。Loggerを使用してエラーを記録する | Success: getDocumentSymbolsメソッドが正しく動作し、DocumentSymbolを取得でき、エラーハンドリングが適切です。_

- [x] 2.3. getSemanticTokensメソッドを実装する
  - File: src/services/sourceToDiagram/lsp/LspProvider.ts（タスク2.2から継続）
  - vscode.languages.provideDocumentSemanticTokensを使用してSemantic Tokensを取得する機能を実装する
  - Purpose: LSPプロバイダーから詳細な型情報と修飾子を取得する
  - _Leverage: VS Code API（vscode.languages.provideDocumentSemanticTokens）、src/LoggerComponents/Logger.ts_
  - _Requirements: 要件2_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extension APIとSemantic Tokensの専門知識を持つ開発者 | Task: 要件2に従って、LspProviderクラスにgetSemanticTokensメソッドを実装します。vscode.languages.provideDocumentSemanticTokensを使用してSemantic Tokensを取得し、エラーが発生した場合はLoggerに記録してnullを返します。Semantic Tokensプロバイダーが利用できない場合もnullを返します。 | Restrictions: エラーをスローせず、常に適切な値を返す。Loggerを使用してエラーを記録する | Success: getSemanticTokensメソッドが正しく動作し、Semantic Tokensを取得でき、エラーハンドリングが適切です。_

- [x] 2.4. DocumentSymbolからClassInfoへの変換ロジックを実装する
  - File: src/services/sourceToDiagram/lsp/DocumentSymbolConverter.ts
  - DocumentSymbolをClassInfo形式に変換するユーティリティクラスを実装する
  - Purpose: LSPのDocumentSymbolを内部データ構造（ClassInfo）に変換する
  - _Leverage: src/services/sourceToDiagram/types.ts、VS Code API（vscode.DocumentSymbol）_
  - _Requirements: 要件1_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: データ変換ロジックの専門知識を持つ開発者 | Task: 要件1に従って、src/services/sourceToDiagram/lsp/DocumentSymbolConverter.tsにDocumentSymbolをClassInfo形式に変換する機能を実装します。クラス、インターフェース、メソッド、プロパティを正しく識別し、ClassInfo、AttributeInfo、OperationInfoに変換します。 | Restrictions: ネストされたシンボルを正しく処理し、エラーが発生しても可能な限り部分的な結果を返す | Success: DocumentSymbolConverterが正しく動作し、DocumentSymbolをClassInfo形式に変換でき、エッジケースも適切に処理されます。_

- [x] 2.5. Semantic Tokensから修飾子と型情報を抽出するロジックを実装する
  - File: src/services/sourceToDiagram/lsp/SemanticTokensExtractor.ts
  - Semantic Tokensから修飾子（public/private/protected、static、abstract等）と型情報を抽出するユーティリティクラスを実装する
  - Purpose: Semantic Tokensから詳細なメタデータを抽出してClassInfoに追加する
  - _Leverage: VS Code API（vscode.SemanticTokens）、src/services/sourceToDiagram/types.ts_
  - _Requirements: 要件2_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Semantic Tokens解析の専門知識を持つ開発者 | Task: 要件2に従って、src/services/sourceToDiagram/lsp/SemanticTokensExtractor.tsにSemantic Tokensから修飾子と型情報を抽出する機能を実装します。Semantic Tokensのトークンタイプと修飾子を解析し、visibility、modifiers、型情報を抽出します。 | Restrictions: Semantic Tokensの形式を正しく理解し、エラーが発生しても可能な限り部分的な結果を返す | Success: SemanticTokensExtractorが正しく動作し、修飾子と型情報を抽出でき、エッジケースも適切に処理されます。_

## フェーズ3: AST解析実装

- [x] 3.1. TypeScriptAstParserクラスの基本構造を実装する
  - File: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts
  - TypeScriptAstParserクラスを作成し、IAstParserインターフェースを実装する。コンストラクタとsupportsメソッドを実装する
  - Purpose: TypeScript/JavaScript AST解析の基本構造を確立する
  - _Leverage: src/services/sourceToDiagram/ast/IAstParser.ts、src/LoggerComponents/Logger.ts_
  - _Requirements: 要件3, 要件4_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript AST解析の専門知識を持つ開発者 | Task: 要件3と要件4に従って、src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.tsにTypeScriptAstParserクラスを作成します。IAstParserインターフェースを実装し、コンストラクタでLoggerを受け取り、supportsメソッドで'typescript'と'javascript'をサポートするように実装します。 | Restrictions: パーサーライブラリは動的にロードし、必須依存としない。エラーをスローせず、適切にハンドリングする | Success: TypeScriptAstParserクラスが正しく作成され、supportsメソッドが正しく動作し、エラーなくコンパイルされます。_

- [x] 3.2. @typescript-eslint/parserの動的ロード機能を実装する
  - File: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts（タスク3.1から継続）
  - @typescript-eslint/parserを動的にロードし、利用できない場合のエラーハンドリングを実装する
  - Purpose: パーサーライブラリをオプショナル依存として扱い、利用できない場合でもエラーをスローしない
  - _Leverage: Node.js require()の動的ロード、src/LoggerComponents/Logger.ts_
  - _Requirements: 要件3, 要件6_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Node.jsモジュールシステムの専門知識を持つ開発者 | Task: 要件3と要件6に従って、TypeScriptAstParserクラスに@typescript-eslint/parserを動的にロードする機能を実装します。try-catchを使用してパーサーのロードを試み、失敗した場合はLoggerに警告を記録し、nullを返します。 | Restrictions: エラーをスローせず、常に適切な値を返す。Loggerを使用して警告を記録する | Success: パーサーの動的ロードが正しく動作し、利用できない場合も適切にハンドリングされます。_

- [x] 3.3. ASTからクラス宣言を抽出する機能を実装する
  - File: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts（タスク3.2から継続）
  - TypeScript ASTをトラバースしてクラス宣言ノードを検出し、ClassInfo形式に変換する機能を実装する
  - Purpose: ASTからクラス、インターフェース、抽象クラスの基本情報を抽出する
  - _Leverage: @typescript-eslint/parser、src/services/sourceToDiagram/types.ts_
  - _Requirements: 要件3_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: ASTトラバーサルとTypeScript構文解析の専門知識を持つ開発者 | Task: 要件3に従って、TypeScriptAstParserクラスにASTからクラス宣言を抽出する機能を実装します。@typescript-eslint/parserで生成されたASTをトラバースし、ClassDeclaration、InterfaceDeclaration、AbstractClassDeclarationノードを検出して、ClassInfo形式に変換します。クラス名、基底クラス、実装インターフェース、ジェネリック型パラメータを抽出します。 | Restrictions: 構文エラーがあるコードでも可能な限り部分的な解析を試みる。エラーはLoggerに記録する | Success: クラス宣言の抽出が正しく動作し、クラス、インターフェース、抽象クラスを正しく識別でき、エッジケースも適切に処理されます。_

- [x] 3.4. ASTからメソッド宣言を抽出する機能を実装する
  - File: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts（タスク3.3から継続）
  - クラス内のメソッド宣言ノードを検出し、OperationInfo形式に変換する機能を実装する
  - Purpose: ASTからメソッド名、パラメータ、戻り値の型、修飾子を抽出する
  - _Leverage: @typescript-eslint/parser、src/services/sourceToDiagram/types.ts_
  - _Requirements: 要件3_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: ASTトラバーサルとTypeScript構文解析の専門知識を持つ開発者 | Task: 要件3に従って、TypeScriptAstParserクラスにASTからメソッド宣言を抽出する機能を実装します。MethodDeclaration、MethodSignatureノードを検出し、メソッド名、パラメータ（名前、型、オプショナル）、戻り値の型、可視性（public/private/protected）、修飾子（static、abstract等）を抽出してOperationInfo形式に変換します。 | Restrictions: オーバーロードされたメソッドも正しく処理する。エラーはLoggerに記録する | Success: メソッド宣言の抽出が正しく動作し、パラメータ、戻り値の型、修飾子を正しく識別でき、エッジケースも適切に処理されます。_

- [x] 3.5. ASTからプロパティ宣言を抽出する機能を実装する
  - File: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts（タスク3.4から継続）
  - クラス内のプロパティ宣言ノードを検出し、AttributeInfo形式に変換する機能を実装する
  - Purpose: ASTからプロパティ名、型、可視性、修飾子を抽出する
  - _Leverage: @typescript-eslint/parser、src/services/sourceToDiagram/types.ts_
  - _Requirements: 要件3_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: ASTトラバーサルとTypeScript構文解析の専門知識を持つ開発者 | Task: 要件3に従って、TypeScriptAstParserクラスにASTからプロパティ宣言を抽出する機能を実装します。PropertyDeclaration、PropertySignatureノードを検出し、プロパティ名、型、可視性（public/private/protected）、修飾子（static、readonly等）、初期値の有無を抽出してAttributeInfo形式に変換します。 | Restrictions: getter/setterも正しく処理する。エラーはLoggerに記録する | Success: プロパティ宣言の抽出が正しく動作し、型、可視性、修飾子を正しく識別でき、エッジケースも適切に処理されます。_

- [x] 3.6. parseメソッドの統合実装を完了する
  - File: src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts（タスク3.5から継続）
  - parseメソッドを実装し、ファイル内容をパースしてClassInfo配列を返す機能を完成する
  - Purpose: TypeScriptAstParserの主要機能を完成させる
  - _Leverage: タスク3.2-3.5で実装した機能、src/services/FileService.ts（ファイル読み込み）_
  - _Requirements: 要件3, 要件6_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: システム統合の専門知識を持つ開発者 | Task: 要件3と要件6に従って、TypeScriptAstParserクラスのparseメソッドを実装します。uriとcontentを受け取り、パーサーをロードし、ASTを構築し、クラス、メソッド、プロパティを抽出してClassInfo配列を返します。エラーが発生した場合はLoggerに記録し、可能な限り部分的な結果を返します。 | Restrictions: 構文エラーがあるコードでも可能な限り部分的な解析を試みる。エラーをスローせず、常に適切な値を返す | Success: parseメソッドが正しく動作し、TypeScript/JavaScriptファイルからClassInfo配列を抽出でき、エラーハンドリングが適切です。_

- [x] 3.7. AstParserFactoryを実装する
  - File: src/services/sourceToDiagram/ast/AstParserFactory.ts
  - 言語IDに基づいて適切なASTパーサーを返すファクトリークラスを実装する
  - Purpose: マルチ言語対応の基盤を提供し、将来の拡張を容易にする
  - _Leverage: src/services/sourceToDiagram/ast/IAstParser.ts、src/services/sourceToDiagram/ast/typescript/TypescriptAstParser.ts_
  - _Requirements: 要件4_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: ファクトリーパターンの専門知識を持つ開発者 | Task: 要件4に従って、src/services/sourceToDiagram/ast/AstParserFactory.tsに言語IDに基づいて適切なASTパーサーを返すファクトリークラスを実装します。TypeScriptAstParserを登録し、'typescript'と'javascript'に対してTypeScriptAstParserを返します。パーサーが見つからない場合はnullを返します。 | Restrictions: ファクトリーは拡張可能な設計にし、将来の言語追加に対応できるようにする | Success: AstParserFactoryが正しく動作し、言語IDに基づいて適切なパーサーを返し、TypeScriptAstParserが正しく登録されています。_

## フェーズ4: データ変換実装

- [x] 4.1. DiagramConverterクラスの基本構造を実装する
  - File: src/services/sourceToDiagram/converter/DiagramConverter.ts
  - DiagramConverterクラスを作成し、IDiagramConverterインターフェースを実装する。コンストラクタを実装する
  - Purpose: diagram.json変換機能の基本構造を確立する
  - _Leverage: src/services/sourceToDiagram/converter/IDiagramConverter.ts、src/CodeComponents/CodeGenerator.ts（IObjectModel）_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: データ変換ロジックの専門知識を持つ開発者 | Task: 要件5に従って、src/services/sourceToDiagram/converter/DiagramConverter.tsにDiagramConverterクラスを作成します。IDiagramConverterインターフェースを実装し、コンストラクタで必要な依存関係を受け取ります。 | Restrictions: 既存のIObjectModelインターフェースに準拠した結果を返すことを保証する | Success: DiagramConverterクラスが正しく作成され、エラーなくコンパイルされます。_

- [x] 4.2. クラスID生成ユーティリティを実装する
  - File: src/services/sourceToDiagram/converter/IdGenerator.ts
  - クラスに一意のIDを生成するユーティリティクラスを実装する
  - Purpose: diagram.jsonの各クラスに一意のIDを割り当てる
  - _Leverage: cryptoまたはuuidライブラリ_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: ID生成ロジックの専門知識を持つ開発者 | Task: 要件5に従って、src/services/sourceToDiagram/converter/IdGenerator.tsにクラスに一意のIDを生成するユーティリティクラスを実装します。クラス名とファイルパスを基に一意のIDを生成し、同じクラスには常に同じIDを返すようにします（またはUUIDを使用）。 | Restrictions: IDは一意性を保証し、既存のdiagram.jsonとの互換性を考慮する | Success: IdGeneratorが正しく動作し、一意のIDを生成でき、同じクラスには一貫したIDが割り当てられます。_

- [x] 4.3. レイアウト生成ロジックを実装する
  - File: src/services/sourceToDiagram/converter/LayoutGenerator.ts
  - クラスのレイアウト情報（x、y、width、height）を生成するユーティリティクラスを実装する
  - Purpose: diagram.jsonの各クラスにデフォルトのレイアウト情報を設定する
  - _Leverage: src/services/sourceToDiagram/types.ts（LayoutInfo）_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: レイアウトアルゴリズムの専門知識を持つ開発者 | Task: 要件5に従って、src/services/sourceToDiagram/converter/LayoutGenerator.tsにクラスのレイアウト情報を生成する機能を実装します。クラス数に基づいてグリッドレイアウトまたは階層レイアウトを生成し、各クラスにx、y、width、heightのデフォルト値を設定します。 | Restrictions: レイアウトは重複しないようにし、既存のクラス図エディタで表示可能な範囲内に収める | Success: LayoutGeneratorが正しく動作し、適切なレイアウト情報を生成でき、クラスが重複しないように配置されます。_

- [x] 4.4. ClassInfoからIClassModelへの変換ロジックを実装する
  - File: src/services/sourceToDiagram/converter/DiagramConverter.ts（タスク4.1から継続）
  - ClassInfoをIClassModel形式に変換する機能を実装する
  - Purpose: 抽出されたクラス情報を既存のdiagram.json形式に変換する
  - _Leverage: src/services/sourceToDiagram/types.ts、src/CodeComponents/CodeGenerator.ts（IClassModel）、IdGenerator、LayoutGenerator_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: データ変換ロジックの専門知識を持つ開発者 | Task: 要件5に従って、DiagramConverterクラスにClassInfoをIClassModel形式に変換する機能を実装します。IdGeneratorでIDを生成し、LayoutGeneratorでレイアウト情報を生成し、baseClass、baseClassId、interfaces、attributes、operationsを正しくマッピングします。 | Restrictions: 既存のIClassModelインターフェースに完全に準拠し、既存のクラス図エディタで読み込める形式を生成する | Success: ClassInfoからIClassModelへの変換が正しく動作し、生成されたdiagram.jsonは既存のクラス図エディタで読み込めます。_

- [x] 4.5. AttributeInfoとOperationInfoの変換ロジックを実装する
  - File: src/services/sourceToDiagram/converter/DiagramConverter.ts（タスク4.4から継続）
  - AttributeInfoをIAttributeModel形式に、OperationInfoをIOperationModel形式に変換する機能を実装する
  - Purpose: メンバ情報を既存のdiagram.json形式に変換する
  - _Leverage: src/CodeComponents/CodeGenerator.ts（IAttributeModel、IOperationModel）_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: データ変換ロジックの専門知識を持つ開発者 | Task: 要件5に従って、DiagramConverterクラスにAttributeInfoをIAttributeModel形式に、OperationInfoをIOperationModel形式に変換する機能を実装します。visibility、modifier、type、parameters等を正しくマッピングします。 | Restrictions: 既存のインターフェースに完全に準拠し、すべてのフィールドを適切に設定する | Success: AttributeInfoとOperationInfoの変換が正しく動作し、生成されたdiagram.jsonは既存のクラス図エディタで正しく表示されます。_

- [x] 4.6. convertメソッドとgenerateLayoutメソッドを完成させる
  - File: src/services/sourceToDiagram/converter/DiagramConverter.ts（タスク4.5から継続）
  - convertメソッドとgenerateLayoutメソッドを実装し、ClassInfo配列からIObjectModelを生成する機能を完成する
  - Purpose: DiagramConverterの主要機能を完成させる
  - _Leverage: タスク4.2-4.5で実装した機能_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: システム統合の専門知識を持つ開発者 | Task: 要件5に従って、DiagramConverterクラスのconvertメソッドとgenerateLayoutメソッドを実装します。ClassInfo配列を受け取り、各クラスをIClassModelに変換し、IObjectModel形式で返します。generateLayoutメソッドはLayoutInfo配列を返します。 | Restrictions: 既存のIObjectModelインターフェースに完全に準拠し、エラーが発生しても可能な限り部分的な結果を返す | Success: convertメソッドとgenerateLayoutメソッドが正しく動作し、ClassInfo配列からIObjectModelを生成でき、生成されたdiagram.jsonは既存のクラス図エディタで読み込めます。_

## フェーズ5: 統合エントリーポイント実装

- [x] 5.1. SourceAnalyzerクラスの基本構造を実装する
  - File: src/services/sourceToDiagram/SourceAnalyzer.ts
  - SourceAnalyzerクラスを作成し、コンストラクタと依存関係の注入を実装する
  - Purpose: 解析層の統合エントリーポイントの基本構造を確立する
  - _Leverage: src/services/sourceToDiagram/lsp/LspProvider.ts、src/services/sourceToDiagram/ast/AstParserFactory.ts、src/LoggerComponents/Logger.ts_
  - _Requirements: 要件1, 要件2, 要件3, 要件6_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: システム統合の専門知識を持つ開発者 | Task: 要件1、要件2、要件3、要件6に従って、src/services/sourceToDiagram/SourceAnalyzer.tsにSourceAnalyzerクラスを作成します。コンストラクタでLspProvider、AstParserFactory、Loggerを受け取り、依存関係を注入します。 | Restrictions: 依存関係はコンストラクタで注入し、テスト容易性を確保する | Success: SourceAnalyzerクラスが正しく作成され、依存関係が適切に注入され、エラーなくコンパイルされます。_

- [x] 5.2. analyzeFileメソッドを実装する（LSP優先）
  - File: src/services/sourceToDiagram/SourceAnalyzer.ts（タスク5.1から継続）
  - 単一ファイルを解析するanalyzeFileメソッドを実装する。LSPプロバイダーを優先的に使用し、利用できない場合はASTパーサーにフォールバックする
  - Purpose: 単一ファイルの解析機能を提供する
  - _Leverage: LspProvider、AstParserFactory、DocumentSymbolConverter、SemanticTokensExtractor_
  - _Requirements: 要件1, 要件2, 要件3, 要件6_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: システム統合とエラーハンドリングの専門知識を持つ開発者 | Task: 要件1、要件2、要件3、要件6に従って、SourceAnalyzerクラスにanalyzeFileメソッドを実装します。LspProviderを使用してDocumentSymbolとSemantic Tokensを取得し、DocumentSymbolConverterとSemanticTokensExtractorでClassInfoに変換します。LSPが利用できない場合はAstParserFactoryでASTパーサーを取得し、解析を試みます。エラーはLoggerに記録し、可能な限り部分的な結果を返します。 | Restrictions: LSPとASTの両方が利用できない場合のみエラーをスローする。部分的な結果でも可能な限り返す | Success: analyzeFileメソッドが正しく動作し、LSPとAST解析を統合し、フォールバック機能が動作し、エラーハンドリングが適切です。_

- [x] 5.3. analyzeWorkspaceメソッドを実装する
  - File: src/services/sourceToDiagram/SourceAnalyzer.ts（タスク5.2から継続）
  - ワークスペース全体を解析するanalyzeWorkspaceメソッドを実装する。複数ファイルをバッチ処理し、プログレスバーを表示する
  - Purpose: ワークスペース全体の解析機能を提供する
  - _Leverage: analyzeFileメソッド、VS Code API（vscode.workspace.findFiles、vscode.window.withProgress）_
  - _Requirements: 要件1, 要件6_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: システム統合とパフォーマンス最適化の専門知識を持つ開発者 | Task: 要件1と要件6に従って、SourceAnalyzerクラスにanalyzeWorkspaceメソッドを実装します。vscode.workspace.findFilesを使用してワークスペース内のソースファイルを検索し、vscode.window.withProgressでプログレスバーを表示し、各ファイルに対してanalyzeFileメソッドを呼び出します。エラーが発生したファイルはスキップし、成功したファイルの結果のみを統合します。 | Restrictions: パフォーマンスを考慮してファイルをバッチ処理する。大規模プロジェクトではプログレスバーを表示する | Success: analyzeWorkspaceメソッドが正しく動作し、ワークスペース全体を解析でき、プログレスバーが表示され、エラーハンドリングが適切です。_

## フェーズ6: コマンド実装

- [x] 6.1. SourceToDiagramCommandクラスの基本構造を実装する
  - File: src/commands/SourceToDiagramCommand.ts
  - SourceToDiagramCommandクラスを作成し、コンストラクタと依存関係の注入を実装する
  - Purpose: ユーザーコマンドの基本構造を確立する
  - _Leverage: src/services/sourceToDiagram/SourceAnalyzer.ts、src/services/sourceToDiagram/converter/DiagramConverter.ts、src/services/FileService.ts、src/LoggerComponents/Logger.ts_
  - _Requirements: 要件7_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extensionコマンドの専門知識を持つ開発者 | Task: 要件7に従って、src/commands/SourceToDiagramCommand.tsにSourceToDiagramCommandクラスを作成します。コンストラクタでSourceAnalyzer、DiagramConverter、FileService、Loggerを受け取り、依存関係を注入します。 | Restrictions: 依存関係はコンストラクタで注入し、テスト容易性を確保する | Success: SourceToDiagramCommandクラスが正しく作成され、依存関係が適切に注入され、エラーなくコンパイルされます。_

- [x] 6.2. ファイル選択ダイアログ機能を実装する
  - File: src/commands/SourceToDiagramCommand.ts（タスク6.1から継続）
  - ユーザーに現在のファイルまたはワークスペース全体から選択できるダイアログを表示する機能を実装する
  - Purpose: ユーザーが解析対象を選択できるようにする
  - _Leverage: VS Code API（vscode.window.showQuickPick、vscode.window.activeTextEditor）_
  - _Requirements: 要件7_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extension UIの専門知識を持つ開発者 | Task: 要件7に従って、SourceToDiagramCommandクラスにファイル選択ダイアログ機能を実装します。vscode.window.showQuickPickを使用して「現在のファイル」と「ワークスペース全体」のオプションを表示し、ユーザーの選択に基づいて解析対象を決定します。ユーザーがキャンセルした場合は何も実行しません。 | Restrictions: ユーザーがキャンセルした場合は適切にハンドリングする。既存のUIパターンに従う | Success: ファイル選択ダイアログが正しく動作し、ユーザーが解析対象を選択でき、キャンセルも適切にハンドリングされます。_

- [x] 6.3. 解析実行とdiagram.json生成機能を実装する
  - File: src/commands/SourceToDiagramCommand.ts（タスク6.2から継続）
  - SourceAnalyzerで解析を実行し、DiagramConverterで変換し、diagram.jsonを生成する機能を実装する
  - Purpose: 解析からdiagram.json生成までの一連の処理を実装する
  - _Leverage: SourceAnalyzer、DiagramConverter、FileService_
  - _Requirements: 要件7_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: システム統合の専門知識を持つ開発者 | Task: 要件7に従って、SourceToDiagramCommandクラスに解析実行とdiagram.json生成機能を実装します。選択されたファイルまたはワークスペースに対してSourceAnalyzer.analyzeFileまたはanalyzeWorkspaceを呼び出し、取得したClassInfo配列をDiagramConverter.convertでIObjectModelに変換し、FileService.saveJsonでdiagram.jsonを保存します。エラーはLoggerに記録し、ユーザーにエラーメッセージを表示します。 | Restrictions: エラーが発生しても可能な限り部分的な結果を保存する。プログレスバーを表示する（大規模プロジェクトの場合） | Success: 解析実行とdiagram.json生成機能が正しく動作し、エラーハンドリングが適切で、ユーザーに適切なフィードバックが提供されます。_

- [x] 6.4. 成功・エラーメッセージ表示機能を実装する
  - File: src/commands/SourceToDiagramCommand.ts（タスク6.3から継続）
  - diagram.json生成の成功時とエラー時に適切なメッセージを表示する機能を実装する
  - Purpose: ユーザーに処理結果をフィードバックする
  - _Leverage: VS Code API（vscode.window.showInformationMessage、vscode.window.showErrorMessage）_
  - _Requirements: 要件7_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extension UIの専門知識を持つ開発者 | Task: 要件7に従って、SourceToDiagramCommandクラスに成功・エラーメッセージ表示機能を実装します。diagram.json生成が成功した場合はvscode.window.showInformationMessageで成功メッセージとファイルパスを表示し、エラーが発生した場合はvscode.window.showErrorMessageでエラーメッセージを表示します。 | Restrictions: メッセージは明確で分かりやすくする。既存のメッセージパターンに従う | Success: 成功・エラーメッセージ表示機能が正しく動作し、ユーザーに適切なフィードバックが提供されます。_

- [x] 6.5. extension.tsにコマンドを登録する
  - File: src/extension.ts
  - 新しいコマンド「sourceToDiagram.generate」を登録し、SourceToDiagramCommandと統合する
  - Purpose: VS Code拡張機能に新しいコマンドを公開する
  - _Leverage: src/commands/SourceToDiagramCommand.ts、既存のコマンド登録パターン_
  - _Requirements: 要件7_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extensionエントリーポイントの専門知識を持つ開発者 | Task: 要件7に従って、src/extension.tsに新しいコマンド「sourceToDiagram.generate」を登録します。既存のコマンド登録パターン（classDiagram.open、workflowDiagram.open）に従い、SourceToDiagramCommandのインスタンスを作成して呼び出します。LoggerとFileServiceのインスタンスを適切に渡します。 | Restrictions: 既存のコードを壊さず、既存のパターンに従う。context.subscriptionsに適切に登録する | Success: コマンドが正しく登録され、コマンドパレットから「Generate Diagram from Source」が表示され、実行時にSourceToDiagramCommandが呼び出されます。_

- [x] 6.6. package.jsonにコマンドを登録する
  - File: package.json
  - コマンドパレットに表示されるコマンド定義を追加する
  - Purpose: ユーザーがコマンドパレットからコマンドを実行できるようにする
  - _Leverage: 既存のコマンド定義パターン_
  - _Requirements: 要件7_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: VS Code Extensionパッケージ定義の専門知識を持つ開発者 | Task: 要件7に従って、package.jsonのcontributes.commandsセクションに新しいコマンド「sourceToDiagram.generate」を追加します。コマンドID、タイトル「Generate Diagram from Source」、カテゴリを適切に設定し、既存のコマンド定義パターンに従います。 | Restrictions: 既存のコマンド定義の形式に従い、一意のコマンドIDを使用する | Success: package.jsonにコマンドが正しく登録され、コマンドパレットに「Generate Diagram from Source」が表示されます。_

## フェーズ7: テスト実装

- [ ] 7.1. LspProviderの単体テストを作成する（DocumentSymbol取得）
  - File: src/test/services/sourceToDiagram/lsp/LspProvider.test.ts
  - LspProviderのgetDocumentSymbolsメソッドの単体テストを作成する
  - Purpose: LSP DocumentSymbol取得機能の信頼性を確保する
  - _Leverage: VS Code Extension Testing Framework、モックされたVS Code API_
  - _Requirements: 要件1_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 単体テストとVS Code Extension Testing Frameworkの専門知識を持つQAエンジニア | Task: 要件1に従って、src/test/services/sourceToDiagram/lsp/LspProvider.test.tsにLspProviderのgetDocumentSymbolsメソッドの単体テストを作成します。MockされたVS Code APIを使用してDocumentSymbolの取得をテストし、LSPプロバイダーが利用できない場合のフォールバック動作もテストします。 | Restrictions: 外部依存関係をモックし、テストは独立して実行可能にする。成功と失敗の両方のシナリオをテストする | Success: getDocumentSymbolsメソッドのテストが正しく動作し、エッジケースがカバーされ、テストは独立して一貫して実行されます。_

- [ ] 7.2. LspProviderの単体テストを作成する（Semantic Tokens取得）
  - File: src/test/services/sourceToDiagram/lsp/LspProvider.test.ts（タスク7.1から継続）
  - LspProviderのgetSemanticTokensメソッドの単体テストを作成する
  - Purpose: LSP Semantic Tokens取得機能の信頼性を確保する
  - _Leverage: VS Code Extension Testing Framework、モックされたVS Code API_
  - _Requirements: 要件2_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 単体テストとVS Code Extension Testing Frameworkの専門知識を持つQAエンジニア | Task: 要件2に従って、LspProvider.test.tsにgetSemanticTokensメソッドの単体テストを追加します。MockされたVS Code APIを使用してSemantic Tokensの取得をテストし、Semantic Tokensプロバイダーが利用できない場合の動作もテストします。 | Restrictions: 外部依存関係をモックし、テストは独立して実行可能にする。成功と失敗の両方のシナリオをテストする | Success: getSemanticTokensメソッドのテストが正しく動作し、エッジケースがカバーされ、テストは独立して一貫して実行されます。_

- [ ] 7.3. DocumentSymbolConverterの単体テストを作成する
  - File: src/test/services/sourceToDiagram/lsp/DocumentSymbolConverter.test.ts
  - DocumentSymbolConverterの変換機能の単体テストを作成する
  - Purpose: DocumentSymbolからClassInfoへの変換ロジックの正確性を確保する
  - _Leverage: サンプルDocumentSymbolデータ、VS Code Extension Testing Framework_
  - _Requirements: 要件1_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 単体テストの専門知識を持つQAエンジニア | Task: 要件1に従って、src/test/services/sourceToDiagram/lsp/DocumentSymbolConverter.test.tsにDocumentSymbolConverterの単体テストを作成します。サンプルDocumentSymbolデータを入力として、期待されるClassInfoが生成されることを検証し、エッジケース（ネストされたシンボル、空のシンボル等）もテストします。 | Restrictions: 実際のDocumentSymbolデータを使用し、テストは独立して実行可能にする | Success: DocumentSymbolConverterのテストが正しく動作し、すべての変換パターンがカバーされ、エッジケースも適切に処理されます。_

- [ ] 7.4. TypeScriptAstParserの単体テストを作成する（クラス抽出）
  - File: src/test/services/sourceToDiagram/ast/typescript/TypescriptAstParser.test.ts
  - TypeScriptAstParserのクラス抽出機能の単体テストを作成する
  - Purpose: ASTからクラスを抽出する機能の信頼性を確保する
  - _Leverage: サンプルTypeScriptファイル、VS Code Extension Testing Framework_
  - _Requirements: 要件3_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: AST解析と単体テストの専門知識を持つQAエンジニア | Task: 要件3に従って、src/test/services/sourceToDiagram/ast/typescript/TypescriptAstParser.test.tsにTypeScriptAstParserのクラス抽出機能の単体テストを作成します。サンプルTypeScriptファイルを入力として、期待されるClassInfoが抽出されることを検証し、構文エラーがあるコードでの部分的な解析もテストします。 | Restrictions: 実際のTypeScriptファイルを使用し、パーサーが利用できない場合のテストも含める。テストは独立して実行可能にする | Success: クラス抽出機能のテストが正しく動作し、構文エラーがある場合の部分的な解析も検証され、テストは独立して一貫して実行されます。_

- [ ] 7.5. TypeScriptAstParserの単体テストを作成する（メソッド・プロパティ抽出）
  - File: src/test/services/sourceToDiagram/ast/typescript/TypescriptAstParser.test.ts（タスク7.4から継続）
  - TypeScriptAstParserのメソッドとプロパティ抽出機能の単体テストを追加する
  - Purpose: ASTからメソッドとプロパティを抽出する機能の信頼性を確保する
  - _Leverage: サンプルTypeScriptファイル、VS Code Extension Testing Framework_
  - _Requirements: 要件3_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: AST解析と単体テストの専門知識を持つQAエンジニア | Task: 要件3に従って、TypescriptAstParser.test.tsにメソッドとプロパティ抽出機能の単体テストを追加します。サンプルTypeScriptファイルを入力として、期待されるOperationInfoとAttributeInfoが抽出されることを検証し、修飾子、可視性、型情報が正しく抽出されることをテストします。 | Restrictions: 実際のTypeScriptファイルを使用し、エッジケース（オーバーロード、getter/setter等）もテストする | Success: メソッドとプロパティ抽出機能のテストが正しく動作し、すべての抽出パターンがカバーされ、エッジケースも適切に処理されます。_

- [ ] 7.6. DiagramConverterの単体テストを作成する（基本変換）
  - File: src/test/services/sourceToDiagram/converter/DiagramConverter.test.ts
  - DiagramConverterの基本変換機能の単体テストを作成する
  - Purpose: ClassInfoからIObjectModelへの変換機能の正確性を確保する
  - _Leverage: サンプルClassInfoデータ、既存のIObjectModelインターフェース_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: データ変換と単体テストの専門知識を持つQAエンジニア | Task: 要件5に従って、src/test/services/sourceToDiagram/converter/DiagramConverter.test.tsにDiagramConverterの基本変換機能の単体テストを作成します。サンプルClassInfo配列を入力として、正しいIObjectModelが生成されることを検証し、ID生成、レイアウト生成が正しく行われることをテストします。 | Restrictions: 既存のIObjectModelインターフェースに準拠した結果が生成されることを検証する。エッジケースもテストする | Success: 基本変換機能のテストが正しく動作し、IObjectModelが正しく生成され、既存のクラス図エディタで読み込める形式であることが検証されます。_

- [ ] 7.7. DiagramConverterの単体テストを作成する（継承・インターフェース）
  - File: src/test/services/sourceToDiagram/converter/DiagramConverter.test.ts（タスク7.6から継続）
  - DiagramConverterの継承関係とインターフェース実装の変換機能の単体テストを追加する
  - Purpose: 継承関係とインターフェース実装の変換ロジックの正確性を確保する
  - _Leverage: サンプルClassInfoデータ（継承関係を含む）_
  - _Requirements: 要件5_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: データ変換と単体テストの専門知識を持つQAエンジニア | Task: 要件5に従って、DiagramConverter.test.tsに継承関係とインターフェース実装の変換機能の単体テストを追加します。基底クラスとインターフェースを含むサンプルClassInfoデータを入力として、baseClass、baseClassId、interfaces配列が正しく設定されることを検証します。 | Restrictions: エッジケース（継承なし、インターフェースなし、複数のインターフェース等）もテストする | Success: 継承関係とインターフェース実装の変換機能のテストが正しく動作し、すべてのパターンがカバーされ、エッジケースも適切に処理されます。_

- [ ] 7.8. SourceAnalyzerの統合テストを作成する（単一ファイル）
  - File: src/test/services/sourceToDiagram/SourceAnalyzer.test.ts
  - SourceAnalyzerのanalyzeFileメソッドの統合テストを作成する
  - Purpose: LSPとAST解析の統合動作を検証する
  - _Leverage: 実際のTypeScriptファイル、VS Code Extension Testing Framework_
  - _Requirements: 要件1, 要件2, 要件3, 要件6_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 統合テストとVS Code Extension Testing Frameworkの専門知識を持つQAエンジニア | Task: 要件1、要件2、要件3、要件6に従って、src/test/services/sourceToDiagram/SourceAnalyzer.test.tsにSourceAnalyzerのanalyzeFileメソッドの統合テストを作成します。実際のTypeScriptファイルを使用して、LSPとAST解析の統合をテストし、フォールバック機能、エラーハンドリング、部分的な解析も検証します。 | Restrictions: 実際のファイルを使用し、LSPプロバイダーが利用できない場合のテストも含める。テストは独立して実行可能にする | Success: analyzeFileメソッドの統合テストが正しく動作し、LSPとAST解析の統合、フォールバック機能、エラーハンドリングが検証されます。_

- [ ] 7.9. SourceAnalyzerの統合テストを作成する（ワークスペース）
  - File: src/test/services/sourceToDiagram/SourceAnalyzer.test.ts（タスク7.8から継続）
  - SourceAnalyzerのanalyzeWorkspaceメソッドの統合テストを追加する
  - Purpose: ワークスペース全体の解析機能を検証する
  - _Leverage: 実際のTypeScriptファイル（複数）、VS Code Extension Testing Framework_
  - _Requirements: 要件1, 要件6_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 統合テストとVS Code Extension Testing Frameworkの専門知識を持つQAエンジニア | Task: 要件1と要件6に従って、SourceAnalyzer.test.tsにanalyzeWorkspaceメソッドの統合テストを追加します。複数のTypeScriptファイルを含むワークスペースを使用して、ワークスペース全体の解析をテストし、プログレスバーの表示、エラーハンドリング、部分的な結果の統合も検証します。 | Restrictions: 実際のファイルを使用し、テストは独立して実行可能にする | Success: analyzeWorkspaceメソッドの統合テストが正しく動作し、ワークスペース全体の解析、プログレスバー、エラーハンドリングが検証されます。_

- [ ] 7.10. エンドツーエンドテストを作成する
  - File: src/test/commands/SourceToDiagramCommand.test.ts
  - コマンド実行からdiagram.json生成までのエンドツーエンドフローをテストする
  - Purpose: ユーザーシナリオ全体の動作を検証する
  - _Leverage: VS Code Extension Testing Framework、実際のTypeScriptファイル_
  - _Requirements: All_
  - _Prompt: Implement the task for spec source-to-diagram, first run spec-workflow-guide to get the workflow guide then implement the task: Role: E2EテストとVS Code Extension Testing Frameworkの専門知識を持つQAエンジニア | Task: すべての要件を網羅したエンドツーエンドテストを作成します。src/test/commands/SourceToDiagramCommand.test.tsに、実際のVS Code環境でコマンドを実行し、diagram.jsonが正しく生成されることを検証するテストを実装します。生成されたdiagram.jsonをクラス図エディタで読み込んで表示できることも確認します。 | Restrictions: 実際のVS Code環境を使用し、ユーザーシナリオを正確に再現する。テストは独立して実行可能にする | Success: エンドツーエンドテストはすべての重要なユーザージャーニーをカバーし、コマンド実行からdiagram.json生成、クラス図エディタでの表示までが正しく動作することが検証されます。_
