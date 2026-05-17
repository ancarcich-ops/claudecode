"""Generate a Sunday school lesson plan PDF presentation."""
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas

OUTPUT = "/home/user/claudecode/Sunday_School_Great_Commission.pdf"

# Color palette - warm, kid-friendly
NAVY = HexColor("#1F3A68")
GOLD = HexColor("#F2B33D")
CREAM = HexColor("#FFF8EC")
CORAL = HexColor("#E76F51")
TEAL = HexColor("#2A9D8F")
DARK = HexColor("#22223B")

PAGE_W, PAGE_H = landscape(letter)  # 11 x 8.5 inches


def slide_background(canvas_obj, doc):
    """Draw cream background and a colored sidebar on every page."""
    canvas_obj.saveState()
    # Full page cream background
    canvas_obj.setFillColor(CREAM)
    canvas_obj.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Left sidebar
    canvas_obj.setFillColor(NAVY)
    canvas_obj.rect(0, 0, 0.4 * inch, PAGE_H, fill=1, stroke=0)
    # Top gold accent
    canvas_obj.setFillColor(GOLD)
    canvas_obj.rect(0.4 * inch, PAGE_H - 0.25 * inch, PAGE_W - 0.4 * inch, 0.25 * inch, fill=1, stroke=0)
    # Footer
    canvas_obj.setFillColor(NAVY)
    canvas_obj.setFont("Helvetica-Oblique", 9)
    canvas_obj.drawRightString(
        PAGE_W - 0.4 * inch, 0.25 * inch,
        f"The Great Commission  -  Matthew 28:16-20   |   Slide {doc.page}"
    )
    canvas_obj.restoreState()


def cover_background(canvas_obj, doc):
    """Special background for the cover page."""
    canvas_obj.saveState()
    canvas_obj.setFillColor(NAVY)
    canvas_obj.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Gold band
    canvas_obj.setFillColor(GOLD)
    canvas_obj.rect(0, PAGE_H / 2 - 0.05 * inch, PAGE_W, 0.1 * inch, fill=1, stroke=0)
    canvas_obj.restoreState()


# Styles
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "TitleBig", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=44, leading=52, textColor=white, alignment=TA_CENTER, spaceAfter=20,
)
subtitle_style = ParagraphStyle(
    "Subtitle", parent=styles["Normal"], fontName="Helvetica-Oblique",
    fontSize=20, leading=26, textColor=GOLD, alignment=TA_CENTER, spaceAfter=20,
)
cover_meta_style = ParagraphStyle(
    "CoverMeta", parent=styles["Normal"], fontName="Helvetica",
    fontSize=14, leading=20, textColor=white, alignment=TA_CENTER,
)

slide_title_style = ParagraphStyle(
    "SlideTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=30, leading=36, textColor=NAVY, alignment=TA_LEFT, spaceAfter=14,
)
section_label_style = ParagraphStyle(
    "SectionLabel", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=12, leading=16, textColor=CORAL, alignment=TA_LEFT, spaceAfter=4,
)
body_style = ParagraphStyle(
    "Body", parent=styles["Normal"], fontName="Helvetica",
    fontSize=15, leading=22, textColor=DARK, alignment=TA_LEFT, spaceAfter=8,
)
bullet_style = ParagraphStyle(
    "Bullet", parent=body_style, leftIndent=18, bulletIndent=4, spaceAfter=6,
)
verse_style = ParagraphStyle(
    "Verse", parent=styles["Normal"], fontName="Helvetica-Oblique",
    fontSize=20, leading=28, textColor=NAVY, alignment=TA_CENTER, spaceAfter=10,
)
verse_ref_style = ParagraphStyle(
    "VerseRef", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=14, leading=18, textColor=CORAL, alignment=TA_CENTER,
)


def bullets(items, style=bullet_style):
    flow = []
    for it in items:
        flow.append(Paragraph(f"&bull;&nbsp;&nbsp;{it}", style))
    return flow


