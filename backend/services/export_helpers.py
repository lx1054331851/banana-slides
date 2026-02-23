"""
Shared helpers for export flows (sync/async).
"""
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from models import Project
from .image_compression_service import ImageCompressionService


def _coerce_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@contextmanager
def maybe_compress_export_images(project: Project, image_paths: list[str], allow_webp: bool = False) -> Iterator[list[str]]:
    """
    Optionally compress images for export (project-level settings).
    Returns a list of image paths; uses a temp dir for compressed outputs.
    """
    enabled = bool(project.export_compress_enabled)
    if not enabled:
        yield image_paths
        return

    fmt = (project.export_compress_format or 'jpeg').lower()
    if fmt == 'webp' and not allow_webp:
        fmt = 'jpeg'

    service = ImageCompressionService()
    with tempfile.TemporaryDirectory() as tmpdir:
        compressed: list[str] = []
        for src in image_paths:
            stem = Path(src).stem
            ext_map = {'jpeg': 'jpg', 'png': 'png', 'webp': 'webp'}
            out_ext = ext_map.get(fmt, 'jpg')
            out_path = os.path.join(tmpdir, f"{stem}.{out_ext}")

            subsampling = _coerce_int(project.export_compress_subsampling, 0)
            progressive = project.export_compress_progressive if project.export_compress_progressive is not None else True

            result_path = None
            quality = _coerce_int(project.export_compress_quality, 92)
            ok = False
            if fmt == 'jpeg':
                if service.has_mozjpeg():
                    ok = service.compress_jpeg_mozjpeg(
                        src,
                        out_path,
                        quality=quality,
                        subsampling=subsampling,
                        progressive=progressive,
                        optimize=True,
                    )
                if not ok:
                    ok = service.compress_with_pillow(src, out_path, "JPEG", quality)
            elif fmt == 'png':
                # map quality (1-100) to compress_level (0-9) if needed
                level = quality if 0 <= quality <= 9 else round((max(1, min(quality, 100)) / 100) * 9)
                if service.has_oxipng():
                    ok = service.compress_png_oxipng(src, out_path, level=level)
                else:
                    ok = service.compress_with_pillow(src, out_path, "PNG", level)
            elif fmt == 'webp':
                ok = service.compress_with_pillow(src, out_path, "WEBP", quality)
            if ok:
                result_path = out_path

            compressed.append(result_path or src)

        yield compressed
