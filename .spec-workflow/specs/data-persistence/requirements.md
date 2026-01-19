# Requirements - Data Persistence

## Introduction
図面のバイナリ（状態）を永続化し、セッション間やプロジェクト間でのポータビリティを確保するデータ管理レイヤー。JSON 形式でのファイル保存とロードを担当します。

## Alignment with Product Vision
`product.md` で掲げた「プロジェクトとしての再利用性」を実現するための基盤です。一度設計したモデルをファイルとして保存し、チームで共有可能にします。

## Requirements

### Requirement 1: 図面の保存とロード
**User Story:** 開発者として、編集した図面を `diagram.json` などのファイルに保存し、後で開き直したい。これにはクラス構造とワークフローロジックの両方が含まれる。

#### Acceptance Criteria
1. WHEN 「Save」ボタンをクリック THEN ファイル保存ダイアログ SHALL 表示され、JSON 形式で書き出される。
2. WHEN 保存された JSON ファイルを選択してロード THEN キャンバス上のクラスと関係 SHALL 保存時の状態で完全に復元される。
3. IF ロードされた JSON の形式が不正 THEN システム SHALL エラーを表示し、読み込みを中断する。

### Requirement 2: モデルのマイグレーション
**User Story:** 開発者として、拡張機能のバージョンアップによってデータ形式が変更されても、古いファイルを壊さずに読み込みたい。

#### Acceptance Criteria
1. IF ロード対象の JSON に ID が存在しない（名称ベース） THEN システム SHALL `cryptoRandomId` を自動付与して内部モデルに変換する。
2. IF 必要なフィールド（`isAbstract` 等）が欠落している THEN デフォルト値 SHALL 適用される。

## Non-Functional Requirements

### Reliability
- ファイル書き込みは `vscode.workspace.fs.writeFile` を使用し、VS Code の堅牢なファイルシステム API に依拠する。

### Performance
- 1MB 程度の JSON ファイル（数百クラス相当）のパースとロードが 1 秒以内に完了すること。
