# Requirements - Code Generation Engine

## Introduction
クラス図データ（JSON）を解析し、各種プログラミング言語（TypeScript, Java, C#, C++, Rust, Go）のソースコードファイルを生成するコアエンジン。設計意図を直接動くコードに変換します。

## Alignment with Product Vision
`product.md` の核心である「多言語ソースコードの雛形自動生成」を担当します。

## Requirements

### Requirement 1: 多言語ソースコード生成
**User Story:** 開発者として、作成したクラス図から任意のターゲット言語のスケルトンコードを一括生成したい。これにより、手動のタイピング時間を削減し、設計との乖離を防ぐ。

#### Acceptance Criteria
1. WHEN 言語（例: Rust）を選択して実行 THEN 各クラスに対応するファイル（例: `class_name.rs`）が生成される。
2. IF 生成先に同名ファイルが存在 THEN システム SHALL ユーザーに上書き確認（またはバックアップ）を行う。
3. WHEN 生成が完了 THEN 生成されたファイルリストとログ SHALL 出力チャネルに表示される。

### Requirement 2: 型の自動変換
**User Story:** 開発者として、図面上の抽象的な型（string, int等）がターゲット言語の適切な組み込み型に自動変換されることを期待する。

#### Acceptance Criteria
1. IF ターゲット言語が TypeScript THEN `int` SHALL `number` に変換される。
2. IF ターゲット言語が Rust THEN `string` SHALL `String` または `&str` (設定による) に変換される。
3. IF ターゲット言語が Go THEN `int` SHALL `int` (または `int32`/`int64`)、`string` SHALL `string` に変換される。
4. IF ターゲット言語が Go THEN ファイル名 SHALL `snake_case.go` に変換され、パッケージ名 SHALL `main` またはフォルダ名から派生したものになる。

## Non-Functional Requirements

### Code Architecture and Modularity
- **Builder Pattern**: 新しい言語の追加を容易にするため、各言語のロジックを `Builder` クラスにカプセル化する。
- **Separation of Concerns**: パースロジック、コード構築ロジック、ファイル書き込みロジックを分離。

### Reliability
- 生成プロセス中にエラーが発生した場合でも、不完全なファイルが残らないようアトミックな書き込み（またはクリーンアップ）を試みる。