# Build document
doc = SimpleDocTemplate(
    OUTPUT, pagesize=landscape(letter),
    leftMargin=0.9 * inch, rightMargin=0.7 * inch,
    topMargin=0.7 * inch, bottomMargin=0.6 * inch,
    title="The Great Commission - Sunday School Lesson Plan",
    author="Sunday School Lesson Plan",
)

story = []

# ---------- SLIDE 1: COVER ----------
story.append(Spacer(1, 0.6 * inch))
story.append(Paragraph("The Great Commission", title_style))
story.append(Paragraph("Go and Tell Everyone!", subtitle_style))
story.append(Spacer(1, 0.4 * inch))
story.append(Paragraph("A Sunday School Lesson Plan", cover_meta_style))
story.append(Paragraph("Matthew 28:16-20", cover_meta_style))
story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph("Ages 4 - 10   |   Approx. 45-60 minutes", cover_meta_style))
story.append(PageBreak())

# ---------- SLIDE 2: AT A GLANCE ----------
story.append(Paragraph("Lesson at a Glance", slide_title_style))
data = [
    ["Theme", "Jesus sends US to share His love with everyone!"],
    ["Passage", "Matthew 28:16-20  (The Great Commission)"],
    ["Ages", "4 - 10  (with split-age discussion tips)"],
    ["Time", "Approx. 45 - 60 minutes"],
    ["Big Idea", "Jesus has ALL authority - and He is ALWAYS with us."],
    ["Take-Home", "This week I will tell one person about Jesus."],
]
tbl = Table(data, colWidths=[1.7 * inch, 7.2 * inch])
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), NAVY),
    ("TEXTCOLOR", (0, 0), (0, -1), white),
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 14),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ("TOPPADDING", (0, 0), (-1, -1), 12),
    ("LEFTPADDING", (0, 0), (-1, -1), 14),
    ("RIGHTPADDING", (0, 0), (-1, -1), 14),
    ("ROWBACKGROUNDS", (1, 0), (1, -1), [white, CREAM]),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LINEBELOW", (0, 0), (-1, -2), 0.5, GOLD),
]))
story.append(tbl)
story.append(PageBreak())

# ---------- SLIDE 3: WELCOME & OPENING PRAYER ----------
story.append(Paragraph("1. Welcome & Opening Prayer", slide_title_style))
story.append(Paragraph("5 minutes", section_label_style))
story.append(Paragraph("Greet each child by name as they arrive. Make every child feel seen and special.", body_style))
story.append(Spacer(1, 0.15 * inch))
story.append(Paragraph("Opening Prayer (say together):", section_label_style))
story.append(Paragraph(
    '"Dear Jesus, thank You for loving us. Help us learn how to share Your love with others today. Amen."',
    verse_style,
))
story.append(PageBreak())

# ---------- SLIDE 4: ICEBREAKER ----------
story.append(Paragraph("2. Icebreaker: Pass the Message", slide_title_style))
story.append(Paragraph("5 - 7 minutes", section_label_style))
story.append(Paragraph("How to Play:", section_label_style))
story.extend(bullets([
    "Have all the kids sit in a circle.",
    'Whisper a short phrase to the first child (e.g., "Jesus loves you!").',
    "They whisper it down the line, one child at a time.",
    "The last child stands up and says it out loud.",
]))
story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Tie-In:", section_label_style))
story.append(Paragraph(
    '"Today we will learn that Jesus gave His friends a very important message to pass on - and it is our job to pass it on too!"',
    body_style,
))
story.append(PageBreak())

# ---------- SLIDE 5: BIBLE STORY ----------
story.append(Paragraph("3. Bible Story: The Great Commission", slide_title_style))
story.append(Paragraph("10 minutes  |  Read Matthew 28:16-20 (NIrV or ICB works well for kids)", section_label_style))
story.append(Paragraph("Tell it in your own words:", section_label_style))
story.extend(bullets([
    "After Jesus rose from the dead, He met His 11 disciples on a mountain in Galilee.",
    "They worshiped Him - some still doubted, but Jesus loved them anyway.",
    'Jesus said something HUGE: <i>"All authority in heaven and earth is mine!"</i>',
    "Then He gave them a MISSION - called the Great Commission.",
    'Best promise: <i>"I am with you always, to the very end of the age."</i>',
]))
story.append(PageBreak())

