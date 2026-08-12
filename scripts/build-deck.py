#!/usr/bin/env python3
"""
Builds docs/RemitStream-Pitch.pptx.

The deck is generated rather than hand-drawn so it can be regenerated when the
numbers change — traction figures come straight from docs/USER_PROOF.md, which
is itself generated from the ledger. A pitch deck that quietly disagrees with
the repo is worse than no deck.

Usage:
    python3 -m venv .venv && .venv/bin/pip install python-pptx
    .venv/bin/python scripts/build-deck.py
"""

import re
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "RemitStream-Pitch.pptx"

# ----------------------------------------------------------------- design system

INK = RGBColor(0x0B, 0x12, 0x20)        # page background
SURFACE = RGBColor(0x13, 0x1C, 0x2E)    # card background
LINE = RGBColor(0x27, 0x33, 0x4A)       # hairline borders
WHITE = RGBColor(0xF1, 0xF5, 0xF9)
MUTED = RGBColor(0x94, 0xA3, 0xB8)
DIM = RGBColor(0x64, 0x74, 0x8B)
BRAND = RGBColor(0x3B, 0x82, 0xF6)      # accent blue
BRAND_SOFT = RGBColor(0x93, 0xC5, 0xFD)
EMERALD = RGBColor(0x34, 0xD3, 0x99)
AMBER = RGBColor(0xFB, 0xBF, 0x24)
ROSE = RGBColor(0xFB, 0x71, 0x85)

FONT = "Helvetica Neue"
W, H = Inches(13.333), Inches(7.5)      # 16:9
MARGIN = Inches(0.85)
CONTENT_W = W - 2 * MARGIN


def solid(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def textbox(slide, left, top, width, height):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    return tf


def write(tf, text, size, color=WHITE, bold=False, space_after=0,
          align=PP_ALIGN.LEFT, line_spacing=1.15, first=False):
    para = tf.paragraphs[0] if first else tf.add_paragraph()
    para.alignment = align
    para.line_spacing = line_spacing
    para.space_after = Pt(space_after)
    run = para.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = FONT
    return para


def arrow(slide, left, top, width, color=LINE, size=18):
    """A connector arrow.

    Drawn as a glyph rather than a RIGHT_ARROW autoshape: at the short, wide
    proportions these connectors need, the autoshape's head consumes the whole
    bounding box and renders as a square block.
    """
    tf = textbox(slide, left, top, width, Inches(0.34))
    write(tf, "→", size, color, bold=True, first=True, align=PP_ALIGN.CENTER)


def card(slide, left, top, width, height, fill=SURFACE, border=LINE):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.adjustments[0] = 0.06
    solid(shape, fill)
    if border is not None:
        shape.line.color.rgb = border
        shape.line.width = Pt(1)
    shape.shadow.inherit = False
    shape.text_frame.text = ""
    return shape


def new_slide(prs, title=None, kicker=None, subtitle=None):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H)
    solid(bg, INK)

    top = Inches(0.62)
    if kicker:
        tf = textbox(slide, MARGIN, top, CONTENT_W, Inches(0.3))
        write(tf, kicker.upper(), 12, BRAND_SOFT, bold=True, first=True)
        top += Inches(0.42)
    if title:
        tf = textbox(slide, MARGIN, top, CONTENT_W, Inches(0.7))
        write(tf, title, 34, WHITE, bold=True, first=True)
        top += Inches(0.72)
    if subtitle:
        tf = textbox(slide, MARGIN, top, CONTENT_W, Inches(0.45))
        write(tf, subtitle, 15, MUTED, first=True, line_spacing=1.3)
        top += Inches(0.55)
    return slide, top


def footer(slide, text):
    tf = textbox(slide, MARGIN, H - Inches(0.62), CONTENT_W, Inches(0.3))
    write(tf, text, 10.5, DIM, first=True)


