import os
import shutil
import string
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

HEADER = string.Template(
    r"""
\documentclass[12pt]{article}
\usepackage{array}
\usepackage{graphicx}
\usepackage[left=0pt,right=0pt,top=1cm,bottom=1cm]{geometry}
\usepackage{csvsimple}

\newcommand{\logo}{\includegraphics[width=5cm]{logo.eps}}
\newcommand{\phase}{\footnotesize $phase}

\newcommand{\entry}[3]{
\begin{tabular}{ccccc}
                 &                &                                          &                                          &                                         \\ \cline{3-5}
 \multicolumn{2}{l}{\phase}       & \multicolumn{1}{|c|}{nombre}             & \multicolumn{1}{c|}{usuario}             & \multicolumn{1}{c|}{contraseña}         \\ \cline{3-5}
 \multicolumn{2}{m{5.2cm}}{\logo} & \multicolumn{1}{|m{6cm}|}{\centering #1} & \multicolumn{1}{p{3cm}|}{\centering #2}  & \multicolumn{1}{p{3cm}|}{\centering #3} \\ \cline{3-5}
                 &                &                                          &                                          &
\end{tabular}
}

\pagestyle{empty}
\begin{document}

\begin{center}
""",
)

FOOTER = r"""
\end{center}
\end{document}
"""


@dataclass(kw_only=True, frozen=True)
class User:
    username: str
    password: str
    first_name: str
    last_name: str


def generate_pdf(phase: str, users: list[User], name: str) -> None:
    with tempfile.TemporaryDirectory() as tempdir:
        shutil.copy(Path(__file__).parent / "logo.eps", Path(tempdir) / "logo.eps")

        texfile_path = Path(tempdir) / "main.tex"
        with texfile_path.open(mode="w") as texfile:
            texfile.write(HEADER.substitute({"phase": phase}))
            for user in users:
                fullname = f"{user.first_name} {user.last_name}".title()
                texfile.write(
                    r"\entry{%s}{%s}{%s}" % (fullname, user.username, user.password),  # noqa: UP031
                )
                texfile.write("\n\\hrule\n")
            texfile.write(FOOTER)

        cwd = Path.cwd()
        os.chdir(tempdir)
        subprocess.check_call(["pdflatex", "main.tex"])
        os.chdir(cwd)
        shutil.move(Path(tempdir) / "main.pdf", f"{name}.pdf")
