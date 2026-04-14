# Project Status

> 最終更新: 2026-04-13  
> ソースコード解析に基づく実態ベースのステータス

## 1. 実装済みの機能 (Completed)

| ID | 機能名 | 内容 |
| :--- | :--- | :--- |
| C-01 | クラス図エディタ | React + Vite ベースの視覚的なクラス/インターフェース/構造体の作成・編集。CLIコマンドラインとGUIエディタの両方から操作可能 |
| C-02 | ワークフロー図エディタ | メソッド単位のGherkin風シナリオ（Given/When/Then/How/Why）を視覚的に編集し、ノード/エッジグラフとして管理 |
| C-03 | フォワードエンジニアリング | クラス図から C#, TypeScript, Java, C++, Rust への多言語コード生成（Builder パターンで各言語を分離） |
| C-04 | リバースエンジニアリング | Tree-sitter AST パーサ（C#, Java, C++, Rust, TypeScript）+ LSP 経由のソースコード解析からクラス図を逆生成 |
| C-05 | JSON データ管理 | `diagram.json` による設計データの保存・読み込み。コンポーネント図は `component-list.json` として分離管理 |
| C-06 | 型マッピング | 言語ごとのプリミティブ型の自動変換（TypeModel クラスによる管理） |
| C-07 | コマンドオブジェクトモデル | 33種のポリモーフィックな Command クラスによる振る舞い駆動アーキテクチャ（AddType, AddAttr, Rename, Delete, Relation, デザインパターン適用等） |
| C-08 | 履歴管理 (Undo/Redo) | スナップショットベースのコマンド履歴スタック（`use-command-history` フック）。最大50件のUndoとRedoに対応 |
| C-09 | DomainModel (Aggregate Root) | DDD Aggregate Root パターンの DomainModel クラス。イミュータブルAPI、バリデーション、スナップショット、DSLエクスポートを提供 |
| C-10 | CLI / DSL インタープリタ | 包括的な CLI コマンド文法（型定義、属性、メソッド、パラメータ、リレーション、リネーム、削除、modify、デザインパターン適用 等） |
| C-11 | Spec DSL エディタ | モナコエディタベースのSpec DSL記述・パース・双方向同期（SpecEditorPanel）。クラス定義、シナリオ、エンドポイント、alias 等を記述可能 |
| C-12 | コンポーネント図エディタ | コンポーネントの作成・編集、ポート管理（入力/出力）、ポート接続、手動リレーション追加、ドラッグ&リサイズ対応 |
| C-13 | メッセージルーター | 登録ベースの MessageRouter によるバックエンド-フロントエンド間メッセージディスパッチ（switchベースから脱却済み） |
| C-14 | イベントシステム | ドメインイベント（TypeAdded, MemberAdded, RelationshipAdded 等 19種）の発行基盤。BaseDomainEvent による統一インターフェース |
| C-15 | .diagram フォルダ管理 | ワークスペース内 `.diagram` フォルダの作成・読み込み・保存・削除・リネーム。DSLファイルの保存時自動検知（FileWatcher） |
| C-16 | ヒートマップ可視化 | クラスメトリクス（複雑度等）のヒートマップ表示とツールチップ |
| C-17 | デザインパターン適用 | CLI からの Factory, Singleton, Adapter, Observer, Strategy, Template, Facade パターンの自動適用 |
| C-18 | Markdown / DSL エクスポート | 仕様書形式の Markdown 生成と Spec DSL のファイルエクスポート |
| C-19 | DslIntegrator | 複数DSLファイルの統合と依存関係の導出 |
| C-20 | リファクタリング提案 | RefactorSuggester による設計改善の自動提案 |
| C-21 | バリデーションレポート | ValidationReport によるモデルの品質検証レポート生成 |
| C-22 | 多言語 UI 対応 | `package.nls.json` / `package.nls.en.json` によるVSCode側のi18n対応 |

## 2. 未実装 / 部分的な実装 (Lacking/In-Progress)

### 2a. App.tsx からの関心分離

| ID | 機能名 | 状態 | 内容 |
| :--- | :--- | :--- | :--- |
| L-01 | コンポーネント図オーケストレーションの抽出 | 未実装 | App.tsx 内のコンポーネント図関連ロジック（`handleMoveComponent`, `handleResizeComponent`, `handleAddPort`, `handleDeletePort`, `handleRenamePort`, `handleAddRelationship`, `handleAddPortConnection`, `handleDeletePortConnection`, `debouncedSaveComponentDSL`, `commitComponentChanges` 等 約200行）を専用のカスタムフックまたはアプリケーションサービスへ抽出 |
| L-02 | ComponentService の `as any` キャスト除去 | 未実装 | App.tsx 内に `(componentService as any).componentDomain` が20箇所存在。ComponentService に `moveComponent()`, `resizeComponent()`, `getSnapshot()` 等の公開APIを追加し、内部ドメインへの直接アクセスを解消 |
| L-03 | コンポーネント状態管理のフック化 | 未実装 | `componentNodes`, `componentRels`, `portConnections`, `componentDslFiles`, `dslContentByPath` 等のコンポーネント図 React state（5個）を `useComponentDiagram` カスタムフックとして App.tsx から分離 |
| L-04 | メッセージハンドラの分離 | 部分的 | App.tsx 内の `onMessage` コールバック（`componentListJsonLoaded`, `diagramFilesLoaded`, `diagramFilesBulkLoaded`, `diagramFileLoaded` の4コマンド、約70行）をフックまたはアダプタ層へ移動 |

