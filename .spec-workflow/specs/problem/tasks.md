# タスクドキュメント - プロジェクト問題点対策

## Phase 1: Extension モジュール分割 (問題1, 問題2対策)

- [x] 1. FileService の作成
  - File: src/services/FileService.ts
  - ファイル読み込み・保存の共通ロジックを抽出
  - loadJson, saveJson, findWorkspaceDiagram メソッドを実装
  - Purpose: コードの重複を排除し、ファイル操作を一元化
  - _Leverage: extension.ts の既存実装_
  - _Requirements: 問題2_
  - _Prompt: Role: TypeScriptとVS Code API の専門家 | Task: extension.ts からファイル読み込み・保存のロジックを抽出し、再利用可能な FileService クラスを作成 | Restrictions: 既存のAPI互換性を維持 | Success: 両方のダイアグラムから FileService を利用でき、重複コードが削除される_

- [x] 2. MessageRouter の作成
  - File: src/messaging/MessageRouter.ts
  - コマンドベースのメッセージルーティングを実装
  - register, dispatch メソッドを実装
  - Purpose: メッセージハンドリングのモジュール化
  - _Leverage: extension.ts の switch 文パターン_
  - _Requirements: 問題1_
  - _Prompt: Role: 設計パターン専門家 | Task: switch 文をルーティングテーブルに置き換え、拡張性を向上 | Restrictions: 既存のメッセージ形式を維持 | Success: 新しいコマンド追加が1箇所の登録で完了する_

- [x] 3. ClassDiagramHandler の作成
  - File: src/handlers/ClassDiagramHandler.ts
  - classDiagram パネル作成とメッセージ処理を移行
  - FileService と MessageRouter を活用
  - Purpose: extension.ts の責務分離
  - _Leverage: FileService, MessageRouter_
  - _Requirements: 問題1_
  - _Prompt: Role: VS Code Extension 開発者 | Task: classDiagram 関連コードを専用ハンドラに移行 | Restrictions: 動作を変更しない | Success: extension.ts が50行以下になる_

- [x] 4. WorkflowDiagramHandler の作成
  - File: src/handlers/WorkflowDiagramHandler.ts
  - workflowDiagram パネル作成とメッセージ処理を移行
  - ClassDiagramHandler と同様のパターン
  - Purpose: 一貫したハンドラアーキテクチャ
  - _Leverage: ClassDiagramHandler パターン_
  - _Requirements: 問題1_
  - _Prompt: Role: VS Code Extension 開発者 | Task: workflowDiagram 関連コードを専用ハンドラに移行 | Restrictions: 動作を変更しない | Success: 両ハンドラが同じインターフェースに準拠_

- [x] 5. extension.ts のリファクタリング
  - File: src/extension.ts
  - ハンドラとサービスを利用する形に書き換え
  - activate 関数を50行以下に削減
  - Purpose: extension.ts をエントリポイントのみに
  - _Leverage: ClassDiagramHandler, WorkflowDiagramHandler_
  - _Requirements: 問題1_
  - _Prompt: Role: リファクタリング専門家 | Task: 新しいモジュールを使用して extension.ts を簡素化 | Restrictions: 既存の動作を維持 | Success: コマンド登録のみのシンプルなファイル_

---

## Phase 2: Webview 型安全性強化 (問題3対策)

- [x] 6. 型定義ファイルの作成
  - File: media/types.d.ts
  - ClassModel, DiagramModel, Attribute, Operation の型定義
  - グローバル変数の型定義 (window.adjustSvgSize 等)
  - Purpose: JSDoc で参照可能な型定義を提供
  - _Leverage: 既存の main.utils.js からの推論_
  - _Requirements: 問題3_
  - _Prompt: Role: TypeScript/JSDoc 専門家 | Task: 既存コードから型を抽出し、d.ts ファイルを作成 | Restrictions: 実行時の動作に影響しない | Success: VSCode で型情報が表示される_

- [x] 7. main.state.js の JSDoc 強化
  - File: media/main.state.js
  - @typedef で DiagramModel を定義
  - state オブジェクトに型アノテーション
  - Purpose: 状態管理の型安全性向上
  - _Leverage: media/types.d.ts_
  - _Requirements: 問題3_
  - _Prompt: Role: JavaScript/JSDoc 専門家 | Task: state.model の構造を JSDoc で文書化 | Restrictions: 実行コードを変更しない | Success: state.model へのアクセスで型補完が効く_

- [x] 8. main.utils.js の JSDoc 強化
  - File: media/main.utils.js
  - すべての export 関数に @param と @returns を追加
  - newClass, newAttribute, newOperation の戻り値型を明記
  - Purpose: ユーティリティ関数の型安全性
  - _Leverage: media/types.d.ts_
  - _Requirements: 問題3_
  - _Prompt: Role: JavaScript/JSDoc 専門家 | Task: 全関数に完全な型アノテーションを追加 | Restrictions: 関数の動作を変更しない | Success: すべての関数呼び出しで型チェックが機能_

---

## Phase 3: パフォーマンス最適化 (問題4対策)

- [x] 9. デバウンス付き requestRender の導入
  - File: media/main.draw.js
  - requestRender() 関数を追加 (16ms デバウンス)
  - 直接の render() 呼び出しを requestRender() に置換
  - Purpose: 連続した変更での再描画を最適化
  - _Leverage: 既存の render() 関数_
  - _Requirements: 問題4_
  - _Prompt: Role: フロントエンドパフォーマンス専門家 | Task: デバウンス機能を追加し、render 呼び出しを最適化 | Restrictions: 視覚的な遅延を最小限に | Success: 連続入力時のちらつきが解消_

