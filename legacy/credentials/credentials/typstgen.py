import shutil
import string
import tempfile
from pathlib import Path

import typst

from credentials.types import User

TEMPLATE = string.Template("""
#set page("us-letter", margin: 0pt)
#set text(font: "New Computer Modern")

#let logo = image("logo.png", width: 5cm)

#let entry(fullname, username, password) = {
  pad(
    x: 50pt,
    y: 13pt,
    table(
      columns: (1.8fr, 1.8fr, 1fr, 1fr),
      stroke: none,
      align: horizon + center,
      table.vline(x: 1), table.vline(x: 2), table.vline(x: 3), table.vline(x: 4),
      table.hline(start: 1),
      table.header(table.cell(align: start + horizon)[$phase], [nombre], [usuario], [contraseña]),
      table.hline(start: 1),
      table.cell(align: start, logo), fullname, username, password,
      table.hline(start: 1),
    ),
  )
}

#let hrule = {
  layout(size => {
    if size.height - here().position().y > 120pt {
      line(length: 100%, stroke: (dash: "densely-dashed"))
    }
  })
}

$entries
""")


def generate_pdf(phase: str, users: list[User], name: str) -> None:
    with tempfile.TemporaryDirectory() as tempdir:
        entries = ""
        for u in users:
            fullname = f"{u.first_name} {u.last_name}".title()
            entries += f"#entry([{fullname}], [`{u.username}`], [`{u.password}`])\n"
            entries += "#hrule\n"

        path = Path(tempdir) / "main.typ"
        with path.open(mode="w") as typstfile:
            typstfile.write(TEMPLATE.substitute({"phase": phase, "entries": entries}))
        shutil.copy(Path(__file__).parent / "logo.png", Path(tempdir) / "logo.png")

        typst.compile(path, output=Path(f"{name}.pdf"))
