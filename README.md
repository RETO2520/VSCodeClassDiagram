
# VSCode Class Diagram (クラス図エディタ)

**概要**
- **拡張機能**: VSCode 内でクラス図からソースコードの雛形を生成・表示するためのエディタです。

**主な機能**
- **クラス図からコードの雛形を生成**: プロジェクト内の言語別ビルダー（TypeScript/Java/C++/C#/Rustなど）に基づき、クラスや型の構造を図示します。
- **簡易ビューワー**: 生成したクラス図を拡張パネルで確認できます。

**使用方法**
1. コマンドパレットを開く（`Ctrl+Shift+P` または `F1`）。
2. `クラス図エディターを開く` を選択します。
    - 設定(`Configure Display Language`)により、英語では`Open Class Diagram Editor`です。
3. WebViewが開き、そこで操作ができます。
    * `Add Class`ボタンでクラス図を生成できます。
    * `Save Json`ボタンで現在のクラス図の情報をJsonで保存できます。
    * `Load Json`ボタンで`Save Json`ボタンで保存されたJsonを読み込めます。
    * `Generate`ボタンでツールバー上のドロップダウンリストで選択されている言語のコードを生成します。

**コマンド**
- `classDiagram.open`: クラス図エディタを開きます。

**設定**
- 現在のところ追加のユーザー設定はありません。

**スクリーンショット / メディア**
- サンプル表示やスタイルは `media/` フォルダ内のファイルで確認できます（例: [media/index.html](media/index.html)）。

**よくある質問**
- Q: サポートされる言語は？
	- A: 現在はプロジェクト内の `CodeComponents` に実装された言語ビルダー（TypeScript, Java, C++, C#, Rust ）を使用します。個別言語のサポートは今後拡張可能です。
- Q: ソースコードからクラス図は変換できますか？
    - A: 現状、出来ません。
- Q: `Generate`ボタンで部分的にコードが生成されません。
    - A: 生成する言語によってはメンバがスキップされます。詳しくは各言語ビルダーの`generateAttributes`メソッド、`generateOperations`メソッドを見てください。

**貢献**
- バグ報告・機能要望はリポジトリの Issues にお願いします: https://github.com/RETO2520/VSCodeClassDiagram/issues
- 開発者向けには `src/` 以下のソースを参照してください。

**ライセンス**
- この拡張はリポジトリの `MIT LICENSE` に従います。詳細は [MIT LICENSE](LICENSE) を参照してください。

---
