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
│   ├── CodeComponents/  # コード生成ロジック（各言語 Builder 含む）
│   ├── LoggerComponents/# ログ出力管理
│   ├── extension.ts     # エントリーポイント
│   └── test/            # テストコード
├── out/                 # コンパイル済み JS（Git 管理外）
└── package.json         # パッケージ定義・コマンド登録
```

## 2. Module Responsibilities
- **Frontend (Webview)**: 
  - ユーザーの操作を受け取り、図面をメモリ上で管理。
  - ワークフローエディタでは、ロジック構造を各言語に依存しない中立なデータモデル（TypeModel）として構築し、Extension Host へ送信する。
- **Backend (Extension Host)**: 
  - メッセージハンドリング、ファイルシステムへのアクセス。
  - Webview から受け取ったデータモデルを各言語 Builder に渡し、ソースコード生成を実行する。
- **Code Generation Engine (`src/CodeComponents/`)**: 
  - `diagram.json` およびワークフロー由来の `TypeModel` を解析する。
  - 言語固有の構文（TypeScript, Rust 等）への変換を担当する `CodeBuilder` 群を管理する。

## 3. Conventions
- **Naming**: 
  - ファイル名: kebab-case または小文字。
  - Webview 資材: `media/` および `media.workflow/` で分離。
- **Data Flow**: Webview (TypeModel 構築) -> Extension (各言語 Builder によるコード変換) -> File System の流れを基本とする。
- **Artifacts**: 仕様書は `.spec-workflow` フォルダ内で一括管理する。
