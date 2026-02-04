#!/usr/bin/env python3
"""Generate professional PDF from markdown comparison document"""

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from reportlab.lib import colors
from datetime import datetime
import os

# Read the markdown file
with open('/home/mm/map2-audio/docs/FEATURE_COMPARISON_MAP2_VS_AXEFX2.md', 'r') as f:
    content = f.read()

# Output PDF path
pdf_path = '/home/mm/map2-audio/docs/FEATURE_COMPARISON_MAP2_VS_AXEFX2.pdf'

# Create PDF document
doc = SimpleDocTemplate(
    pdf_path,
    pagesize=letter,
    rightMargin=0.75*inch,
    leftMargin=0.75*inch,
    topMargin=0.75*inch,
    bottomMargin=0.75*inch
)

# Define custom styles
styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=24,
    textColor=colors.HexColor('#1f4788'),
    spaceAfter=6,
    alignment=TA_CENTER,
    fontName='Helvetica-Bold'
)

subtitle_style = ParagraphStyle(
    'CustomSubtitle',
    parent=styles['Heading2'],
    fontSize=12,
    textColor=colors.HexColor('#555555'),
    spaceAfter=12,
    alignment=TA_CENTER,
    fontName='Helvetica'
)

heading1_style = ParagraphStyle(
    'CustomHeading1',
    parent=styles['Heading1'],
    fontSize=16,
    textColor=colors.HexColor('#1f4788'),
    spaceAfter=10,
    spaceBefore=12,
    fontName='Helvetica-Bold'
)

heading2_style = ParagraphStyle(
    'CustomHeading2',
    parent=styles['Heading2'],
    fontSize=13,
    textColor=colors.HexColor('#2e5c8a'),
    spaceAfter=8,
    spaceBefore=10,
    fontName='Helvetica-Bold'
)

body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['BodyText'],
    fontSize=10,
    alignment=TA_JUSTIFY,
    spaceAfter=6
)

# Build document elements
elements = []

# Title
elements.append(Paragraph("MAP2-Audio vs AxeFX2", title_style))
elements.append(Paragraph("Feature Matrix & Gap Analysis", subtitle_style))

# Date
date_str = datetime.now().strftime("%B %d, %Y")
elements.append(Paragraph(f"<i>Document Date: {date_str}</i>", ParagraphStyle(
    'DateStyle',
    parent=styles['Normal'],
    fontSize=10,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#666666'),
    spaceAfter=20
)))

elements.append(Spacer(1, 0.3*inch))

# Overview section
elements.append(Paragraph("Overview", heading1_style))
elements.append(Paragraph(
    "This document provides a comprehensive side-by-side feature comparison between MAP2-Audio "
    "(open-source software platform) and AxeFX2 (discontinued hardware unit), organized by functional "
    "category with detailed gap analysis.",
    body_style
))
elements.append(Spacer(1, 0.2*inch))

# Feature categories summary
elements.append(Paragraph("Key Comparison Areas", heading2_style))
categories = [
    "Audio Engine & Processing",
    "Amp & Cabinet Modeling",
    "Effects Library",
    "Plugin & Model Ecosystem",
    "Signal Routing & Configuration",
    "Control Surface & MIDI",
    "User Interface & Accessibility",
    "I/O & Connectivity",
    "Metering & Analysis Tools",
    "Preset Management",
    "Audio Quality & Performance",
    "System Requirements & Deployment"
]

category_text = ", ".join(categories)
elements.append(Paragraph(category_text, body_style))
elements.append(Spacer(1, 0.2*inch))

# Summary findings table
elements.append(Paragraph("Summary: Strengths & Limitations", heading2_style))

summary_data = [
    ['Aspect', 'MAP2-Audio', 'AxeFX2'],
    ['Critical Gaps', '4', '5'],
    ['Moderate Limitations', '4', '4'],
    ['Minor Issues', '3', '4'],
    ['Total Gaps', '11', '13'],
    ['Primary Use Case', 'Studio/Extensibility', 'Touring/Reliability'],
]

summary_table = Table(summary_data, colWidths=[2.2*inch, 2*inch, 2*inch])
summary_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f4788')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 11),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
    ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ('FONTSIZE', (0, 1), (-1, -1), 10),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
]))
elements.append(summary_table)
elements.append(Spacer(1, 0.3*inch))

# Key Takeaways
elements.append(Paragraph("Key Takeaways", heading2_style))

takeaways = [
    ("<b>MAP2-Audio</b> is a modern, extensible platform suited for studio work, experimentation, "
     "and integration with software ecosystems. Its gaps are primarily around hardware integration and standalone reliability."),
    ("<b>AxeFX2</b> is a battle-tested hardware processor optimized for touring musicians, but its discontinuation "
     "and closed design limit future growth and integration capabilities."),
    ("For new deployments, consider <b>AxeFX III, FM9, or FM3</b> as AxeFX2 successors rather than "
     "comparing legacy hardware to modern software platforms.")
]

for i, takeaway in enumerate(takeaways):
    elements.append(Paragraph(f"• {takeaway}", body_style))
    if i < len(takeaways) - 1:
        elements.append(Spacer(1, 0.1*inch))

elements.append(Spacer(1, 0.3*inch))

# Footer note
footer_style = ParagraphStyle(
    'FooterStyle',
    parent=styles['Normal'],
    fontSize=9,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#999999'),
    spaceAfter=0
)
elements.append(Paragraph(
    f"<i>For detailed feature matrices and gap analysis, refer to the complete documentation.<br/>"
    f"Generated on {date_str} | MAP2-Audio Platform</i>",
    footer_style
))

# Build PDF
doc.build(elements)

print(f"✓ Professional PDF generated: {pdf_path}")
print(f"✓ Document date: {date_str}")
print(f"✓ File size: {os.path.getsize(pdf_path) / 1024:.1f} KB")
