/**
 * CLI Command Parser based on cli.txt grammar version 1.1
 */

import { Command } from './commands/Command';
import { AddTypeCommand } from './commands/AddTypeCommand';
import { ApplyFactoryPatternCommand } from './commands/ApplyFactoryPatternCommand';
import { AddAttrCommand } from './commands/AddAttrCommand';
import { AddMethodCommand } from './commands/AddMethodCommand';
import { AddParamCommand } from './commands/AddParamCommand';
import { SetBaseCommand } from './commands/SetBaseCommand';
import { SetImplCommand } from './commands/SetImplCommand';
import { RenameCommand } from './commands/RenameCommand';
import { DeleteCommand } from './commands/DeleteCommand';
import { RelationCommand } from './commands/RelationCommand';
import { HelpCommand } from './commands/HelpCommand';
import { SelectCommand } from './commands/SelectCommand';
import { GenerateCodeCommand } from './commands/GenerateCodeCommand';
import { ImportCommand } from './commands/ImportCommand';
import { SaveCommand } from './commands/SaveCommand';
import { LoadCommand } from './commands/LoadCommand';
import { ClearCommand } from './commands/ClearCommand';
import { UndoCommand } from './commands/UndoCommand';
import { RedoCommand } from './commands/RedoCommand';
import { ListCommand } from './commands/ListCommand';
import { ChangeModifierCommand } from './commands/ChangeModifierCommand';
import { ApplySignletonPatternCommand } from './commands/ApplySignleotnPatternCommand';
import { ApplyAdapterPatternCommand } from './commands/ApplyAdapterPatternCommand';
import { ApplyTemplatePatternCommand } from './commands/ApplyTemplatePatternCommand';
import { ApplyStrategyPatternCommand } from './commands/ApplyStrategyPatternCommand';
import { ApplyObserverPatternCommand } from './commands/ApplyObserverPatternCommand';
import { ApplyFacadePatternCommand } from './commands/ApplyFacadePatternCommand';
import { ExportSpecCommand } from './commands/ExportSpecCommand';
import { ImportSpecDslCommand } from './commands/ImportSpecDslCommand';
import { ExportSpecDslCommand } from './commands/ExportSpecDslCommand';
import { SpecSyncCommand } from './commands/SpecSyncCommand';
import { RefactorCommand, RefactorKind } from './commands/RefactorCommand';

export type CliCommandType =
    | 'ADD_TYPE'
    | 'ADD_ATTR'
    | 'ADD_METHOD'
    | 'ADD_PARAM'
    | 'SET_BASE'
    | 'SET_IMPL'
    | 'RENAME'
    | 'DELETE'
    | 'RELATION'
    | 'HELP'
    | 'SELECT'
    | 'GENERATE_CODE'
    | 'IMPORT'
    | 'SAVE'
    | 'LOAD'
    | 'CLEAR'
    | 'UNDO'
    | 'REDO'
    | 'CHANGE_MODIFIER'
    | 'LIST'
    | 'APPLY_FACTORY'
    | 'APPLY_SINGLETON'
    | 'APPLY_ADAPTER'
    | 'APPLY_TEMPLATE'
    | 'APPLY_STRATEGY'
    | 'APPLY_OBSERVER'
    | 'APPLY_FACADE'
    | 'EXPORT_SPEC'
    | 'EXPORT_SPEC_DSL'
    | 'IMPORT_SPEC_DSL'
    | 'SPEC_SYNC'
    | 'REFACTOR';


export type TypePrefix = 'c' | 'ac' | 'i' | 's' | 'e';
export type Visibility = 'public' | 'private' | 'protected' | 'package';
export type Modifier = 'static' | 'abstract' | 'virtual';

// Re-export Command class and all subclasses for convenience
export { Command } from './commands/Command';
export { AddTypeCommand } from './commands/AddTypeCommand';
export { AddAttrCommand } from './commands/AddAttrCommand';
export { AddMethodCommand } from './commands/AddMethodCommand';
export { AddParamCommand } from './commands/AddParamCommand';
export { SetBaseCommand } from './commands/SetBaseCommand';
export { SetImplCommand } from './commands/SetImplCommand';
export { RenameCommand } from './commands/RenameCommand';
export { DeleteCommand } from './commands/DeleteCommand';
export { RelationCommand } from './commands/RelationCommand';
export { HelpCommand } from './commands/HelpCommand';
export { SelectCommand } from './commands/SelectCommand';
export { GenerateCodeCommand } from './commands/GenerateCodeCommand';
export { ImportCommand } from './commands/ImportCommand';
export { SaveCommand } from './commands/SaveCommand';
export { LoadCommand } from './commands/LoadCommand';
export { ClearCommand } from './commands/ClearCommand';
export { UndoCommand } from './commands/UndoCommand';
export { RedoCommand } from './commands/RedoCommand';
export { ListCommand } from './commands/ListCommand';
export { ChangeModifierCommand } from './commands/ChangeModifierCommand';
export { ApplyFactoryPatternCommand } from './commands/ApplyFactoryPatternCommand';

