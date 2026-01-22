# プロジェクト構造

## ディレクトリ構造

```
[プロジェクトのディレクトリ構造を定義します。以下の例を参考に、プロジェクトの種類に合わせてください。]

例：ライブラリ/パッケージ:
project-root/
├── src/                    # Source code
├── tests/                  # Test files  
├── docs/                   # Documentation
├── examples/               # Usage examples
└── [build/dist/out]        # Build output

例：アプリケーション:
project-root/
├── [src/app/lib]           # Main source code
├── [assets/resources]      # Static resources
├── [config/settings]       # Configuration
├── [scripts/tools]         # Build/utility scripts
└── [tests/spec]            # Test files

一般的なパターン:
- Group by feature/module
- Group by layer (UI, business logic, data)
- Group by type (models, controllers, views)
- Flat structure for simple projects
```

## ファイル名規約

### ファイル
- **コンポーネント/モジュール**: [例：`PascalCase`, `snake_case`, `kebab-case`]
- **サービス/ハンドラー**: [例：`UserService`, `user_service`, `user-service`]
- **ユーティリティ/ヘルパー**: [例：`dateUtils`, `date_utils`, `date-utils`]
- **テスト**: [例：`[filename]_test`, `[filename].test`, `[filename]Test`]

### コード
- **クラス/タイプ**: [例：`PascalCase`, `CamelCase`, `snake_case`]
- **関数/メソッド**: [例：`camelCase`, `snake_case`, `PascalCase`]
- **定数**: [例：`UPPER_SNAKE_CASE`, `SCREAMING_CASE`, `PascalCase`]
- **変数**: [例：`camelCase`, `snake_case`, `lowercase`]

## インポートパターン

### インポート順序
1. 外部依存関係
2. 内部モジュール
3. 相対的なインポート
4. スタイルインポート

### モジュール/パッケージ組織
```
[プロジェクトのインポート/包含パターンを説明します]
例:
- プロジェクトルートからの絶対インポート
- モジュール内の相対インポート
- パッケージ/名前空間組織
- 依存関係管理アプローチ
```

## コード構造パターン

[ファイル内のコードを整理する一般的なパターンを定義します。以下の例を参考に、プロジェクトに適したものを選択してください]

### モジュール/クラス組織
```
例:
1. インポート/包含/依存関係
2. 定数と構成
3. 型/インターフェース定義
4. 主な実装
5. ヘルパー/ユーティリティ関数
6. エクスポート/公開API
```

### 関数/メソッド組織
```
例:
- 入力検証最初
- 中央に核心ロジック
- 全てのエラーハンドリング
- 明確な返却ポイント
```

### ファイル組織原則
```
プロジェクトに適したものを選択してください:
- 1ファイル1クラス/モジュール
- 関連する機能を一緒にグループ化
- 公開APIを上部または下部に配置
- 実装詳細を隠す
```

## コード組織原則

1. **単一責任原則**: 各ファイルは明確な目的を持つべきです
2. **モジュール性**: コードは再利用可能なモジュールに組織化する
3. **テスト可能性**: コードを容易にテスト可能にする
4. **一貫性**: コードベースで確立されたパターンを遵守する

## モジュール境界
[異なる部分がどのように相互作用し、責任分離を維持するかを定義します]

境界パターンの例:
- **コア vs プラグイン**: コア機能 vs 拡張可能なプラグイン
- **公開API vs 内部**: 暴露 vs 実装詳細
- **プラットフォーム固有 vs クロスプラットフォーム**: OS固有のコード分離
- **安定 vs 実験的**: 生産コード vs 実験的機能
- **依存方向**: どのモジュールがどのモジュールを依存するか

## コードサイズガイドライン
[定義するプロジェクトのファイルと関数のサイズガイドライン]

ガイドライン例:
- **ファイルサイズ**: [定義するファイルの最大行数]
- **関数/メソッドサイズ**: [定義する関数/メソッドの最大行数]
- **クラス/モジュール複雑さ**: [複雑さの制限]
- **ネスト深度**: [最大ネストレベル]

## ダッシュボード/モニタリング構造
[ダッシュボードまたはモニタリングコンポーネントの構造]

### ダッシュボード構造例:
```
src/
└── dashboard/          # Self-contained dashboard subsystem
    ├── server/        # Backend server components
    ├── client/        # Frontend assets
    ├── shared/        # Shared types/utilities
    └── public/        # Static assets
```

### 講義分離
- ダッシュボードがコアビジネスロジックから孤立する
- 独立した操作のために独自のCLIエントリポイントを持つ
- 主なアプリケーションへの最小限の依存関係
- コア機能に影響を与えないで無効にすることができます

## ドキュメンテーション基準
- 公開APIにはドキュメンテーションが必要です
- 複雑なロジックにはインラインコメントを含める
- 主要モジュールのREADMEファイル
- 言語固有のドキュメンテーション規約に従う
