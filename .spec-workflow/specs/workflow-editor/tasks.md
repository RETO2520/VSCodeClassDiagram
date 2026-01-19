# タスク - ワークフローエディタ

- [x] 1. ES6 モジュール構造のセットアップ (完了)
  - ファイル: `media.workflow/index.html`, `media.workflow/workflow.js`
  - 正しいモジュールのインポートと初期化フローを確保する。
  - 目的: エディタロジックのためのクリーンな基盤を構築する。
  - _活用: プロジェクトの ES モジュール構造パターン_
  - _要件: 非機能要件 (アーキテクチャ)_
  - _プロンプト: Role: フロントエンドアーキテクト | Task: index.html と workflow.js で ES モジュールのエントリポイントを構成してください。state, draw, interactions モジュール間の適切なインポート・エクスポート関係を確保してください。 | Success: Webview がコンソールエラーなしでロードされ、モジュール間で関数を介して通信できる。_

- [x] 2. SVG ノード描画エンジンの実装 (完了)
  - ファイル: `media.workflow/workflow.draw.js`
  - SVG 要素を使用して異なるノード形状を描画する関数を実装する。
  - 目的: ワークフロー要素の視覚的表現。
  - _活用: `media.workflow/workflow.draw.js`_
  - _要件: 1.1_
  - _プロンプト: Role: SVG 専門家 | Task: workflow.draw.js の drawNode() を実装し、'process' (矩形), 'decision' (菱形), 'start/end' (楕円) の形状をサポートしてください。形状の中に適切なラベルを追加してください。 | Success: すべてのノードタイプが正しいスタイリングでレンダリングされる。_

- [x] 3. 中間点を考慮したエッジパスロジックの実装 (完了)
  - ファイル: `media.workflow/workflow.draw.js`
  - 1つの中間点（mid）を持つポリラインをサポートするために `appendEdgePath` と `updateEdgeVisual` を実装する。
  - 目的: 柔軟な接続線を可能にする。
  - _活用: `boundaryPointTowards` ユーティリティ_
  - _要件: 1.2_
  - _プロンプト: Role: グラフィックスプログラマー | Task: エッジモデルのオプションの 'mid' ポイントをサポートするように、エッジの描画をリファクタリングしてください。ノード間の最適な境界出入り口ポイントを計算してください。 | Success: 中間点が存在する場合、エッジが2セグメントのポリラインとして描画される。_

- [x] 4. 拡張機能メッセージング API の接続 (完了)
  - ファイル: `media.workflow/workflow.interactions.js`
  - 保存・読込操作のために `vscode.postMessage` 呼び出しを実装する。
  - 目的: 図面データを拡張機能ホストと同期する。
  - _活用: `media.workflow/workflow.api.js`_
  - _要件: 1.3_
  - _プロンプト: Role: VS Code 拡張機能開発者 | Task: interactions.js に保存ロジックを実装し、現在の状態を収集して 'saveFile' メッセージを VS Code ホストに送信してください。UI を再描画するために 'fileLoaded' メッセージを処理してください。 | Success: データが拡張機能ホストとの間で正しく永続化される。_
