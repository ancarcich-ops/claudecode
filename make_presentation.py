"""Generate a Sunday school lesson plan PDF presentation.

Uses direct canvas drawing for slide-by-slide layout control rather than
the flowable/table approach, which produced a cramped, worksheet-like feel.
"""
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as canvas_mod

OUTPUT = "/home/user/claudecode/Sunday_School_Great_Commission.pdf"

# Register higher quality fonts
pdfmetrics.registerFont(TTFont("Display", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("BodyBold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("BodyItalic", "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf"))

# Refined palette
INK = HexColor("#0B1B33")          # deep navy
INK_SOFT = HexColor("#2D3A5C")
CREAM = HexColor("#FBF6EC")
PAPER = HexColor("#FFFDF8")
GOLD = HexColor("#E8B547")
GOLD_DEEP = HexColor("#C7912A")
CORAL = HexColor("#E26A55")
TEAL = HexColor("#2D8B8C")
SAGE = HexColor("#7BA98B")
LILAC = HexColor("#9B7AA8")
MUTED = HexColor("#7A7563")

# Slide accent colors used for the 4 action words and section banners
ACCENT_CYCLE = [CORAL, GOLD, TEAL, LILAC, SAGE]

PAGE_W, PAGE_H = landscape(letter)  # 11 x 8.5 inches

MARGIN = 0.7 * inch


def soft_shadow(c, x, y, w, h, radius=10, offset=5, fill=Color(0, 0, 0, alpha=0.08)):
    """Drop shadow drawn as an offset rounded rect.
    Call with the SAME x, y as the card you're shadowing — the function
    handles the offset internally."""
    c.setFillColor(fill)
    c.roundRect(x + offset, y - offset, w, h, radius, fill=1, stroke=0)


def header(c, slide_num, total, eyebrow):
    """Top banner shared across content slides."""
    # Thin gold rule across the top
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H - 0.18 * inch, PAGE_W, 0.18 * inch, fill=1, stroke=0)

    # Eyebrow label
    c.setFillColor(INK_SOFT)
    c.setFont("BodyBold", 9.5)
    c.drawString(MARGIN, PAGE_H - 0.45 * inch, eyebrow.upper())

    # Slide number badge on the right
    bx, by = PAGE_W - MARGIN - 0.7 * inch, PAGE_H - 0.55 * inch
    c.setFillColor(INK)
    c.circle(bx + 0.18 * inch, by + 0.12 * inch, 0.18 * inch, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("BodyBold", 10)
    c.drawCentredString(bx + 0.18 * inch, by + 0.06 * inch, str(slide_num))
    c.setFillColor(INK_SOFT)
    c.setFont("Body", 9)
    c.drawString(bx + 0.45 * inch, by + 0.08 * inch, f"of {total}")


def footer(c):
    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 8.5)
    c.drawCentredString(
        PAGE_W / 2, 0.3 * inch,
        "The Great Commission   •   Matthew 28:16-20   •   Ages 4-10",
    )


def page_bg(c, color=CREAM):
    c.setFillColor(color)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def slide_title(c, text, y=None, color=None):
    if y is None:
        y = PAGE_H - 1.1 * inch
    c.setFillColor(color or INK)
    c.setFont("Display", 36)
    c.drawString(MARGIN, y, text)
    # Underline accent
    c.setFillColor(GOLD)
    c.rect(MARGIN, y - 0.18 * inch, 1.4 * inch, 0.06 * inch, fill=1, stroke=0)


def wrap_text(c, text, font, size, max_width):
    """Greedy word-wrapping that returns a list of lines."""
    words = text.split()
    lines, line = [], ""
    for w in words:
        trial = (line + " " + w).strip()
        if pdfmetrics.stringWidth(trial, font, size) <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def draw_paragraph(c, text, x, y, font, size, max_width, leading=None, color=INK):
    leading = leading or size * 1.45
    c.setFillColor(color)
    c.setFont(font, size)
    lines = wrap_text(c, text, font, size, max_width)
    for i, ln in enumerate(lines):
        c.drawString(x, y - i * leading, ln)
    return y - len(lines) * leading


def draw_bullets(c, items, x, y, max_width, font="Body", size=13, leading=20,
                 dot_color=CORAL, text_color=INK):
    for it in items:
        # bullet dot
        c.setFillColor(dot_color)
        c.circle(x + 0.07 * inch, y + 0.05 * inch, 0.05 * inch, fill=1, stroke=0)
        # wrapped text
        text_x = x + 0.25 * inch
        lines = wrap_text(c, it, font, size, max_width - 0.25 * inch)
        c.setFillColor(text_color)
        c.setFont(font, size)
        for i, ln in enumerate(lines):
            c.drawString(text_x, y - i * leading, ln)
        y -= max(leading * len(lines), leading) + 6
    return y


# ---------- SLIDE BUILDERS ----------

TOTAL = 13


def slide_cover(c):
    # Deep navy background
    page_bg(c, INK)

    # Decorative overlapping circles on the right
    c.setFillColor(Color(GOLD.red, GOLD.green, GOLD.blue, alpha=0.85))
    c.circle(PAGE_W - 1.4 * inch, PAGE_H - 1.6 * inch, 1.2 * inch, fill=1, stroke=0)
    c.setFillColor(Color(CORAL.red, CORAL.green, CORAL.blue, alpha=0.80))
    c.circle(PAGE_W - 2.7 * inch, PAGE_H - 2.5 * inch, 0.75 * inch, fill=1, stroke=0)
    c.setFillColor(Color(TEAL.red, TEAL.green, TEAL.blue, alpha=0.85))
    c.circle(PAGE_W - 1.2 * inch, 1.4 * inch, 0.9 * inch, fill=1, stroke=0)
    c.setFillColor(Color(SAGE.red, SAGE.green, SAGE.blue, alpha=0.75))
    c.circle(PAGE_W - 2.3 * inch, 0.7 * inch, 0.5 * inch, fill=1, stroke=0)

    # Top eyebrow
    c.setFillColor(GOLD)
    c.setFont("BodyBold", 11)
    c.drawString(MARGIN, PAGE_H - 0.9 * inch, "SUNDAY SCHOOL LESSON PLAN")
    c.setFillColor(white)
    c.rect(MARGIN, PAGE_H - 1.0 * inch, 0.5 * inch, 0.02 * inch, fill=1, stroke=0)

    # Big title
    c.setFillColor(white)
    c.setFont("Display", 64)
    c.drawString(MARGIN, PAGE_H - 2.6 * inch, "The Great")
    c.drawString(MARGIN, PAGE_H - 3.5 * inch, "Commission")

    # Subtitle
    c.setFillColor(GOLD)
    c.setFont("BodyItalic", 22)
    c.drawString(MARGIN, PAGE_H - 4.1 * inch, "Go and tell everyone!")

    # Bottom meta strip
    c.setFillColor(Color(1, 1, 1, alpha=0.15))
    c.roundRect(MARGIN, 1.0 * inch, 6.2 * inch, 1.1 * inch, 8, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("BodyBold", 11)
    c.drawString(MARGIN + 0.3 * inch, 1.75 * inch, "PASSAGE")
    c.drawString(MARGIN + 2.5 * inch, 1.75 * inch, "AGES")
    c.drawString(MARGIN + 4.3 * inch, 1.75 * inch, "TIME")

    c.setFont("Body", 13)
    c.setFillColor(GOLD)
    c.drawString(MARGIN + 0.3 * inch, 1.35 * inch, "Matthew 28:16-20")
    c.drawString(MARGIN + 2.5 * inch, 1.35 * inch, "4 - 10")
    c.drawString(MARGIN + 4.3 * inch, 1.35 * inch, "45-60 min")

    c.showPage()


def slide_overview(c):
    page_bg(c)
    header(c, 2, TOTAL, "Overview")
    slide_title(c, "Lesson at a Glance")

    # Big idea pull-quote card
    card_x, card_y, card_w, card_h = MARGIN, 4.3 * inch, PAGE_W - 2 * MARGIN, 2.0 * inch
    soft_shadow(c, card_x, card_y, card_w, card_h, radius=14)
    c.setFillColor(INK)
    c.roundRect(card_x, card_y, card_w, card_h, 14, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont("BodyBold", 11)
    c.drawString(card_x + 0.4 * inch, card_y + card_h - 0.45 * inch, "THE BIG IDEA")
    c.setFillColor(white)
    c.setFont("Display", 24)
    c.drawString(card_x + 0.4 * inch, card_y + card_h - 0.95 * inch,
                 "Jesus has ALL authority -")
    c.drawString(card_x + 0.4 * inch, card_y + card_h - 1.4 * inch,
                 "and He is ALWAYS with us.")
    c.setFillColor(Color(1, 1, 1, alpha=0.75))
    c.setFont("BodyItalic", 13)
    c.drawString(card_x + 0.4 * inch, card_y + 0.35 * inch,
                 "So we go and share His love with everyone.")

    # Three info chips
    chip_y = 2.4 * inch
    chip_w = (PAGE_W - 2 * MARGIN - 0.4 * inch) / 3
    chips = [
        ("PASSAGE", "Matthew 28:16-20", CORAL),
        ("AGES", "4 - 10 (split tips)", TEAL),
        ("TIME", "45 - 60 minutes", LILAC),
    ]
    for i, (label, value, col) in enumerate(chips):
        x = MARGIN + i * (chip_w + 0.2 * inch)
        soft_shadow(c, x, chip_y, chip_w, 1.4 * inch, radius=12)
        c.setFillColor(PAPER)
        c.roundRect(x, chip_y, chip_w, 1.4 * inch, 12, fill=1, stroke=0)
        # left color bar
        c.setFillColor(col)
        c.roundRect(x, chip_y, 0.15 * inch, 1.4 * inch, 6, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.setFont("BodyBold", 10)
        c.drawString(x + 0.4 * inch, chip_y + 0.95 * inch, label)
        c.setFillColor(INK)
        c.setFont("Display", 18)
        c.drawString(x + 0.4 * inch, chip_y + 0.45 * inch, value)

    # Take-home strip at bottom
    th_y = 1.0 * inch
    c.setFillColor(GOLD)
    c.roundRect(MARGIN, th_y, PAGE_W - 2 * MARGIN, 0.9 * inch, 10, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("BodyBold", 11)
    c.drawString(MARGIN + 0.4 * inch, th_y + 0.55 * inch, "TAKE-HOME CHALLENGE")
    c.setFont("BodyItalic", 14)
    c.drawString(MARGIN + 0.4 * inch, th_y + 0.22 * inch,
                 'This week I will tell one person about Jesus.')

    footer(c)
    c.showPage()


def section_slide(c, num, section_num, eyebrow, title, time_text, body_fn):
    """Generic content slide with big number, eyebrow, title, and a body callback."""
    page_bg(c)
    header(c, num, TOTAL, eyebrow)

    # Giant numeral background
    c.setFillColor(Color(GOLD.red, GOLD.green, GOLD.blue, alpha=0.18))
    c.setFont("Display", 220)
    c.drawString(PAGE_W - 3.5 * inch, PAGE_H - 4.5 * inch, str(section_num))

    slide_title(c, title)

    # Time pill
    c.setFillColor(CORAL)
    c.roundRect(MARGIN, PAGE_H - 1.7 * inch, 1.6 * inch, 0.35 * inch, 8, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("BodyBold", 11)
    c.drawCentredString(MARGIN + 0.8 * inch, PAGE_H - 1.62 * inch, time_text.upper())

    body_fn(c)
    footer(c)
    c.showPage()


def slide_welcome(c):
    def body(c):
        y = PAGE_H - 2.4 * inch
        draw_paragraph(
            c,
            "Greet each child by name as they arrive. Make every child feel "
            "seen and special before you begin.",
            MARGIN, y, "Body", 15, PAGE_W - 2 * MARGIN - 1 * inch, leading=22,
        )

        # Prayer quote card
        qx, qy, qw, qh = MARGIN, 1.5 * inch, PAGE_W - 2 * MARGIN, 2.8 * inch
        soft_shadow(c, qx, qy, qw, qh, radius=14)
        c.setFillColor(PAPER)
        c.roundRect(qx, qy, qw, qh, 14, fill=1, stroke=0)
        # Big quote mark
        c.setFillColor(GOLD)
        c.setFont("Display", 96)
        c.drawString(qx + 0.4 * inch, qy + qh - 1.1 * inch, "“")
        # Label
        c.setFillColor(CORAL)
        c.setFont("BodyBold", 11)
        c.drawString(qx + 1.5 * inch, qy + qh - 0.55 * inch, "OPENING PRAYER")
        # Quote text
        c.setFillColor(INK)
        c.setFont("BodyItalic", 19)
        lines = [
            "Dear Jesus, thank You for loving us.",
            "Help us learn how to share Your love",
            "with others today. Amen.",
        ]
        for i, ln in enumerate(lines):
            c.drawString(qx + 1.5 * inch, qy + qh - 1.1 * inch - i * 0.4 * inch, ln)

    section_slide(c, 3, 1, "Section 1", "Welcome & Prayer", "5 minutes", body)


def slide_icebreaker(c):
    def body(c):
        # Left column: how to play
        col_x = MARGIN
        col_w = (PAGE_W - 2 * MARGIN) / 2 - 0.2 * inch
        c.setFillColor(TEAL)
        c.setFont("BodyBold", 11)
        c.drawString(col_x, PAGE_H - 2.4 * inch, "HOW TO PLAY")
        y = PAGE_H - 2.75 * inch
        y = draw_bullets(c, [
            "Have all the kids sit in a circle.",
            'Whisper a short phrase to the first child (e.g., "Jesus loves you!").',
            "They whisper it down the line, one child at a time.",
            "The last child stands up and says it out loud.",
        ], col_x, y, col_w, dot_color=TEAL)

        # Right column: tie-in card
        rx = MARGIN + col_w + 0.4 * inch
        ry, rh = 1.5 * inch, 4.6 * inch
        soft_shadow(c, rx, ry, col_w, rh, radius=14)
        c.setFillColor(TEAL)
        c.roundRect(rx, ry, col_w, rh, 14, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("BodyBold", 11)
        c.drawString(rx + 0.35 * inch, ry + rh - 0.5 * inch, "SAY TO THE GROUP")
        c.setFillColor(Color(1, 1, 1, alpha=0.95))
        c.setFont("BodyItalic", 17)
        tie = [
            "Today we'll learn that Jesus",
            "gave His friends a very important",
            "message to pass on - and it's our",
            "job to pass it on too!",
        ]
        for i, ln in enumerate(tie):
            c.drawString(rx + 0.35 * inch, ry + rh - 1.05 * inch - i * 0.38 * inch, ln)

    section_slide(c, 4, 2, "Section 2", "Icebreaker: Pass the Message", "5-7 minutes", body)


def slide_bible_story(c):
    def body(c):
        c.setFillColor(LILAC)
        c.setFont("BodyBold", 11)
        c.drawString(MARGIN, PAGE_H - 2.4 * inch, "READ MATTHEW 28:16-20  (NIrV or ICB)")

        # Story bullets in a single column for readability
        y = PAGE_H - 2.85 * inch
        draw_bullets(c, [
            "After Jesus rose from the dead, He met His 11 disciples on a mountain in Galilee.",
            "They worshiped Him - some still doubted, but Jesus loved them anyway.",
            "Jesus said something HUGE:  “All authority in heaven and earth is mine!”",
            "Then He gave them a MISSION - the Great Commission.",
            "And the best promise:  “I am with you always, to the very end of the age.”",
        ], MARGIN, y, PAGE_W - 2 * MARGIN - 0.5 * inch, size=14, leading=20, dot_color=LILAC)

    section_slide(c, 5, 3, "Section 3", "Bible Story", "10 minutes", body)


def slide_four_words(c):
    page_bg(c)
    header(c, 6, TOTAL, "The Heart of the Lesson")
    slide_title(c, "The 4 Big Action Words")

    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 13)
    c.drawString(MARGIN, PAGE_H - 1.65 * inch,
                 "What Jesus told His disciples - and us! - to do.")

    # 2x2 grid of colored cards
    grid_top = PAGE_H - 2.0 * inch
    card_w = (PAGE_W - 2 * MARGIN - 0.3 * inch) / 2
    card_h = 2.2 * inch
    gap = 0.3 * inch

    cards = [
        ("01", "GO", "Go to ALL people, everywhere in the world.", CORAL),
        ("02", "MAKE DISCIPLES", "Help others become friends and followers of Jesus.", GOLD),
        ("03", "BAPTIZE", "In the name of the Father, Son, and Holy Spirit.", TEAL),
        ("04", "TEACH", "Teach them everything Jesus taught us.", LILAC),
    ]
    for i, (num, word, desc, col) in enumerate(cards):
        row, col_i = divmod(i, 2)
        x = MARGIN + col_i * (card_w + gap)
        y = grid_top - (row + 1) * card_h - row * gap

        soft_shadow(c, x, y, card_w, card_h, radius=14)
        c.setFillColor(col)
        c.roundRect(x, y, card_w, card_h, 14, fill=1, stroke=0)

        # Number in corner
        c.setFillColor(Color(1, 1, 1, alpha=0.35))
        c.setFont("Display", 14)
        c.drawString(x + 0.4 * inch, y + card_h - 0.5 * inch, num)

        # Action word
        c.setFillColor(white)
        c.setFont("Display", 30)
        c.drawString(x + 0.4 * inch, y + card_h - 1.0 * inch, word)

        # Description
        c.setFillColor(Color(1, 1, 1, alpha=0.95))
        c.setFont("Body", 12.5)
        lines = wrap_text(c, desc, "Body", 12.5, card_w - 0.8 * inch)
        for j, ln in enumerate(lines):
            c.drawString(x + 0.4 * inch, y + 0.7 * inch - j * 0.28 * inch, ln)

    footer(c)
    c.showPage()


def slide_memory_verse(c):
    page_bg(c, INK)
    # Top gold bar
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H - 0.18 * inch, PAGE_W, 0.18 * inch, fill=1, stroke=0)

    # Eyebrow
    c.setFillColor(GOLD)
    c.setFont("BodyBold", 11)
    c.drawString(MARGIN, PAGE_H - 0.55 * inch, "SECTION 4  •  MEMORY VERSE")

    # Slide number badge
    c.setFillColor(white)
    c.circle(PAGE_W - MARGIN - 0.3 * inch, PAGE_H - 0.43 * inch, 0.18 * inch, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("BodyBold", 10)
    c.drawCentredString(PAGE_W - MARGIN - 0.3 * inch, PAGE_H - 0.48 * inch, "7")

    # Decorative quote mark
    c.setFillColor(Color(GOLD.red, GOLD.green, GOLD.blue, alpha=0.35))
    c.setFont("Display", 260)
    c.drawString(MARGIN - 0.2 * inch, PAGE_H - 4.2 * inch, "“")

    # Verse text
    c.setFillColor(white)
    c.setFont("Display", 40)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 3.0 * inch, "And surely I am with you")
    c.drawCentredString(PAGE_W / 2, PAGE_H - 3.7 * inch, "always, to the very end")
    c.drawCentredString(PAGE_W / 2, PAGE_H - 4.4 * inch, "of the age.")

    # Attribution
    c.setFillColor(GOLD)
    c.setFont("BodyBold", 16)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 5.05 * inch, "MATTHEW 28:20")

    # Hand-motions strip
    hy = 1.0 * inch
    c.setFillColor(Color(1, 1, 1, alpha=0.10))
    c.roundRect(MARGIN, hy, PAGE_W - 2 * MARGIN, 1.4 * inch, 12, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont("BodyBold", 11)
    c.drawString(MARGIN + 0.3 * inch, hy + 1.1 * inch, "HAND MOTIONS  (try with younger kids!)")

    motions = [
        ('"Surely I am with you"', "point up, then to self, then to others"),
        ('"Always"', "draw a big circle with your arms"),
        ('"To the very end of the age"', "stretch your arms out wide"),
    ]
    col_w = (PAGE_W - 2 * MARGIN - 0.6 * inch) / 3
    for i, (phrase, action) in enumerate(motions):
        cx = MARGIN + 0.3 * inch + i * col_w
        c.setFillColor(white)
        c.setFont("BodyBold", 11)
        c.drawString(cx, hy + 0.65 * inch, phrase)
        c.setFillColor(Color(1, 1, 1, alpha=0.8))
        c.setFont("BodyItalic", 11)
        # wrap action
        lines = wrap_text(c, action, "BodyItalic", 11, col_w - 0.2 * inch)
        for j, ln in enumerate(lines):
            c.drawString(cx, hy + 0.4 * inch - j * 0.22 * inch, ln)

    footer(c)
    c.showPage()


def slide_discussion(c):
    page_bg(c)
    header(c, 8, TOTAL, "Section 5")
    slide_title(c, "Discussion Questions")

    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 13)
    c.drawString(MARGIN, PAGE_H - 1.65 * inch,
                 "5 - 7 minutes. Split into age groups if you can.")

    col_w = (PAGE_W - 2 * MARGIN - 0.4 * inch) / 2
    col_h = 4.7 * inch
    col_y = 1.3 * inch

    groups = [
        ("AGES 4 - 6", TEAL, [
            "Who told the disciples to go tell others about Him?",
            "Does Jesus stay with us?  (Yes - always!)",
            "Who can YOU tell about Jesus this week?",
        ]),
        ("AGES 7 - 10", CORAL, [
            'Why did Jesus say "ALL authority" BEFORE giving the mission?',
            'What does "make disciples" actually mean?  (Not just tell - help them follow Jesus.)',
            "The disciples doubted, but Jesus still used them. What does that tell us?",
        ]),
    ]
    for i, (label, col, qs) in enumerate(groups):
        x = MARGIN + i * (col_w + 0.4 * inch)
        soft_shadow(c, x, col_y, col_w, col_h, radius=14)
        c.setFillColor(PAPER)
        c.roundRect(x, col_y, col_w, col_h, 14, fill=1, stroke=0)
        # header band
        c.setFillColor(col)
        c.roundRect(x, col_y + col_h - 0.7 * inch, col_w, 0.7 * inch, 14, fill=1, stroke=0)
        # square off bottom of header band
        c.rect(x, col_y + col_h - 0.7 * inch, col_w, 0.35 * inch, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("BodyBold", 14)
        c.drawString(x + 0.35 * inch, col_y + col_h - 0.45 * inch, label)

        # questions
        qy = col_y + col_h - 1.1 * inch
        for q in qs:
            # number circle
            c.setFillColor(col)
            c.circle(x + 0.45 * inch, qy + 0.06 * inch, 0.1 * inch, fill=1, stroke=0)
            # question text
            lines = wrap_text(c, q, "Body", 13, col_w - 0.85 * inch)
            c.setFillColor(INK)
            c.setFont("Body", 13)
            for j, ln in enumerate(lines):
                c.drawString(x + 0.7 * inch, qy - j * 0.24 * inch, ln)
            qy -= max(len(lines), 1) * 0.24 * inch + 0.4 * inch

    footer(c)
    c.showPage()


def slide_craft(c):
    page_bg(c)
    header(c, 9, TOTAL, "Section 6")
    slide_title(c, "Craft Activity")

    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 13)
    c.drawString(MARGIN, PAGE_H - 1.65 * inch,
                 "10 - 15 minutes. Pick ONE option - or let the kids choose.")

    col_w = (PAGE_W - 2 * MARGIN - 0.4 * inch) / 2
    col_h = 4.8 * inch
    col_y = 1.2 * inch

    options = [
        ("OPTION A", "Paper Plate Globe", "Best for ages 4-6", GOLD, [
            "Color a paper plate blue and green like Earth.",
            "Add stickers or drawings of people from different places.",
            'Write "GO!" across the top in big letters.',
        ], "Paper plates, markers, stickers"),
        ("OPTION B", "Footprint Path", "Best for ages 7-10", TEAL, [
            "Trace each child's foot on colored paper and cut it out.",
            "On each footprint, write ONE way they can share Jesus.",
            "Tape all the footprints as a path on the classroom wall.",
        ], "Colored paper, scissors, markers, tape"),
    ]
    for i, (eyebrow, title, age, col, steps, supplies) in enumerate(options):
        x = MARGIN + i * (col_w + 0.4 * inch)
        soft_shadow(c, x, col_y, col_w, col_h, radius=14)
        c.setFillColor(PAPER)
        c.roundRect(x, col_y, col_w, col_h, 14, fill=1, stroke=0)

        # left color rail
        c.setFillColor(col)
        c.roundRect(x, col_y, 0.18 * inch, col_h, 6, fill=1, stroke=0)

        # eyebrow + title
        c.setFillColor(col)
        c.setFont("BodyBold", 10)
        c.drawString(x + 0.5 * inch, col_y + col_h - 0.55 * inch, eyebrow)
        c.setFillColor(INK)
        c.setFont("Display", 22)
        c.drawString(x + 0.5 * inch, col_y + col_h - 1.05 * inch, title)
        c.setFillColor(MUTED)
        c.setFont("BodyItalic", 11)
        c.drawString(x + 0.5 * inch, col_y + col_h - 1.32 * inch, age)

        # steps
        sy = col_y + col_h - 1.75 * inch
        draw_bullets(c, steps, x + 0.4 * inch, sy, col_w - 0.6 * inch,
                     size=12.5, leading=18, dot_color=col)

        # supplies strip
        c.setFillColor(Color(col.red, col.green, col.blue, alpha=0.18))
        c.roundRect(x + 0.4 * inch, col_y + 0.3 * inch, col_w - 0.6 * inch, 0.55 * inch,
                    8, fill=1, stroke=0)
        c.setFillColor(col)
        c.setFont("BodyBold", 9.5)
        c.drawString(x + 0.6 * inch, col_y + 0.62 * inch, "SUPPLIES")
        c.setFillColor(INK)
        c.setFont("Body", 10.5)
        c.drawString(x + 0.6 * inch, col_y + 0.42 * inch, supplies)

    footer(c)
    c.showPage()


def slide_game(c):
    def body(c):
        col_x = MARGIN
        col_w = (PAGE_W - 2 * MARGIN) / 2 - 0.2 * inch

        c.setFillColor(SAGE)
        c.setFont("BodyBold", 11)
        c.drawString(col_x, PAGE_H - 2.4 * inch, "HOW TO PLAY")
        y = PAGE_H - 2.75 * inch
        draw_bullets(c, [
            'One child starts as "It."',
            'When they tag someone, that person is NOT out - they BOTH become "It."',
            "The pair holds hands and tags more kids together.",
            "Each new tag joins the chain. Soon EVERYONE is on the team!",
        ], col_x, y, col_w, dot_color=SAGE)

        # Right side: the lesson card
        rx = MARGIN + col_w + 0.4 * inch
        ry, rh = 1.5 * inch, 4.6 * inch
        soft_shadow(c, rx, ry, col_w, rh, radius=14)
        c.setFillColor(SAGE)
        c.roundRect(rx, ry, col_w, rh, 14, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("BodyBold", 11)
        c.drawString(rx + 0.35 * inch, ry + rh - 0.5 * inch, "THE LESSON")
        c.setFillColor(Color(1, 1, 1, alpha=0.95))
        c.setFont("BodyItalic", 16)
        msg = [
            "That's how the church grows -",
            "one person tells another,",
            "who tells another, who tells",
            "another. Jesus' message",
            "spreads everywhere!",
        ]
        for i, ln in enumerate(msg):
            c.drawString(rx + 0.35 * inch, ry + rh - 1.05 * inch - i * 0.38 * inch, ln)

    section_slide(c, 10, 7, "Section 7", 'Game: "Go Tag"', "5-10 minutes", body)


def slide_closing_prayer(c):
    page_bg(c, CREAM)
    header(c, 11, TOTAL, "Section 8")
    slide_title(c, "Closing & Sending Prayer")

    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 13)
    c.drawString(MARGIN, PAGE_H - 1.65 * inch,
                 "3 minutes. Have the kids stand up and say it together.")

    # Big prayer card
    px, py, pw, ph = MARGIN, 2.2 * inch, PAGE_W - 2 * MARGIN, 3.6 * inch
    soft_shadow(c, px, py, pw, ph, radius=16)
    c.setFillColor(PAPER)
    c.roundRect(px, py, pw, ph, 16, fill=1, stroke=0)

    c.setFillColor(GOLD)
    c.setFont("Display", 110)
    c.drawString(px + 0.4 * inch, py + ph - 1.1 * inch, "“")

    c.setFillColor(INK)
    c.setFont("Display", 26)
    c.drawString(px + 1.7 * inch, py + ph - 1.0 * inch,
                 "Jesus, thank You for being with us")
    c.drawString(px + 1.7 * inch, py + ph - 1.5 * inch,
                 "ALWAYS. This week, help us GO and")
    c.drawString(px + 1.7 * inch, py + ph - 2.0 * inch,
                 "share Your love with one person.")
    c.setFillColor(CORAL)
    c.drawString(px + 1.7 * inch, py + ph - 2.6 * inch, "Amen!")

    # Sending line
    sy = 1.3 * inch
    c.setFillColor(INK)
    c.roundRect(MARGIN, sy, PAGE_W - 2 * MARGIN, 0.7 * inch, 10, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont("BodyBold", 11)
    c.drawString(MARGIN + 0.4 * inch, sy + 0.42 * inch, "SEND THEM OUT WITH")
    c.setFillColor(white)
    c.setFont("BodyItalic", 16)
    c.drawString(MARGIN + 2.4 * inch, sy + 0.38 * inch,
                 'a high-five and the words: "Go and tell!"')

    footer(c)
    c.showPage()


def slide_take_home(c):
    page_bg(c)
    header(c, 12, TOTAL, "Take-Home")
    slide_title(c, "Take-Home Challenge")

    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 13)
    c.drawString(MARGIN, PAGE_H - 1.65 * inch,
                 "Send each child home with a card they can fill in.")

    # The card mockup - centered
    cw, ch = 6.5 * inch, 3.6 * inch
    cx = (PAGE_W - cw) / 2
    cy = 1.7 * inch

    # gold backing
    c.setFillColor(GOLD)
    c.roundRect(cx - 0.12 * inch, cy - 0.12 * inch, cw + 0.24 * inch, ch + 0.24 * inch,
                18, fill=1, stroke=0)
    # paper card
    soft_shadow(c, cx, cy, cw, ch, radius=14)
    c.setFillColor(PAPER)
    c.roundRect(cx, cy, cw, ch, 14, fill=1, stroke=0)

    # corner decorations
    c.setFillColor(CORAL)
    c.circle(cx + 0.35 * inch, cy + ch - 0.35 * inch, 0.12 * inch, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.circle(cx + cw - 0.35 * inch, cy + ch - 0.35 * inch, 0.12 * inch, fill=1, stroke=0)
    c.setFillColor(LILAC)
    c.circle(cx + 0.35 * inch, cy + 0.35 * inch, 0.12 * inch, fill=1, stroke=0)
    c.setFillColor(SAGE)
    c.circle(cx + cw - 0.35 * inch, cy + 0.35 * inch, 0.12 * inch, fill=1, stroke=0)

    c.setFillColor(CORAL)
    c.setFont("BodyBold", 12)
    c.drawCentredString(cx + cw / 2, cy + ch - 0.7 * inch, "MY MISSION THIS WEEK")

    c.setFillColor(INK)
    c.setFont("Display", 22)
    c.drawCentredString(cx + cw / 2, cy + ch - 1.4 * inch, "This week I will tell")

    # underline for name
    c.setStrokeColor(INK_SOFT)
    c.setLineWidth(1.5)
    c.line(cx + 1.2 * inch, cy + ch - 1.9 * inch, cx + cw - 1.2 * inch, cy + ch - 1.9 * inch)

    c.setFillColor(INK)
    c.setFont("Display", 22)
    c.drawCentredString(cx + cw / 2, cy + ch - 2.3 * inch, "about Jesus.")

    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 12)
    c.drawCentredString(cx + cw / 2, cy + 0.7 * inch,
                        '“And surely I am with you always.”')
    c.setFillColor(GOLD_DEEP)
    c.setFont("BodyBold", 11)
    c.drawCentredString(cx + cw / 2, cy + 0.4 * inch, "MATTHEW 28:20")

    # bottom tip
    c.setFillColor(MUTED)
    c.setFont("BodyItalic", 12)
    c.drawCentredString(PAGE_W / 2, 1.05 * inch,
                        "Ask them to bring it back next week to share what happened - and celebrate every story.")

    footer(c)
    c.showPage()


def slide_tips(c):
    page_bg(c)
    header(c, 13, TOTAL, "For the Teacher")
    slide_title(c, "Tips & Supply List")

    col_w = (PAGE_W - 2 * MARGIN - 0.4 * inch) / 2
    col_h = 5.2 * inch
    col_y = 0.9 * inch

    # Tips column
    x = MARGIN
    soft_shadow(c, x, col_y, col_w, col_h, radius=14)
    c.setFillColor(PAPER)
    c.roundRect(x, col_y, col_w, col_h, 14, fill=1, stroke=0)
    c.setFillColor(CORAL)
    c.setFont("BodyBold", 11)
    c.drawString(x + 0.4 * inch, col_y + col_h - 0.5 * inch, "TEACHER TIPS")
    c.setFillColor(INK)
    c.setFont("Display", 22)
    c.drawString(x + 0.4 * inch, col_y + col_h - 1.0 * inch, "Lead with warmth")

    tips = [
        "Use a kid-friendly Bible (NIrV or ICB).",
        "If your group is wide-aged, pair an older kid with a younger one.",
        "Repetition helps - say the memory verse often.",
        "Affirm every answer, even if it's not quite right.",
        "If time runs short, skip the game - protect the story and prayer.",
    ]
    draw_bullets(c, tips, x + 0.4 * inch, col_y + col_h - 1.5 * inch,
                 col_w - 0.6 * inch, size=12.5, leading=18, dot_color=CORAL)

    # Supplies column
    x2 = MARGIN + col_w + 0.4 * inch
    soft_shadow(c, x2, col_y, col_w, col_h, radius=14)
    c.setFillColor(PAPER)
    c.roundRect(x2, col_y, col_w, col_h, 14, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("BodyBold", 11)
    c.drawString(x2 + 0.4 * inch, col_y + col_h - 0.5 * inch, "SUPPLIES CHECKLIST")
    c.setFillColor(INK)
    c.setFont("Display", 22)
    c.drawString(x2 + 0.4 * inch, col_y + col_h - 1.0 * inch, "Gather before class")

    supplies = [
        "Kid-friendly Bible",
        "Paper plates, markers, paint, stickers",
        "Colored paper, scissors, tape",
        "Memory-verse take-home cards",
        "Open space for the tag game",
        "Optional: small reward stickers",
    ]
    # Checkbox-style bullets
    sy = col_y + col_h - 1.5 * inch
    for item in supplies:
        c.setStrokeColor(TEAL)
        c.setLineWidth(1.5)
        c.setFillColor(white)
        c.rect(x2 + 0.4 * inch, sy - 0.04 * inch, 0.18 * inch, 0.18 * inch, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont("Body", 12.5)
        c.drawString(x2 + 0.7 * inch, sy + 0.02 * inch, item)
        sy -= 0.35 * inch

    footer(c)
    c.showPage()


def slide_closing(c):
    page_bg(c, INK)

    # Decorative circles
    c.setFillColor(Color(GOLD.red, GOLD.green, GOLD.blue, alpha=0.85))
    c.circle(1.2 * inch, 1.4 * inch, 1.0 * inch, fill=1, stroke=0)
    c.setFillColor(Color(CORAL.red, CORAL.green, CORAL.blue, alpha=0.75))
    c.circle(PAGE_W - 1.3 * inch, PAGE_H - 1.6 * inch, 1.1 * inch, fill=1, stroke=0)
    c.setFillColor(Color(TEAL.red, TEAL.green, TEAL.blue, alpha=0.7))
    c.circle(PAGE_W - 2.5 * inch, PAGE_H - 0.7 * inch, 0.4 * inch, fill=1, stroke=0)

    # Title
    c.setFillColor(white)
    c.setFont("Display", 90)
    c.drawCentredString(PAGE_W / 2, PAGE_H / 2 + 0.4 * inch, "Go and Tell!")

    # Verse
    c.setFillColor(GOLD)
    c.setFont("BodyItalic", 22)
    c.drawCentredString(
        PAGE_W / 2, PAGE_H / 2 - 0.6 * inch,
        '"Therefore go and make disciples of all nations..."',
    )
    c.setFillColor(white)
    c.setFont("BodyBold", 14)
    c.drawCentredString(PAGE_W / 2, PAGE_H / 2 - 1.05 * inch, "MATTHEW 28:19")

    c.showPage()


# ---------- BUILD ----------

c = canvas_mod.Canvas(OUTPUT, pagesize=landscape(letter))
c.setTitle("The Great Commission - Sunday School Lesson Plan")
c.setAuthor("Sunday School Lesson Plan")

slide_cover(c)
slide_overview(c)
slide_welcome(c)
slide_icebreaker(c)
slide_bible_story(c)
slide_four_words(c)
slide_memory_verse(c)
slide_discussion(c)
slide_craft(c)
slide_game(c)
slide_closing_prayer(c)
slide_take_home(c)
slide_tips(c)
slide_closing(c)

c.save()
print(f"Wrote {OUTPUT}")
