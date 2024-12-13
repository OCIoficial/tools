from __future__ import annotations
from prettytable import PrettyTable
import csv
from io import StringIO
from pathlib import Path
import sys


def _read_csv_from_text(text: str) -> list[list[str]]:
    csvfile = StringIO(text)

    sample = csvfile.read(1024)
    csvfile.seek(0)

    sniffer = csv.Sniffer()
    dialect = sniffer.sniff(sample)
    csvfile.seek(0)

    reader = csv.reader(csvfile, dialect)
    return list(reader)


def _write_csv_to_file(data: list[list[str]], file: Path) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open(mode="w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerows(data)


def _print_data(data: list[list[str]]) -> None:
    table = PrettyTable()
    table.header = False
    table.add_rows(data)
    print(table)


def main() -> None:
    print("Choose a name for the output CSV file: ", end="")
    file = input()
    print()
    print("Paste CSV-like text and then hit ctrl-d to finish")
    print("-----------------------------------------")
    text = ""
    for line in sys.stdin:
        text += line
    data = _read_csv_from_text(text)
    _write_csv_to_file(data, Path(file))
    print("-----------------------------------------")
    print()
    print(f"Generated `{file}` with the following content")
    print()
    _print_data(data)
