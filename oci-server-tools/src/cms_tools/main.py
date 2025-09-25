#!/usr/bin/python3

from __future__ import annotations

from pathlib import Path
import shutil
from typing import Any, TypedDict, cast
from ruamel.yaml import YAML
import tomlkit
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
    def __init__(self, conf: Any, identity: str, cms_dir: Path) -> None:
        self._identity = identity
        self._cms_dir = cms_dir
        self._ip = cast(str, conf["ip"])
        self._workers = cast(int, conf.get("workers", 0))
        self._ssh = cast(SSHConf, conf["ssh"])

    @property
    def cms_dir(self) -> Path:
        return self._cms_dir

    @property
    def ip(self) -> str:
        return self._ip

    @property
    def workers(self) -> int:
        return self._workers

    def scp(self, source: str, target: str) -> int:
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
        return subprocess.check_call(cmd)

    def restart_resource_service(self, contest_id: str) -> None:
        session = "resourceService"
        service = self.bin_path("cmsResourceService")
        self.run(
            f"screen -X -S {session} quit; screen -S {session} -d -m {service} -a {contest_id}",
        )

    def stop_resource_service(self) -> None:
        session = "resourceService"
        self.run(f"screen -X -S {session} quit")

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

    def bin_path(self, service: str) -> Path:
        return self._cms_dir / "bin" / service


class Main(Host):
    def __init__(self, conf: Any, identity: str, cms_dir: Path) -> None:
        super().__init__(conf, identity, cms_dir)
        self._db = conf["db"]
        self._admin_web_server: dict[str, Any] = conf["admin_web_server"]
        self._contest_web_server: dict[str, Any] = conf["contest_web_server"]

    def restart_log_service(self) -> None:
        session = "logService"
        service = self.bin_path("cmsLogService")
        self.run(
            f"screen -X -S {session} quit; screen -S {session} -d -m {service}",
        )

    def restart_ranking(self, *, yes: bool, drop: bool) -> None:
        session = "ranking"
        cmd = [str(self.bin_path("cmsRankingWebServer"))]
        if yes:
            cmd.append("--yes")
        if drop:
            cmd.append("--drop")
        cmd_str = " ".join(cmd)
        self.run(
            f"screen -X -S {session} quit; screen -S {session} -d -m {cmd_str}",
        )

    @property
    def admin_web_server_listen_address(self) -> str:
        return self._admin_web_server["listen_address"]

    @property
    def contest_web_server_listen_address(self) -> list[str]:
        return self._contest_web_server["listen_address"]

    @property
    def db(self) -> DBConf:
        return self._db


class CMSTools:
    def __init__(self, conf_path: Path, contest_id: str) -> None:
        self._contest_id = contest_id
        with conf_path.open() as conf_file:
            conf = cast(Any, YAML(typ="safe").load(conf_file))  # type: ignore [reportUnknownMemberType]
            identity = cast(str, conf["identity_file"])
            cms_dir = Path(conf["cms_dir"])
            self._main = Main(conf["main"], identity, cms_dir)
            self._workers = [
                Host(c, identity, cms_dir) for c in conf.get("workers", [])
            ]
            self._rankings = cast("list[str]", conf.get("rankings", []))
            self._secret_key = cast(str, conf["secret_key"])

    def hosts(self) -> list[Host]:
        return [self._main, *self._workers]

    def worker(self, idx: int) -> Host:
        if idx < 0 or idx > len(self._workers):
            raise Exception("Cannot find worker in configuration")
        return self._workers[idx]

    def match_hosts(self, pattern: str) -> list[Host]:
        m = re.match(r"worker(\d+)", pattern)
        if pattern in ["all", "*"]:
            return self.hosts()
        elif pattern == "main":
            return [self._main]
        elif m:
            return [self.worker(int(m[1]))]
        else:
            raise Exception(f"Cannot match host `{pattern}`")

    def stop_resource_service(self, pattern: str) -> None:
        for host in self.match_hosts(pattern):
            host.stop_resource_service()
            print()

    def restart_resource_service(self, pattern: str) -> None:
        for host in self.match_hosts(pattern):
            host.restart_resource_service(self._contest_id)
            print()

    def restart_log_service(self) -> None:
        self._main.restart_log_service()

    def restart_ranking(self, *, yes: bool, drop: bool) -> None:
        self._main.restart_ranking(yes=yes, drop=drop)

    def status(self, pattern: str) -> None:
        for host in self.match_hosts(pattern):
            host.run("screen -list")
            print()

    def copy(self, pattern: str) -> None:
        with tempfile.NamedTemporaryFile(mode="w+") as fp:
            print(tomlkit.dumps(self._cms_conf()))
            # tomlkit.dump(self._cms_conf(), fp)  # type: ignore
            # fp.seek(0)
            # for host in self.match_hosts(pattern):
            #     host.scp(fp.name, str(host.cms_dir / "etc" / "cms.toml"))

    def connect(self, pattern: str) -> None:
        hosts = self.match_hosts(pattern)
        if len(hosts) == 1:
            host = hosts[0]
            host.connect()
        elif len(hosts) == 0:
            raise Exception(f"`{pattern}` doesn't match any host")
        else:
            raise Exception(f"`{pattern}` matches more than one host")

    def _services(self) -> dict[str, list[list[str | int]]]:
        resource_service: list[list[str | int]] = []
        worker_service: list[list[str | int]] = []
        for host in self.hosts():
            resource_service.append([host.ip, 28000])
            worker_service.extend([host.ip, 26000 + i] for i in range(host.workers))

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
            "PrometheusExporter": [],
            "TelegramBot": [],
        }

    def _database_url(self) -> str:
        ip = self._main.ip
        db = self._main.db
        port = db.get("port", 5432)
        return f"postgresql+psycopg2://{db['username']}:{db['password']}@{ip}:{port}/{db['name']}"

    def _cms_conf(self) -> dict[str, Any]:
        cms_conf_path = Path(__file__).parent / "cms.sample.toml"
        with cms_conf_path.open("rb") as cms_conf_file:
            cms_conf = tomlkit.load(cms_conf_file)
            cms_conf["services"] = self._services()
            cms_conf["database"].value["url"] = self._database_url()
            cms_conf["proxy_service"].value["rankings"] = self._rankings
            cms_conf["web_server"].value["secret_key"] = self._secret_key
            cms_conf["admin_web_server"].value["listen_address"] = (
                self._main.admin_web_server_listen_address
            )
            cms_conf["contest_web_server"].value["listen_address"] = (
                self._main.contest_web_server_listen_address
            )
            return cms_conf