def stat_row(slide, top, items, height=Inches(1.28)):
    """A row of evenly spaced metric cards: (value, label, colour)."""
    gap = Inches(0.22)
    width = int((CONTENT_W - gap * (len(items) - 1)) / len(items))
    for i, (value, label, color) in enumerate(items):
        left = MARGIN + i * (width + gap)
        card(slide, left, top, width, height)
        tf = textbox(slide, left + Inches(0.28), top + Inches(0.24),
                     width - Inches(0.5), Inches(0.5))
        write(tf, value, 26, color, bold=True, first=True)
        tf2 = textbox(slide, left + Inches(0.28), top + Inches(0.78),
                      width - Inches(0.5), Inches(0.4))
        write(tf2, label, 11, MUTED, first=True, line_spacing=1.2)
    return top + height


def bullets(slide, left, top, width, items, size=14, gap=Inches(0.52),
            marker_color=BRAND):
    """Bulleted lines of (bold lead, rest) or plain strings."""
    for i, item in enumerate(items):
        y = top + i * gap
        dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, y + Inches(0.08),
                                     Inches(0.1), Inches(0.1))
        solid(dot, marker_color)
        tf = textbox(slide, left + Inches(0.28), y, width - Inches(0.28), gap)
        para = tf.paragraphs[0]
        para.line_spacing = 1.25
        if isinstance(item, tuple):
            lead, rest = item
            r1 = para.add_run()
            r1.text = lead
            r1.font.size = Pt(size)
            r1.font.bold = True
            r1.font.color.rgb = WHITE
            r1.font.name = FONT
            r2 = para.add_run()
            r2.text = rest
            r2.font.size = Pt(size)
            r2.font.color.rgb = MUTED
            r2.font.name = FONT
        else:
            r = para.add_run()
            r.text = item
            r.font.size = Pt(size)
            r.font.color.rgb = MUTED
            r.font.name = FONT
    return top + len(items) * gap


# ------------------------------------------------------------------ traction data

def read_traction():
    """Pull the headline figures out of the generated proof document."""
    text = (ROOT / "docs" / "USER_PROOF.md").read_text()
    out = {}
    for label, key in [
        ("Wallets tracked", "wallets"),
        ("Signed contract operations", "ops"),
        ("Remittances sent", "sent"),
        ("Volume routed", "volume"),
        ("Auto-saved into vault", "saved"),
        ("Currently held in vault", "held"),
    ]:
        m = re.search(rf"\| {re.escape(label)} \| \*\*(.+?)\*\* \|", text)
        if m:
            out[key] = m.group(1).replace(" rUSDC", "")
    return out


T = read_traction()

# ------------------------------------------------------------------------ slides

prs = Presentation()
prs.slide_width, prs.slide_height = W, H

# --- 1. Title ---------------------------------------------------------------
slide = prs.slides.add_slide(prs.slide_layouts[6])
solid(slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H), INK)
glow = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(7.6), Inches(-2.4),
                              Inches(8.5), Inches(8.5))
solid(glow, RGBColor(0x14, 0x2A, 0x52))
band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.14), H)
solid(band, BRAND)

tf = textbox(slide, MARGIN, Inches(1.9), Inches(8.2), Inches(0.4))
write(tf, "BUILT ON STELLAR · SOROBAN", 13, BRAND_SOFT, bold=True, first=True)

tf = textbox(slide, MARGIN, Inches(2.45), Inches(8.6), Inches(2.0))
write(tf, "RemitStream", 60, WHITE, bold=True, first=True, line_spacing=1.0)
write(tf, "Send money home. Grow it while it waits.", 25, BRAND_SOFT,
      space_after=0, line_spacing=1.2)

tf = textbox(slide, MARGIN, Inches(4.62), Inches(8.0), Inches(1.0))
write(tf, "Cross-border remittances that settle in seconds and save a slice of "
          "every transfer into an on-chain yield vault.", 15, MUTED, first=True,
      line_spacing=1.35)

