"""
Image Compression Service - export-time image compression using mozjpeg + butteraugli
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image

from .file_service import convert_image_to_rgb

logger = logging.getLogger(__name__)


_FLOAT_RE = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def _default_bin_paths(name: str) -> list[str]:
    if name in ("cjpeg", "mozjpeg"):
        return [
            "/opt/homebrew/opt/mozjpeg/bin/cjpeg",
            "/usr/local/opt/mozjpeg/bin/cjpeg",
            "/opt/homebrew/bin/cjpeg",
            "/usr/local/bin/cjpeg",
            "/usr/bin/cjpeg",
        ]
    if name == "butteraugli":
        return [
            "/opt/homebrew/opt/libjxl/bin/butteraugli",
            "/usr/local/opt/libjxl/bin/butteraugli",
            "/opt/homebrew/bin/butteraugli",
            "/usr/local/bin/butteraugli",
            "/usr/bin/butteraugli",
        ]
    if name == "oxipng":
        return [
            "/opt/homebrew/opt/oxipng/bin/oxipng",
            "/usr/local/opt/oxipng/bin/oxipng",
            "/opt/homebrew/bin/oxipng",
            "/usr/local/bin/oxipng",
            "/usr/bin/oxipng",
        ]
    if name == "pngquant":
        return [
            "/opt/homebrew/opt/pngquant/bin/pngquant",
            "/usr/local/opt/pngquant/bin/pngquant",
            "/opt/homebrew/bin/pngquant",
            "/usr/local/bin/pngquant",
            "/usr/bin/pngquant",
        ]
    return []


def _resolve_bin(path_or_name: str) -> Optional[str]:
    if not path_or_name:
        return None
    candidate = Path(path_or_name)
    if candidate.exists() and candidate.is_file():
        return str(candidate)
    resolved = shutil.which(path_or_name)
    if resolved:
        return resolved
    for p in _default_bin_paths(path_or_name):
        if os.path.exists(p):
            return p
    return None


class ImageCompressionService:
    def __init__(
        self,
        mozjpeg_bin: Optional[str] = None,
        butteraugli_bin: Optional[str] = None,
        oxipng_bin: Optional[str] = None,
        pngquant_bin: Optional[str] = None,
    ):
        self.mozjpeg_bin = _resolve_bin(mozjpeg_bin or os.getenv('MOZJPEG_BIN', 'cjpeg'))
        self.butteraugli_bin = _resolve_bin(butteraugli_bin or os.getenv('BUTTERAUGLI_BIN', 'butteraugli'))
        self.oxipng_bin = _resolve_bin(oxipng_bin or os.getenv('OXIPNG_BIN', 'oxipng'))
        self.pngquant_bin = _resolve_bin(pngquant_bin or os.getenv('PNGQUANT_BIN', 'pngquant'))

    def has_mozjpeg(self) -> bool:
        return bool(self.mozjpeg_bin)

    def has_butteraugli(self) -> bool:
        return bool(self.butteraugli_bin)

    def has_oxipng(self) -> bool:
        return bool(self.oxipng_bin)

    def has_pngquant(self) -> bool:
        return bool(self.pngquant_bin)

    def _prepare_ppm(self, src_path: str, out_path: str) -> None:
        image = Image.open(src_path)
        image = convert_image_to_rgb(image)
        image.save(out_path, format='PPM')

    def compress_jpeg_mozjpeg(
        self,
        src_path: str,
        dst_path: str,
        quality: int = 92,
        subsampling: int = 0,
        progressive: bool = True,
        optimize: bool = True,
        timeout: int = 60,
    ) -> bool:
        if not self.mozjpeg_bin:
            logger.warning("mozjpeg binary not found; skip compression")
            return False

        quality = max(1, min(int(quality), 100))
        subsampling = subsampling if subsampling in (0, 1, 2) else 0
        sample_map = {0: "1x1", 1: "2x1", 2: "2x2"}

        with tempfile.TemporaryDirectory() as tmpdir:
            ppm_path = os.path.join(tmpdir, "input.ppm")
            self._prepare_ppm(src_path, ppm_path)

            cmd = [
                self.mozjpeg_bin,
                "-quality", str(quality),
                "-sample", sample_map[subsampling],
                "-outfile", dst_path,
            ]
            if optimize:
                cmd.append("-optimize")
            if progressive:
                cmd.append("-progressive")
            cmd.append(ppm_path)

            try:
                result = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=timeout,
                    check=False,
                )
            except Exception as exc:
                logger.warning(f"mozjpeg compress failed: {exc}")
                return False

            if result.returncode != 0:
                logger.warning(f"mozjpeg compress failed: {result.stderr.decode('utf-8', 'ignore')}")
                return False

        return os.path.exists(dst_path)

    def compress_with_pillow(
        self,
        src_path: str,
        dst_path: str,
        fmt: str,
        quality_or_level: int,
    ) -> bool:
        fmt_upper = fmt.upper()
        try:
            image = Image.open(src_path)
            if fmt_upper == "JPEG":
                image = convert_image_to_rgb(image)
                quality = max(1, min(int(quality_or_level), 100))
                image.save(dst_path, format="JPEG", quality=quality, optimize=True)
            elif fmt_upper == "PNG":
                level = max(0, min(int(quality_or_level), 9))
                image.save(dst_path, format="PNG", optimize=True, compress_level=level)
            elif fmt_upper == "WEBP":
                quality = max(1, min(int(quality_or_level), 100))
                image.save(dst_path, format="WEBP", quality=quality, method=6)
            else:
                return False
            return os.path.exists(dst_path)
        except Exception as exc:
            logger.warning(f"Pillow compress failed for {fmt_upper}: {exc}")
            return False

    def compress_png_oxipng(self, src_path: str, dst_path: str, level: int = 4, timeout: int = 60) -> bool:
        if not self.oxipng_bin:
            return False
        lvl = max(0, min(int(level), 6))
        try:
            cmd = [
                self.oxipng_bin,
                f"-o{lvl}",
                "--strip",
                "safe",
                "--out",
                dst_path,
                src_path,
            ]
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
                check=False,
            )
            if result.returncode != 0:
                logger.warning(f"oxipng failed: {result.stderr.decode('utf-8', 'ignore')}")
                return False
            return os.path.exists(dst_path)
        except Exception as exc:
            logger.warning(f"oxipng compress failed: {exc}")
            return False

    def compress_png_quantize(
        self,
        src_path: str,
        dst_path: str,
        colors: int = 256,
        dithering: float = 1.0,
        speed: int = 3,
        timeout: int = 120,
    ) -> bool:
        if not self.pngquant_bin:
            return False
        color_count = max(2, min(int(colors), 256))
        try:
            dither_val = float(dithering)
        except (TypeError, ValueError):
            dither_val = 1.0
        dither_val = max(0.0, min(dither_val, 1.0))
        speed_val = max(1, min(int(speed), 11))

        try:
            cmd = [
                self.pngquant_bin,
                "--force",
                "--output",
                dst_path,
                "--speed",
                str(speed_val),
                "--colors",
                str(color_count),
            ]
            if dither_val <= 0:
                cmd.append("--nofs")
            cmd.append(src_path)

            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
                check=False,
            )
            if result.returncode != 0:
                logger.warning(f"pngquant failed: {result.stderr.decode('utf-8', 'ignore')}")
                return False
            return os.path.exists(dst_path)
        except Exception as exc:
            logger.warning(f"pngquant compress failed: {exc}")
            return False

    def _parse_butteraugli_score(self, output: str) -> Optional[float]:
        matches = _FLOAT_RE.findall(output or "")
        if not matches:
            return None
        try:
            return float(matches[-1])
        except ValueError:
            return None

    def butteraugli_score(
        self,
        ref_path: str,
        dist_path: str,
        timeout: int = 30,
    ) -> Optional[float]:
        if not self.butteraugli_bin:
            logger.warning("butteraugli binary not found; skip auto compression")
            return None

        def _run(args) -> Optional[float]:
            try:
                result = subprocess.run(
                    args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=timeout,
                    check=False,
                )
            except Exception as exc:
                logger.warning(f"butteraugli run failed: {exc}")
                return None
            if result.returncode != 0:
                return None
            out = result.stdout.decode('utf-8', 'ignore') + "\n" + result.stderr.decode('utf-8', 'ignore')
            return self._parse_butteraugli_score(out)

        # Try 2-arg form
        score = _run([self.butteraugli_bin, ref_path, dist_path])
        if score is not None:
            return score

        # Try 3-arg form with diff output
        with tempfile.TemporaryDirectory() as tmpdir:
            diff_path = os.path.join(tmpdir, "diff.png")
            return _run([self.butteraugli_bin, ref_path, dist_path, diff_path])

    def compress_jpeg_auto(
        self,
        src_path: str,
        tmp_dir: str,
        target: float = 1.0,
        min_quality: int = 60,
        max_quality: int = 95,
        max_trials: int = 6,
        subsampling: int = 0,
        progressive: bool = True,
        optimize: bool = True,
    ) -> Optional[Tuple[str, int, float]]:
        if not self.has_mozjpeg() or not self.has_butteraugli():
            return None

        min_quality = max(1, min(int(min_quality), 100))
        max_quality = max(1, min(int(max_quality), 100))
        if min_quality > max_quality:
            min_quality, max_quality = max_quality, min_quality
        max_trials = max(1, min(int(max_trials), 12))

        ref_ppm = os.path.join(tmp_dir, "ref.ppm")
        self._prepare_ppm(src_path, ref_ppm)

        best = None  # (path, quality, score, size)
        low, high = min_quality, max_quality

        for _ in range(max_trials):
            if low > high:
                break
            q = (low + high) // 2
            out_path = os.path.join(tmp_dir, f"q{q}.jpg")
            ok = self.compress_jpeg_mozjpeg(
                src_path,
                out_path,
                quality=q,
                subsampling=subsampling,
                progressive=progressive,
                optimize=optimize,
            )
            if not ok:
                break

            dist_ppm = os.path.join(tmp_dir, f"q{q}.ppm")
            self._prepare_ppm(out_path, dist_ppm)
            score = self.butteraugli_score(ref_ppm, dist_ppm)
            if score is None:
                break

            if score <= target:
                size = os.path.getsize(out_path)
                if best is None or size < best[3]:
                    best = (out_path, q, score, size)
                high = q - 1
            else:
                low = q + 1

        if best:
            return best[0], best[1], best[2]

        # Fallback to max quality if no candidate met target
        out_path = os.path.join(tmp_dir, f"q{max_quality}.jpg")
        ok = self.compress_jpeg_mozjpeg(
            src_path,
            out_path,
            quality=max_quality,
            subsampling=subsampling,
            progressive=progressive,
            optimize=optimize,
        )
        if ok:
            return out_path, max_quality, -1.0
        return None