export class CliParser {
    public parse(input: string): Command | null {
        let line = input.trim();
        if (!line) return null;

        let isDryRun = false;
        if (line.toLowerCase().startsWith('dry-run ')) {
            isDryRun = true;
            line = line.substring(8).trim();
        }

        // PRIORITIZE Relationship commands if relation symbols are present outside of a clear command
        const relationSymbols = ['+>', '>|', '>/', '->', 'o>', '*>', '-/>'];
        if (relationSymbols.some(s => line.includes(s))) {
            const rel = this.parseRelation(line);
            if (rel) {
                const firstPart = line.split(/\s+/)[0].toLowerCase();
                const prefixes = ['c', 'ac', 'i', 's', 'e', 'a', 'm', 'p', 'base', 'impl', 'ren', 'del', 'mod', 'change-modifier'];
                if (!prefixes.includes(firstPart)) {
                    rel.isDryRun = isDryRun;
                    return rel;
                }

                if (relationSymbols.some(s => line.split(/\s+/)[1] === s || line.split(/\s+/)[1]?.startsWith(s))) {
                    rel.isDryRun = isDryRun;
                    return rel;
                }
            }
        }

        const parts = line.split(/\s+/);
        const cmdName = parts[0].toLowerCase();

        let command: Command | null = null;
        switch (cmdName) {
            case 'c':
            case 'ac':
            case 'i':
            case 's':
            case 'e':
                command = this.parseAddType(line, parts);
                break;
            case 'a':
                command = this.parseAddAttr(line, parts);
                break;
            case 'm':
                command = this.parseAddMethod(line, parts);
                break;
            case 'p':
                command = this.parseAddParam(line, parts);
                break;
            case 'base':
                command = this.parseSetBase(line, parts);
                break;
            case 'impl':
                command = this.parseSetImpl(line, parts);
                break;
            case 'ren':
                command = this.parseRename(line, parts);
                break;
            case 'del':
                command = this.parseDelete(line, parts);
                break;
            case 'help':
                command = this.parseHelp(line, parts);
                break;
            case 'sel':
                command = this.parseSelect(line, parts);
                break;
            case 'generate-code':
                command = this.parseGenerateCode(line, parts);
                break;
            case 'import':
                command = this.parseImport(line, parts);
                break;
            case 'save':
                command = this.parseSave(line, parts);
                break;
            case 'load':
                command = this.parseLoad(line, parts);
                break;
            case 'clear':
                command = this.parseClear(line, parts);
                break;
            case 'undo':
                command = this.parseUndo(line, parts);
                break;
            case 'redo':
                command = this.parseRedo(line, parts);
                break;
            case 'change-modifier':
                command = this.parseChangeModifier(line, parts);
                break;
            case 'list':
                command = this.parseList(line, parts);
                break;
            case 'apply-factory':
                command = this.parseApplyFactory(line, parts);
                break;
            case 'apply-singleton':
                command = this.parseApplySingleton(line, parts);
                break;
            case 'apply-adapter':
                command = this.parseApplyAdapter(line, parts);
                break;
            case 'apply-template':
                command = this.parseApplyTemplate(line, parts);
                break;
            case 'apply-strategy':
                command = this.parseApplyStrategy(line, parts);
                break;
            case 'apply-observer':
                command = this.parseApplyObserver(line, parts);
                break;
            case 'apply-facade':
                command = this.parseApplyFacade(line, parts);
                break;
            case 'export-spec':
                command = this.parseExportSpec(line, parts);
                break;
            case 'import-spec-dsl':
                command = this.parseImportSpecDsl(line, parts);
                break;
            case 'export-spec-dsl':
                command = this.parseExportSpecDsl(line, parts);
                break;
            case 'spec-sync':
                command = this.parseSpecSync(line, parts);
                break;
            case 'refactor':
                command = this.parseRefactor(line, parts);
                break;
            default:
                command = this.parseRelation(line);
                break;
        }

        if (command) {
            command.isDryRun = isDryRun;
        }
        return command;
    }