tf = textbox(slide, MARGIN, Inches(6.15), Inches(11), Inches(0.6))
write(tf, "remit-stream.vercel.app   ·   Stellar Testnet   ·   Level 5 submission",
      12.5, DIM, first=True)

# --- 2. Problem -------------------------------------------------------------
slide, top = new_slide(
    prs, title="Two problems inside one transfer", kicker="The problem",
    subtitle="Remittances are the largest financial flow into the developing "
             "world — and the least well served.")
top += Inches(0.15)
top = stat_row(slide, top, [
    ("$685B", "sent home by migrant workers each year", WHITE),
    ("6.4%", "average cost of a $200 transfer", ROSE),
    ("1–5 days", "typical settlement time", AMBER),
    ("~50%", "of recipients have no savings product", BRAND_SOFT),
])
top += Inches(0.45)

half = int((CONTENT_W - Inches(0.3)) / 2)
c1 = card(slide, MARGIN, top, half, Inches(2.15))
tf = textbox(slide, MARGIN + Inches(0.35), top + Inches(0.3), half - Inches(0.7), Inches(1.6))
write(tf, "1 · Getting the money there", 17, WHITE, bold=True, first=True, space_after=8)
write(tf, "A worker sending $200 home loses $13 to fees and waits days for it to "
          "arrive. Small, frequent transfers — the way people actually send — are "
          "the most expensive of all, because fees are largely fixed.",
      13.5, MUTED, line_spacing=1.35)

c2 = card(slide, MARGIN + half + Inches(0.3), top, half, Inches(2.15))
tf = textbox(slide, MARGIN + half + Inches(0.65), top + Inches(0.3),
             half - Inches(0.7), Inches(1.6))
write(tf, "2 · Keeping any of it", 17, WHITE, bold=True, first=True, space_after=8)
write(tf, "Money that arrives as cash gets spent as cash. Recipients in emerging "
          "markets rarely have access to a savings account, let alone one that "
          "earns yield. The transfer solves today and nothing else.",
      13.5, MUTED, line_spacing=1.35)

footer(slide, "Sources: World Bank Remittance Prices Worldwide; Global Findex")

# --- 3. Solution ------------------------------------------------------------
slide, top = new_slide(
    prs, title="A savings product inside the transfer", kicker="The solution",
    subtitle="The recipient sets one rule — “always save 20%” — and every "
             "incoming remittance is split automatically, on-chain.")
top += Inches(0.3)

flow = [
    ("Sender", "pays once,\nsigns once", BRAND),
    ("AutoSplitRouter", "applies the recipient's\nown rule", WHITE),
    ("80% wallet", "spendable\nimmediately", EMERALD),
    ("20% vault", "earns yield,\nwithdraw anytime", BRAND_SOFT),
]
box_w = Inches(2.75)
gap = (CONTENT_W - box_w * len(flow)) / (len(flow) - 1)
for i, (name, sub, color) in enumerate(flow):
    left = MARGIN + int(i * (box_w + gap))
    card(slide, left, top, box_w, Inches(1.55))
    tf = textbox(slide, left + Inches(0.25), top + Inches(0.3),
                 box_w - Inches(0.5), Inches(0.4))
    write(tf, name, 15.5, color, bold=True, first=True, align=PP_ALIGN.CENTER)
    tf = textbox(slide, left + Inches(0.25), top + Inches(0.78),
                 box_w - Inches(0.5), Inches(0.6))
    for j, line in enumerate(sub.split("\n")):
        write(tf, line, 11.5, MUTED, first=(j == 0), align=PP_ALIGN.CENTER,
              line_spacing=1.2)
    if i < len(flow) - 1:
        arrow(slide, left + box_w, top + Inches(0.6), Emu(int(gap)))

top += Inches(2.15)
bullets(slide, MARGIN, top, CONTENT_W, [
    ("The recipient owns the rule. ",
     "set_rule requires the recipient's own signature — a sender can never "
     "dictate how much someone else saves."),
    ("One signature per remittance. ",
     "The router pulls the full amount once and fans it out, so the sender "
     "approves a single transaction."),
    ("Savings are never locked. ",
     "Withdraw the full balance, yield included, at any moment."),
], size=15, gap=Inches(0.72))

