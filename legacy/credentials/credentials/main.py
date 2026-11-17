import csv
import datetime
from collections.abc import Callable, Iterable
from io import StringIO
from pathlib import Path
from typing import ClassVar

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import HorizontalGroup, Vertical
from textual.events import Paste
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    DirectoryTree,
    Footer,
    Header,
    Input,
    Label,
    Select,
    Switch,
)

from credentials import typstgen
from credentials.types import Keys, User
from credentials.vim import VimDataTable, VimDirectoryTree

HEADER_NAMES: dict[Keys, str] = {
    Keys.username: "Username",
    Keys.password: "Password",
    Keys.first_name: "First Names",
    Keys.last_name: "Last Names",
    Keys.site: "Site",
}


class FilePicker(ModalScreen[Path | None]):
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("q", "quit", "Quit"),
        Binding("p", "goto_parent", "Go to parent"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._path = Path.cwd()
        self._dir_tree = VimDirectoryTree(self._path)

    def compose(self) -> ComposeResult:
        yield Header()
        yield self._dir_tree
        yield Footer()

    def action_goto_parent(self) -> None:
        self._path = self._path.parent
        self._dir_tree.path = self._path

    def action_quit(self) -> None:
        self.dismiss()

    def on_directory_tree_file_selected(
        self,
        message: DirectoryTree.FileSelected,
    ) -> None:
        self.dismiss(message.path)


class Table(VimDataTable[str], can_focus=True):
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("d", "delete_column", "Delete column"),
        Binding(
            "ctrl+left,ctrl+h",
            "move_column_left",
            "Move column left",
            key_display="^←/^h",
        ),
        Binding(
            "ctrl+right,ctrl+l",
            "move_column_right",
            "Move column right",
            key_display="^→/^l",
        ),
    ]

    headers: reactive[list[str]] = reactive([], init=False)
    data: reactive[list[list[str]]] = reactive([], init=False)

    def __init__(self) -> None:
        super().__init__(cursor_type="column", zebra_stripes=True)

    def validate_data(self, data: list[list[str]]) -> list[list[str]]:
        return _ensure_min_columns(data, len(self.headers), "")

    def watch_headers(self) -> None:
        self._update_table(self.cursor_column)

    def watch_data(self) -> None:
        self._update_table()

    def action_delete_column(self) -> None:
        col = self.cursor_column
        self.set_reactive(Table.data, _delete_column(self.data, col))
        self._update_table(col)

    def action_move_column_right(self) -> None:
        col = self.cursor_column
        if col + 1 < len(self.data):
            self.set_reactive(Table.data, _swap_columns(self.data, col, col + 1))
            self._update_table(col + 1)

    def action_move_column_left(self) -> None:
        col = self.cursor_column
        if col > 0:
            self.set_reactive(Table.data, _swap_columns(self.data, col - 1, col))
            self._update_table(col - 1)

    def _update_table(self, cursor: int | None = None) -> None:
        self.clear(columns=True)

        mincols = max(map(len, self.data), default=0)
        self.add_columns(*_pad_iter(self.headers, mincols, str))

        self.add_rows(self.data)

        self.move_cursor(column=cursor)


