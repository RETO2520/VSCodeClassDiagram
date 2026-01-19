# Design - VSCode Class Diagram & Workflow Editor

## 1. System Architecture
本拡張機能は、VS Code の拡張機能ホストプロセス（Extension Host）と、エディタ UI を提供する Webview プロセスで構成されます。

### 1.1. コンポーネント構成
- **Extension Host (`src/extension.ts`)**:
  - Webview のライフサイクル管理（作成、メッセージ通信）。
  - 各種コマンド (`classDiagram.open`, `workflowDiagram.open`) の登録。
  - ファイル I/O (JSON の保存・読み込み)。
  - 言語ごとのコード生成ロジックの呼び出し。
- **Webview UI (Class Diagram - `media/`)**:
  - `index.html`, `style.css`, `main.js` で構成される SPA。
  - クラス図のビジュアル編集ロジックを担当。
- **Webview UI (Workflow - `media.workflow/`)**:
  - `index.html`, `style.css` および複数の `workflow.*.js` ファイルで構成。
  - 状態管理 (`state.js`)、描画 (`draw.js`)、対話 (`interactions.js`) が分離された設計。
- **Code Generator (`src/CodeComponents/`)**:
  - 言語ごとのソースコード生成エンジン。

## 2. Interaction Design (Webview ↔ Extension)
Webview と Extension Host 間は `postMessage` を使用して通信します。

- **Extension → Webview**:
  - 初期化データ（`diagram.json` の内容）の送信。
  - 設定変更の反映。
- **Webview → Extension**:
  - 図面の保存（JSON 出力）リクエスト。
  - ソースコード生成（Generate）リクエスト。
  - ログ出力メッセージの送信。

## 3. Data Structure
- **Diagram JSON**:
  - クラス・ワークフローのノード情報、接続情報、メタデータ（プロパティ、メソッド等）を保持する JSON フォーマット。

## 4. Technology Stack
- **Extension**: TypeScript / VS Code Extension API.
- **Webview**: Vanilla HTML/CSS/JavaScript.
- **Testing**: VS Code Extension Testing Framework, Node.js (src/test).
