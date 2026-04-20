#!/usr/bin/env python3
"""Project transfer utility for Banana Slides.

Use this script to export/import a single project (DB rows + upload files)
between different machines.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[1]
DEFAULT_MANIFEST_NAME = "manifest.json"
DEFAULT_DATA_NAME = "data.json"


def _load_defaults() -> Tuple[str, str]:
    """Resolve default db path and uploads dir from backend config when possible."""
    backend_dir = REPO_ROOT / "backend"
    default_db = str(backend_dir / "instance" / "database.db")
    default_uploads = str(REPO_ROOT / "uploads")

    try:
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        from config import Config, get_default_sqlite_db_path  # type: ignore

        return str(get_default_sqlite_db_path()), str(Config.UPLOAD_FOLDER)
    except Exception:
        return default_db, default_uploads


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _rows_to_dicts(rows: Iterable[sqlite3.Row]) -> List[Dict[str, Any]]:
    return [dict(row) for row in rows]


def _select_where_project(conn: sqlite3.Connection, table: str, project_id: str) -> List[Dict[str, Any]]:
    rows = conn.execute(f"SELECT * FROM {table} WHERE project_id = ?", (project_id,)).fetchall()
    return _rows_to_dicts(rows)


def _select_page_versions(conn: sqlite3.Connection, page_ids: Sequence[str]) -> List[Dict[str, Any]]:
    if not page_ids:
        return []
    placeholders = ",".join("?" for _ in page_ids)
    sql = f"SELECT * FROM page_image_versions WHERE page_id IN ({placeholders})"
    rows = conn.execute(sql, tuple(page_ids)).fetchall()
    return _rows_to_dicts(rows)


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _normalize_rel(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.replace("\\", "/")


def _rewrite_project_prefix(value: Optional[str], source_project_id: str, target_project_id: str) -> Optional[str]:
    value = _normalize_rel(value)
    if value is None:
        return None
    src_prefix = f"{source_project_id}/"
    if value == source_project_id:
        return target_project_id
    if value.startswith(src_prefix):
        return f"{target_project_id}/{value[len(src_prefix):]}"
    return value


def _rewrite_url(url: Optional[str], source_project_id: str, target_project_id: str) -> Optional[str]:
    if url is None:
        return None
    return url.replace(f"/files/{source_project_id}/", f"/files/{target_project_id}/")


def _insert_rows(conn: sqlite3.Connection, table: str, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    columns = list(rows[0].keys())
    placeholders = ",".join("?" for _ in columns)
    cols_sql = ",".join(columns)
    sql = f"INSERT INTO {table} ({cols_sql}) VALUES ({placeholders})"
    payload = [tuple(row.get(col) for col in columns) for row in rows]
    conn.executemany(sql, payload)


def _project_exists(conn: sqlite3.Connection, project_id: str) -> bool:
    row = conn.execute("SELECT 1 FROM projects WHERE id = ? LIMIT 1", (project_id,)).fetchone()
    return row is not None


def _delete_project_cascade_sql(conn: sqlite3.Connection, project_id: str) -> None:
    conn.execute(
        "DELETE FROM page_image_versions WHERE page_id IN (SELECT id FROM pages WHERE project_id = ?)",
        (project_id,),
    )
    conn.execute("DELETE FROM pages WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM tasks WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM materials WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM reference_files WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))


def _copy_project_upload_dir(source_uploads: Path, source_project_id: str, bundle_root: Path) -> bool:
    src_dir = source_uploads / source_project_id
    if not src_dir.exists():
        return False
    dst_dir = bundle_root / "uploads" / source_project_id
    _ensure_parent(dst_dir)
    shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)
    return True


def _restore_project_upload_dir(bundle_root: Path, target_uploads: Path, source_project_id: str, target_project_id: str) -> bool:
    src_dir = bundle_root / "uploads" / source_project_id
    if not src_dir.exists():
        return False

    dst_dir = target_uploads / target_project_id
    dst_dir.parent.mkdir(parents=True, exist_ok=True)

    if source_project_id == target_project_id:
        shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)
        return True

    temp_copy = target_uploads / f".__import_tmp_{source_project_id}__"
    if temp_copy.exists():
        shutil.rmtree(temp_copy)
    shutil.copytree(src_dir, temp_copy, dirs_exist_ok=True)

    for root, _, files in os.walk(temp_copy):
        for filename in files:
            file_path = Path(root) / filename
            rel = file_path.relative_to(temp_copy)
            out_path = dst_dir / rel
            out_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, out_path)

    shutil.rmtree(temp_copy, ignore_errors=True)
    return True


def cmd_export(args: argparse.Namespace) -> int:
    db_path = Path(args.db_path).resolve()
    uploads_dir = Path(args.uploads_dir).resolve()
    output_zip = Path(args.output).resolve()

    if not db_path.exists():
        raise FileNotFoundError(f"DB file not found: {db_path}")

    with _connect(str(db_path)) as conn:
        project = conn.execute("SELECT * FROM projects WHERE id = ?", (args.project_id,)).fetchone()
        if not project:
            raise ValueError(f"Project not found: {args.project_id}")

        project_row = dict(project)
        pages = _select_where_project(conn, "pages", args.project_id)
        page_ids = [row["id"] for row in pages]
        versions = _select_page_versions(conn, page_ids)
        materials = _select_where_project(conn, "materials", args.project_id)
        reference_files = _select_where_project(conn, "reference_files", args.project_id)

    export_payload = {
        "project": project_row,
        "pages": pages,
        "page_image_versions": versions,
        "materials": materials,
        "reference_files": reference_files,
    }

    manifest = {
        "schema_version": 1,
        "created_at": dt.datetime.utcnow().isoformat() + "Z",
        "source_project_id": args.project_id,
        "source_db_path": str(db_path),
        "source_uploads_dir": str(uploads_dir),
        "records": {
            "projects": 1,
            "pages": len(pages),
            "page_image_versions": len(versions),
            "materials": len(materials),
            "reference_files": len(reference_files),
        },
    }

    with tempfile.TemporaryDirectory(prefix="banana_project_export_") as tmpdir:
        tmp_root = Path(tmpdir)
        _write_json(tmp_root / DEFAULT_MANIFEST_NAME, manifest)
        _write_json(tmp_root / DEFAULT_DATA_NAME, export_payload)

        files_copied = _copy_project_upload_dir(uploads_dir, args.project_id, tmp_root)
        manifest["includes_upload_files"] = bool(files_copied)
        _write_json(tmp_root / DEFAULT_MANIFEST_NAME, manifest)

        _ensure_parent(output_zip)
        with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path in tmp_root.rglob("*"):
                if path.is_file():
                    zf.write(path, path.relative_to(tmp_root).as_posix())

    print(f"Exported project {args.project_id} -> {output_zip}")
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    db_path = Path(args.db_path).resolve()
    uploads_dir = Path(args.uploads_dir).resolve()
    archive_path = Path(args.archive).resolve()

    if not db_path.exists():
        raise FileNotFoundError(f"DB file not found: {db_path}")
    if not archive_path.exists():
        raise FileNotFoundError(f"Archive not found: {archive_path}")

    with tempfile.TemporaryDirectory(prefix="banana_project_import_") as tmpdir:
        tmp_root = Path(tmpdir)
        with zipfile.ZipFile(archive_path, "r") as zf:
            zf.extractall(tmp_root)

        manifest = _read_json(tmp_root / DEFAULT_MANIFEST_NAME)
        data = _read_json(tmp_root / DEFAULT_DATA_NAME)

        source_project_id = manifest.get("source_project_id")
        if not source_project_id:
            raise ValueError("Invalid archive: source_project_id missing")

        target_project_id = args.target_project_id or source_project_id

        project_row = dict(data["project"])
        pages = [dict(x) for x in data.get("pages", [])]
        versions = [dict(x) for x in data.get("page_image_versions", [])]
        materials = [dict(x) for x in data.get("materials", [])]
        reference_files = [dict(x) for x in data.get("reference_files", [])]

        project_row["id"] = target_project_id
        project_row["template_image_path"] = _rewrite_project_prefix(project_row.get("template_image_path"), source_project_id, target_project_id)

        for row in pages:
            row["project_id"] = target_project_id
            row["generated_image_path"] = _rewrite_project_prefix(row.get("generated_image_path"), source_project_id, target_project_id)
            row["cached_image_path"] = _rewrite_project_prefix(row.get("cached_image_path"), source_project_id, target_project_id)

        for row in versions:
            row["image_path"] = _rewrite_project_prefix(row.get("image_path"), source_project_id, target_project_id)

        for row in materials:
            row["project_id"] = target_project_id
            row["relative_path"] = _rewrite_project_prefix(row.get("relative_path"), source_project_id, target_project_id)
            row["url"] = _rewrite_url(row.get("url"), source_project_id, target_project_id)

        for row in reference_files:
            row["project_id"] = target_project_id
            row["file_path"] = _rewrite_project_prefix(row.get("file_path"), source_project_id, target_project_id)

        with _connect(str(db_path)) as conn:
            try:
                if _project_exists(conn, target_project_id):
                    if args.on_conflict == "fail":
                        raise ValueError(
                            f"Target project already exists: {target_project_id}. "
                            "Use --on-conflict replace or provide --target-project-id."
                        )
                    if args.on_conflict == "replace":
                        _delete_project_cascade_sql(conn, target_project_id)

                _insert_rows(conn, "projects", [project_row])
                _insert_rows(conn, "pages", pages)
                _insert_rows(conn, "page_image_versions", versions)
                _insert_rows(conn, "materials", materials)
                _insert_rows(conn, "reference_files", reference_files)

                conn.commit()
            except Exception:
                conn.rollback()
                raise

        uploads_dir.mkdir(parents=True, exist_ok=True)
        restored = _restore_project_upload_dir(tmp_root, uploads_dir, source_project_id, target_project_id)

    print(f"Imported archive {archive_path} -> project {target_project_id}")
    if not restored:
        print("Warning: archive does not contain uploads/<project_id> directory; DB records imported only.")
    return 0


def build_parser(default_db: str, default_uploads: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export/import Banana Slides project data for cross-machine migration."
    )
    parser.add_argument("--db-path", default=default_db, help=f"SQLite DB path (default: {default_db})")
    parser.add_argument("--uploads-dir", default=default_uploads, help=f"Uploads directory (default: {default_uploads})")

    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Export one project into a zip archive")
    export_parser.add_argument("--project-id", required=True, help="Project ID to export")
    export_parser.add_argument("--output", required=True, help="Output zip file path")
    export_parser.set_defaults(func=cmd_export)

    import_parser = subparsers.add_parser("import", help="Import one project from a zip archive")
    import_parser.add_argument("--archive", required=True, help="Input zip file path")
    import_parser.add_argument("--target-project-id", help="Override project ID on import")
    import_parser.add_argument(
        "--on-conflict",
        choices=["fail", "replace"],
        default="fail",
        help="When target project already exists: fail (default) or replace",
    )
    import_parser.set_defaults(func=cmd_import)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    default_db, default_uploads = _load_defaults()
    parser = build_parser(default_db, default_uploads)
    args = parser.parse_args(argv)

    try:
        return args.func(args)
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
