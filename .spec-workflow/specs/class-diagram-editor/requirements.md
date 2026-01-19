# Requirements - Class Diagram Editor

## Introduction
VS Code Webview 上で UML ライクなクラス図を視覚的に編集するためのコンポーネント。設計からコード生成への橋渡しとなる視覚的インターフェースを提供します。

## Alignment with Product Vision
`product.md` で掲げた「直感的なモデリング体験」と「多言語ソースコードの雛形生成」を具体化する主要機能です。

## Requirements

### Requirement 1: クラス/インターフェースの描画と編集
**User Story:** 開発者として、クラスやインターフェースをキャンバス上に追加・移動し、その名称を編集したい。これにより、設計の構造を素早く定義できる。

#### Acceptance Criteria
1. WHEN キャンバスをダブルクリック THEN 新しいクラスボックス SHALL 生成される。
2. WHEN クラスボックスをドラッグ THEN その座標 (x, y) SHALL 更新され、接続されているリレーションも追従する。
3. WHEN クラスボックスの名称エリアをダブルクリック THEN インラインエディタ SHALL 表示され、名称を変更できる。

### Requirement 2: 属性と操作の定義
**User Story:** 開発者として、クラスにプロパティやメソッドを追加したい。これにより、クラスの詳細な責任を定義できる。

#### Acceptance Criteria
1. WHEN クラス内の (+) ボタンをクリック THEN 新しいプロパティまたはメソッド SHALL 行として追加される。
2. IF 属性の型が既存のクラス名と一致 THEN システム SHALL 関連（Association）を自動的に描画する候補とする。

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: `main.js` は描画ロジックとイベント管理に集中し、データ変換は別モジュールに委譲する。
- **Modular Design**: 各 `classbox` は独立した DOM 要素として構築され、状態変更に応じて部分的に再レンダリング可能とする。

### Performance
- 100 以上のクラスが存在する場合でも、ドラッグ操作の遅延が 16ms (60fps) 以内に収まること。

### Usability
- VS Code のカラーテーマ（Dark/Light）に自動的に追従し、視認性を確保すること。
