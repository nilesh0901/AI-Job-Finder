"""
pdf.py — Convert ATS resume plain text → styled PDF bytes

Uses fpdf2 (pure Python, no native system libraries). WeasyPrint was dropped
because it needs GObject/Pango/Cairo shared libs that aren't present in
Railway's nixpacks image (the "cannot load library 'gobject-2.0-0'" 500).
fpdf2 has no such dependencies and runs anywhere.
"""

import re

from fpdf import FPDF

# Section headers = ALL-CAPS lines (SUMMARY, EXPERIENCE, SKILLS, etc.)
SECTION_RE = re.compile(r"^([A-Z][A-Z\s&/]{3,})$")

# Letter page, points. 0.75in margin = 54pt.
MARGIN = 54
LINE_H = 14


def resume_to_pdf(resume_text: str) -> bytes:
    """
    Convert plain-text ATS resume to a clean, professional PDF.
    Returns raw PDF bytes — caller uploads to Supabase Storage.
    """
    pdf = FPDF(format="Letter", unit="pt")
    pdf.set_auto_page_break(auto=True, margin=MARGIN)
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    pdf.add_page()

    width = pdf.w - pdf.l_margin - pdf.r_margin

    for raw in resume_text.strip().split("\n"):
        line = _sanitize(raw.strip())

        if not line:
            pdf.ln(5)
            continue

        if SECTION_RE.match(line):
            pdf.ln(4)
            pdf.set_font("Times", "B", 11)
            pdf.set_text_color(20, 20, 20)
            pdf.multi_cell(width, LINE_H, line.upper())
            rule_y = pdf.get_y() + 1
            pdf.set_draw_color(60, 60, 60)
            pdf.line(pdf.l_margin, rule_y, pdf.l_margin + width, rule_y)
            pdf.ln(5)
        elif line[0] in "•-*":
            content = line.lstrip("•-* ").strip()
            pdf.set_font("Times", "", 11)
            pdf.set_text_color(17, 17, 17)
            pdf.set_x(pdf.l_margin + 12)
            # · (middle dot) is latin-1 safe; fpdf2 core fonts reject U+2022.
            pdf.multi_cell(width - 12, LINE_H, f"·  {content}")
        else:
            pdf.set_font("Times", "", 11)
            pdf.set_text_color(17, 17, 17)
            pdf.multi_cell(width, LINE_H, line)

    return bytes(pdf.output())


def _sanitize(text: str) -> str:
    """
    Map common typographic characters to the latin-1 range so fpdf2's built-in
    Times font never chokes on smart quotes / em dashes / bullets (its core
    fonts are strict latin-1).
    """
    replacements = {
        "‘": "'", "’": "'",   # curly single quotes
        "“": '"', "”": '"',   # curly double quotes
        "–": "-", "—": "-",   # en / em dash
        "…": "...",                # ellipsis
        "•": "·",                  # bullet -> middle dot (latin-1 safe)
        " ": " ",                  # non-breaking space
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text.encode("latin-1", "replace").decode("latin-1")
