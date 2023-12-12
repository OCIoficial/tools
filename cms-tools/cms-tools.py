#!/usr/bin/python3

from typing import Any, TypedDict, cast, List, Dict
import yaml
import json
import tempfile
import subprocess
import argparse
import re
import os


class DBConf(TypedDict):
    name: str
    username: str
    password: str


class SSHConf(TypedDict):
    ip: str
    username: str


class Host:
    def __init__(self, conf: Any, identity: str) -> None:
        self._identity = identity
        self._ip = cast(str, conf["ip"])
        self._workers = cast(int, conf.get("workers", 0))
        self._ssh = cast(SSHConf, conf["ssh"])

    @property
    def ip(self) -> str:
        return self._ip

    @property
    def workers(self) -> int:
        return self._workers

    def scp(self, source: str, target: str):
        ip = self._ssh["ip"]
        username = self._ssh["username"]
        cmd = [
            "scp",
            "-i",
            self._identity,
            source,
            f"{username}@{ip}:{target}",
        ]
        self._print_cmd(cmd)
        subprocess.check_call(cmd)

    def run(self, cmd: str) -> None:
        username = self._ssh["username"]
        ip = self._ssh["ip"]
        cmds = ["ssh", "-i", self._identity, f"{username}@{ip}", cmd]
        self._print_cmd(cmds)
        subprocess.call(cmds)

    def connect(self) -> None:
        username = self._ssh["username"]
        ip = self._ssh["ip"]
        cmd = ["ssh", f"{username}@{ip}", "-i", self._identity]
        self._print_cmd(cmd)
        os.execlp("ssh", *cmd)

    def _print_cmd(self, cmd: list[str]) -> None:
        print("$", " ".join(cmd))


class Main(Host):
    def __init__(self, conf: Any, identity: str) -> None:
        super().__init__(conf, identity)
        self._db = conf["db"]

    @property
    def db(self) -> DBConf:
        return self._db


class CMSTools:
    def __init__(self, conf_path: str, contest_id: str):
        self._contest_id = contest_id
        conf: Any = yaml.safe_load(open(conf_path, "r"))
        identity = cast(str, conf["identity_file"])
        self._main = Main(conf["main"], identity)
        self._workers = [Host(c, identity) for c in conf.get("workers", [])]
        self._rankings = cast(List[str], conf.get("rankings", []))
        self._secret_key = cast(str, conf["secret_key"])

    def hosts(self) -> List[Host]:
        return [self._main, *self._workers]

    def worker(self, idx: int) -> Host:
        if idx < 0 or idx > len(self._workers):
            raise Exception("Cannot find worker in configuration")
        return self._workers[idx]

    def match_hosts(self, pattern: str) -> List[Host]:
        m = re.match(r"worker(\d+)", pattern)
        if pattern in ["all", "*"]:
            return self.hosts()
        elif pattern == "main":
            return [self._main]
        elif m:
            return [self.worker(int(m[1]))]
        else:
            raise Exception(f"Cannot match host `{pattern}`")

    def exec(self, cmd: str, pattern: str):
        for host in self.match_hosts(pattern):
            host.run(cmd)
            print()

    def stop_resource_service(self, pattern: str):
        self.exec("screen -X -S resourceService quit", pattern)

    def restart_resource_service(self, pattern: str):
        session = "resourceService"
        self.exec(
            f"screen -X -S {session} quit; screen -S {session} -d -m cmsResourceService -a {self._contest_id}",
            pattern,
        )

    def restart_log_service(self):
        session = "logService"
        self._main.run(
            f"screen -X -S {session} quit; screen -S {session} -d -m cmsLogService",
        )

    def status(self, pattern: str):
        self.exec("screen -list", pattern)

    def copy(self, pattern: str, cms_conf_path: str):
        with tempfile.NamedTemporaryFile(mode="w+") as fp:
            json.dump(self._cms_conf(cms_conf_path), fp, indent=4)
            fp.seek(0)
            for host in self.match_hosts(pattern):
                host.scp(fp.name, "/usr/local/etc/cms.conf")

    def connect(self, pattern: str):
        hosts = self.match_hosts(pattern)
        if len(hosts) == 1:
            host = hosts[0]
            host.connect()
        elif len(hosts) == 0:
            raise Exception(f"`{pattern}` doesn't match any host")
        else:
            raise Exception(f"`{pattern}` matches more than one host")

    def _core_services(self) -> Dict[str, Any]:
        resource_service: List[List[Any]] = []
        worker_service: List[List[Any]] = []
        for host in self.hosts():
            resource_service.append([host.ip, 28000])
            for i in range(host.workers):
                worker_service.append([host.ip, 26000 + i])

        main_ip = self._main.ip

        return {
            "LogService": [[main_ip, 29000]],
            "ResourceService": resource_service,
            "ScoringService": [[main_ip, 28500]],
            "Checker": [[main_ip, 22000]],
            "EvaluationService": [[main_ip, 25000]],
            "Worker": worker_service,
            "ContestWebServer": [[main_ip, 21000]],
            "AdminWebServer": [[main_ip, 21100]],
            "ProxyService": [[main_ip, 28600]],
            "PrintingService": [[main_ip, 25123]],
        }

    def _database(self):
        ip = self._main.ip
        db = self._main.db
        port = db.get("port", 5432)
        return f"postgresql+psycopg2://{db['username']}:{db['password']}@{ip}:{port}/{db['name']}"

    def _cms_conf(self, cms_conf_path: str):
        cms_conf = json.load(open(cms_conf_path, "r"))
        cms_conf["core_services"] = self._core_services()
        cms_conf["database"] = self._database()
        cms_conf["rankings"] = self._rankings
        cms_conf["secret_key"] = self._secret_key
        return cms_conf


