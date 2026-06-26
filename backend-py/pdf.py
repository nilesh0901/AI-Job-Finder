"""
pdf.py — Convert ATS resume plain text → styled PDF bytes
Uses WeasyPrint for server-side PDF generation (no external service needed)
"""

import re


def resume_to_pdf(resume_text: str) -> bytes:
    """
    Convert plain-text ATS resume to a clean, professional PDF.
    Returns raw PDF bytes — caller uploads to Supabase Storage.
    """
    from weasyprint import HTML

    html = _text_to_html(resume_text)
    pdf_bytes = HTML(string=html).write_pdf()
    return pdf_bytes


def _text_to_html(text: str) -> str:
    """Transform plain resume text into styled HTML for WeasyPrint."""

    # Section headers: ALL CAPS lines (SUMMARY, EXPERIENCE, SKILLS, etc.)
    SECTION_RE = re.compile(r"^([A-Z][A-Z\s&/]{3,})$", re.MULTILINE)

    lines = text.strip().split("\n")
    html_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            html_lines.append('<div class="spacer"></div>')
        elif SECTION_RE.match(stripped):
            html_lines.append(f'<h2 class="section">{stripped}</h2><hr class="rule"/>')
        elif stripped.startswith("•") or stripped.startswith("-"):
            content = stripped.lstrip("•- ").strip()
            html_lines.append(f'<li>{content}</li>')
        else:
            html_lines.append(f'<p>{stripped}</p>')

    body = "\n".join(html_lines)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @page {{
    size: Letter;
    margin: 0.75in 0.75in 0.75in 0.75in;
  }}

  * {{ box-sizing: border-box; margin: 0; padding: 0; }}

  body {{
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 11pt;
    color: #111;
    line-height: 1.45;
  }}

  h1.name {{
    font-size: 20pt;
    letter-spacing: 0.04em;
    text-align: center;
    margin-bottom: 2pt;
  }}

  h2.section {{
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 10pt;
    margin-bottom: 1pt;
    color: #1a1a1a;
  }}

  hr.rule {{
    border: none;
    border-top: 1px solid #333;
    margin-bottom: 5pt;
  }}

  p {{
    margin-bottom: 3pt;
  }}

  li {{
    margin-left: 16pt;
    margin-bottom: 2pt;
    list-style-type: disc;
  }}

  .spacer {{
    height: 4pt;
  }}
</style>
</head>
<body>
{body}
</body>
</html>"""