    private parseHelp(raw: string, parts: string[]): HelpCommand | null {
        return new HelpCommand(raw);
    }

    private parseSelect(raw: string, parts: string[]): SelectCommand | null {
        if (parts.length < 2) return null;
        return new SelectCommand(raw, parts.slice(1).join(' '));
    }


    private parseGenerateCode(raw: string, parts: string[]): GenerateCodeCommand | null {
        // generate-code <language> <path>?
        // Require at least language
        if (parts.length < 2) return null;
        const langRaw = parts[1].toLowerCase();
        // Normalize common aliases
        const map: Record<string, string> = {
            'c#': 'csharp', 'csharp': 'csharp', 'cs': 'csharp',
            'java': 'java',
            'ts': 'ts', 'typescript': 'ts',
            'rust': 'rust',
            'c++': 'cpp', 'cpp': 'cpp'
        };
        const language = map[langRaw] || langRaw;
        const path = parts.length >= 3 ? parts.slice(2).join(' ') : undefined;
        return new GenerateCodeCommand(raw, language, path);
    }

    private parseImport(raw: string, parts: string[]): ImportCommand | null {
        // import <format> <path>
        if (parts.length < 3) return null;
        return new ImportCommand(raw, parts[1], parts.slice(2).join(' '));
    }

    private parseSave(raw: string, parts: string[]): SaveCommand | null {
        if (parts.length === 1) return new SaveCommand(raw);
        return new SaveCommand(raw, parts.slice(1).join(' '));
    }

    private parseLoad(raw: string, parts: string[]): LoadCommand | null {
        if (parts.length < 2) return null;
        return new LoadCommand(raw, parts.slice(1).join(' '));
    }

    private parseClear(raw: string, parts: string[]): ClearCommand | null {
        return new ClearCommand(raw);
    }

    private parseUndo(raw: string, parts: string[]): UndoCommand | null {
        return new UndoCommand(raw);
    }

    private parseRedo(raw: string, parts: string[]): RedoCommand | null {
        return new RedoCommand(raw);
    }

    private parseList(raw: string, parts: string[]): ListCommand | null {
        if (parts.length === 1) return new ListCommand(raw);
        const subject = parts[1].toLowerCase();
        if (subject === 'classes' || subject === 'commands') {
            return new ListCommand(raw, subject);
        }
        return null;
    }

    private parseChangeModifier(raw: string, parts: string[]): ChangeModifierCommand | null {
        if (parts.length < 5) return null;
        const target = parts[1].toLowerCase() as 'a' | 'm';
        const className = parts[2];
        const memberName = parts[3];
        const modifierSpec = parts[4];

        const VISIBILITY = new Set(['+', '-', '#', '~']);
        const MODIFIER_ATTR = new Set(['s', 'a']);
        const MODIFIER_METHOD = new Set(['s', 'a', 'v']);

        let visibility: string | null = null;
        let modifier: string | null = null;
        // modSpec をパース: "+s", "+", "s", "#v" など
        let rest = modifierSpec;
        if (VISIBILITY.has(rest[0])) {
            visibility = this.parseVisibility(rest[0]);
            rest = rest.slice(1); // 残りはモディファイア
        }
        if (rest.length > 0) {
            const validMod = target === 'm' ? MODIFIER_METHOD : MODIFIER_ATTR;
            if (validMod.has(rest)) {
                modifier = this.parseModifier(rest);
            } else {
                return null; // 不正なモディファイア
            }
        }

        return new ChangeModifierCommand(
            raw,
            target,
            className,
            memberName,
            visibility,
            modifier,
            rest.length > 0 || modifier !== null
        );
    }

