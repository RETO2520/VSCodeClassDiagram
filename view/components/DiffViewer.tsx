import React from 'react';
import { DiffEditor } from '@monaco-editor/react';

interface DiffViewerProps {
    original: string;
    modified: string;
    onApply: () => void;
    onCancel: () => void;
    title?: string;
}

export function DiffViewer({ original, modified, onApply, onCancel, title = 'Apply Changes?' }: DiffViewerProps) {
    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            background: '#080f1a',
            border: '1px solid #1e293b',
            borderRadius: '4px',
            overflow: 'hidden',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                background: '#0f172a',
                borderBottom: '1px solid #1e293b'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#94a3b8',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase'
                    }}>
                        {title}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            borderRadius: '3px',
                            border: '1px solid #334155',
                            background: 'transparent',
                            color: '#94a3b8',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onApply}
                        style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            borderRadius: '3px',
                            border: '1px solid #3b82f6',
                            background: '#3b82f6',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Apply Changes
                    </button>
                </div>
            </div>

            {/* Diff Editor */}
            <div style={{ flex: 1, minHeight: 0 }}>
                <DiffEditor
                    original={original}
                    modified={modified}
                    language="class-spec-dsl"
                    theme="spec-dark"
                    options={{
                        renderSideBySide: true,
                        readOnly: true,
                        fontSize: 13,
                        lineHeight: 20,
                        fontFamily: '"Cascadia Code","SF Mono","Fira Code",monospace',
                        minimap: { enabled: false },
                        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                    }}
                />
            </div>

            {/* Footer / Info */}
            <div style={{
                padding: '4px 16px',
                fontSize: '10px',
                color: '#475569',
                background: '#080f1a',
                borderTop: '1px solid #1e293b'
            }}>
                Previewing changes from dry-run. Click "Apply Changes" to update the specification.
            </div>
        </div>
    );
}
