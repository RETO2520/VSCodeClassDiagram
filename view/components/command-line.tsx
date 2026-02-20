import * as React from 'react'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from './ui/command'
import { cn } from '@/lib/utils'
import { ClassInfo } from '../lib/class-diagram-types'
import { Search } from 'lucide-react'
import { Command as CommandPrimitive } from 'cmdk'
interface CommandLineProps {
    onExecute: (command: string) => void;
    classes: ClassInfo[];
    className?: string;
}

interface Suggestion {
    id: string;
    label: string;
    group: string;
    valueToInsert: string;
}

export function CommandLine({ onExecute, classes, className }: CommandLineProps) {
    const [input, setInput] = React.useState('')
    const [history, setHistory] = React.useState<string[]>([])
    const [historyIndex, setHistoryIndex] = React.useState(-1)
    const [selectedIdx, setSelectedIdx] = React.useState(-1)

    // Locked context for Tab cycling
    const [lockedSuggestions, setLockedSuggestions] = React.useState<Suggestion[] | null>(null)
    const [prefixAtLock, setPrefixAtLock] = React.useState('')

    const inputRef = React.useRef<HTMLInputElement>(null)

    // Focus trigger (Vim style ':')
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === ':' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault()
                inputRef.current?.focus()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    // Get current suggestions based on input (Standard real-time parsing)
    const getSuggestionsData = (currentInput: string): Suggestion[] => {
        const trimmed = currentInput.trimStart()
        const parts = currentInput.split(/\s+/)
        const isTrailingSpace = currentInput.endsWith(' ')
        const effectiveParts = isTrailingSpace ? [...parts] : parts
        const currentIdx = effectiveParts.length - 1
        const currentPart = effectiveParts[currentIdx].toLowerCase()
        const cmd = effectiveParts[0]?.toLowerCase()

        // 1. Root Commands (Order per cli.txt)
        if (currentIdx === 0) {
            const allCommands = [
                { id: 'c', label: 'c (Class)', group: 'Types' },
                { id: 'ac', label: 'ac (Abstract Class)', group: 'Types' },
                { id: 'i', label: 'i (Interface)', group: 'Types' },
                { id: 's', label: 's (Struct)', group: 'Types' },
                { id: 'e', label: 'e (Enum)', group: 'Types' },
                { id: 'a', label: 'a (Attribute)', group: 'Members' },
                { id: 'm', label: 'm (Method)', group: 'Members' },
                { id: 'p', label: 'p (Parameter)', group: 'Members' },
                { id: 'base', label: 'base (Inheritance)', group: 'Relationships' },
                { id: 'impl', label: 'impl (Realization)', group: 'Relationships' },
                { id: 'ren', label: 'ren (Rename)', group: 'Operations' },
                { id: 'del', label: 'del (Delete)', group: 'Operations' },
                { id: 'help', label: 'help (Show help)', group: 'Utilities' },
                { id: 'sel', label: 'sel (Select class)', group: 'Utilities' },
                { id: 'generate-code', label: 'generate-code (Codegen)', group: 'Utilities' },
                { id: 'change-modifier', label: 'change-modifier (Change modifier)', group: 'Utilities' },
                { id: 'import', label: 'import (Import model)', group: 'Utilities' },
                { id: 'save', label: 'save (Save model)', group: 'Utilities' },
                { id: 'load', label: 'load (Load model)', group: 'Utilities' },
                { id: 'clear', label: 'clear (Clear canvas)', group: 'Utilities' },
                { id: 'list', label: 'list (List classes/commands)', group: 'Utilities' },
                { id: 'undo', label: 'undo (Undo last action)', group: 'Utilities' },
                { id: 'redo', label: 'redo (Redo last undone action)', group: 'Utilities' },
            ]
            return allCommands.filter(c => c.id.startsWith(currentPart)).map(c => ({
                ...c,
                valueToInsert: c.id
            }))
        }

        const prefix = effectiveParts.slice(0, -1).join(' ') + ' '

        // 2. Argument Completion
        // ren/del targets
        if ((cmd === 'ren' || cmd === 'del') && currentIdx === 1) {
            const targets = [
                { id: 'c', label: 'c (Class)' },
                { id: 'a', label: 'a (Attribute)' },
                { id: 'm', label: 'm (Method)' }
            ]
            return targets.filter(t => t.id.startsWith(currentPart)).map(t => ({
                id: t.id,
                label: t.label,
                group: 'Target Type',
                valueToInsert: t.id
            }))
        }

        if ((cmd === 'change-modifier') && currentIdx === 1) {
            const targets = [
                { id: 'a', label: 'a (Attribute)' },
                { id: 'm', label: 'm (Method)' }
            ]
            return targets.filter(t => t.id.startsWith(currentPart)).map(t => ({
                id: t.id,
                label: t.label,
                group: 'Target Type',
                valueToInsert: t.id
            }))
        }

        // Class suggestions
        const needsClassAt = {
            'a': [1], 'm': [1], 'p': [1], 'base': [1, 2], 'impl': [1, 2],
            'ren': { 'c': [2], 'a': [2], 'm': [2] },
            'del': { 'c': [2], 'a': [2], 'm': [2] },
            'change-modifier': { 'a': [2], 'm': [2] },
        } as any

        let showClasses = false
        if (needsClassAt[cmd]) {
            if (Array.isArray(needsClassAt[cmd])) {
                showClasses = needsClassAt[cmd].includes(currentIdx)
            } else if (typeof needsClassAt[cmd] === 'object') {
                const sub = effectiveParts[1]?.toLowerCase()
                showClasses = needsClassAt[cmd][sub]?.includes(currentIdx)
            }
        }

        if (showClasses) {
            return classes
                .filter(c => c.name.toLowerCase().startsWith(currentPart))
                .map(c => ({
                    id: c.id,
                    label: c.name,
                    group: 'Classes',
                    valueToInsert: c.name
                }))
        }

        // Visibility & Modifiers
        if ((cmd === 'a' || cmd === 'm') && currentIdx === 2) {
            const items = [
                { id: '+', label: '+ (public)', group: 'Visibility' },
                { id: '-', label: '- (private)', group: 'Visibility' },
                { id: '#', label: '# (protected)', group: 'Visibility' },
                { id: '~', label: '~ (package)', group: 'Visibility' },
                { id: 's', label: 's (static)', group: 'Modifiers' },
                { id: 'a', label: 'a (abstract)', group: 'Modifiers' },
                { id: 'v', label: 'v (virtual)', group: 'Modifiers' },
            ]
            return items.filter(i => i.id.startsWith(currentPart) || currentPart === '').map(i => ({
                id: i.id,
                label: i.label,
                group: i.group,
                valueToInsert: i.id
            }))
        }

        // Member suggestions
        if ((cmd === 'ren' || cmd === 'del' || cmd === 'change-modifier') && (effectiveParts[1] === 'a' || effectiveParts[1] === 'm') && currentIdx === 3) {
            const cls = classes.find(c => c.name === effectiveParts[2])
            const sub = effectiveParts[1]
            const items = sub === 'a' ? cls?.members : cls?.operations
            if (!items) return []
            return items
                .filter(i => i.name.toLowerCase().startsWith(currentPart))
                .map(i => ({
                    id: i.id,
                    label: i.name,
                    group: sub === 'a' ? 'Attributes' : 'Methods',
                    valueToInsert: i.name
                }))
        }

        // Visibility & Modifiers
        if ((cmd === 'change-modifier') && currentIdx === 4) {
            const items = [
                { id: '+s', label: '+s (public static)', group: 'Visibility' },
                { id: '-s', label: '-s (private static)', group: 'Visibility' },
                { id: '#s', label: '#s (protected static)', group: 'Visibility' },
                { id: '~s', label: '~s (package static)', group: 'Visibility' },
                { id: 's', label: 's (static)', group: 'Modifiers' },

            ]
            return items.filter(i => i.id.startsWith(currentPart) || currentPart === '').map(i => ({
                id: i.id,
                label: i.label,
                group: i.group,
                valueToInsert: i.id
            }))
        }


        // p <class> <method>
        if (cmd === 'p' && currentIdx === 2) {
            const cls = classes.find(c => c.name === effectiveParts[1])
            if (!cls) return []
            return cls.operations
                .filter(o => o.name.toLowerCase().startsWith(currentPart))
                .map(o => ({
                    id: o.id,
                    label: o.name,
                    group: 'Methods',
                    valueToInsert: o.name
                }))
        }

        // generate-code <language>
        if (cmd === 'generate-code' && currentIdx === 1) {
            const langs = ['csharp', 'java', 'ts', 'rust', 'cpp']
            return langs
                .filter(l => l.startsWith(currentPart))
                .map(l => ({ id: l, label: l, group: 'Languages', valueToInsert: l }))
        }

        return []
    }

    const currentSuggestions = lockedSuggestions || getSuggestionsData(input)

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (input.trim()) {
                onExecute(input)
                setHistory(prev => [input, ...prev].slice(0, 50))
                setHistoryIndex(-1)
                resetCycling()
                setInput('')
            }
        } else if (e.key === 'Escape') {
            inputRef.current?.blur()
        } else if (e.key === 'Tab') {
            e.preventDefault()

            const activeSuggestions = currentSuggestions
            if (activeSuggestions.length > 0) {
                if (!lockedSuggestions) {
                    // Start cycling
                    const parts = input.split(/\s+/)
                    const isTrailingSpace = input.endsWith(' ')

                    // Prefix calculation: everything before the current part being completed
                    let prefix = ''
                    if (isTrailingSpace) {
                        prefix = input
                    } else if (parts.length > 1) {
                        // Find the split point for the last word
                        const lastPart = parts[parts.length - 1]
                        prefix = input.slice(0, input.length - lastPart.length)
                    } else {
                        prefix = ''
                    }

                    setLockedSuggestions(activeSuggestions)
                    setPrefixAtLock(prefix)

                    const firstIdx = 0
                    setSelectedIdx(firstIdx)
                    // Insert completion and add a trailing space to advance to next arg
                    setInput(prefix + activeSuggestions[firstIdx].valueToInsert)
                } else {
                    // Continue cycling
                    const nextIdx = (selectedIdx + 1) % lockedSuggestions.length
                    setSelectedIdx(nextIdx)
                    setInput(prefixAtLock + lockedSuggestions[nextIdx].valueToInsert)
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (historyIndex < history.length - 1) {
                const nextIndex = historyIndex + 1
                setHistoryIndex(nextIndex)
                setInput(history[nextIndex])
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (historyIndex > 0) {
                const nextIndex = historyIndex - 1
                setHistoryIndex(nextIndex)
                setInput(history[nextIndex])
            } else if (historyIndex === 0) {
                setHistoryIndex(-1)
                setInput('')
            }
        } else {
            // Any other key resets the cycling state
            if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
                resetCycling()
            }
        }
    }

    const resetCycling = () => {
        setLockedSuggestions(null)
        setSelectedIdx(-1)
        setPrefixAtLock('')
    }

    const onInputChange = (val: string) => {
        // If the change came from typing (not Tab cycling), reset cycling
        // We handle this in handleKeyDown usually, but this is a safety.
        resetCycling()
        setInput(val)
    }

    const handleSelect = (s: Suggestion) => {
        // When clicking or hitting Enter on a specific item
        const parts = input.split(/\s+/)
        const isTrailingSpace = input.endsWith(' ')
        let prefix = ''
        if (isTrailingSpace) {
            prefix = input
        } else if (parts.length > 1) {
            prefix = input.slice(0, input.length - parts[parts.length - 1].length)
        }

        setInput(prefix + s.valueToInsert + ' ')
        resetCycling()
        setTimeout(() => inputRef.current?.focus(), 0)
    }

    return (
        <div className={cn("bg-background border-t p-2 shadow-sm", className)}>
            <Command shouldFilter={false} className="rounded-lg border shadow-md">
                <CommandList className={cn("max-h-[300px] overflow-y-auto", input === '' && "hidden")}>
                    <CommandEmpty>No suggestions found.</CommandEmpty>
                    {['Types', 'Members', 'Operations', 'Relationships', 'Target Type', 'Classes', 'Visibility', 'Modifiers', 'Attributes', 'Methods', 'Utilities', 'Languages'].map(g => {
                        const groupItems = currentSuggestions.filter(s => s.group === g)
                        if (groupItems.length === 0) return null
                        return (
                            <CommandGroup key={g} heading={g}>
                                {groupItems.map((s) => {
                                    const absoluteIdx = currentSuggestions.indexOf(s)
                                    return (
                                        <CommandItem
                                            key={s.id + s.group}
                                            onSelect={() => handleSelect(s)}
                                            data-selected={absoluteIdx === selectedIdx}
                                            className={cn(absoluteIdx === selectedIdx && "bg-accent text-accent-foreground")}
                                        >
                                            {s.label}
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        )
                    })}
                </CommandList>
                <div className="flex items-center px-3 border-t flex-grow">
                    <span className="text-muted-foreground font-mono mr-2">:</span>
                    <div className="flex flex-grow items-center border-t px-3" cmdk-input-wrapper="">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <CommandPrimitive.Input
                            ref={inputRef}
                            placeholder="c:class, i:interface, m:method, a:attr..."
                            value={input}
                            onValueChange={onInputChange}
                            onKeyDown={handleKeyDown}
                            className={cn(
                                'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
                                className,
                            )}

                        />
                    </div>

                </div>
            </Command>
        </div>
    )
}
