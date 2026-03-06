from __future__ import annotations

import subprocess


class SystemRestarter:
    def restart(self):
        subprocess.Popen(["sudo", "shutdown", "-r", "now"])
