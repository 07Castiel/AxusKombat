# -*- coding: utf-8 -*-
"""
Gerador do Relatório de Auditoria de Segurança do Axus Kombat.

Uso (dentro do venv com reportlab + matplotlib):
    python gerar_relatorio.py

Saída:
    relatorio-auditoria-seguranca.pdf   (neste mesmo diretório)

Regera o PDF a partir de achados.py. Sem rede, sem instalação global.
"""
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, KeepTogether, Flowable,
)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import achados as A  # noqa: E402

PDF_PATH = os.path.join(HERE, "relatorio-auditoria-seguranca.pdf")
ASSETS = os.path.join(HERE, "_assets")
os.makedirs(ASSETS, exist_ok=True)

# ---------------------------------------------------------------------------
# Fontes (DejaVu — cobre acentuação pt-BR e é embutível)
# ---------------------------------------------------------------------------
DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
DEJAVU_M = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
pdfmetrics.registerFont(TTFont("DejaVu", DEJAVU))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", DEJAVU_B))
pdfmetrics.registerFont(TTFont("DejaVu-Mono", DEJAVU_M))
for p in (DEJAVU, DEJAVU_B, DEJAVU_M):
    font_manager.fontManager.addfont(p)
plt.rcParams["font.family"] = "DejaVu Sans"

INK = colors.HexColor("#1F2933")       # texto primário
INK2 = colors.HexColor("#52606D")      # texto secundário
MUTED = colors.HexColor("#7B8794")     # texto muted
SURFACE = colors.HexColor("#FFFFFF")
PANEL = colors.HexColor("#F5F7FA")
LINE = colors.HexColor("#E4E7EB")
BRAND = colors.HexColor("#0F172A")

C = {k: colors.HexColor(v) for k, v in A.CORES.items()}

REPORT_NAME = f"Relatório de Auditoria de Segurança — {A.PROJETO}"

# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------
ss = getSampleStyleSheet()


def style(name, **kw):
    base = dict(fontName="DejaVu", fontSize=9.5, leading=14, textColor=INK,
                alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)


S = {
    "h1": style("h1", fontName="DejaVu-Bold", fontSize=17, leading=21,
                textColor=BRAND, spaceBefore=6, spaceAfter=10),
    "h2": style("h2", fontName="DejaVu-Bold", fontSize=12.5, leading=16,
                textColor=BRAND, spaceBefore=14, spaceAfter=6),
    "h3": style("h3", fontName="DejaVu-Bold", fontSize=10.5, leading=14,
                textColor=INK, spaceBefore=8, spaceAfter=3),
    "body": style("body", alignment=TA_JUSTIFY, spaceAfter=5),
    "bodyc": style("bodyc", alignment=TA_LEFT, spaceAfter=4),
    "small": style("small", fontSize=8.5, leading=12, textColor=INK2),
    "muted": style("muted", fontSize=8.5, leading=12, textColor=MUTED),
    "mono": style("mono", fontName="DejaVu-Mono", fontSize=7.7, leading=10.5,
                  textColor=INK, backColor=PANEL),
    "cell": style("cell", fontSize=8.3, leading=11),
    "cellsm": style("cellsm", fontSize=7.6, leading=10),
    "chip": style("chip", fontName="DejaVu-Bold", fontSize=8, leading=10,
                  textColor=colors.white, alignment=TA_CENTER),
    "cover_t": style("cover_t", fontName="DejaVu-Bold", fontSize=25, leading=30,
                     textColor=colors.white, alignment=TA_LEFT),
    "cover_s": style("cover_s", fontSize=12, leading=17, textColor=colors.HexColor("#CBD5E1"),
                     alignment=TA_LEFT),
    "cover_m": style("cover_m", fontSize=9.5, leading=15, textColor=colors.HexColor("#94A3B8")),
    "issue": style("issue", fontName="DejaVu-Mono", fontSize=7.6, leading=11,
                   textColor=INK),
}


# ---------------------------------------------------------------------------
# Gráficos (matplotlib -> PNG)
# ---------------------------------------------------------------------------
def contagem_por_severidade():
    ordem = ["critica", "alta", "media", "baixa", "informativa"]
    cont = {k: 0 for k in ordem}
    for a in A.ACHADOS:
        cont[a["severidade"]] += 1
    return ordem, cont


