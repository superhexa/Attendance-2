"""Arabic-capable PDF generation for attendance reports (reportlab + reshaper + bidi)."""
import io
from pathlib import Path
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

_FONT_DIR = Path(__file__).parent / "assets" / "fonts"
_REGISTERED = False


def _ensure_fonts():
    global _REGISTERED
    if _REGISTERED:
        return
    pdfmetrics.registerFont(TTFont("Tajawal", str(_FONT_DIR / "Amiri-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Tajawal-Bold", str(_FONT_DIR / "Amiri-Bold.ttf")))
    _REGISTERED = True


def ar(text) -> str:
    """Reshape + reorder Arabic text for correct PDF rendering."""
    return get_display(arabic_reshaper.reshape(str(text if text is not None else ""))) 


STATUS_AR = {"PRESENT": "حاضر", "ABSENT": "غائب", "LATE": "متأخر", "EXCUSED": "بعذر", "LEFT_EARLY": "خروج مبكر"}


def build_attendance_pdf(school_name: str, meta_lines: list, summary: dict, rate: float, rows: list) -> bytes:
    _ensure_fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), rightMargin=15 * mm, leftMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], fontName="Tajawal-Bold", fontSize=18, alignment=1, leading=24)
    sub_style = ParagraphStyle("s", parent=styles["Normal"], fontName="Tajawal", fontSize=11, alignment=1, leading=18, textColor=colors.HexColor("#475569"))
    small = ParagraphStyle("sm", parent=styles["Normal"], fontName="Tajawal", fontSize=10, alignment=1, textColor=colors.HexColor("#64748B"))

    elements = []
    elements.append(Paragraph(ar(school_name), title_style))
    elements.append(Paragraph(ar("تقرير الحضور"), sub_style))
    for line in meta_lines:
        elements.append(Paragraph(ar(line), small))
    elements.append(Spacer(1, 8))

    # summary strip
    summ_data = [[
        ar(f"نسبة الحضور: {rate}%"),
        ar(f"حاضر: {summary.get('PRESENT',0)}"),
        ar(f"غائب: {summary.get('ABSENT',0)}"),
        ar(f"متأخر: {summary.get('LATE',0)}"),
        ar(f"بعذر: {summary.get('EXCUSED',0)}"),
        ar(f"خروج مبكر: {summary.get('LEFT_EARLY',0)}"),
    ]]
    summ = Table(summ_data, colWidths=[45 * mm, 35 * mm, 35 * mm, 35 * mm, 35 * mm, 40 * mm])
    summ.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Tajawal-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ECFDF5")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#065F46")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#A7F3D0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#A7F3D0")),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(summ)
    elements.append(Spacer(1, 12))

    # data table (columns reversed for RTL reading: الحالة | المعلم | المادة | الطالب | التاريخ)
    header = [ar("الحالة"), ar("المعلم"), ar("المادة"), ar("الطالب"), ar("التاريخ")]
    data = [header]
    for r in rows[:800]:
        data.append([
            ar(STATUS_AR.get(r["status"], r["status"])),
            ar(r.get("teacher_name", "")),
            ar(r.get("subject_name", "")),
            ar(r.get("student_name", "")),
            ar(r.get("date", "")),
        ])
    table = Table(data, colWidths=[35 * mm, 55 * mm, 50 * mm, 65 * mm, 35 * mm], repeatRows=1)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Tajawal"),
        ("FONTNAME", (0, 0), (-1, 0), "Tajawal-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F4C3A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]
    table.setStyle(TableStyle(style))
    elements.append(table)

    doc.build(elements)
    buf.seek(0)
    return buf.getvalue()
