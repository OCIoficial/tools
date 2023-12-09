#!/usr/bin/python3

from typing import Any, TypedDict, cast, List
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


class Host(TypedDict):
    ip: str
    workers: int
    is_local: bool


class LocalHost(Host):
    db: DBConf


class RemoteHost(Host):
    username: str


class CMSTools:
    def __init__(self, hosts_conf: Any, contest_id: str):
        self._contest_id = contest_id
        self._hosts_conf: Any = yaml.safe_load(open(hosts_conf, "r"))
        self._hosts_conf["local"]["is_local"] = True

        for remote in self.remotes:
            remote["is_local"] = False

    @property
    def remotes(self) -> List[RemoteHost]:
        return cast(List[RemoteHost], self._hosts_conf["remote"])

    @property
    def local(self) -> LocalHost:
        return cast(LocalHost, self._hosts_conf["local"])

    @property
    def hosts(self):
        return [self.local, *self.remotes]

    def remote(self, idx: int) -> RemoteHost:
        if idx < 0 or idx > len(self.remotes):
            raise Exception("Cannot find remote in configuration")
        return self.remotes[idx]

    def match_hosts(self, pattern: str) -> List[Any]:
        m = re.match(r"remote(\d+)", pattern)
        if pattern in ["all", "*"]:
            return self.hosts
        elif pattern == "local":
            return [self.local]
        elif m:
            return [self.remote(int(m[1]))]
        else:
            raise Exception(f"Cannot match host `{pattern}`")

    def exec(self, cmd: str, pattern: str):
        for host in self.match_hosts(pattern):
            if host["is_local"]:
                subprocess.check_call(["bash", "-c", cmd])
            else:
                exec_remote(host, cmd)

    def stop(self, pattern: str):
        self.exec("screen -X -S resourceService quit", pattern)

    def restart(self, pattern: str):
        self.exec(
            f"screen -X -S resourceService quit; screen -S resourceService -d -m cmsResourceService -a {self._contest_id}",
            pattern,
        )

    def copy(self, pattern: str, cms_conf_path: str):
        with tempfile.NamedTemporaryFile(mode="w+") as fp:
            json.dump(self._cms_conf(cms_conf_path), fp, indent=4)
            fp.seek(0)
            for host in self.match_hosts(pattern):
                if host["is_local"]:
                    subprocess.check_call(["cp", fp.name, "/usr/local/etc/cms.conf"])
                else:
                    username = host["username"]
                    ip = host["ip"]
                    subprocess.check_call(
                        ["scp", fp.name, f"{username}@{ip}:/usr/local/etc/cms.conf"]
                    )

    def connect(self, remote_name: str):
        m = re.match(r"remote(\d+)", remote_name)
        if m:
            remote = self.remote(int(m[1]))
            username = remote["username"]
            ip = remote["ip"]
            os.execlp("ssh", "ssh", f"{username}@{ip}")
        else:
            raise Exception(f"Cannot match remote `{remote_name}`")

    def _core_services(self):
        local_ip = self.local["ip"]
        workers_in_local = self.local.get("workers", 0)
        worker_service = [[local_ip, 26000 + i] for i in range(workers_in_local)]
        resource_service = [[local_ip, 28000]]

        for remote in self.remotes:
            remote_ip = remote["ip"]
            resource_service.append([remote_ip, 28000])
            for i in range(remote["workers"]):
                worker_service.append([remote_ip, 26000 + i])

        return {
            "LogService": [[local_ip, 29000]],
            "ResourceService": resource_service,
            "ScoringService": [[local_ip, 28500]],
            "Checker": [[local_ip, 22000]],
            "EvaluationService": [[local_ip, 25000]],
            "Worker": worker_service,
            "ContestWebServer": [[local_ip, 21000]],
            "AdminWebServer": [[local_ip, 21100]],
            "ProxyService": [[local_ip, 28600]],
            "PrintingService": [[local_ip, 25123]],
        }

    def _database(self):
        local_ip = self.local["ip"]
        db = self.local["db"]
        port = db.get("port", 5432)
        return f"postgresql+psycopg2://{db['username']}:{db['password']}@{local_ip}:{port}/{db['name']}"

    def _cms_conf(self, cms_conf_path: str):
        cms_conf = json.load(open(cms_conf_path, "r"))
        cms_conf["core_services"] = self._core_services()
        cms_conf["database"] = self._database()
        cms_conf["rankings"] = self._rankings()
        cms_conf["secret_key"] = self._secret_key()
        return cms_conf

    def _rankings(self):
        return self._hosts_conf["rankings"] or []

    def _secret_key(self) -> str:
        return cast(str, self._hosts_conf["secret_key"])


def exec_remote(host: RemoteHost, cmd: str):
    username = host["username"]
    ip = host["ip"]
    subprocess.check_call(["ssh", f"{username}@{ip}", cmd])


def main():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description="""
             cms-tools is a script containing a set of useful commands to configure cms contests
             in multiple hosts.  The script expects a configuration file containing the description
             of the hosts.  See the example hosts.yaml for a more detailed description.
             All comands expect a positional argument specifying in which host they should run.
             This argument can be either `all` (run in all hosts), `local` (run in local host)
             or `remoteX` where X is the index (starting from 0) of a remote host as described
             in the host configuration file.  This command is optional and defaulted to `all` for
             all commands expect for connect which expects a remote host.  To see further
             information for a specific command run the command followed by --help.
             """,
    )
    parser.add_argument(
        "--contest-id",
        "-c",
        default="ALL",
        help="A contest id or ALL to serve all contests",
    )
    parser.add_argument(
        "--host-conf", default="hosts.yaml", help="Path to the host configuration file."
    )
    subparsers = parser.add_subparsers(dest="command")
    stop_parser = subparsers.add_parser(
        "stop",
        help="""Stop the services runing on the host(s). This just kills the screen session
        running cmsResourceService.""",
    )
    stop_parser.add_argument("host", nargs="?", default="all")

    restart_parser = subparsers.add_parser(
        "restart",
        help="""Start or restart the services running on the host(s). This kills the previous screen
        session and creates a new one executing cmsResourceService -a CONTEST_ID.""",
    )
    restart_parser.add_argument("host", nargs="?", default="all")

    copy_parser = subparsers.add_parser(
        "copy",
        help="""
                 Copy the cms.conf file to the host(s).
                 This command expects write permissions to /usr/local/etc/cms.conf.
                 The cms.conf file is created from a sample one by filling the core_services and
                 database fields with the correct information as described in the host configuration file.
                 """,
    )
    copy_parser.add_argument("host", nargs="?", default="all")

    copy_parser.add_argument("--cms-conf", default="cms.conf")
    host_parser = subparsers.add_parser(
        "connect", help="Connect to remote host via ssh."
    )
    host_parser.add_argument("host")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    tools = CMSTools(args.host_conf, args.contest_id)
    if args.command == "stop":
        tools.stop(args.host)
    elif args.command == "restart":
        tools.restart(args.host)
    elif args.command == "copy":
        tools.copy(args.host, args.cms_conf)
    elif args.command == "connect":
        tools.connect(args.host)


if __name__ == "__main__":
    main()