def grafico_rosca():
    ordem, cont = contagem_por_severidade()
    labels, vals, cols = [], [], []
    for k in ordem:
        if cont[k] == 0:
            continue
        labels.append(f"{A.SEV_LABEL[k]} ({cont[k]})")
        vals.append(cont[k])
        cols.append(A.CORES[k])
    fig, ax = plt.subplots(figsize=(3.5, 3.0), dpi=200)
    wedges, _ = ax.pie(vals, colors=cols, startangle=90, counterclock=False,
                       wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2))
    total = sum(vals)
    ax.text(0, 0.08, str(total), ha="center", va="center",
            fontsize=22, fontweight="bold", color="#1F2933")
    ax.text(0, -0.22, "achados", ha="center", va="center", fontsize=9, color="#7B8794")
    ax.legend(wedges, labels, loc="center left", bbox_to_anchor=(1.0, 0.5),
              frameon=False, fontsize=8.5, handlelength=1.1, handleheight=1.1)
    ax.set(aspect="equal")
    fig.subplots_adjust(left=0.0, right=0.62, top=0.98, bottom=0.02)
    out = os.path.join(ASSETS, "rosca.png")
    fig.savefig(out, transparent=True)
    plt.close(fig)
    return out


def grafico_barras():
    # achados por categoria
    cats = {}
    for a in A.ACHADOS:
        cat = a["categoria"]
        cats.setdefault(cat, []).append(a["severidade"])
    labels = list(cats.keys())
    # rótulo curto
    short = {
        "1. Isolamento de inquilino": "1 · Isolamento\nde inquilino",
        "2. Permissão no navegador": "2 · Permissão\nno navegador",
        "3. IDOR": "3 · IDOR",
        "4. Chaves / defaults inseguros": "4 · Chaves /\ndefaults",
        "5. Inputs sem tratamento": "5 · Inputs\n(XSS)",
    }
    xs = [short.get(l, l) for l in labels]
    # cor = severidade máxima na categoria
    peso = {"critica": 5, "alta": 4, "media": 3, "baixa": 2, "informativa": 1}
    counts, cols = [], []
    for l in labels:
        sevs = cats[l]
        counts.append(len(sevs))
        pior = max(sevs, key=lambda s: peso[s])
        cols.append(A.CORES[pior])
    fig, ax = plt.subplots(figsize=(5.4, 2.7), dpi=200)
    bars = ax.bar(range(len(xs)), counts, color=cols, width=0.62, zorder=3)
    for b, c in zip(bars, counts):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.06, str(c),
                ha="center", va="bottom", fontsize=10, fontweight="bold", color="#1F2933")
    ax.set_xticks(range(len(xs)))
    ax.set_xticklabels(xs, fontsize=8, color="#52606D")
    ax.set_ylim(0, max(counts) + 0.8)
    ax.set_yticks(range(0, max(counts) + 1))
    ax.tick_params(axis="y", labelsize=8, colors="#7B8794")
    ax.grid(axis="y", color="#E4E7EB", linewidth=0.8, zorder=0)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#E4E7EB")
    fig.subplots_adjust(left=0.06, right=0.99, top=0.95, bottom=0.20)
    out = os.path.join(ASSETS, "barras.png")
    fig.savefig(out, transparent=True)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# Flowables auxiliares
# ---------------------------------------------------------------------------
class HR(Flowable):
    def __init__(self, width, color=LINE, thickness=0.7, pad=2):
        super().__init__()
        self.width = width
        self.color = color
        self.thickness = thickness
        self.pad = pad
        self.height = thickness + pad * 2

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.pad, self.width, self.pad)


CHIP_LABEL = {"critica": "CRÍTICA", "alta": "ALTA", "media": "MÉDIA",
              "baixa": "BAIXA", "informativa": "INFO"}


