from typing import ClassVar, TypeVar

from textual.binding import BindingType
from textual.widgets import DataTable, DirectoryTree


class VimDirectoryTree(DirectoryTree):
    """A `DirectoryTree` with vim-like keybindings."""

    BINDINGS: ClassVar[list[BindingType]] = [
        ("k", "cursor_up"),
        ("j", "cursor_down"),
        ("l", "expand_node"),
        ("h", "collapse_node"),
    ]

    def action_expand_node(self) -> None:
        try:
            line = self._tree_lines[self.cursor_line]
            node = line.path[-1]
        except IndexError:
            pass
        else:
            if node.allow_expand:
                node.expand()

    def action_collapse_node(self) -> None:
        try:
            line = self._tree_lines[self.cursor_line]
            node = line.path[-1]
        except IndexError:
            pass
        else:
            if not node.is_collapsed:
                line.path[-1].collapse()
            elif node.parent:
                self.move_cursor(node.parent)
                node.parent.collapse()


CellType = TypeVar("CellType")


class VimDataTable(DataTable[CellType]):
    """A `DataTable` with vim-like keybindings."""

    BINDINGS: ClassVar[list[BindingType]] = [
        ("h", "cursor_left"),
        ("l", "cursor_right"),
        ("j", "cursor_down"),
        ("k", "cursor_up"),
    ]
