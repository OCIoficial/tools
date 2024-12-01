"""Generate pdf with credentials for the Chilean Olympiad in Informatics."""

from credentials.main import Credentials


def main() -> None:
    Credentials().run()


if __name__ == "__main__":
    main()
