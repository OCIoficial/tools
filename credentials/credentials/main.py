import csv
import datetime
from io import StringIO
from pathlib import Path
from typing import ClassVar

from rich.text import Text
from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import HorizontalGroup, Vertical
from textual.events import Paste
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import Button, DirectoryTree, Footer, Header, Input, Label, Select

from credentials import typstgen
from credentials.types import Keys, User
from credentials.vim import VimDataTable, VimDirectoryTree

COLUMN_NAMES: dict[Keys, str] = {
    Keys.username: "Username",
    Keys.password: "Password",
    Keys.first_name: "First Names",
    Keys.last_name: "Last Names",
    Keys.site: "Site",
}


class FilePicker(ModalScreen[Path | None]):
    BINDINGS: ClassVar[list[BindingType]] = [
        ("Q,q", "quit", "Quit"),
        ("P,p", "goto_parent", "Go to parent"),
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


class Credentials(App[None]):
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("Q,q", "quit", "Quit"),
        Binding("O,o", "open_csv_file", show=False),
        Binding("G,g", "generate_pdf", show=False),
        Binding("D,d", "delete_column", "Delete column"),
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
        Binding("S,s", "toggle_group_by_site", "Toggle group by site"),
    ]

    CSS_PATH = "credentials.tcss"

    data: reactive[list[list[str]]] = reactive([])

    def __init__(self) -> None:
        super().__init__()
        self._table = VimDataTable[str](cursor_type="column", zebra_stripes=True)
        self._phase_selector = Select(
            [("Regional", "Regional"), ("Final", "Final")],
            value="Regional",
            allow_blank=False,
            id="phase",
        )
        self._set_column: int | None = None
        self._group_by_site = True

    def on_mount(self) -> None:
        self.add_columns(0)
        self._table.focus()

    def compose(self) -> ComposeResult:
        yield Footer()
        with Vertical(classes="container"):
            with HorizontalGroup():
                yield Label("Phase: ", classes="label")
                yield self._phase_selector
                yield Label("Year: ", classes="label")
                yield Input(str(datetime.date.today().year), id="year")
                yield Button(
                    "Open CSV (O)",
                    variant="primary",
                    id="load-csv",
                )
                yield Button(
                    self.generate_pdf_label(),
                    variant="primary",
                    id="generate-pdf",
                )
            yield self._table
        yield Header()

    @work()
    async def action_open_csv_file(self) -> None:
        path = await self.push_screen(FilePicker(), wait_for_dismiss=True)
        if not path:
            return
        match _read_csv_file(path):
            case Exception() as exc:
                self.notify(f"error loading csv: {exc} ", severity="error")
            case list() as data:
                self.data = _ensure_min_columns(data, len(Keys))

    def on_paste(self, ev: Paste) -> None:
        match _read_csv_from_paste(ev.text):
            case Exception() as exc:
                self.notify(f"error loading csv: {exc} ", severity="error")
            case list() as data:
                self.data = _ensure_min_columns(data, len(Keys))

    def action_delete_column(self) -> None:
        col = self._table.cursor_column
        self._set_column = col
        self.data = _delete_column(self.data, col)

    def action_move_column_right(self) -> None:
        col = self._table.cursor_column
        if col < len(self.data) - 1:
            self._set_column = col + 1
            self.data = _swap_columns(self.data, col, col + 1)

    def action_move_column_left(self) -> None:
        col = self._table.cursor_column
        if col > 0:
            self._set_column = col - 1
            self.data = _swap_columns(self.data, col - 1, col)

    def action_toggle_group_by_site(self) -> None:
        self._group_by_site = not self._group_by_site
        self._set_column = self._table.cursor_column
        self.query_one("#generate-pdf", Button).label = self.generate_pdf_label()
        self.refresh_table()

    def watch_data(self) -> None:
        self.refresh_table()

    def refresh_table(self) -> None:
        self._table.clear(columns=True)
        self.add_columns(max((len(r) for r in self.data), default=0))
        self._table.add_rows(self.data)
        self._table.move_cursor(column=self._set_column)
        self._set_column = None

    def add_columns(self, min_columns: int) -> None:
        for k in Keys:
            name = "" if not self._group_by_site and k == Keys.site else COLUMN_NAMES[k]
            self._table.add_column(Text(name))

        for _ in range(max(0, min_columns - len(Keys))):
            self._table.add_column("")

    def on_button_pressed(self, ev: Button.Pressed) -> None:
        match ev.button.id:
            case "generate-pdf":
                self.action_generate_pdf()
            case "load-csv":
                self.action_open_csv_file()
            case _:
                pass

    def action_generate_pdf(self) -> None:
        year = self.query_one("#year", Input).value
        phase = f"{self._phase_selector.value} {year}"

        if self._group_by_site:
            groups = _group_by_site(self.data)
        else:
            groups = {phase: _data_to_users(self.data)}

        with self.suspend():
            try:
                for name, users in groups.items():
                    typstgen.generate_pdf(phase, users, name)
            except Exception as exc:
                self.notify(f"error building pdfs: {exc} ", severity="error")
        self.refresh()

    def generate_pdf_label(self) -> str:
        return "Generate PDFs (G)" if self._group_by_site else "Generate PDF (G)"


def _swap_columns(data: list[list[str]], col1: int, col2: int) -> list[list[str]]:
    data = [row[:] for row in data]
    for row in data:
        if 0 <= col1 < len(row) and 0 <= col2 < len(row):
            row[col1], row[col2] = row[col2], row[col1]
    return data


def _delete_column(data: list[list[str]], col: int) -> list[list[str]]:
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


def _ensure_min_columns(data: list[list[str]], columns: int) -> list[list[str]]:
    for row in data:
        if len(row) < columns:
            row.extend([""] * (columns - len(row)))
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