def chip(sev):
    """Chip colorido de severidade para célula de tabela."""
    txt = CHIP_LABEL[sev]
    t = Table([[Paragraph(txt, S["chip"])]], colWidths=[2.05 * cm], rowHeights=[0.52 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C[sev]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def mono_block(text, width):
    """Bloco de código monoespaçado com fundo."""
    rows = [[Paragraph(esc(text).replace("\n", "<br/>"), S["mono"])]]
    t = Table(rows, colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


# ---------------------------------------------------------------------------
# Documento: capa + cabeçalho/rodapé
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN = 2 * cm
CONTENT_W = PAGE_W - 2 * MARGIN


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BRAND)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # faixa de severidade no topo
    x = 0
    seg = PAGE_W / 5
    for k in ["critica", "alta", "media", "baixa", "forte"]:
        canvas.setFillColor(C[k])
        canvas.rect(x, PAGE_H - 0.5 * cm, seg, 0.5 * cm, fill=1, stroke=0)
        x += seg
    canvas.restoreState()


def on_page(canvas, doc):
    canvas.saveState()
    # cabeçalho
    canvas.setFont("DejaVu", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, PAGE_H - 1.25 * cm, REPORT_NAME)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, PAGE_H - 1.35 * cm, PAGE_W - MARGIN, PAGE_H - 1.35 * cm)
    # rodapé
    canvas.line(MARGIN, 1.2 * cm, PAGE_W - MARGIN, 1.2 * cm)
    canvas.setFont("DejaVu", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 0.85 * cm, f"{A.PROJETO} · Confidencial")
    canvas.drawRightString(PAGE_W - MARGIN, 0.85 * cm, f"Página {doc.page - 1}")
    canvas.restoreState()


def build():
    doc = BaseDocTemplate(
        PDF_PATH, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=1.7 * cm, bottomMargin=1.6 * cm,
        title=REPORT_NAME, author="Auditoria de Segurança",
    )
    frame = Frame(MARGIN, 1.6 * cm, CONTENT_W, PAGE_H - 1.7 * cm - 1.6 * cm, id="main")
    cover_frame = Frame(MARGIN, 2.5 * cm, CONTENT_W, PAGE_H - 8 * cm, id="cover")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=on_cover),
        PageTemplate(id="body", frames=[frame], onPage=on_page),
    ])

    story = []
    story += cover()
    story.append(NextPageTemplate("body"))  # a partir da próxima página, fundo branco
    story.append(PageBreak())
    story += resumo_executivo()
    story += pontos_fortes_fracos()
    story += tabela_detalhada()
    story += recomendacoes()
    story += issues_github()
    doc.build(story)


# Troca de template após a capa
from reportlab.platypus.doctemplate import NextPageTemplate  # noqa: E402


# ---------------------------------------------------------------------------
# Seções
# ---------------------------------------------------------------------------
def cover():
    el = []
    el.append(Spacer(1, 1.2 * cm))
    el.append(Paragraph("AUDITORIA DE SEGURANÇA", S["cover_s"]))
    el.append(Spacer(1, 0.3 * cm))
    el.append(Paragraph(f"Relatório de Auditoria de<br/>Segurança — {A.PROJETO}", S["cover_t"]))
    el.append(Spacer(1, 0.8 * cm))
    el.append(HR(CONTENT_W, color=colors.HexColor("#334155"), thickness=1))
    el.append(Spacer(1, 0.5 * cm))
    ordem, cont = contagem_por_severidade()
    resumo = " · ".join(
        f"{cont[k]} {A.SEV_LABEL[k]}" for k in ordem if cont[k]
    )
    linhas = [
        f"<b>Data:</b> {A.DATA}",
        f"<b>Escopo auditado:</b> repositório 07Castiel/AxusKombat — código-fonte "
        f"({A.STACK['framework']}), migrações e RLS do Supabase/PostgreSQL, rotas "
        f"públicas, worker de WhatsApp, integração Stripe, bundle do navegador e "
        f"histórico git (400 commits).",
        f"<b>Total de achados:</b> {sum(cont.values())} ({resumo}).",
        "<b>Categorias:</b> (1) isolamento de inquilino, (2) permissão no navegador, "
        "(3) IDOR, (4) chaves/segredos, (5) inputs sem tratamento (XSS).",
    ]
    for l in linhas:
        el.append(Paragraph(l, S["cover_m"]))
        el.append(Spacer(1, 0.18 * cm))
    el.append(Spacer(1, 0.5 * cm))
    el.append(Paragraph(
        "<b>Nota metodológica.</b> Cada categoria foi mapeada para o equivalente "
        "da stack detectada. O isolamento de inquilino do projeto é RLS no Postgres "
        "(get_current_tenant), não havendo Supabase 'sem RLS'; a verificação de "
        "permissão foi cruzada entre os gates do frontend (React) e o caminho de "
        "escrita real (server function ou escrita direta protegida por RLS); IDOR foi "
        "varrido nos 63 handlers e nas policies; segredos foram procurados na árvore, "
        "no bundle e em todo o histórico git; XSS foi avaliado no React (escape "
        "automático), nos sinks dangerouslySetInnerHTML e nas exportações. Os achados "
        "críticos foram reproduzidos em uma instância PostgreSQL 16 local montada a "
        "partir das migrações reais do repositório.",
        S["cover_m"]))
    return el


