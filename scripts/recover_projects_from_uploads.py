"""
Recover minimal project/page records from the uploads folder.

This is a best-effort recovery tool for cases where SQLite database history was lost
but generated images still exist under ./uploads/{project_id}/pages.

Notes:
- Recovered projects will have placeholder metadata (idea_prompt, etc.).
- Page order is inferred by file modified time (v1 PNG), which may not match original order.
- The script is non-destructive by default (dry-run). Use --apply to write to DB.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional


PROJECT_ID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
PAGE_FILE_RE = re.compile(r"^(?P<page_id>[0-9a-fA-F-]{36})_v(?P<ver>\d+)\.(?P<ext>png|jpg|jpeg|webp)$", re.IGNORECASE)


@dataclass
class PageArtifact:
    page_id: str
    version: int
    ext: str
    rel_path: str
    mtime: float


def _is_uuid36(s: str) -> bool:
    if not PROJECT_ID_RE.match(s):
        return False
    try:
        uuid.UUID(s)
        return True
    except Exception:
        return False


def _scan_project_pages(upload_root: Path, project_id: str) -> list[PageArtifact]:
    pages_dir = upload_root / project_id / "pages"
    if not pages_dir.is_dir():
        return []

    artifacts: dict[tuple[str, int], PageArtifact] = {}
    for p in pages_dir.iterdir():
        if not p.is_file():
            continue
        m = PAGE_FILE_RE.match(p.name)
        if not m:
            continue
        page_id = m.group("page_id")
        version = int(m.group("ver"))
        ext = m.group("ext").lower()
        rel = (Path(project_id) / "pages" / p.name).as_posix()
        artifacts[(page_id, version)] = PageArtifact(
            page_id=page_id,
            version=version,
            ext=ext,
            rel_path=rel,
            mtime=p.stat().st_mtime,
        )

    return list(artifacts.values())


def _pick_latest_version(artifacts: list[PageArtifact]) -> dict[str, PageArtifact]:
    latest: dict[str, PageArtifact] = {}
    for a in artifacts:
        prev = latest.get(a.page_id)
        if prev is None or a.version > prev.version or (a.version == prev.version and a.mtime > prev.mtime):
            latest[a.page_id] = a
    return latest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--uploads", default="uploads", help="Uploads folder (default: ./uploads)")
    parser.add_argument("--apply", action="store_true", help="Actually write recovered records into DB")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of projects to process (0 = no limit)")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    upload_root = (repo_root / args.uploads).resolve()
    if not upload_root.is_dir():
        print(f"Uploads folder not found: {upload_root}", file=sys.stderr)
        return 2

    # Ensure backend is importable
    sys.path.insert(0, str((repo_root / "backend").resolve()))

    from app import create_app  # noqa: E402
    from models import db, Project, Page  # noqa: E402

    app = create_app()

    project_dirs = [p for p in upload_root.iterdir() if p.is_dir() and _is_uuid36(p.name)]
    project_dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    if args.limit and args.limit > 0:
        project_dirs = project_dirs[: args.limit]

    if not project_dirs:
        print("No project folders found under uploads/.")
        return 0

    print(f"Found {len(project_dirs)} upload project folders.")

    with app.app_context():
        for proj_dir in project_dirs:
            project_id = proj_dir.name

            artifacts = _scan_project_pages(upload_root, project_id)
            latest = _pick_latest_version(artifacts)
            if not latest:
                continue

            existing = Project.query.get(project_id)
            if existing:
                print(f"- skip existing project {project_id} (already in DB)")
                continue

            created_at = datetime.utcfromtimestamp(proj_dir.stat().st_mtime)
            updated_at = created_at

            page_entries = list(latest.values())
            page_entries.sort(key=lambda a: a.mtime)

            print(f"- recover project {project_id}: pages={len(page_entries)}")
            if not args.apply:
                continue

            project = Project(
                id=project_id,
                creation_type="idea",
                idea_prompt=f"[Recovered] {project_id}",
                status="DRAFT",
                created_at=created_at,
                updated_at=created_at,
            )
            db.session.add(project)

            for order_index, a in enumerate(page_entries):
                # Prefer jpg thumb if exists, since frontend uses cached_url for preview
                thumb_name = f"{a.page_id}_v{a.version}_thumb.jpg"
                thumb_abs = upload_root / project_id / "pages" / thumb_name
                cached_rel = (Path(project_id) / "pages" / thumb_name).as_posix() if thumb_abs.is_file() else None

                updated_at = max(updated_at, datetime.utcfromtimestamp(a.mtime))

                page = Page(
                    id=a.page_id,
                    project_id=project_id,
                    order_index=order_index,
                    status="DRAFT",
                    generated_image_path=a.rel_path,
                    cached_image_path=cached_rel,
                    created_at=created_at,
                    updated_at=updated_at,
                )
                page.set_outline_content({"title": f"Page {order_index + 1}", "points": []})
                db.session.add(page)

            project.updated_at = updated_at
            db.session.commit()

    if args.apply:
        print("Recovery applied.")
    else:
        print("Dry-run only. Re-run with --apply to write recovered records into DB.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