# ---------- SLIDE 6: THE FOUR ACTION WORDS ----------
story.append(Paragraph("The 4 Big Action Words", slide_title_style))
story.append(Paragraph("What Jesus told His disciples (and us!) to do:", section_label_style))
story.append(Spacer(1, 0.1 * inch))
action_data = [
    ["GO", "Go to ALL people, everywhere in the world."],
    ["MAKE DISCIPLES", "Help others become friends and followers of Jesus."],
    ["BAPTIZE", "In the name of the Father, the Son, and the Holy Spirit."],
    ["TEACH", "Teach them everything Jesus taught us."],
]
action_tbl = Table(action_data, colWidths=[2.2 * inch, 6.7 * inch])
action_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), CORAL),
    ("BACKGROUND", (0, 1), (0, 1), GOLD),
    ("BACKGROUND", (0, 2), (0, 2), TEAL),
    ("BACKGROUND", (0, 3), (0, 3), NAVY),
    ("TEXTCOLOR", (0, 0), (0, -1), white),
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (0, -1), 18),
    ("FONTSIZE", (1, 0), (1, -1), 14),
    ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
    ("TOPPADDING", (0, 0), (-1, -1), 16),
    ("LEFTPADDING", (0, 0), (-1, -1), 14),
    ("BACKGROUND", (1, 0), (1, -1), white),
]))
story.append(action_tbl)
story.append(PageBreak())

# ---------- SLIDE 7: MEMORY VERSE ----------
story.append(Paragraph("4. Memory Verse", slide_title_style))
story.append(Paragraph("5 minutes", section_label_style))
story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph(
    '"And surely I am with you always,<br/>to the very end of the age."',
    verse_style,
))
story.append(Paragraph("- Matthew 28:20", verse_ref_style))
story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph("Hand Motions (great for younger kids!):", section_label_style))
story.extend(bullets([
    '"Surely I am with you" - point up, then to self, then to others',
    '"Always" - draw a big circle with arms',
    '"To the very end of the age" - stretch arms wide',
    "Repeat together 3 times!",
]))
story.append(PageBreak())

# ---------- SLIDE 8: DISCUSSION ----------
story.append(Paragraph("5. Discussion Questions", slide_title_style))
story.append(Paragraph("5 - 7 minutes  |  Split into age groups if possible", section_label_style))
story.append(Spacer(1, 0.1 * inch))

disc_data = [
    ["Ages 4 - 6", "Ages 7 - 10"],
    [
        "&bull; Who told the disciples to go tell others about Him?<br/><br/>"
        "&bull; Does Jesus stay with us? (Yes - always!)<br/><br/>"
        "&bull; Who can YOU tell about Jesus this week?",
        '&bull; Why did Jesus say "ALL authority" BEFORE giving the mission?<br/><br/>'
        '&bull; What does "make disciples" actually mean? (Not just tell - help them follow Jesus.)<br/><br/>'
        "&bull; The disciples doubted, but Jesus still used them. What does that tell us?",
    ],
]
# Convert second row to Paragraphs to allow HTML
disc_data[1] = [Paragraph(disc_data[1][0], body_style), Paragraph(disc_data[1][1], body_style)]
disc_tbl = Table(disc_data, colWidths=[4.45 * inch, 4.45 * inch])
disc_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), TEAL),
    ("BACKGROUND", (1, 0), (1, 0), CORAL),
    ("TEXTCOLOR", (0, 0), (-1, 0), white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, 0), 16),
    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 14),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ("LEFTPADDING", (0, 0), (-1, -1), 14),
    ("RIGHTPADDING", (0, 0), (-1, -1), 14),
    ("BACKGROUND", (0, 1), (-1, 1), white),
    ("BOX", (0, 0), (-1, -1), 1, NAVY),
    ("LINEBEFORE", (1, 0), (1, -1), 1, NAVY),
]))
story.append(disc_tbl)
story.append(PageBreak())