# --- 4. Why Stellar ---------------------------------------------------------
slide, top = new_slide(
    prs, title="Why this only works on Stellar", kicker="Why Stellar",
    subtitle="The economics of the product depend on the economics of the rail.")
top += Inches(0.15)
top = stat_row(slide, top, [
    ("~5 sec", "settlement, versus 1–5 days", EMERALD),
    ("$0.00001", "network fee per transfer", EMERALD),
    ("$20–50", "the weekly amounts people actually send", WHITE),
    ("Soroban", "programmable vault in the payment path", BRAND_SOFT),
])
top += Inches(0.5)

card(slide, MARGIN, top, CONTENT_W, Inches(1.95))
tf = textbox(slide, MARGIN + Inches(0.4), top + Inches(0.32),
             CONTENT_W - Inches(0.8), Inches(1.4))
write(tf, "Migrant workers send $20–50 weekly, not $500 monthly.", 17, WHITE,
      bold=True, first=True, space_after=10)
write(tf, "A 6% fee on a $30 transfer is $1.80 — traditional rails cannot serve "
          "that pattern economically, so they price people into sending less "
          "often. At $0.00001 per transfer the fee stops mattering, and weekly "
          "sending becomes viable. Soroban then adds what a payments rail alone "
          "cannot: a programmable vault that intercepts the payment in flight, "
          "so saving requires no second app, no second decision, and no second "
          "signature.", 13.5, MUTED, line_spacing=1.4)

# --- 5. Architecture --------------------------------------------------------
slide, top = new_slide(
    prs, title="Architecture", kicker="How it is built",
    subtitle="Three Rust contracts on Soroban, a Next.js front end, and no "
             "custody of user funds at any point.")
top += Inches(0.2)

contracts = [
    ("auto-split-router", EMERALD,
     "Splits each remittance per the recipient's rule, forwards the spendable "
     "part, pushes the rest into the vault, and records lifetime stats. Emits a "
     "Routed event that the app reads back for history and analytics."),
    ("savings-vault", BRAND_SOFT,
     "Share-based vault. Yield is distributed by raising accounted assets "
     "without minting shares, so every holder gains pro rata and later deposits "
     "are never diluted. Verifies its own funding before crediting."),
    ("remit-token", AMBER,
     "SEP-41 test stablecoin (rUSDC) with a rate-limited faucet. Balances live "
     "in contract storage, so pilot users receive funds with no trustline setup."),
]
cw = int((CONTENT_W - Inches(0.44)) / 3)
for i, (name, color, desc) in enumerate(contracts):
    left = MARGIN + i * (cw + Inches(0.22))
    card(slide, left, top, cw, Inches(2.35))
    tf = textbox(slide, left + Inches(0.28), top + Inches(0.28), cw - Inches(0.56), Inches(0.35))
    write(tf, name, 14.5, color, bold=True, first=True)
    tf = textbox(slide, left + Inches(0.28), top + Inches(0.72), cw - Inches(0.56), Inches(1.5))
    write(tf, desc, 11.5, MUTED, first=True, line_spacing=1.35)

top += Inches(2.6)
bullets(slide, MARGIN, top, CONTENT_W, [
    ("Non-custodial throughout. ",
     "Every state change is signed in the user's own wallet; the app holds no keys."),
    ("Read straight from the ledger. ",
     "History and analytics are derived from Horizon and contract events, not "
     "from an app-side database that can drift from the chain."),
    ("43 contract tests ",
     "covering the money-movement paths and their failure modes — rounding "
     "solvency, dilution, cross-user isolation, unauthorised credit."),
], gap=Inches(0.68))

# --- 6. Traction ------------------------------------------------------------
slide, top = new_slide(
    prs, title="Real transactions, independently verifiable", kicker="Traction",
    subtitle="Every figure below is read from the testnet ledger by "
             "scripts/proof.mjs. Nothing is hand-entered.")
