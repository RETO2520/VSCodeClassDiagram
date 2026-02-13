/**
 * CLI Command Parser based on cli.txt grammar version 1.1
 */

export type CliCommandType =
    | 'ADD_TYPE'
    | 'ADD_ATTR'
    | 'ADD_METHOD'
    | 'ADD_PARAM'
    | 'SET_BASE'
    | 'SET_IMPL'
    | 'RENAME'
    | 'DELETE'
    | 'RELATION';

export type TypePrefix = 'c' | 'ac' | 'i' | 's' | 'e';
export type Visibility = 'public' | 'private' | 'protected' | 'package';
export type Modifier = 'static' | 'abstract' | 'virtual';

export interface CliCommand {
    type: CliCommandType;
    raw: string;
}

export interface AddTypeCommand extends CliCommand {
    type: 'ADD_TYPE';
    kind: TypePrefix;
    name: string;
    extends?: string[];
}

export interface AddAttrCommand extends CliCommand {
    type: 'ADD_ATTR';
    className: string;
    visibility: Visibility;
    modifier?: Modifier;
    name: string;
    dataType: string;
}

export interface AddMethodCommand extends CliCommand {
    type: 'ADD_METHOD';
    className: string;
    visibility: Visibility;
    modifier?: Modifier;
    name: string;
    returnType: string;
}

export interface AddParamCommand extends CliCommand {
    type: 'ADD_PARAM';
    className: string;
    methodName: string;
    name: string;
    dataType: string;
}

export interface SetBaseCommand extends CliCommand {
    type: 'SET_BASE';
    className: string;
    baseClassName: string;
}

export interface SetImplCommand extends CliCommand {
    type: 'SET_IMPL';
    className: string;
    interfaceName: string;
}

export interface RenameCommand extends CliCommand {
    type: 'RENAME';
    target: 'c' | 'a' | 'm';
    className: string;
    oldName: string;
    newName: string;
}

export interface DeleteCommand extends CliCommand {
    type: 'DELETE';
    target: 'c' | 'a' | 'm';
    className: string;
    name?: string;
}

export interface RelationCommand extends CliCommand {
    type: 'RELATION';
    source: string;
    target: string;
    symbol: string;
    multiplicity?: string;
}

