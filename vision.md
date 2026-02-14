# Architecture Vision  
VSCode Class Diagram + DSL Platform

---

## 1. Core Philosophy

The system is not a diagram editor.

It is a **Design Language Platform**.

The diagram is only a visualization of a structured architectural model.

The CLI is not a utility feature.  
It is a DSL interpreter.

The JSON is not storage.  
It is a serialized domain snapshot.

---

## 2. Final Layered Architecture

```
┌─────────────────────────────┐
│         Presentation        │
│  React UI / CLI Input       │
└───────────────┬─────────────┘
                ↓
┌─────────────────────────────┐
│     Application Layer       │
│ Command Dispatcher          │
│ Transaction Manager         │
│ History Manager             │
└───────────────┬─────────────┘
                ↓
┌─────────────────────────────┐
│       Domain Layer          │
│ DomainModel                 │
│ ClassEntity                 │
│ RelationEntity              │
│ Invariants / Validation     │
└───────────────┬─────────────┘
                ↓
┌─────────────────────────────┐
│      Infrastructure         │
│ JSON Serializer             │
│ Code Generator              │
│ Reverse Parser              │
└─────────────────────────────┘
```

---

## 3. Core Domain Model Concept

DomainModel becomes the single source of truth.

```ts
class DomainModel {
    execute(command: Command): DomainModel
    validate(): ValidationResult
    exportSnapshot(): DiagramSnapshot
}
```

React never mutates domain state directly.

React only receives:

```ts
const snapshot = domain.exportSnapshot()
```

---

## 4. Command Model Evolution

### Current
- Data-based command + switch reducer

### Final
Each command becomes behavior-driven:

```ts
interface Command {
    execute(model: DomainModel): DomainModel
    undo(model: DomainModel): DomainModel
}
```

No switch statement.

Polymorphism replaces branching.

---

## 5. Undo/Redo Final Model

Command history stack:

```ts
history: Command[]
redoStack: Command[]
```

### Execution

```ts
model = command.execute(model)
history.push(command)
```

### Undo

```ts
const last = history.pop()
model = last.undo(model)
redoStack.push(last)
```

This enables:

- Time-travel
- Macro recording
- Replay
- Deterministic architecture evolution

---

## 6. Transaction Support

Future DSL extension:

```
begin
c User
a User +name string
commit
```

Application layer handles transaction grouping:

```ts
TransactionCommand(commands[])
```

Either fully applied or rejected.

---

## 7. Event-Driven Extension

Optional advanced layer:

Domain emits events:

- ClassAdded
- MethodAdded
- RelationLinked

Allows:

- Plugin system
- Live AI suggestions
- External synchronization
- Metrics tracking

---

## 8. AI Integration Future

Because domain execution is pure:

AI can:

- Generate command sequences
- Simulate architecture changes
- Evaluate structural metrics
- Propose refactors
- Auto-apply patterns

Example:

```
apply DDD to UserModule
```

Becomes internal command sequence.

---

## 9. Multi-Representation Model

Single DomainModel → multiple outputs:

- Diagram Snapshot
- CLI Script
- JSON
- Code (multi-language)
- Metrics
- Documentation

The diagram is just one projection.

---

## 10. Long-Term Identity of the Project

It is no longer:

"A VSCode extension for class diagrams."

It becomes:

"A programmable architectural modeling platform embedded in VSCode."

---

## 11. Implementation Phases

Do NOT implement everything at once.

### Phase Progression

1. Pure reducer `executeAction`
2. Command object behavior model
3. History stack (snapshot first)
4. DomainModel extraction from React
5. Transaction grouping
6. Optional event system

Each step should preserve working functionality.

---

## 12. Key Architectural Rule

React must never contain domain logic.

React renders.

Domain decides.

Application orchestrates.

---

## 13. Final Vision Summary

The ultimate system:

- Is deterministic
- Is testable without UI
- Is replayable
- Is scriptable
- Is AI-compatible
- Is transaction-safe
- Is language-agnostic
- Is architecture-first