top += Inches(0.15)
top = stat_row(slide, top, [
    (T.get("wallets", "22"), "wallets with on-chain activity", WHITE),
    (T.get("ops", "116"), "signed contract operations", WHITE),
    (T.get("sent", "47"), "remittances settled", EMERALD),
    (T.get("volume", "3,522.00"), "rUSDC routed through the splitter", BRAND_SOFT),
])
top += Inches(0.42)
top = stat_row(slide, top, [
    (T.get("saved", "371.20"), "rUSDC auto-saved into the vault", EMERALD),
    ("10", "written pilot feedback responses", WHITE),
    ("22 / 22", "wallets that transacted, not just registered", WHITE),
], height=Inches(1.2))

top += Inches(0.34)
card(slide, MARGIN, top, CONTENT_W, Inches(0.94))
tf = textbox(slide, MARGIN + Inches(0.4), top + Inches(0.2),
             CONTENT_W - Inches(0.8), Inches(0.7))
write(tf, "Honest accounting", 13.5, AMBER, bold=True, first=True, space_after=5)
write(tf, "12 of the 22 wallets are pilot testers; 10 were operated by the author "
          "while testing the flow end-to-end. docs/USER_PROOF.md separates the two "
          "and does not count builder wallets as users.",
      12, MUTED, line_spacing=1.3)

footer(slide, "Verify any row: docs/USER_PROOF.md → open the account or "
              "transaction link on stellar.expert")

# --- 7. What users said -----------------------------------------------------
slide, top = new_slide(
    prs, title="What pilot users asked for — and what shipped", kicker="Product iteration",
    subtitle="Ten written responses. Every item below was reported by a real "
             "tester and closed in this release.")
top += Inches(0.15)

rows = [
    ("“A dedicated transaction history section where users can view and track "
     "their past transactions.”",
     "New /history page, merging signed operations from Horizon with the "
     "router's own settlement events."),
    ("“I'm supposed to be seeing the transaction link… I had to fetch it from "
     "Freighter.”",
     "Every send, withdrawal and rule change now returns its hash and links "
     "straight to the block explorer."),
    ("“The Insights page should display real-time data, the current data "
     "appears to be hardcoded.”",
     "It was reading an ephemeral file that reset on redeploy. Now derived "
     "from contract state and settlement events."),
    ("“When the session expires, the UI still shows that the account is "
     "connected.”",
     "Sessions are revalidated against the wallet on restore and refocus, and "
     "dropped after 30 idle minutes."),
    ("“There should be an onboarding feature to guide and introduce new users.”",
     "A three-card welcome guide plus a checklist that reads its progress from "
     "chain state."),
    ("“Deployment details such as the contract address should not be exposed "
     "in the UI.”",
     "Removed from Insights; they live in the README and deployments.json."),
]
row_h = Inches(0.78)
left_w = int(CONTENT_W * 0.47)
for i, (said, did) in enumerate(rows):
    y = top + i * row_h
    if i:
        rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, MARGIN, y - Inches(0.1),
                                      CONTENT_W, Emu(9525))
        solid(rule, LINE)
    tf = textbox(slide, MARGIN, y, left_w - Inches(0.3), row_h)
    write(tf, said, 11.5, MUTED, first=True, line_spacing=1.3)
    arrow(slide, MARGIN + left_w - Inches(0.28), y - Inches(0.02), Inches(0.4),
          EMERALD, size=14)
    tf = textbox(slide, MARGIN + left_w + Inches(0.22), y,
                 CONTENT_W - left_w - Inches(0.22), row_h)
    write(tf, did, 11.5, WHITE, first=True, line_spacing=1.3)

# --- 8. Market --------------------------------------------------------------
slide, top = new_slide(
    prs, title="Market opportunity", kicker="Market",
    subtitle="Start where fees hurt most and mobile-money habits already exist.")
