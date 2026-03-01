import React, { useMemo, useState } from 'react';

export interface FolderTreeProps {
    files: string[];
    activeFilePath: string | null;
    onSelectFile: (path: string) => void;
    onCreateFile: (path: string) => void;
    onCreateFolder: (path: string) => void;
    onRefresh: () => void;
}

interface TreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children: Record<string, TreeNode>;
}

export function FolderTree({ files, activeFilePath, onSelectFile, onCreateFile, onCreateFolder, onRefresh }: FolderTreeProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));

    const toggleFolder = (path: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const tree = useMemo(() => {
        const root: TreeNode = { name: '', path: '', isDirectory: true, children: {} };

        for (const file of files) {
            const parts = file.split('/');
            let current = root;
            let currentPath = '';

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isDir = i < parts.length - 1;
                currentPath = currentPath ? `${currentPath}/${part}` : part;

                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        path: currentPath,
                        isDirectory: isDir,
                        children: {}
                    };
                }
                current = current.children[part];
            }
        }
        return root;
    }, [files]);

    const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const isExpanded = expandedFolders.has(node.path) || node.path === '';

        // Root node is just a container, don't render it directly
        if (node.path === '') {
            return Object.values(node.children)
                .sort((a, b) => {
                    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                    return a.isDirectory ? -1 : 1;
                })
                .map(child => renderNode(child, 0));
        }

        const isActive = activeFilePath === node.path;

        return (
            <div key={node.path} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                    onClick={() => {
                        if (node.isDirectory) toggleFolder(node.path);
                        else onSelectFile(node.path);
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: `4px 8px 4px ${8 + depth * 12}px`,
                        cursor: 'pointer',
                        background: isActive ? '#3b82f640' : 'transparent',
                        color: isActive ? '#60a5fa' : '#cbd5e1',
                        userSelect: 'none',
                        fontSize: 11,
                        fontFamily: '"Cascadia Code","SF Mono",monospace',
                        borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                    onMouseEnter={e => {
                        if (!isActive) e.currentTarget.style.background = '#1e293b';
                    }}
                    onMouseLeave={e => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <span style={{
                        width: 14,
                        display: 'inline-block',
                        textAlign: 'center',
                        marginRight: 4,
                        color: node.isDirectory ? '#fbbf24' : '#94a3b8',
                        fontSize: 10
                    }}>
                        {node.isDirectory ? (isExpanded ? '▾' : '▸') : '≡'}
                    </span>
                    <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>{node.name}</span>
                </div>
                {node.isDirectory && isExpanded && (
                    <div>
                        {Object.values(node.children)
                            .sort((a, b) => {
                                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                                return a.isDirectory ? -1 : 1;
                            })
                            .map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            flex: 1
        }}>
            <div style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700,
                color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase',
                borderBottom: '1px solid #1e293b', borderTop: '1px solid #1e293b', flexShrink: 0,
                fontFamily: '"Cascadia Code","SF Mono",monospace',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <span>.DIAGRAM</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                        onClick={() => onCreateFile('')}
                        title="New File"
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                        ⊞
                    </button>
                    <button
                        onClick={() => onCreateFolder('')}
                        title="New Folder"
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                        📁
                    </button>
                    <button
                        onClick={onRefresh}
                        title="Refresh"
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: 11 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                        ↻
                    </button>
                </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {files.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                        No files found
                    </div>
                ) : (
                    renderNode(tree)
                )}
            </div>
        </div>
    );
}
