"""Config database path resolution tests."""

from types import SimpleNamespace

import config


def test_branch_scoped_sqlite_db_path(monkeypatch):
    monkeypatch.setenv('BRANCH_SCOPED_SQLITE_DB', 'true')
    monkeypatch.delenv('BANANA_DB_NAMESPACE', raising=False)
    config._detect_git_branch.cache_clear()
    monkeypatch.setattr(
        config.subprocess,
        'run',
        lambda *args, **kwargs: SimpleNamespace(stdout='feature/test-branch\n'),
    )

    db_path = config.get_default_sqlite_db_path()

    assert db_path.endswith('backend/instance/database-feature-test-branch.db')


def test_shared_sqlite_db_path_can_be_restored(monkeypatch):
    monkeypatch.setenv('BRANCH_SCOPED_SQLITE_DB', 'false')
    monkeypatch.setenv('BANANA_DB_NAMESPACE', 'feature/ignored')
    config._detect_git_branch.cache_clear()

    db_path = config.get_default_sqlite_db_path()

    assert db_path.endswith('backend/instance/database.db')
