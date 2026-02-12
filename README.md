# Class Diagram & Workflow Editor for VS Code

VS Code 内でクラス図やワークフロー図を視覚的に作成し、それらに基づいて各種プログラミング言語のソースコードを生成、あるいは既存のソースコードからクラス図を逆生成することができる拡張機能です。

## 主な機能

- **クラス図エディタ (Reactベース)**:
  - クラス、インターフェースの視覚的な作成。
  - 属性（フィールド）および操作（メソッド）の定義。
  - 継承（Base Class）およびインターフェースの実装（Interfaces）の指定。
  - 抽象クラス、抽象メソッド、仮想メソッドのサポート。
  - React/Vite/Tailwind CSSを採用した現代的で高速な操作感。
- **ワークフロー図エディタ**:
  - シンプルなワークフロー図を視覚的に作成可能。
- **マルチ言語コード生成 (Forward Engineering)**:
  - 作成したクラス図から以下の言語のコードを自動生成：
    - **TypeScript**, **Java**, **C#**, **C++**, **Rust**
- **ソースコード解析からの図生成 (Reverse Engineering)**:
  - 既存のソースコード（TS, JS, C#, Java, Rust, C++）を解析し、クラス図を自動生成。
  - LSP（Language Server Protocol）と Tree-sitter（AST解析）を組み合わせた高度な解析。
- **JSONベースのデータ管理**:
  - 図の情報を `diagram.json` として保存・読み込みが可能。

## 使用方法

### 1. エディタを起動する
コマンドパレット（`Ctrl+Shift+P` または `F1`）を開き、以下のコマンドを実行します：
- `Open Class Diagram Editor` (クラス図エディタを開く)
- `Open Workflow Editor` (ワークフロー図エディタを開く)

### 2. ソースコードからクラス図を生成（逆変換）
1. コマンドパレットから `Generate Diagram from Source` を実行します。
2. 解析対象として「現在のファイル」または「ワークスペース全体」を選択します。
3. 解析が完了すると `diagram.json` が生成され、クラス図エディタで確認することができます。

### 3. クラス図の作成とコード生成（順変換）
1. **Add Class**: ボタンをクリックして新しいクラスを図面に追加します。
2. **詳細設定**: クラス名、メンバ、継承関係などを編集パネルで設定します。
3. **Generate**: ツールバーで生成対象の言語を選択し、`Generate` ボタンを押します。出力先のフォルダを選択すると、ファイルが自動生成されます。
   - ※ 生成されたコードの詳細は `Output` パネルの `Class Diagram Editor Log` で確認できます。

### 4. 図の保存と読み込み
- **Save Json**: 現在の図の状態を JSON ファイルとして保存します。デフォルトではワークスペース直下の `diagram.json` に保存されます。
- **Load Json**: 保存した JSON ファイルを読み込んで図を復元します。

## コマンド

| コマンド ID | 説明 |
| :--- | :--- |
| `classDiagram.open` | クラス図エディタを新しいパネルで開きます。 |
| `workflowDiagram.open` | ワークフロー図エディタを新しいパネルで開きます。 |
| `sourceToDiagram.generate` | ソースコードからクラス図を生成します。 |

## サポートされるデータ型

各言語に合わせて以下のプリミティブ型が自動的にマッピングされます：

| クラス図上の型 | C# | TypeScript | Java | C++ | Rust |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `int` | `int` | `number` | `int` | `int` | `i32` |
| `string` | `string` | `string` | `String` | `std::string` | `String` |
| `bool` | `bool` | `boolean` | `boolean` | `bool` | `bool` |
| `float` | `float` | `number` | `float` | `float` | `f32` |
| `double` | `double` | `number` | `double` | `double` | `f64` |
| `void` | `void` | `void` | `void` | `void` | `()` |
| `char` | `char` | `string` | `char` | `char` | `String` |
| `object` | `object` | `object` | `Object` | `auto` | `()` |

## FAQ

- **Q: ソースコードからクラス図へ逆変換（リバースエンジニアリング）はできますか？**
  - A: はい、`Generate Diagram from Source` コマンドにより可能です。現在、TypeScript, JavaScript, C#, Java, Rust, C++ をサポートしています。
- **Q: `Generate` ボタンで一部のメンバがスキップされます。**
  - A: 言語仕様（例：private かつ abstract/virtual なメンバなど）により、適切でない組み合わせはログに出力された上でスキップされる場合があります。
- **Q: C++ で `List<T>` を使うとどうなりますか？**
  - A: `std::vector<T>` に変換されるように一部特殊なマッピングが実装されています。

## 貢献・作者

- **作者**: RETO2520
- **リポジトリ**: [GitHub: VSCodeClassDiagram](https://github.com/RETO2520/VSCodeClassDiagram)
- バグ報告や機能要望は GitHub の Issues までお寄せください。

## ライセンス

[MIT LICENSE](LICENSE)
