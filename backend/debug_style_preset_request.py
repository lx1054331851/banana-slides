import json
import sqlite3
import sys
import time
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app import create_app  # noqa: E402
from models.settings import Settings  # noqa: E402
from services.ai_service_manager import clear_ai_service_cache, get_ai_service  # noqa: E402
from services.prompts import get_style_recommendations_prompt  # noqa: E402
from services.style_preview_service import _normalize_single_style_recommendation  # noqa: E402
from services.provider_routing import resolve_routing_bundle  # noqa: E402


DEFAULT_TASK_ID = "1be71111-cf52-4de9-a936-2592755506d8"


def load_task_payload(task_id: str) -> dict:
    db_path = ROOT / "instance" / "database-feature-lee-new.db"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("select progress from tasks where id = ?", (task_id,)).fetchone()
        if not row:
            raise RuntimeError(f"Task not found: {task_id}")
        progress = json.loads(row["progress"] or "{}")
        return {
            "task_id": task_id,
            "template_json": progress.get("template_json") or "",
            "style_requirements": progress.get("style_requirements") or "",
            "preset_name": progress.get("preset_name") or "",
        }
    finally:
        conn.close()


def main() -> int:
    task_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TASK_ID
    payload = load_task_payload(task_id)

    app = create_app()
    with app.app_context():
        settings = Settings.get_settings()
        routing_bundle = resolve_routing_bundle(project=None, generation_override=None)
        clear_ai_service_cache()
        ai_service = get_ai_service(force_new=True, routing_bundle=routing_bundle)

        prompt = get_style_recommendations_prompt(
            project_dict={},
            reference_files_content=[],
            template_json_text=payload["template_json"],
            style_requirements=payload["style_requirements"],
            language=app.config.get("OUTPUT_LANGUAGE", "zh"),
        )

        print("=== Effective Config ===")
        print(
            json.dumps(
                {
                    "task_id": task_id,
                    "ai_provider_format": app.config.get("AI_PROVIDER_FORMAT"),
                    "text_model_source": app.config.get("TEXT_MODEL_SOURCE"),
                    "text_model": app.config.get("TEXT_MODEL"),
                    "openai_api_base": app.config.get("OPENAI_API_BASE"),
                    "text_api_base": app.config.get("TEXT_API_BASE"),
                    "api_key_length": len(settings.api_key or ""),
                    "text_api_key_length": len(settings.text_api_key or ""),
                    "route_provider": routing_bundle.text.provider,
                    "route_source": routing_bundle.text.source,
                    "route_model": routing_bundle.text.model,
                    "route_api_base": routing_bundle.text.api_base,
                    "route_fingerprint": routing_bundle.text.fingerprint,
                    "template_json_length": len(payload["template_json"]),
                    "style_requirements_length": len(payload["style_requirements"]),
                    "prompt_length": len(prompt),
                },
                ensure_ascii=False,
                indent=2,
            )
        )

        print("\n=== Prompt Head ===")
        print(prompt[:3000])

        started = time.perf_counter()
        try:
            result = ai_service.generate_json(prompt, thinking_budget=0)
            elapsed = round(time.perf_counter() - started, 2)
            normalized = _normalize_single_style_recommendation(result)
            print("\n=== Result Summary ===")
            print(
                json.dumps(
                    {
                        "elapsed_seconds": elapsed,
                        "normalized_name": normalized.get("name"),
                        "style_json_keys": list((normalized.get("style_json") or {}).keys())[:20],
                        "sample_page_keys": list((normalized.get("sample_pages") or {}).keys())[:20],
                        "preview_slot_count": len(normalized.get("preview_slots") or []),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        except Exception as exc:
            elapsed = round(time.perf_counter() - started, 2)
            print("\n=== Request Failed ===")
            print(json.dumps({"elapsed_seconds": elapsed, "error_type": type(exc).__name__, "error": str(exc)}, ensure_ascii=False, indent=2))
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