def main():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description="""
             cms-tools is a script containing a set of useful commands to configure cms contests
             in multiple hosts. The script expects a configuration file containing the description
             of the hosts. See the example conf.yaml for a more detailed description.
             All comands expect a positional argument specifying in which host they should run.
             This argument can be either `all` (run in all hosts), `main` (run in main host)
             or `workerX` where X is the index (starting from 0) of a worker as described
             in the configuration file. This command is optional and defaulted to `all` for
             all commands expect for connect. To see further information for a specific command
             run the command followed by --help.
             """,
    )
    parser.add_argument(
        "--contest-id",
        "-c",
        default="ALL",
        help="A contest id or ALL to serve all contests",
    )
    parser.add_argument(
        "--conf", default="conf.yaml", help="Path to the host configuration file."
    )
    subparsers = parser.add_subparsers(dest="command")

    # copy
    copy_parser = subparsers.add_parser(
        "copy-cms-conf",
        help="""
                 Copy the cms.conf file to the host(s).
                 This command expects write permissions to /usr/local/etc/cms.conf in the
                 remote host(s).
                 The cms.conf file is created from a sample one by filling the core_services and
                 database fields with the correct information as described in the host configuration file.
                 """,
    )
    copy_parser.add_argument("host", nargs="?", default="all")
    copy_parser.add_argument("--cms-conf", default="cms.conf")

    # start log service
    subparsers.add_parser(
        "restart-log-service", help="start the log service in the main host"
    )

    # restart resource service
    restart_parser = subparsers.add_parser(
        "restart-resource-service",
        help="""Start or restart the services running on the host(s). This kills the previous screen
        session and creates a new one executing cmsResourceService -a CONTEST_ID.""",
    )
    restart_parser.add_argument("host", nargs="?", default="all")

    # stop resource service
    stop_parser = subparsers.add_parser(
        "stop-resource-service",
        help="""Stop the services runing on the host(s). This just kills the screen session
        running cmsResourceService.""",
    )
    stop_parser.add_argument("host", nargs="?", default="all")

    # status
    status_parser = subparsers.add_parser("status", help="List screen sessions")
    status_parser.add_argument("host", nargs="?", default="all")

    # connect
    connect_parser = subparsers.add_parser(
        "connect", help="Connect to remote host via ssh."
    )
    connect_parser.add_argument("host")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    tools = CMSTools(args.conf, args.contest_id)
    if args.command == "stop-resource-service":
        tools.stop_resource_service(args.host)
    elif args.command == "restart-resource-service":
        tools.restart_resource_service(args.host)
    elif args.command == "restart-log-service":
        tools.restart_log_service()
    elif args.command == "copy-cms-conf":
        tools.copy(args.host, args.cms_conf)
    elif args.command == "status":
        tools.status(args.host)
    elif args.command == "connect":
        tools.connect(args.host)


if __name__ == "__main__":
    main()
