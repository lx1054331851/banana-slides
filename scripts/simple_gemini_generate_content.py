import argparse
import base64
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv


def build_endpoint(base_url: str, model: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1beta"):
        return f"{base}/models/{model}:generateContent"
    if base.endswith("/v1"):
        return f"{base[:-3]}/v1beta/models/{model}:generateContent"
    return f"{base}/v1beta/models/{model}:generateContent"


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Simple Gemini generateContent image test")
    parser.add_argument("--prompt", default="一只戴墨镜的香蕉在沙滩上", help="Prompt text")
    parser.add_argument("--aspect-ratio", default="1:1", help="Image aspect ratio, e.g. 1:1")
    parser.add_argument("--image-size", default="1024", help="Image size value")
    parser.add_argument("--output", default="outputs/gemini_test.png", help="Output image path")
    parser.add_argument("--timeout", type=int, default=120, help="Request timeout in seconds")
    args = parser.parse_args()

    api_base = os.getenv("IMAGE_API_BASE") or os.getenv("GOOGLE_API_BASE")
    api_key = os.getenv("IMAGE_API_KEY") or os.getenv("GOOGLE_API_KEY")
    model = os.getenv("IMAGE_MODEL") or "gemini-2.5-flash-image-preview"

    if not api_base:
        raise ValueError("Missing API base. Set IMAGE_API_BASE or GOOGLE_API_BASE in .env")
    if not api_key:
        raise ValueError("Missing API key. Set IMAGE_API_KEY or GOOGLE_API_KEY in .env")

    url = build_endpoint(api_base, model)
    payload = {
        "contents": [{"parts": [{"text": args.prompt}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": args.aspect_ratio,
                "imageSize": args.image_size,
            },
        },
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    response = requests.post(url, headers=headers, json=payload, timeout=args.timeout)
    print(f"status={response.status_code}")

    if response.status_code >= 400:
        print(response.text)
        response.raise_for_status()

    data = response.json()

    image_b64 = None
    for candidate in data.get("candidates", []):
        content = candidate.get("content", {})
        for part in content.get("parts", []):
            inline_data = part.get("inlineData")
            if inline_data and inline_data.get("data"):
                image_b64 = inline_data["data"]
                break
        if image_b64:
            break

    if not image_b64:
        print("No image data found in response. Full response:")
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(base64.b64decode(image_b64))

    print(f"Image saved to: {output_path}")


if __name__ == "__main__":
    main()
