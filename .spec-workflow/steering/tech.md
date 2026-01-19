# Tech Stack - VSCode Class Diagram & Workflow Editor

## 1. Core Technologies
- **Runtime**: Visual Studio Code Extension Host.
- **Languages**: 
  - Extension: **TypeScript** (CommonJS).
  - Webview: **HTML5**, **CSS3**, **Vanilla JavaScript**.
- **Compiler**: TypeScript (`tsc`).

## 2. Frameworks & Libraries
- **VS Code API**: 核心的なインターフェース提供。
- **Webview API**: 図面描画用の HTML/JS 実行環境。
- **ESLint**: コード品質管理。

## 3. Development Standards
- **Coding Style**: TypeScript 準拠。
- **Webview Implementation**: 外部ライブラリ（React/Vue等）を最小限に抑え、Vanilla JS による軽量かつ高速な描画を維持する（特にワークフロー関連）。
- **CommonJS**: 現在の `package.json` に基づき、CommonJS 形式を採用。

## 4. Test Strategy
- **Extension Testing**: `@vscode/test-cli` および `@vscode/test-electron` を使用した統合テスト。
- **Unit Testing**: Node.js 環境でのスクリプトテスト（`src/test/js`）。
