from types import SimpleNamespace

from services.ai_service import AIService


class _StreamProvider:
    def __init__(self, chunks):
        self.chunks = chunks

    def generate_text(self, prompt: str, thinking_budget: int = 0) -> str:
        return "".join(self.chunks)

    def generate_text_stream(self, prompt: str, thinking_budget: int = 0):
        for chunk in self.chunks:
            yield chunk


def _make_service(chunks):
    provider = _StreamProvider(chunks)
    service = AIService(
        text_provider=provider,
        image_provider=SimpleNamespace(),
        caption_provider=SimpleNamespace(),
    )
    service.enable_text_reasoning = False
    return service


def test_generate_json_stream_parses_chunked_json_object():
    service = _make_service(['{"recommend', 'ations":[{"name":"A"}]}'])

    result = service.generate_json_stream("irrelevant")

    assert result["recommendations"][0]["name"] == "A"


def test_generate_json_stream_extracts_json_from_fenced_text():
    service = _make_service(['```json\n', '{"recommendations":[{"name":"A"}]}', '\n```'])

    result = service.generate_json_stream("irrelevant")

    assert result["recommendations"][0]["name"] == "A"
