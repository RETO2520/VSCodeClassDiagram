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

## Non-Functional Requirements

### Code Architecture and Modularity
- **Modular Design**: `media.workflow/` 内で State, Draw, Interactions, Utils にファイルを分割し、疎結合を実現。
- **ES Modules**: モダンなブラウザ機能（Webview）を活かし、`<script type="module">` を使用。

### Usability
- コンテキストメニュー（右クリック）により、キーボード操作を最小限に抑えた高速な編集を可能にする。