def kpi_cards():
    ordem, cont = contagem_por_severidade()
    cells = []
    data = [("critica", "Crítica"), ("alta", "Alta"), ("media", "Média"),
            ("baixa", "Baixa"), ("informativa", "Info")]
    row = []
    for k, lbl in data:
        inner = Table(
            [[Paragraph(str(cont[k]), ParagraphStyle(
                "kpi", fontName="DejaVu-Bold", fontSize=20, leading=22,
                textColor=C[k], alignment=TA_CENTER))],
             [Paragraph(lbl, ParagraphStyle(
                 "kpil", fontName="DejaVu", fontSize=8, leading=10,
                 textColor=INK2, alignment=TA_CENTER))]],
            colWidths=[CONTENT_W / 5 - 6],
        )
        inner.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
            ("LINEABOVE", (0, 0), (-1, 0), 2.2, C[k]),
            ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ]))
        row.append(inner)
    t = Table([row], colWidths=[CONTENT_W / 5] * 5)
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def resumo_executivo():
    el = [Paragraph("Resumo executivo", S["h1"])]
    total = len(A.ACHADOS)
    ncrit = sum(1 for a in A.ACHADOS if a["severidade"] == "critica")
    nalta = sum(1 for a in A.ACHADOS if a["severidade"] == "alta")
    el.append(Paragraph(
        f"A auditoria identificou <b>{total} achados</b>, sendo <b>{ncrit} "
        f"crítico</b> e <b>{nalta} de severidade alta</b>. O risco central é a "
        "possibilidade de um usuário anônimo tomar conta dos dados de outra academia "
        "(quebra de isolamento multi-inquilino), seguido de duas escaladas de "
        "privilégio gravadas direto do navegador — burla de assinatura/suspensão e "
        "reset das próprias permissões. As fundações de segurança do projeto, porém, "
        "são sólidas: RLS em todas as tabelas, webhook do Stripe robusto, portal do "
        "aluno com 2º fator e nenhum segredo vivo no código ou no histórico git.",
        S["body"]))
    el.append(Spacer(1, 0.2 * cm))
    el.append(kpi_cards())
    el.append(Spacer(1, 0.5 * cm))

    rosca = grafico_rosca()
    barras = grafico_barras()
    left = [Paragraph("Achados por severidade", S["h3"]),
            Image(rosca, width=8.0 * cm, height=6.86 * cm)]
    right = [Paragraph("Achados por categoria", S["h3"]),
             Image(barras, width=8.6 * cm, height=4.3 * cm),
             Spacer(1, 0.2 * cm),
             Paragraph("Cor da barra = maior severidade da categoria.", S["muted"])]
    g = Table([[left, right]], colWidths=[8.4 * cm, CONTENT_W - 8.4 * cm])
    g.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (0, 0), 6)]))
    el.append(g)
    el.append(Spacer(1, 0.3 * cm))

    # tabela panorâmica
    el.append(Paragraph("Panorama dos achados", S["h3"]))
    head = [Paragraph("<b>#</b>", S["cellsm"]),
            Paragraph("<b>Severidade</b>", S["cellsm"]),
            Paragraph("<b>Categoria</b>", S["cellsm"]),
            Paragraph("<b>Achado</b>", S["cellsm"])]
    rows = [head]
    for a in A.ACHADOS:
        rows.append([
            Paragraph(str(a["id"]), S["cellsm"]),
            chip(a["severidade"]),
            Paragraph(a["categoria"], S["cellsm"]),
            Paragraph(esc(a["titulo"]), S["cellsm"]),
        ])
    t = Table(rows, colWidths=[0.8 * cm, 2.3 * cm, 3.2 * cm, CONTENT_W - 6.3 * cm],
              repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVu-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [SURFACE, PANEL]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    el.append(t)
    return el


def pontos_fortes_fracos():
    el = [PageBreak(), Paragraph("Pontos fortes e pontos fracos", S["h1"])]
    el.append(Paragraph("Pontos fortes (o que está protegido)", S["h2"]))
    el.append(Paragraph(
        "Itens verificados no código real e considerados corretos — comprovam a "
        "cobertura da auditoria.", S["muted"]))
    el.append(Spacer(1, 0.2 * cm))
    for titulo, desc in A.PONTOS_FORTES:
        bullet = Table(
            [[Paragraph("✓", ParagraphStyle("ok", fontName="DejaVu-Bold",
                                            fontSize=11, textColor=C["forte"])),
              Paragraph(f"<b>{esc(titulo)}.</b> {esc(desc)}", S["small"])]],
            colWidths=[0.7 * cm, CONTENT_W - 0.7 * cm])
        bullet.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                    ("TOPPADDING", (0, 0), (-1, -1), 1),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        el.append(bullet)

    el.append(Paragraph("Pontos fracos (os riscos centrais)", S["h2"]))
    fracos = [a for a in A.ACHADOS if a["severidade"] in ("critica", "alta")]
    for a in fracos:
        bar = Table(
            [[Paragraph(f"<b>#{a['id']} · {esc(a['titulo'])}</b>", S["small"])]],
            colWidths=[CONTENT_W])
        bar.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PANEL),
            ("LINEBEFORE", (0, 0), (0, 0), 3, C[a["severidade"]]),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        el.append(bar)
        el.append(Paragraph(esc(a["impacto"]), S["small"]))
        el.append(Spacer(1, 0.18 * cm))
    return el


