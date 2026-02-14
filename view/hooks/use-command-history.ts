// hooks/use-command-history.ts

import { useState, useCallback } from 'react';
import { ClassInfo } from '@/lib/class-diagram-types';
import { CliCommand } from '@/lib/CliParser';
import { executeAction } from '@/lib/command-executor';

interface HistoryEntry {
    command: CliCommand;
    prevState: ClassInfo[];
    timestamp: number;
}

interface UseCommandHistoryResult {
    classes: ClassInfo[];
    history: HistoryEntry[];
    redoStack: HistoryEntry[];
    executeCommand: (command: CliCommand) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    setClasses: React.Dispatch<React.SetStateAction<ClassInfo[]>>;
}

const MAX_HISTORY_SIZE = 50;

export function useCommandHistory(initialClasses: ClassInfo[] = []): UseCommandHistoryResult {
    const [classes, setClasses] = useState<ClassInfo[]>(initialClasses);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

    /**
     * コマンドを実行して履歴に追加
     */
    const executeCommand = useCallback((command: CliCommand) => {
        setClasses(prevClasses => {
            const newClasses = executeAction(command, prevClasses);

            // 履歴エントリを作成
            const historyEntry: HistoryEntry = {
                command,
                prevState: prevClasses,
                timestamp: Date.now()
            };

            // 履歴スタックを更新
            setHistory(prevHistory => {
                const newHistory = [...prevHistory, historyEntry];
                // 最大サイズを超えたら古いものを削除
                if (newHistory.length > MAX_HISTORY_SIZE) {
                    newHistory.shift();
                }
                return newHistory;
            });

            // 新しいコマンド実行時はredoスタックをクリア
            setRedoStack([]);

            return newClasses;
        });
    }, []);

    /**
     * Undo: 最後のコマンドを取り消す
     */
    const undo = useCallback(() => {
        if (history.length === 0) {
            console.log('Nothing to undo');
            return;
        }

        const lastEntry = history[history.length - 1];

        // redoスタックに現在の状態を保存
        setRedoStack(prev => [...prev, {
            command: lastEntry.command,
            prevState: classes, // 現在の状態（undo前）
            timestamp: Date.now()
        }]);

        // 履歴から削除
        setHistory(prev => prev.slice(0, -1));

        // 状態を戻す
        setClasses(lastEntry.prevState);
    }, [history, classes]);

    /**
     * Redo: Undoした操作をやり直す
     */
    const redo = useCallback(() => {
        if (redoStack.length === 0) {
            console.log('Nothing to redo');
            return;
        }

        const redoEntry = redoStack[redoStack.length - 1];

        // コマンドを再実行
        setClasses(prevClasses => {
            const newClasses = executeAction(redoEntry.command, prevClasses);

            // 履歴に追加
            setHistory(prev => [...prev, {
                command: redoEntry.command,
                prevState: prevClasses,
                timestamp: Date.now()
            }]);

            return newClasses;
        });

        // redoスタックから削除
        setRedoStack(prev => prev.slice(0, -1));
    }, [redoStack]);

    return {
        classes,
        history,
        redoStack,
        executeCommand,
        undo,
        redo,
        canUndo: history.length > 0,
        canRedo: redoStack.length > 0,
        setClasses // 直接操作用（既存のコードとの互換性）
    };
}