export class CliParser {
    public parse(input: string): CliCommand | null {
        const line = input.trim();
        if (!line) return null;

        // PRIORITIZE Relationship commands if relation symbols are present outside of a clear command
        const relationSymbols = ['>|', '>/', '->', 'o>', '*>', '-/>'];
        if (relationSymbols.some(s => line.includes(s))) {
            const rel = this.parseRelation(line);
            if (rel) {
                // Check if it's not actually an add-attr command misidentified as relation
                // (e.g. "a Class -> type" where -> is part of type)
                // However, our grammar says relation symbols are special.

                // If it starts with a command prefix, but contains a relation symbol,
                // we should be careful. But generally symbols win.
                const firstPart = line.split(/\s+/)[0].toLowerCase();
                const prefixes = ['c', 'ac', 'i', 's', 'e', 'a', 'm', 'p', 'base', 'impl', 'ren', 'del'];
                if (!prefixes.includes(firstPart)) {
                    return rel;
                }

                // If it is a prefix but the relation symbol is prominent (e.g. "A -> B"), return rel
                // If it's "a User +name string", no relation symbol.
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
            default:
                return this.parseRelation(line);
        }
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

        return { type: 'ADD_TYPE', raw, kind, name, extends: extendsList };
    }

    private parseAddAttr(raw: string, parts: string[]): AddAttrCommand | null {
        // a <className> <visibility>? <modifier>? <name> <type>
        if (parts.length < 3) return null;
        const className = parts[1];

        // Use a more flexible consumption of prefixes
        const { visibility, modifier, name, nextIdx } = this.consumeVisibilityAndModifier(parts, 2);
        if (nextIdx >= parts.length) return null;

        const dataType = parts.slice(nextIdx).join(' ');

        return {
            type: 'ADD_ATTR',
            raw,
            className,
            visibility: visibility || 'private',
            modifier: modifier || undefined,
            name,
            dataType
        };
    }

    private parseAddMethod(raw: string, parts: string[]): AddMethodCommand | null {
        // m <className> <visibility>? <modifier>? <name> <type>
        if (parts.length < 3) return null;
        const className = parts[1];

        const { visibility, modifier, name, nextIdx } = this.consumeVisibilityAndModifier(parts, 2);
        if (nextIdx >= parts.length) return null;

        const returnType = parts.slice(nextIdx).join(' ');

        return {
            type: 'ADD_METHOD',
            raw,
            className,
            visibility: visibility || 'public',
            modifier: modifier || undefined,
            name,
            returnType
        };
    }

    private consumeVisibilityAndModifier(parts: string[], startIdx: number): { visibility: Visibility | null, modifier: Modifier | null, name: string, nextIdx: number } {
        let visibility: Visibility | null = null;
        let modifier: Modifier | null = null;
        let name = '';
        let currentIdx = startIdx;

        let token = parts[currentIdx];
        if (!token) return { visibility, modifier, name, nextIdx: currentIdx };

        // 1. Try to extract visibility from the start of the token
        const vis = this.parseVisibility(token[0]);
        if (vis) {
            visibility = vis;
            token = token.substring(1);
        }

        // If token became empty, move to next and continue
        if (token === '' && currentIdx + 1 < parts.length) {
            currentIdx++;
            token = parts[currentIdx];
        }

        // 2. Try to extract modifier
        const mod = this.parseModifier(token[0]);
        if (mod) {
            modifier = mod;
            token = token.substring(1);
        }

        // If token became empty, move to next
        if (token === '' && currentIdx + 1 < parts.length) {
            currentIdx++;
            token = parts[currentIdx];
        }

        name = token;
        return { visibility, modifier, name, nextIdx: currentIdx + 1 };
    }

    private parseAddParam(raw: string, parts: string[]): AddParamCommand | null {
        if (parts.length < 5) return null;
        return {
            type: 'ADD_PARAM',
            raw,
            className: parts[1],
            methodName: parts[2],
            name: parts[3],
            dataType: parts.slice(4).join(' ')
        };
    }

    private parseSetBase(raw: string, parts: string[]): SetBaseCommand | null {
        if (parts.length < 3) return null;
        return { type: 'SET_BASE', raw, className: parts[1], baseClassName: parts[2] };
    }

    private parseSetImpl(raw: string, parts: string[]): SetImplCommand | null {
        if (parts.length < 3) return null;
        return { type: 'SET_IMPL', raw, className: parts[1], interfaceName: parts[2] };
    }

    private parseRename(raw: string, parts: string[]): RenameCommand | null {
        if (parts.length < 4) return null;
        const target = parts[1].toLowerCase() as 'c' | 'a' | 'm';
        if (target === 'c') {
            return { type: 'RENAME', raw, target, className: parts[2], oldName: parts[2], newName: parts[3] };
        }
        if (parts.length < 5) return null;
        return { type: 'RENAME', raw, target, className: parts[2], oldName: parts[3], newName: parts[4] };
    }

    private parseDelete(raw: string, parts: string[]): DeleteCommand | null {
        if (parts.length < 3) return null;
        const target = parts[1].toLowerCase() as 'c' | 'a' | 'm';
        return {
            type: 'DELETE',
            raw,
            target,
            className: parts[2],
            name: parts[3] || undefined
        };
    }

    private parseRelation(raw: string): RelationCommand | null {
        const symbols = ['>|', '>/', '->', 'o>', '*>', '-/>'];
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
                        return { type: 'RELATION', raw, source, target: '', symbol, multiplicity: content };
                    }
                    const multiplicity = content.substring(0, firstSpace).trim();
                    const target = content.substring(firstSpace).trim();
                    return { type: 'RELATION', raw, source, target, symbol, multiplicity };
                } else {
                    return { type: 'RELATION', raw, source, target: rest, symbol };
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

    private parseModifier(symbol: string): Modifier | null {
        switch (symbol) {
            case 's': return 'static';
            case 'a': return 'abstract';
            case 'v': return 'virtual';
            default: return null;
        }
    }
}