- [x] 10. イベントハンドラの render 呼び出し置換
  - File: media/main.draw.js, media/main.interactions.js
  - すべての render() 呼び出しを requestRender() に変更
  - 即時描画が必要な箇所は render() を維持
  - Purpose: 全体的なパフォーマンス向上
  - _Leverage: タスク9 の requestRender_
  - _Requirements: 問題4_
  - _Prompt: Role: リファクタリング専門家 | Task: render 呼び出しを分析し、適切なものを置換 | Restrictions: ドラッグ操作の応答性を維持 | Success: CPU 使用率が低下_

---

## Phase 4: エラーハンドリング強化 (問題5対策)

- [x] 11. main.js のエラーハンドリング追加
  - File: media/main.js
  - メッセージ受信時の try-catch 追加
  - adjustSvgSize の null チェック追加
  - Purpose: 予期しないエラーからの保護
  - _Leverage: 既存のエラーパターン_
  - _Requirements: 問題5_
  - _Prompt: Role: 堅牢なコード専門家 | Task: エラー発生しうる箇所に適切なハンドリングを追加 | Restrictions: 正常系の動作を変更しない | Success: エラー時もUI がクラッシュしない_

- [x] 12. cryptoRandomId の改善
  - File: media/main.utils.js
  - 関数名を generateId に変更、または crypto.getRandomValues を使用
  - 既存の利用箇所を更新
  - Purpose: 名称と実装の一致、または真のランダム性
  - _Leverage: Web Crypto API_
  - _Requirements: 問題5_
  - _Prompt: Role: セキュリティ意識のある開発者 | Task: 関数名を正確にするか、暗号学的乱数を使用 | Restrictions: ID の一意性を保証 | Success: 関数名が実装を正確に反映_

---

## Phase 5: 循環依存解消 (問題6対策)

- [ ] 13. EventEmitter モジュールの作成
  - File: media/main.events.js
  - on, emit, off メソッドを持つイベントシステム
  - モジュール間通信の中継点として機能
  - Purpose: draw と interactions の直接依存を解消
  - _Leverage: 標準的な EventEmitter パターン_
  - _Requirements: 問題6_
  - _Prompt: Role: モジュールアーキテクチャ専門家 | Task: 軽量なイベントシステムを実装 | Restrictions: 外部ライブラリを使用しない | Success: 循環依存なしでモジュールが通信可能_

- [ ] 14. draw.js と interactions.js のリファクタリング
  - File: media/main.draw.js, media/main.interactions.js
  - 相互参照を EventEmitter 経由に変更
  - 初期化時の refs パターンを簡素化
  - Purpose: 依存関係の一方向化
  - _Leverage: main.events.js_
  - _Requirements: 問題6_
  - _Prompt: Role: リファクタリング専門家 | Task: 相互参照をイベント駆動に置換 | Restrictions: 既存の機能を維持 | Success: 依存グラフがDAGになる_

---

## Phase 6: テストカバレッジ向上 (問題7対策)

- [ ] 15. main.utils.js の単体テスト作成
  - File: src/test/js/utils.test.js
  - newClass, newAttribute, newOperation, migrateModel のテスト
  - 既存のテストパターンを参考
  - Purpose: ユーティリティ関数の信頼性確保
  - _Leverage: src/test/js/main.test.js_
  - _Requirements: 問題7_
  - _Prompt: Role: QA エンジニア | Task: utils 関数の単体テストを作成 | Restrictions: Node.js 環境で実行可能 | Success: npm run test:js でテスト実行可能_

- [ ] 16. FileService の単体テスト作成
  - File: src/test/FileService.test.ts
  - VS Code API のモック使用
  - loadJson, saveJson のテスト
  - Purpose: サービス層の信頼性確保
  - _Leverage: @vscode/test-cli_
  - _Requirements: 問題7_
  - _Prompt: Role: TypeScript テスト専門家 | Task: FileService のテストを作成 | Restrictions: 実際のファイルシステムに依存しない | Success: npm run test でテスト実行可能_

---

## Phase 7: SVG サイズ調整改善 (問題8対策)

- [ ] 17. adjustSvgSize の改善
  - File: media/main.js
  - クラスボックスの実際の範囲から SVG サイズを計算
  - null チェックと余白の追加
  - Purpose: あらゆる配置でリレーション線が正しく表示
  - _Leverage: 既存の adjustSvgSize 関数_
  - _Requirements: 問題8_
  - _Prompt: Role: SVG とレイアウト専門家 | Task: コンテンツベースのサイズ計算を実装 | Restrictions: パフォーマンスへの影響を最小限に | Success: 負の座標でもリレーション線が表示_

- [ ] 18. scroll イベントのデバウンス
  - File: media/main.js
  - adjustSvgSize 呼び出しをデバウンス (100ms)
  - ResizeObserver の活用を検討
  - Purpose: スクロール時のパフォーマンス向上
  - _Leverage: タスク9 のデバウンスパターン_
  - _Requirements: 問題8_
  - _Prompt: Role: パフォーマンス専門家 | Task: scroll イベントの最適化 | Restrictions: 視覚的な遅延を防ぐ | Success: 高速スクロール時も滑らか_

---

## 検証計画

### 自動テスト
- `npm run test` - 単体テストと統合テスト実行
- `npm run test:js` - Webview ユーティリティのテスト
- `npm run lint` - コード品質チェック

### 手動検証
1. Extension を起動し、classDiagram と workflowDiagram の両方が正常に動作することを確認
2. クラスを複数追加し、ドラッグ操作がスムーズか確認
3. 大量のクラス (20+) でパフォーマンスを確認
4. コード生成が各言語で正常に動作することを確認
