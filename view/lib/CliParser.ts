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
    | 'APPLY_STRATEGY';


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
        const line = input.trim();
        if (!line) return null;

        // PRIORITIZE Relationship commands if relation symbols are present outside of a clear command
        const relationSymbols = ['+>', '>|', '>/', '->', 'o>', '*>', '-/>'];
        if (relationSymbols.some(s => line.includes(s))) {
            const rel = this.parseRelation(line);
            if (rel) {
                const firstPart = line.split(/\s+/)[0].toLowerCase();
                const prefixes = ['c', 'ac', 'i', 's', 'e', 'a', 'm', 'p', 'base', 'impl', 'ren', 'del', 'mod', 'change-modifier'];
                if (!prefixes.includes(firstPart)) {
                    return rel;
                }

                if (relationSymbols.some(s => line.split(/\s+/)[1] === s || line.split(/\s+/)[1]?.startsWith(s))) {
                    return rel;
                }
            }
        }

        const parts = line.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
            case 'c':
            case 'ac':
            case 'i':
            case 's':
            case 'e':
                return this.parseAddType(line, parts);
            case 'a':
                return this.parseAddAttr(line, parts);
            case 'm':
                return this.parseAddMethod(line, parts);
            case 'p':
                return this.parseAddParam(line, parts);
            case 'base':
                return this.parseSetBase(line, parts);
            case 'impl':
                return this.parseSetImpl(line, parts);
            case 'ren':
                return this.parseRename(line, parts);
            case 'del':
                return this.parseDelete(line, parts);
            case 'help':
                return this.parseHelp(line, parts);
            case 'sel':
                return this.parseSelect(line, parts);
            case 'generate-code':
                return this.parseGenerateCode(line, parts);
            case 'import':
                return this.parseImport(line, parts);
            case 'save':
                return this.parseSave(line, parts);
            case 'load':
                return this.parseLoad(line, parts);
            case 'clear':
                return this.parseClear(line, parts);
            case 'undo':
                return this.parseUndo(line, parts);
            case 'redo':
                return this.parseRedo(line, parts);
            case 'change-modifier':
                return this.parseChangeModifier(line, parts);
            case 'list':
                return this.parseList(line, parts);
            case 'apply-factory':
                return this.parseApplyFactory(line, parts);
            case 'apply-singleton':
                return this.parseApplySingleton(line, parts);
            case 'apply-adapter':
                return this.parseApplyAdapter(line, parts);
            case 'apply-template':
                return this.parseApplyTemplate(line, parts);
            case 'apply-strategy':
                return this.parseApplyStrategy(line, parts);
            default:
                return this.parseRelation(line);
        }
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
}