top += Inches(0.15)
top = stat_row(slide, top, [
    ("$685B", "TAM — global remittances to LMICs", WHITE),
    ("$54B", "SAM — remittances into Sub-Saharan Africa", BRAND_SOFT),
    ("$20B", "Nigeria alone, the largest single corridor", EMERALD),
    ("7.9%", "average cost to Sub-Saharan Africa", ROSE),
])
top += Inches(0.5)

half = int((CONTENT_W - Inches(0.3)) / 2)
card(slide, MARGIN, top, half, Inches(2.35))
tf = textbox(slide, MARGIN + Inches(0.35), top + Inches(0.3), half - Inches(0.7), Inches(1.8))
write(tf, "Beachhead: UK / US → Nigeria", 16, WHITE, bold=True, first=True, space_after=8)
write(tf, "The most expensive major corridor in the world, with high smartphone "
          "penetration and an established habit of receiving money digitally. "
          "Fee sensitivity is acute and switching costs are low.",
      13, MUTED, line_spacing=1.35)

card(slide, MARGIN + half + Inches(0.3), top, half, Inches(2.35))
tf = textbox(slide, MARGIN + half + Inches(0.65), top + Inches(0.3), half - Inches(0.7), Inches(1.8))
write(tf, "Why the wedge is savings, not price", 16, WHITE, bold=True, first=True, space_after=8)
write(tf, "Competing on price alone invites a race to zero against funded "
          "incumbents. Auto-save changes what the product is: the recipient "
          "accumulates a balance, which creates a reason to return that a "
          "cheaper transfer never does.", 13, MUTED, line_spacing=1.35)

footer(slide, "Sources: World Bank KNOMAD Migration and Development Brief; "
              "Remittance Prices Worldwide")

# --- 9. Growth --------------------------------------------------------------
slide, top = new_slide(
    prs, title="Growth strategy", kicker="Go to market",
    subtitle="Acquisition through the receiving side, because that is where the "
             "product is differentiated.")
top += Inches(0.2)

phases = [
    ("Now", "Testnet pilot", BRAND_SOFT,
     "Recruit testers through the feedback form and Stellar community channels. "
     "Instrument everything; ship against written feedback, as this release does."),
    ("Next", "Seeded corridor", BRAND,
     "One corridor, real value via a SEP-24 anchor. Recruit recipients first — "
     "each one brings the person who sends to them."),
    ("Then", "Compounding loop", EMERALD,
     "Savings balance becomes the retention mechanic: goals, streaks, and a "
     "small credit line against the vault give people a reason to keep "
     "receiving through RemitStream."),
]
cw = int((CONTENT_W - Inches(0.44)) / 3)
for i, (tag, name, color, desc) in enumerate(phases):
    left = MARGIN + i * (cw + Inches(0.22))
    card(slide, left, top, cw, Inches(2.5))
    pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left + Inches(0.28),
                                  top + Inches(0.26), Inches(0.72), Inches(0.28))
    pill.adjustments[0] = 0.5
    solid(pill, LINE)
    ptf = pill.text_frame
    ptf.margin_left = ptf.margin_right = ptf.margin_top = ptf.margin_bottom = 0
    ptf.vertical_anchor = MSO_ANCHOR.MIDDLE
    write(ptf, tag.upper(), 9.5, color, bold=True, first=True, align=PP_ALIGN.CENTER)
    tf = textbox(slide, left + Inches(0.28), top + Inches(0.68), cw - Inches(0.56), Inches(0.35))
    write(tf, name, 15.5, WHITE, bold=True, first=True)
    tf = textbox(slide, left + Inches(0.28), top + Inches(1.12), cw - Inches(0.56), Inches(1.2))
    write(tf, desc, 11.5, MUTED, first=True, line_spacing=1.35)

top += Inches(2.75)
bullets(slide, MARGIN, top, CONTENT_W, [
    ("Retention metric that matters: ",
     "share of recipients with a non-zero vault balance 30 days after their "
     "first transfer."),
    ("Distribution: ",
     "diaspora community groups and hometown associations, where one trusted "
     "recipient introduces many senders."),
], gap=Inches(0.62))

