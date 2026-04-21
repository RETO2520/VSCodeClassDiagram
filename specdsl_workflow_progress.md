# SpecDSL Workflow拡張 進捗ログ

最終更新: 2026-04-21

## 意図
- 目的: Gherkinだけでは不足する実装ロジック表現を、追加DSLで `workflowAst` に落とし込み、コード生成可能な形にする。
- 方針: `Scenario` は業務振る舞い(仕様)を保持し、`Flow:` ブロックは実装手順(制御構造)を保持する二層構造にする。

## 今回の実装(Phase 1)
- `SpecDslParser` に `Flow:` ブロック解析を追加。
- `Flow:` で以下を解釈して `operation.workflowAst` に変換。
  - `var <name>:<type> = <expr>`
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

## 進捗チェック
- [x] Parserに `Flow:` ブロックを追加
- [x] `workflowAst` の保存連携
- [x] ユニットテスト追加 (`src/test/SpecDslParser.test.ts`)
- [ ] Builderごとの生成品質調整(言語別テンプレート最適化)
- [ ] `dsl_syntax_guide.md` への正式統合
- [ ] Flow構文エラー時の診断メッセージ強化

## 次フェーズ候補
1. `Flow:` の式/型推論を強化し、`do` 行から副作用対象(メンバ・依存先)を抽出する。
2. `if/while` 以外に `for` / `switch` / `break` / `continue` を追加する。
3. GherkinステップとFlowノード間にトレーサビリティIDを持たせ、生成コードコメントと相互参照できるようにする。
