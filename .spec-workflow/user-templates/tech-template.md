# テクノロジースタック

## プロジェクトの種類
[どのような種類のプロジェクトであるかを説明します: Web アプリケーション、CLI ツール、デスクトップ アプリケーション、モバイル アプリ、ライブラリ、API サービス、組み込みシステム、ゲームなど。]

## コアテクノロジー

### 主要言語
- **Language**: [例: Python 3.11、Go 1.21、TypeScript、Rust、C++]
- **Runtime/Compiler**: [該当する場合]
- **Language-specific tools**: [パッケージ マネージャー、ビルド ツールなど。]

### 主要な依存関係/ライブラリ
[プロジェクトが依存する主要なライブラリとフレームワークをリストします]
- **[ライブラリ/フレームワーク名]**: [目的とバージョン]
- **[ライブラリ/フレームワーク名]**: [目的とバージョン]

### アプリケーションアーキテクチャ
[アプリケーションの構造を説明します - MVC、イベント駆動型、プラグインベース、クライアントサーバー、スタンドアロン、マイクロサービス、モノリシックなど。]

### データストレージ (該当する場合)
- **プライマリストレージ**: [例: PostgreSQL、ファイル、インメモリ、クラウドストレージ]
- **キャッシュ**: [例: Redis、インメモリ、ディスクキャッシュ]
- **データフォーマット**: [例: JSON、Protocol Buffers、XML、バイナリ]

### 外部統合 (該当する場合)
- **APIs**: [連携する外部サービス]
- **Protocols**: [例: HTTP/REST、gRPC、WebSocket、TCP/IP]
- **Authentication**: [例: OAuth、APIキー、証明書]

### モニタリング & ダッシュボードテクノロジー (該当する場合)
- **Dashboard Framework**: [例: React、Vue、vanilla JS、ターミナル UI]
- **Real-time Communication**: [例: WebSocket、Server-Sent Events、ポーリング]
- **Visualization Libraries**: [例: Chart.js、D3、ターミナルグラフ]
- **State Management**: [例: Redux、Vuex、ファイルシステム as source of truth]

## 開発環境

### ビルド & 開発ツール
- **Build System**: [例: Make, CMake, Gradle, npm scripts, cargo]
- **Package Management**: [例: pip, npm, cargo, go mod, apt, brew]
- **Development workflow**: [例: hot reload, watch mode, REPL]

### コード品質ツール
- **Static Analysis**: [コード品質と正確性のためのツール]
- **Formatting**: [コードスタイル適用ツール]
- **Testing Framework**: [ユニット、インテグレーション、および/またはエンドツーエンド テスト ツール]
- **Documentation**: [ドキュメント生成ツール]

### バージョン管理 & コラボレーション
- **VCS**: [例: Git, Mercurial, SVN]
- **Branching Strategy**: [例: Git Flow, GitHub Flow, trunk-based]
- **Code Review Process**: [コードレビューの実施方法]

### ダッシュボード開発 (該当する場合)
- **Live Reload**: [例: Hot module replacement, file watchers]
- **Port Management**: [例: Dynamic allocation, configurable ports]
- **Multi-Instance Support**: [例: Running multiple dashboards simultaneously]

## デプロイ & ディストリビューション (該当する場合)
- **Target Platform(s)**: [プロジェクトの実行場所と方法: クラウド、オンプレミス、デスクトップ、モバイル、組み込み]
- **Distribution Method**: [ユーザーがソフトウェアを入手する方法: ダウンロード、パッケージマネージャー、アプリストア、SaaS]
- **Installation Requirements**: [前提条件、システム要件]
- **Update Mechanism**: [更新の提供方法]

## 技術要件 & 制約

### パフォーマンス要件
- [例: レスポンスタイム、スループット、メモリ使用量、起動時間]
- [特定のベンチマークまたはターゲット]

### 互換性要件  
- **Platform Support**: [オペレーティングシステム、アーキテクチャ、バージョン]
- **依存関係バージョン**: [依存関係の最小/最大バージョン]
- **標準準拠**: [業界標準、プロトコル、仕様]

### セキュリティ & コンプライアンス
- **セキュリティ要件**: [認証、暗号化、データ保護]
- **コンプライアンス基準**: [GDPR, HIPAA, SOC2, etc. if applicable]
- **脅威モデル**: [重要なセキュリティ上の考慮事項]

### スケーラビリティ & 信頼性
- **想定される負荷**: [ユーザー数、リクエスト数、データ量]
- **可用性要件**: [稼働時間目標、災害復旧]
- **成長予測**: [システムの拡張性]

## 技術的決定 & 根拠
[主要なアーキテクチャとテクノロジーの選択を文書化する]

### 決定ログ
1. **[テクノロジー/パターンの選択]**: [なぜこれを選択したか、検討した代替案]
2. **[アーキテクチャの決定]**: [根拠、受け入れたトレードオフ]
3. **[ツール/ライブラリの選択]**: [選択理由、評価基準]

## 既知の制限事項
[技術的な負債、制限、改善の余地があれば文書化する]

- [制限事項1]: [影響と将来の解決策の可能性]
- [制限事項2]: [なぜ存在し、いつ対処される可能性があるか]
