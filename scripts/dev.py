"""在 macOS/Linux 上管理本地前后端开发进程及其退出清理。"""

import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


def stop_processes(processes):
    """停止本次启动的进程组，包括 Flask 重载器和 Vite 子进程。"""
    for process in processes:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + 5
    for process in processes:
        try:
            process.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def main():
    """启动两个服务，收到退出信号或任一服务退出时停止全部服务。"""
    if os.name != 'posix':
        print('此命令适用于 macOS/Linux；Windows 请使用 npm run dev:ps。', file=sys.stderr)
        return 1
    npm = shutil.which('npm')
    if not npm:
        print('未找到 npm，请先安装 Node.js。', file=sys.stderr)
        return 1

    root = Path(__file__).resolve().parent.parent
    processes = []
    stopping = False

    def request_stop(signum, frame):
        """记录退出请求，让主循环统一清理子进程。"""
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    commands = [
        ('后端', [sys.executable, '-u', 'app.py'], root / 'backend'),
        ('前端', [npm, 'run', 'dev', '--', '--strictPort'], root / 'frontend'),
    ]
    try:
        for name, command, directory in commands:
            if stopping:
                break
            process = subprocess.Popen(command, cwd=directory, start_new_session=True)
            processes.append(process)
            print(f'{name}已启动（PID {process.pid}）。', flush=True)
        print('端口沿用项目 .env 配置，按 Ctrl+C 同时停止前后端。', flush=True)
        while not stopping:
            for (name, _, _), process in zip(commands, processes):
                code = process.poll()
                if code is not None:
                    print(f'{name}已退出（退出码 {code}），正在停止全部服务。', flush=True)
                    return code if code >= 0 else 128 - code
            time.sleep(0.2)
        return 0
    finally:
        stop_processes(processes)


if __name__ == '__main__':
    sys.exit(main())
