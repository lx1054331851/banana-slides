#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from pathlib import Path

THIS_FILE = Path(__file__).resolve()
BUNDLE_ROOT = THIS_FILE.parents[1]
REPO_ROOT = Path.cwd().resolve()


def load_defaults(repo_root: Path):
    backend_dir = repo_root / 'backend'
    sys.path.insert(0, str(backend_dir))
    try:
        from config import Config, get_default_sqlite_db_path  # type: ignore
        return Path(get_default_sqlite_db_path()), Path(Config.UPLOAD_FOLDER)
    except Exception:
        return backend_dir / 'instance' / 'database.db', repo_root / 'uploads'


def rows_exist(conn, table, row_id):
    return conn.execute(f'select 1 from {table} where id=? limit 1', (row_id,)).fetchone() is not None


def insert_or_replace(conn, table, row, replace=False):
    exists = rows_exist(conn, table, row['id'])
    if exists and not replace:
        return 'skipped'
    cols = list(row.keys())
    sql = ('insert or replace' if replace else 'insert') + f" into {table} ({','.join(cols)}) values ({','.join('?' for _ in cols)})"
    conn.execute(sql, tuple(row.get(c) for c in cols))
    return 'replaced' if exists else 'inserted'


def main():
    """Import style library rows and copy bundled preset assets when needed."""
    default_db, default_uploads = load_defaults(REPO_ROOT)
    parser = argparse.ArgumentParser(description='Import Banana Slides JSON style templates/presets from project transfer bundle.')
    parser.add_argument('--db-path', default=str(default_db), help=f'SQLite DB path (default: {default_db})')
    parser.add_argument('--uploads-dir', default=str(default_uploads), help=f'Uploads dir (default: {default_uploads})')
    parser.add_argument('--on-conflict', choices=['skip', 'replace'], default='skip')
    args = parser.parse_args()

    data_path = BUNDLE_ROOT / 'style-library' / 'data.json'
    data = json.loads(data_path.read_text(encoding='utf-8'))
    replace = args.on_conflict == 'replace'

    db_path = Path(args.db_path).resolve()
    uploads_dir = Path(args.uploads_dir).resolve()
    if not db_path.exists():
        raise FileNotFoundError(f'DB file not found: {db_path}')

    stats = {'style_templates': {}, 'style_presets': {}}
    with sqlite3.connect(db_path) as conn:
        for row in data.get('style_templates', []):
            status = insert_or_replace(conn, 'style_templates', row, replace=replace)
            stats['style_templates'][status] = stats['style_templates'].get(status, 0) + 1
        for row in data.get('style_presets', []):
            status = insert_or_replace(conn, 'style_presets', row, replace=replace)
            stats['style_presets'][status] = stats['style_presets'].get(status, 0) + 1
        conn.commit()

    src_style_dir = BUNDLE_ROOT / 'uploads' / 'style-presets'
    if src_style_dir.exists():
        dst_style_dir = uploads_dir / 'style-presets'
        dst_style_dir.mkdir(parents=True, exist_ok=True)
        if src_style_dir.resolve() != dst_style_dir.resolve():
            for child in src_style_dir.iterdir():
                if child.is_dir():
                    shutil.copytree(child, dst_style_dir / child.name, dirs_exist_ok=True)

    print(json.dumps({'success': True, 'db_path': str(db_path), 'uploads_dir': str(uploads_dir), 'stats': stats}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