The CLI is not a feature.  
It is the gateway to architectural programming.
# Ultimate Architecture Vision  
VSCode Class Diagram + DSL Platform

---

## 1. Core Philosophy

The system is not a diagram editor.

It is a **Design Language Platform**.

The diagram is only a visualization of a structured architectural model.

The CLI is not a utility feature.  
It is a DSL interpreter.

The JSON is not storage.  
It is a serialized domain snapshot.

---

## 2. Final Layered Architecture

```
┌─────────────────────────────┐
│         Presentation        │
│  React UI / CLI Input       │
└───────────────┬─────────────┘
                ↓
┌─────────────────────────────┐
│     Application Layer       │
│ Command Dispatcher          │
│ Transaction Manager         │
│ History Manager             │
└───────────────┬─────────────┘
                ↓
┌─────────────────────────────┐
│       Domain Layer          │
│ DomainModel                 │
│ ClassEntity                 │
│ RelationEntity              │
│ Invariants / Validation     │
└───────────────┬─────────────┘
                ↓
┌─────────────────────────────┐
│      Infrastructure         │
│ JSON Serializer             │
│ Code Generator              │
│ Reverse Parser              │
└─────────────────────────────┘
```

---

## 3. Core Domain Model Concept

DomainModel becomes the single source of truth.

```ts
class DomainModel {
    execute(command: Command): DomainModel
    validate(): ValidationResult
    exportSnapshot(): DiagramSnapshot
}
```

React never mutates domain state directly.

React only receives:

```ts
const snapshot = domain.exportSnapshot()
```

---

## 4. Command Model Evolution

### Current
- Data-based command + switch reducer

### Final
Each command becomes behavior-driven:

```ts
interface Command {
    execute(model: DomainModel): DomainModel
    undo(model: DomainModel): DomainModel
}
```

No switch statement.

Polymorphism replaces branching.

---

## 5. Undo/Redo Final Model

Command history stack:

```ts
history: Command[]
redoStack: Command[]
```

### Execution

```ts
model = command.execute(model)
history.push(command)
```

### Undo

```ts
const last = history.pop()
model = last.undo(model)
redoStack.push(last)
```

This enables:

- Time-travel
- Macro recording
- Replay
- Deterministic architecture evolution

---

## 6. Transaction Support

Future DSL extension:

```
begin
c User
a User +name string
commit
```

Application layer handles transaction grouping:

```ts
TransactionCommand(commands[])
```

Either fully applied or rejected.

---

## 7. Event-Driven Extension

Optional advanced layer:

Domain emits events:

- ClassAdded
- MethodAdded
- RelationLinked

Allows:

- Plugin system
- Live AI suggestions
- External synchronization
- Metrics tracking

---

## 8. AI Integration Future

Because domain execution is pure:

AI can:

- Generate command sequences
- Simulate architecture changes
- Evaluate structural metrics
- Propose refactors
- Auto-apply patterns

Example:

```
apply DDD to UserModule
```

Becomes internal command sequence.

---

## 9. Multi-Representation Model

Single DomainModel → multiple outputs:

- Diagram Snapshot
- CLI Script
- JSON
- Code (multi-language)
- Metrics
- Documentation

The diagram is just one projection.

---

## 10. Long-Term Identity of the Project

It is no longer:

"A VSCode extension for class diagrams."

It becomes:

"A programmable architectural modeling platform embedded in VSCode."

---

## 11. Implementation Phases

Do NOT implement everything at once.

### Phase Progression

1. Pure reducer `executeAction`
2. Command object behavior model
3. History stack (snapshot first)
4. DomainModel extraction from React
5. Transaction grouping
6. Optional event system

Each step should preserve working functionality.

---

## 12. Key Architectural Rule

React must never contain domain logic.

React renders.

Domain decides.

Application orchestrates.

---

## 13. Final Vision Summary

The ultimate system:

- Is deterministic
- Is testable without UI
- Is replayable
- Is scriptable
- Is AI-compatible
- Is transaction-safe
- Is language-agnostic
- Is architecture-first

The CLI is not a feature.  
It is the gateway to architectural programming.