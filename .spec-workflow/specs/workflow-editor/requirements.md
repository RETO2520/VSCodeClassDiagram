# Requirements - Workflow Editor

## Introduction
特定のメソッド（操作）の内部ロジックを視覚的に定義するためのワークフローエディタ。UML アクティビティ図に近い形式で、処理フローを視覚化します。

## Alignment with Product Vision
`product.md` での「ロジックの視覚的定義」を実現する機能であり、コード生成エンジンがメソッド内部のロジックを作成するための基盤となります。

## Requirements

### Requirement 1: ノードの配置と接続
**User Story:** 開発者として、処理、分岐、開始、終了の各ノードを配置し、それらを接続してフローを構築・編集したい。

#### Acceptance Criteria
1. WHEN パレットのボタンをクリック THEN 対応する種類のノードがキャンバス中央に生成される。
2. WHEN ノードの「ハンドル（＋）」から別のノードへドラッグ THEN 新しい接続エッジ SHALL 生成される。
3. IF 出力元が「分岐（Decision）」ノード THEN 接続エッジに条件ラベル（true/false等）を付与できる。

### Requirement 2: エッジ（接続線）の整形
**User Story:** 開発者として、複雑なフローでも見やすくするために接続線を曲げたい。

#### Acceptance Criteria
1. WHEN 接続エッジ上をクリック THEN 中間点（Midpoint）ハンドルが表示される。
2. WHEN 中間点ハンドルをドラッグ THEN エッジのパス SHALL 追従して変形し、座標が保存される。

### Requirement 3: 変換互換性のあるノードタイプ
**User Story:** 開発者として、図面上で定義したロジックを正確にコード変換できるように、標準的な制御構造に対応するノードを使用したい。

#### Acceptance Criteria
1. **アクションノード**: 代入や関数呼び出しなどの 1 ステートメントを表現できなければならない。
2. **分岐ノード**: エッジの `condition` に基づいて `if-else` 構造を構築可能でなければならない。
3. **ループノード**: 繰り返し処理（`while` 構造）を表現するノードをサポートしなければならない。
4. **終了（Return）ノード**: 戻り値を保持し、関数の終了を表現できなければならない。

### Requirement 4: 言語中立な AST の出力
**User Story:** 開発者として、エディタで保存した内容が `workflow-node-conversion` 仕様で定義された `WorkflowAst` 形式で出力され、各言語ビルダーで処理可能であることを期待する。

#### Acceptance Criteria
1. 保存時、エディタはノードとエッジのグラフ構造を、`WorkflowAst`（`variables` および `body`）へ変換して出力しなければならない。

## Non-Functional Requirements

### Code Architecture and Modularity
- **Modular Design**: `media.workflow/` 内で State, Draw, Interactions, Utils にファイルを分割し、疎結合を実現。
- **ES Modules**: モダンなブラウザ機能（Webview）を活かし、`<script type="module">` を使用。

### Usability
- コンテキストメニュー（右クリック）により、キーボード操作を最小限に抑えた高速な編集を可能にする。