    private parseAddType(raw: string, parts: string[]): AddTypeCommand | null {
        if (parts.length < 2) return null;
        const kind = parts[0].toLowerCase() as TypePrefix;
        let name = parts[1];
        let extendsList: string[] | undefined;

        // Handle Admin : User, ILogin or Admin:User
        const fullRest = parts.slice(1).join(' ');
        if (fullRest.includes(':')) {
            const splitted = fullRest.split(':');
            name = splitted[0].trim();
            extendsList = splitted[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
        }

        return new AddTypeCommand(raw, kind, name, extendsList);
    }

    private parseAddAttr(raw: string, parts: string[]): AddAttrCommand | null {
        // a <className> <visibility>? <modifier>? <name> <type>
        if (parts.length < 3) return null;
        const className = parts[1];

        // Use a more flexible consumption of prefixes
        let idx = 2;

        let visibility: Visibility | null = null;
        let modifier: Modifier | null = null;

        // 現在のトークンを取得
        let currentToken = parts[idx];
        // visibilityを解析（先頭が記号の場合）
        if (currentToken && currentToken.length >= 1) {
            const visSymbol = this.parseVisibility(currentToken[0]);
            if (visSymbol) {
                visibility = visSymbol;
                currentToken = currentToken.substring(1); // 記号を削除
                // トークンが空になったら次へ
                if (currentToken === '') {
                    idx++;
                    currentToken = parts[idx];
                }
            }
        }

        // modifierを解析（独立したトークンまたは連結されている場合）
        if (currentToken && currentToken.length === 1) {
            const modSymbol = this.parseModifier(currentToken);
            if (modSymbol) {
                modifier = modSymbol;
                idx++;
                currentToken = parts[idx];
            }
        }

        // 属性名
        if (!currentToken) return null;
        const name = currentToken;
        idx++;

        // 型
        if (idx >= parts.length) return null;
        const dataType = parts.slice(idx).join(' ');

        return new AddAttrCommand(raw, className, visibility || 'private', name, dataType, modifier || undefined);
    }

    private parseAddMethod(raw: string, parts: string[]): AddMethodCommand | null {
        // m <className> <visibility>? <modifier>? <name> <type>
        if (parts.length < 3) return null;
        const className = parts[1];
        let idx = 2;

        let visibility: Visibility | null = null;
        let modifier: Modifier | null = null;

        // 現在のトークンを取得
        let currentToken = parts[idx];

        // visibilityを解析（先頭が記号の場合）
        if (currentToken && currentToken.length >= 1) {
            const visSymbol = this.parseVisibility(currentToken[0]);
            if (visSymbol) {
                visibility = visSymbol;
                currentToken = currentToken.substring(1); // 記号を削除

                // トークンが空になったら次へ
                if (currentToken === '') {
                    idx++;
                    currentToken = parts[idx];
                }
            }
        }

        // modifierを解析（独立したトークンまたは連結されている場合）
        if (currentToken && currentToken.length === 1) {
            const modSymbol = this.parseModifier(currentToken);
            if (modSymbol) {
                modifier = modSymbol;
                idx++;
                currentToken = parts[idx];
            }
        }

        // 属性名
        if (!currentToken) return null;
        const name = currentToken;
        idx++;

        // 戻り値型
        if (idx >= parts.length) return null;
        const returnType = parts.slice(idx).join(' ');

        return new AddMethodCommand(raw, className, visibility || 'public', name, returnType, modifier || undefined);
    }

    private parseAddParam(raw: string, parts: string[]): AddParamCommand | null {
        if (parts.length < 5) return null;
        return new AddParamCommand(raw, parts[1], parts[2], parts[3], parts.slice(4).join(' '));
    }

    private parseSetBase(raw: string, parts: string[]): SetBaseCommand | null {
        if (parts.length < 3) return null;
        return new SetBaseCommand(raw, parts[1], parts[2]);
    }

    private parseSetImpl(raw: string, parts: string[]): SetImplCommand | null {
        if (parts.length < 3) return null;
        return new SetImplCommand(raw, parts[1], parts[2]);
    }

    private parseRename(raw: string, parts: string[]): RenameCommand | null {
        if (parts.length < 4) return null;
        const target = parts[1].toLowerCase() as 'c' | 'a' | 'm';
        if (target === 'c') {
            return new RenameCommand(raw, target, parts[2], parts[2], parts[3]);
        }
        if (parts.length < 5) return null;
        return new RenameCommand(raw, target, parts[2], parts[3], parts[4]);
    }

    private parseDelete(raw: string, parts: string[]): DeleteCommand | null {
        if (parts.length < 3) return null;
        const target = parts[1].toLowerCase() as 'c' | 'a' | 'm';
        return new DeleteCommand(raw, target, parts[2], parts[3] || undefined);
    }

    private parseRelation(raw: string): RelationCommand | null {
        const symbols = ['>|', '>/', '+>', '->', 'o>', '*>', '-/>'];
        // Sort symbols by length descending to match longer ones first (like -/> before -> if it existed)
        const sortedSymbols = [...symbols].sort((a, b) => b.length - a.length);

        for (const symbol of sortedSymbols) {
            if (raw.includes(symbol)) {
                const parts = raw.split(symbol);
                if (parts.length < 2) continue;

                const source = parts[0].trim();
                const rest = parts[1].trim();

                if (rest.startsWith(':')) {
                    const content = rest.substring(1).trim();
                    const firstSpace = content.indexOf(' ');
                    if (firstSpace === -1) {
                        return new RelationCommand(raw, source, '', symbol, content);
                    }
                    const multiplicity = content.substring(0, firstSpace).trim();
                    const target = content.substring(firstSpace).trim();
                    return new RelationCommand(raw, source, target, symbol, multiplicity);
                } else {
                    return new RelationCommand(raw, source, rest, symbol);
                }
            }
        }
        return null;
    }

    private parseVisibility(symbol: string): Visibility | null {
        switch (symbol) {
            case '+': return 'public';
            case '-': return 'private';
            case '#': return 'protected';
            case '~': return 'package';
            default: return null;
        }
    }

    private consumeVisibility(parts: string[], idx: number): { visibility: Visibility | null, nextIdx: number, currentToken: string } {
        let visibility: Visibility | null = null;
        let currentToken = parts[idx];

        if (currentToken && currentToken.length >= 1) {
            const visSymbol = this.parseVisibility(currentToken[0]);
            if (visSymbol) {
                visibility = visSymbol;
                currentToken = currentToken.substring(1);
                if (currentToken === '') {
                    idx++;
                    currentToken = parts[idx];
                }
            }
        }
        return { visibility, nextIdx: idx, currentToken };
    }

    private consumeModifier(parts: string[], idx: number, currentToken: string): { modifier: Modifier | null, nextIdx: number, currentToken: string } {
        let modifier: Modifier | null = null;
        if (currentToken && currentToken.length === 1) {
            const modSymbol = this.parseModifier(currentToken);
            if (modSymbol) {
                modifier = modSymbol;
                idx++;
                currentToken = parts[idx];
            }
        }
        return { modifier, nextIdx: idx, currentToken };
    }

    private parseMember(parts: string[], startIdx: number) {
        let { visibility, nextIdx, currentToken } = this.consumeVisibility(parts, startIdx);
        let { modifier, nextIdx: finalIdx, currentToken: finalToken } = this.consumeModifier(parts, nextIdx, currentToken);

        if (!finalToken) return null;
        const name = finalToken;
        let idx = finalIdx + 1;

        if (idx >= parts.length) return null;
        const type = parts.slice(idx).join(' ');

        return { visibility, modifier, name, type };
    }

    private parseModifier(symbol: string): Modifier | null {
        switch (symbol) {
            case 's': return 'static';
            case 'a': return 'abstract';
            case 'v': return 'virtual';
            default: return null;
        }
    }

    private parseApplyFactory(raw: string, parts: string[]): ApplyFactoryPatternCommand | null {
        // apply-factory <factoryName> <abstractName> <concreteName>...
        if (parts.length < 4) return null;

        const factoryName = parts[1];
        const abstractName = parts[2];
        const concreteNames = parts.slice(3);

        return new ApplyFactoryPatternCommand(raw, factoryName, abstractName, concreteNames);
    }

    private parseApplySingleton(raw: string, parts: string[]): ApplySignletonPatternCommand | null {
        // apply-singleton <className>
        if (parts.length !== 2) return null;

        const className = parts[1];

        return new ApplySignletonPatternCommand(raw, className);
    }

    private parseApplyAdapter(raw: string, parts: string[]) {
        // apply-adapter <adapterName> <targetName> <adapteeName>...
        if (parts.length < 4) return null;

        const adapterName = parts[1];
        const targetName = parts[2];
        const adapteeNames = parts.slice(3);

        return new ApplyAdapterPatternCommand(raw, adapterName, targetName, adapteeNames);
    }

    private parseApplyTemplate(raw: string, parts: string[]) {
        // apply-template <abstractName> <concreteName>...
        if (parts.length < 3) return null;

        const abstractName = parts[1];
        const concreteNames = parts.slice(2);

        return new ApplyTemplatePatternCommand(raw, abstractName, concreteNames);
    }

    private parseApplyStrategy(raw: string, parts: string[]) {
        // apply-strategy <contextName> <strategyInterfaceName> <strategyConcreteClassName>...
        if (parts.length < 4) return null;

        const contextName = parts[1];
        const strategyInterfaceName = parts[2];
        const strategyConcreteClassNames = parts.slice(3);

        return new ApplyStrategyPatternCommand(raw, contextName, strategyInterfaceName, strategyConcreteClassNames);
    }

    private parseApplyObserver(raw: string, parts: string[]) {
        // apply-observer <subjectClassName> <observerInterfaceName> <observerConcreteClassName>...
        if (parts.length < 4) return null;

        const subjectClassName = parts[1];
        const observerInterfaceName = parts[2];
        const observerConcreteClassNames = parts.slice(3);

        return new ApplyObserverPatternCommand(raw, subjectClassName, observerInterfaceName, observerConcreteClassNames);
    }

    private parseApplyFacade(raw: string, parts: string[]) {
        // apply-facade <facadeClassName> <subsystemClassName>...
        if (parts.length < 3) return null;

        const facadeClassName = parts[1];
        const subsystemClassNames = parts.slice(2);

        return new ApplyFacadePatternCommand(raw, facadeClassName, subsystemClassNames);
    }

    private parseExportSpec(raw: string, parts: string[]) {
        // export-spec <output-path>
        if (parts.length < 2) return null;

        const outputPath = parts[1];

        return new ExportSpecCommand(raw, outputPath);
    }

    private parseImportSpecDsl(raw: string, parts: string[]) {
        // import-spec

        return new ImportSpecDslCommand(raw);
    }

    private parseExportSpecDsl(raw: string, parts: string[]) {
        // export-spec <output-path>
        if (parts.length < 2) return null;

        const outputPath = parts[1];

        return new ExportSpecDslCommand(raw, outputPath);
    }

    private parseSpecSync(raw: string, parts: string[]) {
        // spec-sync
        return new SpecSyncCommand(raw);
    }

    private parseRefactor(raw: string, parts: string[]) {
        if (parts.length < 2) return null;

        // --sync オプション検出・除去
        const sync = parts.includes('--sync');
        const args = parts.filter(p => p !== '--sync');

        // kind のエイリアス正規化（generate-code の language マップと同じ方式）
        const kindMap: Record<string, RefactorKind> = {
            'extract-interface': 'extract-interface',
            'ei': 'extract-interface',   // 短縮形
            'extract-superclass': 'extract-superclass',
            'es': 'extract-superclass',
            'inline-class': 'inline-class',
            'ic': 'inline-class',
            'split-class': 'split-class',
            'sc': 'split-class',
            'rename-type': 'rename-type',
            'rt': 'rename-type',
            'invert-dependency': 'invert-dependency',
            'id': 'invert-dependency',
            'resolve-circular': 'resolve-circular',
            'rc': 'resolve-circular',
            'resolve-circular-inheritance': 'resolve-circular-inheritance',
            'rci': 'resolve-circular-inheritance',
        };

        const kind = kindMap[args[1].toLowerCase()];
        if (!kind) return null;  // 不明な kind は null → パーサが default に落ちる

        switch (kind) {
            case 'extract-interface':
                // refactor ei <ClassName> <InterfaceName> [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, className: args[2], interfaceName: args[3] }, sync);

            case 'extract-superclass':
                // refactor es <SuperName> <ClassA> <ClassB> ... [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, superName: args[2], classNames: args.slice(3) }, sync);

            case 'inline-class':
                // refactor ic <SourceClass> <TargetClass> [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, sourceClass: args[2], targetClass: args[3] }, sync);

            case 'split-class':
                // refactor sc <SourceClass> <NewNameA> <NewNameB> ... [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, sourceClass: args[2], newNames: args.slice(3) }, sync);

            case 'rename-type':
                // refactor rt <OldName> <NewName> [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, oldName: args[2], newName: args[3] }, sync);

            case 'invert-dependency':
                // refactor id <ClientClass> <ConcreteClass> [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, clientClass: args[2], concreteClass: args[3] }, sync);

            case 'resolve-circular':
                // refactor rc <ClassA> <ClassB> [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, classA: args[2], classB: args[3] }, sync);

            case 'resolve-circular-inheritance':
                // refactor rci <ClassA> <ClassB> [--sync]
                if (args.length < 4) return null;
                return new RefactorCommand(raw, { kind, classA: args[2], classB: args[3] }, sync);
        }
        return null;
    }
}
