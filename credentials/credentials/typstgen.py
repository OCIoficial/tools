import shutil
import string
import tempfile
from pathlib import Path

import typst

from credentials.types import User

TEMPLATE = string.Template("""
#set page("us-letter", margin: (left: 0pt, right: 0pt, top: 0em, bottom: 0pt))
#set text(font: "New Computer Modern")

#let entry(fullname, username, password) = {
  pad(
    x: 50pt,
    y: 12pt,
    grid(
      columns: (5cm, 1fr),
      rows: (auto),
      inset: 10pt,
      align: horizon,
      stack(
        spacing: 10pt,
        [$phase],
        image("logo.png"),
      ),
      table(
        columns: (1.8fr, 1fr, 1fr),
        rows: (auto, 3em),
        align: horizon + center,
        table.header([nombre], [usuario], [contraseña]),
        fullname, username, password,
      ),
    ),
  )
}

$entries
""")


def generate_pdf(phase: str, users: list[User], name: str) -> None:
    with tempfile.TemporaryDirectory() as tempdir:
        entries = ""
        for user in users:
            fullname = f"{user.first_name} {user.last_name}".title()
            entries += f"#entry([{fullname}], [{user.username}], [{user.password}])\n"
            entries += "#line(length: 100%)\n"

        path = Path(tempdir) / "main.typ"
        with path.open(mode="w") as typstfile:
            typstfile.write(TEMPLATE.substitute({"phase": phase, "entries": entries}))
        shutil.copy(Path(__file__).parent / "logo.png", Path(tempdir) / "logo.png")

        typst.compile(path, output=Path(f"{name}.pdf"))