def copy_images() -> None:
    src = Path(__file__).parent
    dst = Path("/var/local/lib/cms/ranking")

    # Copy logo
    logo_src = src / "logo.png"
    print(f"$ cp {logo_src} {dst}")
    dst.mkdir(exist_ok=True, parents=True)
    shutil.copy(logo_src, dst)

    # Copy flags
    flags_src = src / "flags"
    flags_dst = dst / "flags"
    for flag in flags_src.glob("*.png"):
        print(f"$ cp {flag} {flags_dst}")
        flags_dst.mkdir(exist_ok=True)
        shutil.copy(flag, flags_dst)


def main() -> None:
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description="""
             cms-tools is a script containing a set of useful commands to configure cms contests
             in multiple hosts. The script expects a configuration file containing the description
             of the hosts used for cms. You can generate one in the current directory with `cms-tools init-conf`
             the generated file contains comments with detailing how to configure cms-tools.

             Most commands expect a positional argument specifying in which host they should run.
             This argument can be either `all` (run in all hosts), `main` (run in main host)
             or `workerX` where X is the index (starting from 0) of a worker as described
             in the configuration file. This command is optional and defaulted to `all` for
             all commands except for `connect`. To see further information for a specific command
             run the command followed by `--help`.
             """,
    )
    parser.add_argument(
        "--contest-id",
        "-c",
        default="ALL",
        help="A contest id or ALL to serve all contests",
    )
    parser.add_argument(
        "--conf",
        default="conf.yaml",
        help="Path to the host configuration file.",
    )
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser(
        "init-conf",
        help="initialize conf.yaml in the current directory",
    )

    # copy
    copy_parser = subparsers.add_parser(
        "copy-conf",
        help="""
                 copy the cms.toml file to the host(s).
                 This command expects write permissions to `<cms_dir>/etc` in the
                 remote host(s).
                 The cms.toml file is created from a sample one by filling the core_services and
                 database fields with the correct information as described in the host configuration file.
                 """,
    )
    copy_parser.add_argument("host", nargs="?", default="all")

    # start log service
    subparsers.add_parser(
        "restart-log-service",
        help="start the log service in the main host",
    )

    # restart resource service
    restart_parser = subparsers.add_parser(
        "restart-resource-service",
        help="""start or restart the services running on the host(s). This kills the previous screen
        session and creates a new one executing cmsResourceService -a CONTEST_ID.""",
    )
    restart_parser.add_argument("host", nargs="?", default="all")

    # stop resource service
    stop_parser = subparsers.add_parser(
        "stop-resource-service",
        help="""Stop the services running on the host(s). This just kills the screen session
        running cmsResourceService.""",
    )
    stop_parser.add_argument("host", nargs="?", default="all")

    # ranking
    ranking_parser = subparsers.add_parser(
        "restart-ranking",
        help="Connect to remote host via ssh.",
    )
    ranking_parser.add_argument(
        "--drop",
        action="store_true",
        help="drop the data already stored",
    )
    ranking_parser.add_argument(
        "--yes",
        action="store_true",
        help="do not require confirmation on dropping data",
    )

    # copy logos
    subparsers.add_parser(
        "copy-ranking-images",
        help="copy logo and team flags for ranking web server.",
    )

    # status
    status_parser = subparsers.add_parser("status", help="list screen sessions")
    status_parser.add_argument("host", nargs="?", default="all")

    # connect
    connect_parser = subparsers.add_parser(
        "connect",
        help="Connect to remote host via ssh.",
    )
    connect_parser.add_argument("host")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    if args.command == "init-conf":
        sample_conf = Path(__file__).parent / "conf.sample.yaml"
        conf = Path("conf.yaml")
        with sample_conf.open() as sample_conf_file, conf.open("wb") as conf_file:
            yaml = YAML()
            data = yaml.load(sample_conf_file)  # type: ignore [reportUnknownMemberType]
            data["secret_key"] = os.urandom(16).hex()
            yaml.dump(data, conf_file)  # type: ignore [reportUnknownMemberType]
            print(f"{conf} file generated in current directory")
        return

    if args.command == "copy-ranking-images":
        return copy_images()

    tools = CMSTools(Path(args.conf), args.contest_id)
    if args.command == "stop-resource-service":
        tools.stop_resource_service(args.host)
    elif args.command == "restart-resource-service":
        tools.restart_resource_service(args.host)
    elif args.command == "restart-log-service":
        tools.restart_log_service()
    elif args.command == "restart-ranking":
        tools.restart_ranking(yes=args.yes, drop=args.drop)
    elif args.command == "copy-conf":
        tools.copy(args.host)
    elif args.command == "status":
        tools.status(args.host)
    elif args.command == "connect":
        tools.connect(args.host)


if __name__ == "__main__":
    main()
