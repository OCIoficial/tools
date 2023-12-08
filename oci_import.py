#!/usr/bin/env python3

# Contest Management System - http://cms-dev.github.io/
# Copyright © 2016 Stefano Maggiolo <s.maggiolo@gmail.com>
# Copyright © 2017-2018 Luca Wehrstedt <luca.wehrstedt@gmail.com>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

"""This script imports users and teams from csv files

"""
import gevent.monkey
gevent.monkey.patch_all()  # noqa

import argparse
import logging
import sys
import csv

from sqlalchemy.exc import IntegrityError

from cms import utf8_decoder
from cms.db import SessionGen, User, Team, Contest, Participation
from cmscommon.crypto import hash_password


logger = logging.getLogger(__name__)

def add_user(session, first_name, last_name, username, password, email):
    logger.info(f"creating the user {username} in the database.")
    stored_password = hash_password(password, "bcrypt")

    user = User(first_name=first_name,
                last_name=last_name,
                username=username,
                password=stored_password,
                email=email)
    session.add(user)

def add_team(session, code, name):
    logger.info(f"creating the team {code} in the database.")
    team = Team(code=code, name=name)
    session.add(team)

def add_participation(session, contest_id, username, team_code):
    logger.info(f"creating the user {username} participation in the contest.")

    user = \
        session.query(User).filter(User.username == username).first()
    if user is None:
        logger.error("no user with username `%s' found.", username)
        return False
    contest = Contest.get_from_id(contest_id, session)
    if contest is None:
        logger.error("no contest with id `%s' found.", contest_id)
        return False
    team = None
    if team_code is not None:
        team = \
            session.query(Team).filter(Team.code == team_code).first()
        if team is None:
            logger.error("no team with code `%s' found.", team_code)
            return False

    participation = Participation(
        user=user,
        contest=contest,
        team=team)
    session.add(participation)

    logger.info(f"participation for {username} added.")
    return True

def main():
    """Parse arguments and launch process.

    """
    parser = argparse.ArgumentParser(description="Import .csv into CMS")
    parser.add_argument("users_file", action="store", type=utf8_decoder,
                        help="csv with users to import with format: (username, password, email, first_name, last_name, team_code)")
    parser.add_argument("--teams_file", action="store", type=utf8_decoder,
                        help="csv with teams to import with format: (team_code, name)", required=False)
    parser.add_argument("contest_id", action="store", type=utf8_decoder,
                        help="contest to use")
    args = parser.parse_args()

    users_csv = open(args.users_file, 'r')
    users_reader = csv.reader(users_csv)
    teams_reader = []
    if args.teams_file != None:
        teams_csv = open(args.teams_file, 'r')
        teams_reader = csv.reader(teams_csv)
    
    try:
        with SessionGen() as session:
            for row in teams_reader:
                (code, name) = row
                add_team(session, code, name)

            for row in users_reader:
                (username, password, email, first_name, last_name, team_code) = row
                if team_code == "":
                    team_code = None
                add_user(session, first_name, last_name, username, password, email)
                result = add_participation(session, args.contest_id, username, team_code)
                if not result:
                    return
            session.commit()
    except IntegrityError as e:
        logger.error("an error ocurred importing csv.")
        logger.error(e)
        return
    
    logger.info("imported csv correctly.")

if __name__ == "__main__":
    sys.exit(main())