# ---------- SLIDE 9: CRAFT ----------
story.append(Paragraph("6. Craft Activity", slide_title_style))
story.append(Paragraph("10 - 15 minutes  |  Pick ONE option (or let kids choose)", section_label_style))
story.append(Spacer(1, 0.1 * inch))

craft_data = [
    ["Option A: Paper Plate Globe", "Option B: Footprint Path"],
    ["Best for ages 4 - 6", "Best for ages 7 - 10"],
    [
        Paragraph(
            "Color a paper plate blue and green to look like Earth.<br/><br/>"
            "Add stickers or drawings of people from different places.<br/><br/>"
            '<b>Write "GO!" across the top in big letters.</b><br/><br/>'
            "<b>Supplies:</b> paper plates, blue and green markers/paint, stickers.",
            body_style,
        ),
        Paragraph(
            "Trace each child's foot on colored paper and cut it out.<br/><br/>"
            "On each footprint, write ONE way they can share Jesus this week.<br/>"
            "(Examples: be kind, invite a friend, pray, share, forgive.)<br/><br/>"
            "<b>Tape all the footprints as a path on the classroom wall.</b><br/><br/>"
            "<b>Supplies:</b> colored paper, scissors, markers, tape.",
            body_style,
        ),
    ],
]
craft_tbl = Table(craft_data, colWidths=[4.45 * inch, 4.45 * inch])
craft_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), GOLD),
    ("BACKGROUND", (1, 0), (1, 0), TEAL),
    ("TEXTCOLOR", (0, 0), (-1, 0), white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, 0), 16),
    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
    ("BACKGROUND", (0, 1), (-1, 1), CREAM),
    ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Oblique"),
    ("FONTSIZE", (0, 1), (-1, 1), 11),
    ("TEXTCOLOR", (0, 1), (-1, 1), NAVY),
    ("ALIGN", (0, 1), (-1, 1), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 10),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ("BACKGROUND", (0, 2), (-1, 2), white),
    ("BOX", (0, 0), (-1, -1), 1, NAVY),
    ("LINEBEFORE", (1, 0), (1, -1), 1, NAVY),
]))
story.append(craft_tbl)
story.append(PageBreak())

# ---------- SLIDE 10: GAME ----------
story.append(Paragraph('7. Game: "Go Tag"', slide_title_style))
story.append(Paragraph("5 - 10 minutes  |  Play in a safe open space", section_label_style))
story.append(Paragraph("How to Play:", section_label_style))
story.extend(bullets([
    'One child starts as "It."',
    'When they tag someone, that person is NOT out - instead, they BOTH become "It."',
    "The pair holds hands and tags more kids together.",
    "Each new tag joins the chain. Soon EVERYONE is part of the team!",
]))
story.append(Spacer(1, 0.15 * inch))
story.append(Paragraph("The Lesson:", section_label_style))
story.append(Paragraph(
    '"That is how the church grows - one person tells another, who tells another, who tells another. Jesus message spreads everywhere!"',
    body_style,
))
story.append(PageBreak())

# ---------- SLIDE 11: CLOSING ----------
story.append(Paragraph("8. Closing & Sending Prayer", slide_title_style))
story.append(Paragraph("3 minutes", section_label_style))
story.append(Paragraph("Have the kids stand up. Say together:", body_style))
story.append(Spacer(1, 0.2 * inch))
story.append(Paragraph(
    '"Jesus, thank You for being with us ALWAYS.<br/>'
    'This week, help us GO and share Your love with one person. Amen!"',
    verse_style,
))
story.append(Spacer(1, 0.2 * inch))
story.append(Paragraph(
    'Send each child out with a high-five and the words: <b>"Go and tell!"</b>',
    body_style,
))
story.append(PageBreak())

