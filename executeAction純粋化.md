# executeAction 純粋関数化 実現方法と手順

## 目的

React 依存を排除し、`executeAction` を純粋関数へ移行する。

### 現在

```ts
executeAction(command, setClasses)
```

- React state に直接依存
- テストが困難
- History / Undo 導入が難しい
- DomainModel 抽出ができない

### 目標

```ts
executeAction(command, classes): ClassInfo[]
```

- 入力 → 出力のみ
- 副作用なし
- UI 非依存
- テスト可能
- 将来の DomainModel 移行基盤

---

# 基本方針

1. **状態更新責務を UI から分離**
2. `setClasses` を完全に排除
3. 常に `prevState` を引数として受け取る
4. 新しい state を返すだけにする

---

# 実装手順（安全な段階移行）

---

## Step 1: 新しい executeAction を作成する

### 新シグネチャ

```ts
export function executeAction(
    command: CliCommand,
    prevClasses: ClassInfo[]
): ClassInfo[] {
    if (!command) return prevClasses;

    switch (command.type) {
        case 'ADD_TYPE': {
            let currentClasses = [...prevClasses];

            const { updatedClasses, target: newClass } =
                getOrCreateClass(currentClasses, command.name);

            currentClasses = updatedClasses;

            newClass.kind =
                command.kind === 'i'
                    ? 'interface'
                    : command.kind === 's'
                    ? 'struct'
                    : 'class';

            return currentClasses.map(c =>
                c.name === newClass.name ? newClass : c
            );
        }

        default:
            return prevClasses;
    }
}
```

ポイント：

- `setClasses` を使わない
- `prevClasses` を直接受け取る
- 新しい配列を返す
- 副作用なし

---

## Step 2: React 側を変更する

### 変更前

```ts
executeAction(action, setClasses)
```

### 変更後

```ts
setClasses(prev => executeAction(action, prev))
```

これで：

- React は state 管理だけ
- ロジックは純粋関数

完全分離完了。

---

## Step 3: 全ケースを同様に書き換える

現在の各 `case` は：

```ts
setClasses(prev => prev.map(...))
```

となっているはず。

それを：

```ts
return prevClasses.map(...)
```

に置き換えるだけ。

ロジック自体は変更しない。

---

# 重要な設計ルール

## 1. 常にイミュータブルに

```ts
const next = [...prev]
```

直接 mutate しない。

---

## 2. 外部変数を参照しない

禁止例：

```ts
console.log(...)
Date.now()
Math.random()
```

純粋関数性を守る。

---

## 3. React 型を import しない

`React`, `Dispatch`, `SetStateAction` を使わない。

---

# テスト可能になる例

```ts
it('adds class correctly', () => {
    const result = executeAction(
        { type: 'ADD_TYPE', name: 'User' },
        []
    )

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('User')
})
```

UI不要でテスト可能。

---

# この変更で得られる未来

| 効果 | 可能になること |
|------|----------------|
| 純粋化 | 単体テスト |
| 状態明示化 | History導入 |
| 副作用排除 | AIバッチ実行 |
| UI分離 | DomainModel抽出 |
| 再利用性 | CLI専用実行エンジン |

---

# 次の進化（任意）

純粋化後、さらに安全にするなら：

```ts
export function executeAction(
    command: CliCommand,
    prev: Readonly<ClassInfo[]>
): ClassInfo[]
```

`Readonly` を付与し、
誤った破壊的変更を防ぐ。

---

# 最終イメージ

```
UI (React)
    ↓
Application Layer
    ↓
executeAction (Pure)
    ↓
New State
```

UI は表示のみ。

ロジックは完全独立。

---

# リスク

ほぼなし。

ロジック変更はしないため、
影響範囲は最小。

---

# 結論

executeAction 純粋化は：

- 低リスク
- 高リターン
- 将来設計への最重要布石

最小コストで、
アーキテクチャを一段引き上げる変更。

まずはここから始めるのが最適。
