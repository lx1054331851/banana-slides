"""Alembic migration graph regression checks."""

from collections import Counter
from pathlib import Path
import re


REVISION_PATTERN = re.compile(r"^revision\s*=\s*['\"](.+?)['\"]", re.MULTILINE)
DOWN_REVISION_PATTERN = re.compile(r"^down_revision\s*=\s*(.+)$", re.MULTILINE)


def test_migration_revisions_are_unique():
    versions_dir = Path(__file__).resolve().parents[2] / 'migrations' / 'versions'

    revisions = []
    for migration_file in versions_dir.glob('*.py'):
        content = migration_file.read_text(encoding='utf-8')
        match = REVISION_PATTERN.search(content)
        assert match is not None, f'missing revision in {migration_file.name}'
        revisions.append(match.group(1))

    duplicates = [revision for revision, count in Counter(revisions).items() if count > 1]
    assert duplicates == [], f'duplicate Alembic revisions found: {duplicates}'


def test_migration_graph_has_single_head():
    versions_dir = Path(__file__).resolve().parents[2] / 'migrations' / 'versions'

    revisions = set()
    referenced_down_revisions = set()

    for migration_file in versions_dir.glob('*.py'):
        content = migration_file.read_text(encoding='utf-8')

        revision_match = REVISION_PATTERN.search(content)
        assert revision_match is not None, f'missing revision in {migration_file.name}'
        revisions.add(revision_match.group(1))

        down_revision_match = DOWN_REVISION_PATTERN.search(content)
        assert down_revision_match is not None, f'missing down_revision in {migration_file.name}'
        down_revision = down_revision_match.group(1).strip()

        if down_revision == 'None':
            continue

        if down_revision.startswith('('):
            referenced_down_revisions.update(re.findall(r"['\"](.+?)['\"]", down_revision))
            continue

        referenced_down_revisions.add(down_revision.strip("'\""))

    heads = sorted(revisions - referenced_down_revisions)
    assert len(heads) == 1, f'expected exactly one Alembic head, found: {heads}'

