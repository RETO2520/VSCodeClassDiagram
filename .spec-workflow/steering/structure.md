# Project Structure - VSCode Class Diagram & Workflow Editor

## 1. Directory Layout
```text
.
├── .spec-workflow/      # 仕様管理（Requirements, Design, Steering）
├── media/               # クラス図エディタ用の Webview 資材
│   ├── index.html
│   ├── style.css
│   └── main.js
├── media.workflow/      # ワークフローエディタ用の Webview 資材
│   ├── workflow.*.js    # 機能ごとに分割されたモジュール
│   └── index.html
├── src/                 # Extension ソースコード
│   ├── CodeComponents/  # コード生成ロジック
│   ├── LoggerComponents/# ログ出力管理
│   ├── extension.ts     # エントリーポイント
│   └── test/            # テストコード
├── out/                 # コンパイル済み JS（Git 管理外）
└── package.json         # パッケージ定義・コマンド登録
```

## 2. Module Responsibilities
- **Frontend (Webview)**: ユーザーの操作を受け取り、図面をメモリ上で管理。Extension Host へデータを送信。
- **Backend (Extension Host)**: メッセージハンドリング、ファイルシステムへのアクセス、多言語コード生成ロジックの実行。
- **Code Generation Engine**: `diagram.json` の構造を解析し、各言語の構文木（または文字列）に変換。

## 3. Conventions
- **Naming**: 
  - ファイル名: kebab-case または小文字。
  - Webview 資材: `media/` および `media.workflow/` で分離。
- **Data Flow**: Webview から Extension への一方通行のリクエストが基本となる。
- **Artifacts**: 仕様書は `.spec-workflow` フォルダ内で一括管理する。
