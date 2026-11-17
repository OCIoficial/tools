from dataclasses import dataclass
from enum import Enum


class Keys(Enum):
    username = 0
    password = 1
    first_name = 2
    last_name = 3
    site = 4


@dataclass(kw_only=True, frozen=True)
class User:
    username: str
    password: str
    first_name: str
    last_name: str
