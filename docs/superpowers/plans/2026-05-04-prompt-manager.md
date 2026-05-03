# Prompt Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent prompt manager page that edits enabled database overrides for backend prompt stages.

**Architecture:** Backend prompt functions keep their current signatures and pass rendered default prompt text through a resolver. The resolver lazily syncs default prompt snapshots into `prompt_templates`, and enabled custom content overrides the rendered default. The frontend adds a focused `/prompt-manager` page with list, editor, save, and reset flows.

**Tech Stack:** Flask, SQLAlchemy, Alembic, pytest, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Backend Prompt Template Service

**Files:**
- Create: `backend/models/prompt_template.py`
- Create: `backend/services/prompt_template_service.py`
- Create: `backend/controllers/prompt_template_controller.py`
- Create: `backend/migrations/versions/20260504_add_prompt_templates.py`
- Modify: `backend/models/__init__.py`
- Modify: `backend/app.py`
- Test: `backend/tests/unit/test_prompt_template_service.py`
- Test: `backend/tests/unit/test_api_prompt_templates.py`

- [ ] **Step 1: Write failing service tests**

Create tests that assert default fallback, enabled override, disabled override, and reset behavior:

```python
from models import db
from services.prompt_template_service import (
    PROMPT_TEMPLATE_DEFINITIONS,
    get_effective_prompt,
    list_prompt_templates,
    reset_prompt_template,
    save_prompt_template,
)


def test_effective_prompt_returns_default_without_override(db_session):
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    assert prompt == "默认图片提示词"


def test_enabled_override_replaces_default_prompt(db_session):
    save_prompt_template("image_generation", "自定义图片提示词", True)
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    assert prompt == "自定义图片提示词"


def test_disabled_override_is_kept_but_not_used(db_session):
    save_prompt_template("image_generation", "暂存图片提示词", False)
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    item = next(t for t in list_prompt_templates() if t["key"] == "image_generation")
    assert prompt == "默认图片提示词"
    assert item["custom_content"] == "暂存图片提示词"
    assert item["enabled"] is False


def test_reset_prompt_template_clears_custom_content(db_session):
    save_prompt_template("image_generation", "自定义图片提示词", True)
    reset = reset_prompt_template("image_generation")
    prompt = get_effective_prompt("image_generation", "默认图片提示词")
    assert reset["custom_content"] == ""
    assert reset["enabled"] is False
    assert prompt == "默认图片提示词"


def test_registered_prompt_templates_are_listed(db_session):
    templates = list_prompt_templates()
    keys = {item["key"] for item in templates}
    assert set(PROMPT_TEMPLATE_DEFINITIONS) <= keys
```

- [ ] **Step 2: Run service tests and verify they fail**

Run: `cd backend && pytest tests/unit/test_prompt_template_service.py -v`
Expected: FAIL because `services.prompt_template_service` is missing.

- [ ] **Step 3: Implement backend model, service, controller, app registration, and migration**

Implement the files listed above. The service must expose `PROMPT_TEMPLATE_DEFINITIONS`, `list_prompt_templates`, `get_effective_prompt`, `save_prompt_template`, `reset_prompt_template`, and `resolve_prompt_template`. The controller must expose list, update, and reset endpoints under `/api/prompt-templates`.

- [ ] **Step 4: Run service tests and verify they pass**

Run: `cd backend && pytest tests/unit/test_prompt_template_service.py -v`
Expected: PASS.

- [ ] **Step 5: Write failing API tests**

Create API tests that assert list, update, validation, and reset:

```python
def test_prompt_templates_list_endpoint(client):
    response = client.get("/api/prompt-templates")
    data = response.get_json()
    assert response.status_code == 200
    assert data["success"] is True
    assert any(item["key"] == "image_generation" for item in data["data"]["templates"])


def test_prompt_template_update_endpoint(client):
    response = client.put(
        "/api/prompt-templates/image_generation",
        json={"custom_content": "自定义图片提示词", "enabled": True},
    )
    item = response.get_json()["data"]
    assert response.status_code == 200
    assert item["custom_content"] == "自定义图片提示词"
    assert item["enabled"] is True


def test_prompt_template_rejects_empty_enabled_content(client):
    response = client.put(
        "/api/prompt-templates/image_generation",
        json={"custom_content": "  ", "enabled": True},
    )
    assert response.status_code == 400


def test_prompt_template_reset_endpoint(client):
    client.put(
        "/api/prompt-templates/image_generation",
        json={"custom_content": "自定义图片提示词", "enabled": True},
    )
    response = client.post("/api/prompt-templates/image_generation/reset")
    item = response.get_json()["data"]
    assert response.status_code == 200
    assert item["custom_content"] == ""
    assert item["enabled"] is False
```

