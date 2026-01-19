# タスク - データ永続化

- [ ] 1. saveJson メッセージハンドラの実装
  - ファイル: `src/extension.ts`
  - `msg.command === 'saveJson'` のケースを実装する。`vscode.window.showSaveDialog` を表示する。
  - 目的: ユーザーが保存場所を指定して図面を永続化できるようにする。
  - _活用: VS Code FileSystem API_
  - _要件: 1.1_
  - _プロンプト: Role: VS Code 拡張機能開発者 | Task: src/extension.ts に saveJson コマンドを実装してください。showSaveDialog を使用してユーザーにファイルパスを選択させ、workspace.fs.writeFile を使用して JSON コンテンツを書き込んでください。 | Success: 図面ファイルが選択した場所に正常に保存される。_

- [ ] 2. loadJson メッセージハンドラの実装
  - ファイル: `src/extension.ts`
  - `showOpenDialog` を使用して `msg.command === 'loadJson'` を実装する。
  - 目的: ユーザーが既存の図面ファイルを開けるようにする。
  - _活用: `workspace.fs.readFile`_
  - _要件: 1.1_
  - _プロンプト: Role: VS Code 拡張機能開発者 | Task: src/extension.ts に loadJson コマンドを実装してください。showOpenDialog を使用し、ファイルのバイトデータを読み込み、変換した JSON を loadedJson メッセージを介して webview に送り返してください。 | Success: 図面ファイルが読み込まれ、webview で正しくレンダリングされる。_

- [ ] 3. モデルマイグレーションロジックの作成
  - ファイル: `media/main.js` (クラスエディタ) または `media.workflow/workflow.js` (ワークフロー)
  - 欠落している ID やデフォルトフィールドを追加する `migrateModel` 関数を実装する。
  - 目的: 古い保存形式との後方互換性を維持する。
  - _活用: 標準的な JavaScript オブジェクト操作_
  - _要件: 2.1_
  - _プロンプト: Role: フロントエンド開発者 | Task: ロードされた JSON データが現在の内部構造と一致するように migrateModel(obj) を実装してください。クラスに ID がない場合は一意の ID を割り当て、属性/操作の空配列を初期化してください。 | Success: レガシーファイルが実行時エラーを起こさずに正しく読み込まれる。_

- [ ] 4. diagram.json の自動検出の実装
  - ファイル: `src/extension.ts` (activate)
  - アクティベーション時に現在のワークスペースフォルダ内で `**/diagram.json` を検索する。
  - 目的: 現在のワークスペースの図面を自動ロードすることで UX を向上させる。
  - _活用: `vscode.workspace.findFiles`_
  - _要件: (ビジョン)_
  - _プロンプト: Role: VS Code 拡張機能開発者 | Task: アクティベーション時にワークスペース内の diagram.json ファイルを検索してください。見つかった場合は、開始プロセスを合理化するためにデータを Webview に自動的に送信するか、ユーザーを誘導してください。 | Success: 拡張機能が既存のワークスペース図面を自動的に検出してロードする。_