# ---------- SLIDE 12: TAKE-HOME ----------
story.append(Paragraph("Take-Home Challenge", slide_title_style))
story.append(Paragraph("Send each child home with a small card:", section_label_style))
story.append(Spacer(1, 0.2 * inch))

card = Table(
    [[Paragraph(
        '<b>MY MISSION THIS WEEK</b><br/><br/>'
        'This week I will tell <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> about Jesus.<br/><br/>'
        '<font size="11"><i>"And surely I am with you always." - Matthew 28:20</i></font>',
        ParagraphStyle("Card", parent=body_style, alignment=TA_CENTER, fontSize=16, leading=24, textColor=NAVY),
    )]],
    colWidths=[7 * inch], rowHeights=[2.6 * inch],
)
card.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), CREAM),
    ("BOX", (0, 0), (-1, -1), 3, GOLD),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 30),
    ("RIGHTPADDING", (0, 0), (-1, -1), 30),
]))
# Center the card on the slide
wrap = Table([[card]], colWidths=[8.9 * inch])
wrap.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
story.append(wrap)
story.append(Spacer(1, 0.2 * inch))
story.append(Paragraph(
    "Ask kids to bring the card back next week to share what happened. Celebrate every story!",
    body_style,
))
story.append(PageBreak())

# ---------- SLIDE 13: TEACHER TIPS ----------
story.append(Paragraph("Teacher Tips & Supply List", slide_title_style))
tip_data = [
    [
        Paragraph("<b>Teacher Tips</b>", ParagraphStyle("th", parent=body_style, fontName="Helvetica-Bold", fontSize=14, textColor=white)),
        Paragraph("<b>Supplies Checklist</b>", ParagraphStyle("th", parent=body_style, fontName="Helvetica-Bold", fontSize=14, textColor=white)),
    ],
    [
        Paragraph(
            "&bull; Use a kid-friendly Bible (NIrV or ICB).<br/>"
            "&bull; If your group is wide-aged, pair an older kid with a younger one.<br/>"
            "&bull; Repetition helps - say the memory verse often.<br/>"
            "&bull; Affirm every answer, even if it is wrong.<br/>"
            "&bull; If time runs short, skip the game - protect the Bible story and prayer.",
            body_style,
        ),
        Paragraph(
            "&bull; Kid-friendly Bible<br/>"
            "&bull; Paper plates, markers, paint, stickers<br/>"
            "&bull; Colored paper, scissors, tape<br/>"
            "&bull; Memory verse take-home cards<br/>"
            "&bull; Open space for the tag game<br/>"
            "&bull; Optional: small reward stickers",
            body_style,
        ),
    ],
]
tip_tbl = Table(tip_data, colWidths=[4.45 * inch, 4.45 * inch])
tip_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 14),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ("LEFTPADDING", (0, 0), (-1, -1), 14),
    ("RIGHTPADDING", (0, 0), (-1, -1), 14),
    ("BACKGROUND", (0, 1), (-1, 1), white),
    ("BOX", (0, 0), (-1, -1), 1, NAVY),
    ("LINEBEFORE", (1, 0), (1, -1), 1, NAVY),
]))
story.append(tip_tbl)
story.append(PageBreak())

# ---------- SLIDE 14: CLOSING SLIDE ----------
story.append(Spacer(1, 1.2 * inch))
story.append(Paragraph("Go and Tell!", title_style))
story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph(
    '"Therefore go and make disciples of all nations..."',
    ParagraphStyle("Closing", parent=verse_style, textColor=GOLD, fontSize=22),
))
story.append(Paragraph("Matthew 28:19", ParagraphStyle("CRef", parent=verse_ref_style, textColor=white)))


# Page templates
def on_first_page(canvas_obj, doc):
    cover_background(canvas_obj, doc)


def on_later_pages(canvas_obj, doc):
    if doc.page == 1 or doc.page == 14:  # cover + final
        cover_background(canvas_obj, doc)
    else:
        slide_background(canvas_obj, doc)


doc.build(story, onFirstPage=cover_background, onLaterPages=on_later_pages)
print(f"Wrote {OUTPUT}")