- [ ] **Step 6: Run API tests and verify they pass**

Run: `cd backend && pytest tests/unit/test_api_prompt_templates.py -v`
Expected: PASS.

- [ ] **Step 7: Commit backend service and API**

Run:

```bash
git add -A
git commit -m "新增提示词模板接口"
```

### Task 2: Prompt Resolver Integration

**Files:**
- Modify: `backend/services/prompts.py`
- Test: `backend/tests/unit/test_prompt_template_service.py`

- [ ] **Step 1: Add failing resolver integration test**

Add a test that saves an enabled override for `image_generation`, calls `get_image_generation_prompt`, and expects the custom prompt.

- [ ] **Step 2: Run the integration test and verify it fails**

Run: `cd backend && pytest tests/unit/test_prompt_template_service.py::test_image_generation_prompt_uses_enabled_override -v`
Expected: FAIL because prompt functions do not use the resolver yet.

- [ ] **Step 3: Add resolver calls to first-version prompt functions**

Import `resolve_prompt_template` in `prompts.py`. Wrap first-version scope functions after their default prompt text is built. Keep all existing function signatures unchanged.

- [ ] **Step 4: Run backend prompt tests**

Run: `cd backend && pytest tests/unit/test_prompt_template_service.py tests/unit/test_image_prompt_ratio.py tests/unit/test_descriptions_refinement_prompt.py tests/unit/test_style_recommendation_prompt_fallback.py -v`
Expected: PASS.

- [ ] **Step 5: Commit resolver integration**

Run:

```bash
git add -A
git commit -m "接入提示词覆盖解析"
```

### Task 3: Frontend Prompt Manager Page

**Files:**
- Create: `frontend/src/pages/PromptManager.tsx`
- Create: `frontend/src/pages/PromptManager.i18n.ts`
- Create: `frontend/src/pages/components/PromptTemplateEditor.tsx`
- Create: `frontend/src/pages/components/PromptTemplateList.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api/endpoints.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/Home.tsx`
- Test: `frontend/src/tests/pages/PromptManager.test.tsx`

- [ ] **Step 1: Write failing frontend page tests**

Create tests for loading, selecting, saving, and resetting a prompt template.

- [ ] **Step 2: Run frontend page tests and verify they fail**

Run: `cd frontend && npm test -- --run src/tests/pages/PromptManager.test.tsx`
Expected: FAIL because the page and API helpers are missing.

- [ ] **Step 3: Implement API types and helpers**

Add `PromptTemplate`, `PromptTemplatesResponse`, `getPromptTemplates`, `updatePromptTemplate`, and `resetPromptTemplate`.

- [ ] **Step 4: Implement page and components**

Build a focused page with route `/prompt-manager`, list sidebar, editor pane, save, enable switch, and reset confirmation.

- [ ] **Step 5: Add home navigation entry**

Add a compact “提示词管理” entry next to the existing management links without expanding `Settings.tsx`.

- [ ] **Step 6: Run frontend tests**

Run: `cd frontend && npm test -- --run src/tests/pages/PromptManager.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit frontend page**

Run:

```bash
git add -A
git commit -m "新增提示词管理页面"
```

### Task 4: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend focused tests**

Run: `cd backend && pytest tests/unit/test_prompt_template_service.py tests/unit/test_api_prompt_templates.py tests/unit/test_image_prompt_ratio.py tests/unit/test_descriptions_refinement_prompt.py -v`
Expected: PASS.

- [ ] **Step 2: Run frontend focused tests**

Run: `cd frontend && npm test -- --run src/tests/pages/PromptManager.test.tsx`
Expected: PASS.

- [ ] **Step 3: Check git status**

Run: `git status --short`
Expected: only intentional files changed, or clean after commits.
