from services import export_helpers


def test_export_filename_uses_project_title_and_keeps_chinese_characters():
    """导出文件名应使用项目标题，并保留合法的中文字符。"""
    build_export_filename = getattr(export_helpers, "build_export_filename", None)

    assert callable(build_export_filename)
    assert build_export_filename("2026 年度经营/复盘", ".pptx", "presentation") == "2026 年度经营_复盘.pptx"
    assert build_export_filename("2026 年度经营复盘.pptx", ".pptx", "presentation") == "2026 年度经营复盘.pptx"


def test_export_filename_falls_back_when_project_title_is_empty():
    """项目标题为空时应使用稳定的通用名称，而不是数据库编号。"""
    build_export_filename = getattr(export_helpers, "build_export_filename", None)

    assert callable(build_export_filename)
    assert build_export_filename("  ", ".pdf", "presentation") == "presentation.pdf"
