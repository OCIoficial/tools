#!/usr/bin/env python3

"""This script imports users and teams from csv files

"""
from uu import Error
import gevent.monkey

gevent.monkey.patch_all()  # noqa

import argparse
import logging
import sys
import csv

from sqlalchemy.exc import IntegrityError

from cms import utf8_decoder
from cms.db import SessionGen, User, Team, Contest, Participation
from cmscommon.crypto import build_password


logger = logging.getLogger(__name__)


def import_teams(session, teams):
    for row in teams:
        (code, name) = row
        logger.info(f"importing team {code}.")
        team = Team(code=code, name=name)
        session.add(team)


def import_users(session, users):
    for row in users:
        (username, password, email, first_name, last_name, *rest) = row
        logger.info(f"importing user {username}.")

        stored_password = build_password(password, "plaintext")

        user = User(
            first_name=first_name,
            last_name=last_name,
            username=username,
            password=stored_password,
            email=email,
        )
        session.add(user)


def get_team_or_none(session, cells):
    team_code = None
    if len(cells) >= 1:
        team_code = cells[0]
        if team_code == "":
            team_code = None

    if team_code is not None:
        return session.query(Team).filter(Team.code == team_code).one()
    else:
        return None


def import_participations(session, users, contest_name):
    contest = session.query(Contest).filter(Contest.name == contest_name).one()

    for row in users:
        (username, password, _email, _first_name, _last_name, *rest) = row
        stored_password = build_password(password, "plaintext")
        team = get_team_or_none(session, rest)
        user = session.query(User).filter(User.username == username).one()

        logger.info(f"importing participation for {username}.")

        participation = Participation(
            user=user,
            contest=contest,
            password=stored_password,
            team=team,
        )
        session.add(participation)


def main():
    """Parse arguments and launch process."""
    parser = argparse.ArgumentParser(description="Import .csv into CMS")
    subparsers = parser.add_subparsers(dest="command")

    # Import Teams
    import_teams_parser = subparsers.add_parser("import-teams")
    import_teams_parser.add_argument(
        "teams_file",
        type=utf8_decoder,
        help="csv with teams to import with format: (team_code, name)",
        metavar="teams-file",
    )

    # Import Users
    import_users_parser = subparsers.add_parser("import-users")
    import_users_parser.add_argument(
        "users_file",
        type=utf8_decoder,
        help="csv with users to import with format: (username, password, email, first_name, last_name)",
        metavar="users-file",
    )

    # Import participations
    import_participations_parser = subparsers.add_parser("import-participations")
    import_participations_parser.add_argument(
        "users_file",
        help="csv with users to import with format: (username, password, email, first_name, last_name, team_code)\nThe columns email, first_name and last_name are ignored. They are included to be compatible with the format for importing users",
        metavar="users-file",
    )
    import_participations_parser.add_argument(
        "contest",
        action="store",
        type=utf8_decoder,
        help="the name of the contest",
    )

    args = parser.parse_args()

    try:
        with SessionGen() as session:
            if args.command == "import-teams":
                teams = list(csv.reader(open(args.teams_file, "r")))
                import_teams(session, teams)
            elif args.command == "import-users":
                users = list(csv.reader(open(args.users_file, "r")))
                import_users(session, users)
            elif args.command == "import-participations":
                users = list(csv.reader(open(args.users_file, "r")))
                import_participations(session, users, args.contest)

            session.commit()
    except IntegrityError as e:
        logger.error("an error ocurred importing csv.")
        logger.error(e)
        return

    logger.info("csv imported successfully.")


if __name__ == "__main__":
    sys.exit(main())