def tabela_detalhada():
    el = [PageBreak(), Paragraph("Achados detalhados", S["h1"])]
    el.append(Paragraph(
        "Um bloco por achado, agrupado por categoria. Cada bloco traz severidade, "
        "arquivo:linha, trecho do código, por que é explorável, impacto, correção, "
        "critérios de aceite e condições de explorabilidade.", S["muted"]))
    el.append(Spacer(1, 0.25 * cm))

    cat_atual = None
    for a in A.ACHADOS:
        if a["categoria"] != cat_atual:
            cat_atual = a["categoria"]
            el.append(Paragraph(esc(cat_atual), S["h2"]))

        # cabeçalho do achado: chip + título + arquivo
        head = Table(
            [[chip(a["severidade"]),
              Paragraph(f"<b>#{a['id']} — {esc(a['titulo'])}</b>", S["cell"])]],
            colWidths=[2.2 * cm, CONTENT_W - 2.2 * cm])
        head.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("LEFTPADDING", (1, 0), (1, 0), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))

        block = [head,
                 Paragraph(f"<b>Arquivo:</b> {esc(a['arquivo'])}", S["small"]),
                 Paragraph(f"<b>Ref.:</b> {esc(a['linhas'])}", S["muted"]),
                 Spacer(1, 0.12 * cm),
                 mono_block(a["trecho"], CONTENT_W),
                 Spacer(1, 0.12 * cm)]

        def field(label, val):
            return Paragraph(f"<b>{label}:</b> {esc(val)}", S["small"])

        block += [
            field("Por que é explorável", a["por_que"]),
            Spacer(1, 0.06 * cm),
            field("Impacto", a["impacto"]),
            Spacer(1, 0.06 * cm),
            field("Explorabilidade", a["explorabilidade"]),
            Spacer(1, 0.06 * cm),
            field("Correção sugerida", a["correcao"]),
            Spacer(1, 0.08 * cm),
            Paragraph("<b>Critérios de aceite:</b>", S["small"]),
        ]
        for c in a["criterios"]:
            block.append(Paragraph(f"☐ {esc(c)}", S["small"]))
        block.append(HR(CONTENT_W))
        block.append(Spacer(1, 0.2 * cm))
        el.append(KeepTogether(block) if len(a["trecho"]) < 600 else block[0])
        if not (len(a["trecho"]) < 600):
            el += block[1:]
    return el


