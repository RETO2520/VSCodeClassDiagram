# SpecDSL Workflow拡張 進捗ログ

最終更新: 2026-04-21

## 意図
- 目的: Gherkinだけでは不足する実装ロジック表現を、追加DSLで `workflowAst` に落とし込み、コード生成可能な形にする。
- 方針: `Scenario` は業務振る舞い(仕様)を保持し、`Flow:` ブロックは実装手順(制御構造)を保持する二層構造にする。

## 今回の実装(Phase 1)
- `SpecDslParser` に `Flow:` ブロック解析を追加。
- `Flow:` で以下を解釈して `operation.workflowAst` に変換。
  - `var <n>:<type> = <expr>`
  - `do <statement>`
  - `if <condition>` / `else` / `end`
  - `while <condition>` / `end`
  - `return [value]`
- Gherkin由来の `workflow` と併用保存するように、`applyUpdateOperationWorkflow` へ `workflowAst` を連携。

## 新記法(暫定)
```dsl
Scenario: approved flow
Given ...
When ...
Then ...
Flow:
var normalized:boolean = amount > 0
if normalized
  do this.markCompleted()
  return true
else
  do this.markRejected()
  return false
end
```

## Phase 1 進捗チェック
- [x] Parserに `Flow:` ブロックを追加
- [x] `workflowAst` の保存連携
- [x] ユニットテスト追加 (`src/test/SpecDslParser.test.ts`)
- [ ] Builderごとの生成品質調整(言語別テンプレート最適化)
- [ ] `dsl_syntax_guide.md` への正式統合
- [ ] Flow構文エラー時の診断メッセージ強化

---

## Phase 2 実装計画 — DSL拡張 + ワークフローエディタ反映

### 追加するDSL構文

```dsl
Flow:
  # forEachループ (コレクション反復)
  for item in this.items
    do item.process()
    if item.invalid
      break
    end
  end

  # for範囲ループ
  for i from 0 to 10
    do this.retry(i)
    if this.succeeded
      continue
    end
  end

  # switch / case / default
  switch this.status
    case "pending":
      do this.initialize()
    case "active":
      do this.execute()
      return true
    default:
      return false
  end
```

### 追加ASTノード

| ノード           | プロパティ                                | 対応DSL構文                     |
|------------------|-------------------------------------------|---------------------------------|
| `ForEachNode`    | `variable`, `collection`, `body[]`        | `for v in col ... end`          |
| `ForRangeNode`   | `variable`, `from`, `to`, `body[]`        | `for v from n to m ... end`     |
| `SwitchNode`     | `expression`, `cases[]`, `default?`       | `switch expr ... end`           |
| `CaseNode`       | `value`, `body[]`                         | `case val:`                     |
| `BreakNode`      | ―                                         | `break`                         |
| `ContinueNode`   | ―                                         | `continue`                      |

### ワークフローエディタへの反映 (`view/components/WorkflowEditorPanel.tsx`)

| ビジュアルノード | 形状                  | 色 (stroke)  | 対応ASTノード   |
|------------------|-----------------------|--------------|-----------------|
| `foreach`        | 六角形 (横長)         | `#2dd4bf`    | `ForEachNode`   |
| `forrange`       | 六角形 (破線枠)       | `#14b8a6`    | `ForRangeNode`  |
| `switch`         | 五角形 (家型)         | `#f59e0b`    | `SwitchNode`    |
| `break`          | 台形 (上辺短)         | `#f87171`    | `BreakNode`     |
| `continue`       | 台形 (上辺短・violet) | `#a78bfa`    | `ContinueNode`  |

### エッジ条件の自動付与ルール

| 元ノード型            | 自動付与される condition     |
|-----------------------|------------------------------|
| `decision` / `loop`   | `'false'` → `'true'` の順    |
| `foreach` / `forrange`| 1本目: `'body'`、以降: なし  |
| `switch`              | `'case0'`, `'case1'`, … 最後に `'default'` |
| `break` / `continue`  | なし (条件なし)              |

### Phase 2 進捗チェック
- [x] `WorkflowEditorPanel.tsx` に新 NodeType を追加 (`foreach` / `forrange` / `switch` / `break` / `continue`)
- [x] 各ノードの形状実装
  - [x] `foreach` / `forrange` — 六角形 (`hexagonPoints`)
  - [x] `switch` — 五角形・家型 (`pentagonPoints`)
  - [x] `break` / `continue` — 台形 (`trapezoidPoints`)
- [x] `STYLE` / `NODE_COL` / `nodeSize` に新型を追加
- [x] `FLOW_NODE_TYPES` グループをツールバーに追加
- [x] `autoCondition()` に foreach / forrange / switch のエッジ条件自動付与を追加
- [x] `convertToAst()` に forEach / forRange / switch / break / continue の走査を追加
- [x] `InlineEditor` に foreach / forrange / switch の構文ヒント placeholder を追加
- [x] 右クリックコンテキストメニューに Flow制御ノードセクション追加
- [ ] SpecDslParser 実装 (ForEach/ForRange/Switch/Break/Continue トークン解析)
- [ ] Builder各言語テンプレート追加
  - [ ] TypeScript: `for...of` / `for(let i=n;i<m;i++)` / `switch` / `break` / `continue`
  - [ ] Kotlin: `for(v in col)` / `(n..m).forEach` / `when(expr)` / `break` / `continue`
  - [ ] Python: `for v in col:` / `for i in range(n,m):` / `match expr:` / `break` / `continue`
- [ ] ネスト検証テスト (for の中に switch、switch の中に for)
- [ ] `break`/`continue` スコープ検証 (ループ外使用時に診断エラー)
- [ ] `dsl_syntax_guide.md` に新構文サンプルを追記

### スコープ管理方針
`break`/`continue` はループスコープ内でのみ有効。Parserにループ深度カウンタ（`loopDepth`）を持たせ、
`loopDepth === 0` の時点で `break`/`continue` が現れた場合は診断エラーを出力する。
これは Phase 1 の「Flow構文エラー時の診断メッセージ強化」課題と同時に対処する。

---

## 次フェーズ候補 (Phase 3)
1. `Flow:` の式/型推論を強化し、`do` 行から副作用対象(メンバ・依存先)を抽出する。
2. GherkinステップとFlowノード間にトレーサビリティIDを持たせ、生成コードコメントと相互参照できるようにする。
3. `forEach`/`forRange` ノードのラベル構文を `for <var> in <col>` / `for <var> from <n> to <m>` に統一し、Parserとエディタ間で往復可能にする。
