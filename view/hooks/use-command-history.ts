// hooks/use-command-history.ts

import { useState, useCallback } from 'react';
import { ClassInfo } from '@/lib/class-diagram-types';
import { CliCommand } from '@/lib/CliParser';
import { executeAction } from '@/lib/command-executor';
import { DomainModel } from '@/lib/DomainModel';
import { HandlerResult } from '@/lib/handler-registry';

interface HistoryEntry {
    command: CliCommand;
    prevState: ClassInfo[];
    timestamp: number;
    result: HandlerResult;
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
    setClasses: (updaterOrClasses: ClassInfo[] | ((prev: ClassInfo[]) => ClassInfo[])) => void;  // 互換性用
}

const MAX_HISTORY_SIZE = 50;

export function useCommandHistory(initialClasses: ClassInfo[] = []): UseCommandHistoryResult {
    // DomainModel として状態を保持
    const [model, setModel] = useState<DomainModel>(
        DomainModel.from(initialClasses)
    );
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

    /**
     * コマンドを実行して履歴に追加
     */
    const executeCommand = useCallback((command: CliCommand) => {
        setModel(prevModel => {
            // コマンド実行
            const result = executeAction(command, prevModel);

            // 履歴エントリを作成（スナップショットとして保存）
            const historyEntry: HistoryEntry = {
                command,
                prevState: prevModel.getClasses(), // 実行前の状態をスナップショット
                timestamp: Date.now(),
                result
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

            return result.model;
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
            prevState: model.getClasses(), // 現在の状態（undo前）
            timestamp: Date.now(),
            result: lastEntry.result
        }]);

        // 履歴から削除
        setHistory(prev => prev.slice(0, -1));

        // 状態を戻す（スナップショットから復元）
        setModel(DomainModel.from(lastEntry.prevState));
    }, [history, model]);

    /**
     * Redo: Undoした操作をやり直す
     */
    const redo = useCallback(() => {
        if (redoStack.length === 0) {
            console.log('Nothing to redo');
            return;
        }

        const redoEntry = redoStack[redoStack.length - 1];

        setModel(prevModel => {
            // コマンドを再実行
            const newModel = executeAction(redoEntry.command, prevModel);

            // 履歴に追加
            setHistory(prev => [...prev, {
                command: redoEntry.command,
                prevState: prevModel.getClasses(),
                timestamp: Date.now(),
                result: redoEntry.result
            }]);

            return newModel.model;
        });

        // redoスタックから削除
        setRedoStack(prev => prev.slice(0, -1));
    }, [redoStack]);
    /**
         * 既存コードとの互換性用
         * React の setClasses パターンをサポート
         */
    /**
     * 既存コードとの互換性用
     * React の setClasses パターンをサポート
     * 
     * オーバーロード: 配列または updater 関数を受け取る
     */
    const setClasses = useCallback((
        updaterOrClasses: ClassInfo[] | ((prev: ClassInfo[]) => ClassInfo[])
    ) => {
        setModel(prevModel => {
            const prevClasses = prevModel.getClasses();

            // 関数が渡された場合
            if (typeof updaterOrClasses === 'function') {
                const newClasses = updaterOrClasses(prevClasses);
                return DomainModel.from(newClasses);
            }

            // 配列が直接渡された場合
            return DomainModel.from(updaterOrClasses);
        });
    }, []);
    return {
        classes: model.getClasses(),
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