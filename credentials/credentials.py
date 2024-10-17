#! /usr/bin/python

# Format of expected csv
# user, pass, email, first_name, last_name, team, site

# The site is optional and only required if the `--by-site` flag is used

# team = is corresponds to the team we create in cms, this is typically the city.
# site = is where they are participating, either a university or online.

import csv
import argparse
import shutil
import subprocess
import os
from pathlib import Path
import tempfile
import string

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
"""
)

FOOTER = r"""
\end{center}
\end{document}
"""


def row_to_dict(row):
    return {
        "user": row[0].strip(),
        "pass": row[1].strip(),
        "email": row[2].strip(),
        "first_name": row[3].strip(),
        "last_name": row[4].strip(),
        "team": row[5].strip(),
    }


def group_by_site(csv_reader):
    groups = {}
    for row in csv_reader:
        site = row[6]
        groups.setdefault(site, []).append(row_to_dict(row))
    return groups


def get_users(csv_reader):
    users = []
    for row in csv_reader:
        users.append(row_to_dict(row))
    return users


def generate_pdf(phase, users, dest):
    with tempfile.TemporaryDirectory() as tempdir:
        shutil.copy("logo.eps", Path(tempdir) / "logo.eps")

        texfile_path = Path(tempdir) / "main.tex"
        with open(texfile_path, mode="w") as texfile:
            texfile.write(HEADER.substitute({"phase": phase}))
            for user in users:
                fullname = f"{user["first_name"]} {user["last_name"]}".title()
                texfile.write(
                    r"\entry{%s}{%s}{%s}" % (fullname, user["user"], user["pass"])
                )
                texfile.write("\n\\hrule\n")
            texfile.write(FOOTER)

        cwd = os.getcwd()
        os.chdir(tempdir)
        subprocess.check_call(["pdflatex", "main.tex"])
        os.chdir(cwd)
        shutil.move(Path(tempdir) / "main.pdf", f"{dest}.pdf")


def main():
    parser = argparse.ArgumentParser(description="Generate pdf with credentials")

    parser.add_argument(
        "--phase", type=str, required=True, help="Either Final or Regional"
    )
    parser.add_argument(
        "--year",
        type=str,
        required=True,
    )
    parser.add_argument(
        "--users", type=str, help="CSV with user data", default="users.csv"
    )
    parser.add_argument("--by-site", action="store_true", help="Create one by site")

    args = parser.parse_args()

    phase = f"{args.phase} {args.year}".title()

    with open(args.users, mode="r") as csvfile:
        csv_reader = csv.reader(csvfile)

        if args.by_site:
            groups = group_by_site(csv_reader)
            for group, users in groups.items():
                generate_pdf(phase, users, group)
        else:
            users = get_users(csv_reader)
            generate_pdf(phase, users, "credenciales")


if __name__ == "__main__":
    main()
