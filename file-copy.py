#!/usr/bin/python3

import argparse
import re
import glob
import shutil

from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("in_path")
    parser.add_argument("out_path")

    args = parser.parse_args()

    regex = re.compile(r"(\d+)-(.+).txt")

    for file in Path(args.in_path).glob("**/*"):
        ext = ".in" if file.parent.name == "in" else ".sol"
        if m := regex.match(file.name):
            st = int(m[1])
            name = m[2]
            st_dir = Path(args.out_path, f"st{st}")
            st_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy(file, Path(st_dir, f"{name}{ext}"))


if __name__ == '__main__':
    main()