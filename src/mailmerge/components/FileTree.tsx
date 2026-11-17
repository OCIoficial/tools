import { ScrollArea, Text } from '@mantine/core'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { filesIn, formatSize, type AttachmentTree, type TreeNode } from '../attachments/tree.ts'
import classes from './FileTree.module.css'

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function ChevronIcon() {
  return (
    <svg {...iconProps} width={12} height={12} strokeWidth={2.25}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg {...iconProps}>
      <path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1" />
      <path d="M3.6 10h17.2a1 1 0 0 1 1 1.2l-1.5 7.2a2 2 0 0 1-2 1.6H5.6a2 2 0 0 1-2-1.6L2.6 11.2a1 1 0 0 1 1-1.2Z" />
    </svg>
  ) : (
    <svg {...iconProps}>
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

const INDENT = 16
/** Space to the left of each row, before the indentation. */
const PADDING = 4

interface NodesProps {
  nodes: TreeNode[]
  level: number
  expanded: Set<string>
  onToggle: (id: string) => void
}

/** One-level list; open folders show their contents below. No keyboard navigation. */
function Nodes({ nodes, level, expanded, onToggle }: NodesProps) {
  // The guide sits under the parent folder's chevron.
  const style = { '--guide-x': `${PADDING + (level - 1) * INDENT + 8}px` } as CSSProperties
  return (
    <ul className={classes.list} data-guide={level > 0 || undefined} style={style}>
      {nodes.map((node) => {
        const isDir = node.kind === 'dir'
        const open = isDir && expanded.has(node.id)
        const files = isDir ? filesIn(node).length : 0
        return (
          <li key={node.id}>
            <div
              className={classes.label}
              style={{ paddingInlineStart: PADDING + level * INDENT }}
              data-dir={isDir || undefined}
              title={node.name}
              onClick={isDir ? () => onToggle(node.id) : undefined}
            >
              <span className={classes.chevron} data-expanded={open || undefined}>
                {isDir && node.children.length > 0 && <ChevronIcon />}
              </span>
              <span className={isDir ? `${classes.icon} ${classes.folder}` : classes.icon}>
                {isDir ? <FolderIcon open={open && node.children.length > 0} /> : <FileIcon />}
              </span>
              <span className={classes.name}>{node.name}</span>
              <span className={classes.meta}>
                {isDir ? `${files} ${files === 1 ? 'file' : 'files'}` : formatSize(node.size)}
              </span>
            </div>
            {open && <Nodes nodes={node.children} level={level + 1} expanded={expanded} onToggle={onToggle} />}
          </li>
        )
      })}
    </ul>
  )
}

interface Props {
  tree: AttachmentTree
  /** Before the name (the handle to reorder). */
  leading?: ReactNode
  /** Buttons on the right of the header. */
  actions?: ReactNode
  /** Below the tree, in the same box (the source's paths). */
  children?: ReactNode
}

/** Explorer of the loaded tree. Mount it with a `key` per tree to reset the open folders. */
export function FileTree({ tree, leading, actions, children }: Props) {
  // Top-level folders start open.
  const [expanded, setExpanded] = useState(
    () => new Set(tree.root.children.filter((node) => node.kind === 'dir').map((node) => node.id)),
  )
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <div className={classes.browser}>
      <div className={classes.header} data-leading={leading ? true : undefined}>
        {leading}
        <Text size="sm" fw={500} truncate style={{ flex: 1, minWidth: 0 }} title={tree.name}>
          {tree.name}
        </Text>
        <Text size="xs" c="dimmed" style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
          {tree.fileCount} files, {formatSize(tree.totalSize)}
        </Text>
        {actions}
      </div>

      {/* offsetScrollbars reserves space for the scrollbar, so it does not cover the sizes. */}
      <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars="present" className={classes.body}>
        {tree.root.children.length === 0 ? (
          <Text size="sm" c="dimmed" p="xs">
            This folder is empty.
          </Text>
        ) : (
          <Nodes nodes={tree.root.children} level={0} expanded={expanded} onToggle={toggle} />
        )}
      </ScrollArea.Autosize>
      {children && <div className={classes.footer}>{children}</div>}
    </div>
  )
}