def recomendacoes():
    el = [PageBreak(), Paragraph("Recomendações priorizadas", S["h1"])]
    el.append(Paragraph(
        "P1 = corrigir antes de qualquer novo release. P2 = próximo ciclo. "
        "P3 = higiene e prevenção.", S["muted"]))
    el.append(Spacer(1, 0.2 * cm))
    cor_p = {"P1": C["critica"], "P2": C["media"], "P3": C["baixa"]}
    rows = []
    for pr, texto in A.RECOMENDACOES:
        tag = Table([[Paragraph(pr, S["chip"])]], colWidths=[1.1 * cm], rowHeights=[0.5 * cm])
        tag.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), cor_p[pr]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        rows.append([tag, Paragraph(esc(texto), S["small"])])
    t = Table(rows, colWidths=[1.3 * cm, CONTENT_W - 1.3 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [SURFACE, PANEL]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    el.append(t)
    return el


def issue_markdown(issue):
    ids = issue["achados"]
    principal = next(a for a in A.ACHADOS if a["id"] == ids[0])
    labels = ", ".join(f"`{l}`" for l in issue["labels"])
    titulo_curto = principal["titulo"].split("(")[0].strip()
    if len(titulo_curto) > 80:
        titulo_curto = titulo_curto[:77] + "..."
    linhas = []
    linhas.append(f"**Título:** [Segurança] {titulo_curto}")
    linhas.append(f"**Labels:** {labels}")
    linhas.append("")
    for aid in ids:
        a = next(x for x in A.ACHADOS if x["id"] == aid)
        if len(ids) > 1:
            linhas.append(f"### Achado #{a['id']}: {a['titulo']}")
        linhas.append(f"**Severidade:** {A.SEV_LABEL[a['severidade']]}")
        linhas.append("")
        linhas.append("#### Problema e por que é explorável")
        linhas.append(a["por_que"])
        linhas.append("")
        linhas.append("#### Evidência")
        linhas.append(f"`{a['arquivo']}`")
        linhas.append("")
        linhas.append("```")
        linhas.append(a["trecho"])
        linhas.append("```")
        linhas.append("")
        linhas.append("#### Impacto")
        linhas.append(a["impacto"])
        linhas.append("")
        linhas.append("#### Explorabilidade")
        linhas.append(a["explorabilidade"])
        linhas.append("")
        linhas.append("#### Sugestão de correção")
        linhas.append(a["correcao"])
        linhas.append("")
        linhas.append("#### Critérios de aceite")
        for c in a["criterios"]:
            linhas.append(f"- [ ] {c}")
        linhas.append("")
    return "\n".join(linhas)


def issues_github():
    el = [PageBreak(), Paragraph("Issues para o GitHub", S["h1"])]
    el.append(Paragraph(
        "Texto completo de cada issue em Markdown, pronto para copiar e colar. "
        "Cada uma está entre os delimitadores <b>--- ISSUE n ---</b> e "
        "<b>--- FIM ISSUE n ---</b>. Achados triviais do mesmo tema foram agrupados "
        "para não gerar spam de issues.", S["muted"]))
    el.append(Spacer(1, 0.25 * cm))
    for i, issue in enumerate(A.ISSUES_GITHUB, start=1):
        md = issue_markdown(issue)
        delim_top = f"--- ISSUE {i} ---"
        delim_bot = f"--- FIM ISSUE {i} ---"
        full = delim_top + "\n\n" + md + "\n" + delim_bot
        # renderiza como bloco monoespaçado; quebra por página se preciso
        el.append(mono_block(full, CONTENT_W))
        el.append(Spacer(1, 0.35 * cm))
    return el


if __name__ == "__main__":
    grafico_rosca()
    grafico_barras()
    build()
    print("PDF gerado em:", PDF_PATH)