### 2b. コマンド・履歴アーキテクチャ

| ID | 機能名 | 状態 | 内容 |
| :--- | :--- | :--- | :--- |
| L-05 | Command.undo() メソッドの実装 | 未実装 | Command 基底クラスに `undo(model: DomainModel): DomainModel` を定義。現状はスナップショット復元方式のみ。vision.md Section 4-5 が示すコマンドベースの逆操作は未実装 |
| L-06 | TransactionCommand の実装 | 未実装 | 複数 Command をアトミックにグループ化して適用/拒否する `TransactionCommand` クラス。vision.md Section 6 に設計あり、コードは未着手 |
| L-07 | コンポーネント図の Undo/Redo 対応 | 未実装 | `use-command-history` はクラス図（DomainModel）のみ対応。コンポーネント図（ComponentDomainModel）の変更に対する履歴管理は未実装 |

### 2c. テストカバレッジ

| ID | 機能名 | 状態 | 内容 |
| :--- | :--- | :--- | :--- |
| L-08 | DomainModel 単体テスト | 未実装 | DomainModel（1,591行）の addClass / removeClass / updateClass / setBaseClass / addMember / addOperation 等のコア操作に対するテストが不在 |
| L-09 | SpecDslParser 単体テスト | 未実装 | SpecDslParser（47,178行）—プロジェクト最大のファイル—のパース結果検証テストが不在 |
| L-10 | ClassDiagramService 単体テスト | 未実装 | ClassDiagramService（1,747行）の applyAddType / applyRename / applyDelete / applyFactoryPattern 等のサービス操作テストが不在 |
| L-11 | WorkflowEditorPanel テスト | 未実装 | ワークフロー図のノード/エッジ操作（57,377行のコンポーネント）のロジックテストが不在 |

### 2d. ComponentService API の成熟

| ID | 機能名 | 状態 | 内容 |
| :--- | :--- | :--- | :--- |
| L-12 | ComponentService の位置・サイズ操作 API | 未実装 | `updateComponentPosition()`, `updateComponentSize()` が ComponentService に未定義。App.tsx が `(componentService as any).componentDomain` を直接操作している |
| L-13 | ComponentService のポート管理 API | 未実装 | ポートの追加・削除・リネームが App.tsx 内で `componentNodes` state を直接書き換えており、ComponentService / ComponentDomainModel を経由していない |

### 2e. クラス図/ワークフロー図/コンポーネント図の描画部分の最適化

| ID | 機能名 | 状態 | 内容 |
| :--- | :--- | :--- | :--- |
| L-14 | 描画最適化（全体方針） | 進行中 | 大量ノード/エッジ時の描画負荷を段階的に削減する。優先順位は `Viewport Culling` → `描画基盤のreact-konva化` → `イベント処理最適化` |
| L-15 | Viewport Culling 共通基盤 | 完了 | `view/lib/viewport-culling.ts` を追加。画面座標⇔ワールド座標変換、矩形/線分/ポリラインの可視判定を共通化 |
| L-16 | クラス図 Canvas の Culling + Konva対応 | 部分的 | `diagram-canvas.tsx` のクラス/リレーション描画に可視範囲判定を実装済み（表示外をスキップ）。Konva本体への描画移行は未着手 |
| L-17 | ワークフロー図 SVG の Culling + Konva対応 | 部分的 | `WorkflowEditorPanel.tsx` のノード/エッジ描画を可視範囲判定で間引き済み。Konva本体への描画移行は未着手 |
| L-18 | コンポーネント図 Canvas の Culling + Konva対応 | 部分的 | `component-diagram-canvas.tsx` のコンポーネント/依存線/ポート接続/DOMオーバーレイに可視範囲判定を実装済み。Konva本体への描画移行は未着手 |

## 3. 将来的に対応する機能 (Milestones/Future)

| ID | 機能名 | 内容 |
| :--- | :--- | :--- |
| M-01 | AI インテグレーション | パターン自動適用、リファクタリング提案、コマンドシーケンス生成のAI連携（vision.md Section 8） |
| M-02 | 外部プラグインシステム | ドメインイベント（既に19種定義済み）を活用したプラグイン連携・外部同期（vision.md Section 7） |
| M-03 | アーキテクチャメトリクス | 設計品質の数値化・評価。ヒートマップ基盤は実装済みだが、メトリクス算出ロジックの本格化が未了 |
| M-04 | 多目的プロジェクション | 単一DomainModelからドキュメント、メトリクス、コード等の複数形式出力。Markdown/DSL/JSONエクスポートは一部実現済み |
| M-05 | マクロ記録・リプレイ | コマンド履歴を活用したマクロ記録と再生。履歴基盤は実装済みだが、マクロ機能は未着手 |