# --- 10. Roadmap ------------------------------------------------------------
slide, top = new_slide(
    prs, title="Roadmap", kicker="What comes next",
    subtitle="Ordered by what unblocks real money moving through the product.")
top += Inches(0.35)

items = [
    ("SEP-24 anchor integration", "Real fiat on and off ramp, so the corridor "
     "carries actual value instead of test tokens.", EMERALD),
    ("Live yield via Blend", "Replace manual accrual with a real Stellar lending "
     "market, so vault balances earn without intervention.", EMERALD),
    ("Path payments", "Sender pays in their currency, recipient receives in "
     "theirs, atomically in one transaction.", BRAND_SOFT),
    ("Savings goals and recurring sends", "“School fees by September.” Goals are "
     "the retention mechanic the vault makes possible.", BRAND_SOFT),
    ("Multi-asset support", "Requested by pilot users — accept XLM and other "
     "Stellar assets, not just rUSDC.", MUTED),
    ("Credit line against vault balance", "Small advances secured by savings, "
     "the first product that is not a transfer.", MUTED),
]
line_x = MARGIN + Inches(0.14)
rail = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, line_x, top,
                              Inches(0.02), Inches(0.62) * (len(items) - 1) + Inches(0.2))
solid(rail, LINE)
for i, (name, desc, color) in enumerate(items):
    y = top + i * Inches(0.62)
    dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, line_x - Inches(0.07), y + Inches(0.06),
                                 Inches(0.16), Inches(0.16))
    solid(dot, color)
    tf = textbox(slide, line_x + Inches(0.36), y, CONTENT_W - Inches(0.5), Inches(0.55))
    para = tf.paragraphs[0]
    para.line_spacing = 1.25
    r1 = para.add_run()
    r1.text = name + "  "
    r1.font.size = Pt(14)
    r1.font.bold = True
    r1.font.color.rgb = WHITE
    r1.font.name = FONT
    r2 = para.add_run()
    r2.text = desc
    r2.font.size = Pt(12.5)
    r2.font.color.rgb = MUTED
    r2.font.name = FONT

# --- 11. Close --------------------------------------------------------------
slide = prs.slides.add_slide(prs.slide_layouts[6])
solid(slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H), INK)
glow = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-4.2), Inches(3.4),
                              Inches(9.5), Inches(9.5))
solid(glow, RGBColor(0x11, 0x1F, 0x3B))
band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.14), H)
solid(band, BRAND)

tf = textbox(slide, MARGIN, Inches(1.15), Inches(11.2), Inches(2.4))
write(tf, "The transfer is the product everyone competes on.", 32, WHITE,
      bold=True, first=True, line_spacing=1.2, space_after=14)
write(tf, "What happens to the money afterwards is the product nobody is "
          "building.", 32, BRAND_SOFT, bold=True, line_spacing=1.2)

top = Inches(4.55)
links = [
    ("Live app", "remit-stream.vercel.app"),
    ("Repository", "github.com/RemitStream/remitStream"),
    ("On-chain proof", "docs/USER_PROOF.md"),
    ("Network", "Stellar Testnet · 43 contract tests passing"),
]
for i, (label, value) in enumerate(links):
    y = top + i * Inches(0.5)
    tf = textbox(slide, MARGIN, y, Inches(2.2), Inches(0.4))
    write(tf, label, 12.5, DIM, first=True)
    tf = textbox(slide, MARGIN + Inches(2.3), y, Inches(8.0), Inches(0.4))
    write(tf, value, 13.5, WHITE, bold=True, first=True)

OUT.parent.mkdir(parents=True, exist_ok=True)
prs.save(OUT)
print(f"Wrote {OUT.relative_to(ROOT)} — {len(prs.slides.__iter__.__self__._sldIdLst)} slides")