class Credentials(App[None]):
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("q", "quit", "Quit"),
        Binding("o", "open_csv_file", "Open CSV file", show=False),
        Binding("g", "generate_pdf", "Generate PDF", show=False),
    ]

    CSS_PATH = "credentials.tcss"

    def __init__(self) -> None:
        super().__init__()
        self._table = Table()
        self._phase_selector = Select(
            [("Regional", "Regional"), ("Final", "Final")],
            value="Regional",
            allow_blank=False,
            id="phase",
        )
        self._group_by_site = True

    def on_mount(self) -> None:
        self._table.headers = self._get_headers()

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(classes="container"):
            with HorizontalGroup():
                yield Label("Group by site: ", classes="label")
                yield Switch(
                    value=True,
                    animate=False,
                    tooltip="Whether to generate a separate PDF per Site",
                )
                yield Label("Phase: ", classes="label")
                yield self._phase_selector
                yield Label("Year: ", classes="label")
                yield Input(str(datetime.date.today().year), id="year")
                yield Button(
                    "Open CSV (o)",
                    variant="primary",
                    id="load-csv",
                )
                yield Button(
                    self._get_pdf_label(),
                    variant="primary",
                    id="generate-pdf",
                )
            yield self._table
        yield Footer()

    @work()
    async def action_open_csv_file(self) -> None:
        path = await self.push_screen(FilePicker(), wait_for_dismiss=True)
        if path:
            self._update_data(_read_csv_file(path))

    def on_paste(self, ev: Paste) -> None:
        self._update_data(_read_csv_from_paste(ev.text))

    def _update_data(self, data: list[list[str]] | Exception) -> None:
        match data:
            case Exception() as exc:
                self.notify(f"error loading csv: {exc} ", severity="error")
            case list() as data:
                self._table.data = data
                self._table.focus()

    def on_switch_changed(self, ev: Switch.Changed) -> None:
        self._group_by_site = ev.value
        self.query_one("#generate-pdf", Button).label = self._get_pdf_label()
        self._table.headers = self._get_headers()

    def on_button_pressed(self, ev: Button.Pressed) -> None:
        match ev.button.id:
            case "generate-pdf":
                self.action_generate_pdf()
            case "load-csv":
                self.action_open_csv_file()
            case _:
                ...

    def action_generate_pdf(self) -> None:
        year = self.query_one("#year", Input).value
        phase = f"{self._phase_selector.value} {year}"

        if self._group_by_site:
            groups = _group_by_site(self._table.data)
        else:
            groups = {phase: _data_to_users(self._table.data)}

        if not groups:
            return

        with self.suspend():
            n = len(groups)
            try:
                for name, users in groups.items():
                    typstgen.generate_pdf(phase, users, name)
                self.notify(
                    f"{n} {_pluralize("PDF", n)} successfully generated",
                )
            except Exception as exc:
                self.notify(
                    f"error generating {_pluralize("PDF", n)}: {exc} ",
                    severity="error",
                )
        self.refresh()

    def _get_pdf_label(self) -> str:
        return "Generate PDFs (g)" if self._group_by_site else "Generate PDF (g)"

    def _get_headers(self) -> list[str]:
        return [HEADER_NAMES[k] for k in Keys if self._group_by_site or k != Keys.site]


def _swap_columns[T](data: list[list[T]], col1: int, col2: int) -> list[list[T]]:
    data = [row[:] for row in data]
    for row in data:
        if 0 <= col1 < len(row) and 0 <= col2 < len(row):
            row[col1], row[col2] = row[col2], row[col1]
    return data


def _pluralize(s: str, c: int) -> str:
    return s if c == 1 else f"{s}s"


def _delete_column[T](data: list[list[T]], col: int) -> list[list[T]]:
    return [row[:col] + row[col + 1 :] for row in data]


def _read_csv_file(path: Path) -> list[list[str]] | Exception:
    try:
        with path.open() as csvfile:
            reader = csv.reader(csvfile)
            return list(reader)
    except Exception as e:
        return e


def _read_csv_from_paste(text: str) -> list[list[str]] | Exception:
    try:
        csvfile = StringIO(text)

        sample = csvfile.read(1024)
        csvfile.seek(0)

        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample)
        csvfile.seek(0)

        reader = csv.reader(csvfile, dialect)
        return list(reader)
    except Exception as e:
        return e


def _ensure_min_columns[T](
    data: list[list[T]],
    columns: int,
    default: T,
) -> list[list[T]]:
    for row in data:
        if len(row) < columns:
            row.extend([default] * (columns - len(row)))
    return data


def _group_by_site(data: list[list[str]]) -> dict[str, list[User]]:
    groups: dict[str, list[User]] = {}
    for row in data:
        groups.setdefault(row[Keys.site.value], []).append(_row_to_user(row))
    return groups


def _data_to_users(data: list[list[str]]) -> list[User]:
    return [_row_to_user(row) for row in data]


def _row_to_user(row: list[str]) -> User:
    return User(
        username=row[Keys.username.value],
        first_name=row[Keys.first_name.value],
        last_name=row[Keys.last_name.value],
        password=row[Keys.password.value],
    )


def _pad_iter[T](ls: list[T], n: int, f: Callable[[], T]) -> Iterable[T]:
    yield from ls
    yield from (f() for _ in range(n - len(ls)))
