"""Office extraction adapted from Cielo Pseudonym’s DOCX and XLSX readers."""

from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import datetime, time
from io import BytesIO
from zipfile import BadZipFile, ZipFile

from .model import Block, Document, ExtractionError

MAX_OFFICE_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_WORKSHEET_CELLS = 250_000
WHITESPACE = re.compile(r"\s+")
UNSUPPORTED_PARTS = {
    "docx": {"word/vbaproject": "macro"},
    "xlsx": {
        "xl/vbaproject": "macro",
        "xl/pivotcache/": "pivot_cache",
        "xl/externallinks/": "external_reference",
        "xl/threadedcomments/": "threaded_comments",
    },
}


def read_office(data: bytes, format: str) -> Document:
    if data.startswith(b"\xd0\xcf\x11\xe0"):
        raise ExtractionError(
            "The Office file is encrypted or uses a legacy format.",
            code=f"{format}_password_or_legacy",
        )
    try:
        with ZipFile(BytesIO(data)) as archive:
            members = archive.infolist()
            if sum(member.file_size for member in members) > MAX_OFFICE_UNCOMPRESSED_BYTES:
                raise ExtractionError("The expanded Office file exceeds 100 MiB.", code="file_too_large")
            if any(member.flag_bits & 1 for member in members):
                raise ExtractionError("The Office file is encrypted.", code=f"{format}_password")
            parts = {member.filename.lower() for member in members}
    except BadZipFile as exc:
        raise ExtractionError("Invalid Office file.", code=f"{format}_invalid") from exc
    for prefix, code in UNSUPPORTED_PARTS[format].items():
        if any(part.startswith(prefix) for part in parts):
            raise ExtractionError(f"Unsupported Office content: {code}.", code=f"{format}_{code}")

    document = _read_docx(data) if format == "docx" else _read_xlsx(data)
    if any(part.startswith(("word/media/", "xl/media/", "word/embeddings/", "xl/embeddings/")) for part in parts):
        document.warnings.append("The file contains images or embedded objects. Check them separately.")
    if {"word/footnotes.xml", "word/endnotes.xml"} & parts:
        document.warnings.append("Check footnotes and endnotes in the original Word document.")
    if not document.blocks:
        raise ExtractionError("No readable content found in the Office file.", code=f"{format}_empty")
    return document


def _table_rows(table) -> Iterator[str]:
    # Merged cells can appear in several grid positions. Keep the XML objects
    # alive while deduplicating so their identities cannot be recycled.
    seen = set()
    for row in table.rows:
        texts = []
        for cell in row.cells:
            if cell._tc in seen:
                continue
            seen.add(cell._tc)
            texts.append("\n".join(text for _, text in _docx_blocks(cell)))
        yield "\t".join(texts)


def _docx_blocks(container) -> Iterator[tuple[str, str]]:
    from docx.text.paragraph import Paragraph

    for item in container.iter_inner_content():
        if isinstance(item, Paragraph):
            yield "paragraph", item.text
        else:
            for row in _table_rows(item):
                yield "table_row", row


def _read_docx(data: bytes) -> Document:
    import docx

    try:
        source = docx.Document(BytesIO(data))
    except Exception as exc:
        raise ExtractionError("Could not read the Word document.", code="docx_invalid") from exc
    containers = [("body", source, source.element.body)]
    seen = set()
    for section in source.sections:
        for kind, part in (
            ("header", section.header),
            ("header", section.first_page_header),
            ("header", section.even_page_header),
            ("footer", section.footer),
            ("footer", section.first_page_footer),
            ("footer", section.even_page_footer),
        ):
            if not part.is_linked_to_previous and part.part not in seen:
                seen.add(part.part)
                containers.append((kind, part, part._element))

    blocks = []
    for kind, container, root in containers:
        if root.xpath(".//w:ins") or root.xpath(".//w:del"):
            raise ExtractionError(
                "Resolve tracked changes before processing the document.", code="docx_tracked_changes"
            )
        contents = list(_docx_blocks(container))
        original_text = "".join(node.text or "" for node in root.xpath(".//w:t"))
        extracted_text = "".join(text for _, text in contents)
        if WHITESPACE.sub("", original_text) != WHITESPACE.sub("", extracted_text):
            raise ExtractionError(
                "Some Word text could not be extracted, such as text in a textbox.",
                code="docx_unreadable_content",
            )
        for block_kind, text in contents:
            if text.strip():
                blocks.append(Block(f"{kind}-{len(blocks) + 1}", block_kind if kind == "body" else kind, text))
    for index, comment in enumerate(source.comments, start=1):
        if comment.text.strip():
            blocks.append(Block(f"comment-{index}", "comment", comment.text))

    return Document("docx", blocks)


def _read_xlsx(data: bytes) -> Document:
    import openpyxl

    try:
        workbook = openpyxl.load_workbook(BytesIO(data), keep_links=False)
        cached_values = openpyxl.load_workbook(BytesIO(data), data_only=True, keep_links=False)
    except Exception as exc:
        raise ExtractionError("Could not read the spreadsheet.", code="xlsx_invalid") from exc

    blocks = []
    warnings = []
    cell_count = 0
    for sheet, cached_sheet in zip(workbook.worksheets, cached_values.worksheets, strict=True):
        cell_count += sheet.max_row * sheet.max_column
        if cell_count > MAX_WORKSHEET_CELLS:
            raise ExtractionError("The combined worksheet area exceeds 250,000 cells.", code="xlsx_too_many_cells")
        missing_cache = False
        if sheet.sheet_state != "visible":
            warnings.append(f"Included hidden worksheet {sheet.title!r}.")
        for row_number, row in enumerate(sheet.iter_rows(), start=1):
            values = []
            for cell in row:
                value_cell = cached_sheet[cell.coordinate] if cell.data_type == "f" else cell
                value = value_cell.value
                if cell.data_type == "f" and value is None:
                    missing_cache = True
                if value_cell.data_type == "e":
                    value = None
                    warnings.append(f"Spreadsheet error at {sheet.title}!{cell.coordinate}.")
                if isinstance(value, datetime) and value.time() == time.min:
                    value = value.date()
                values.append("" if value is None else str(value))
                if cell.comment is not None and cell.comment.text.strip():
                    blocks.append(Block(f"{sheet.title}!{cell.coordinate}-comment", "comment", cell.comment.text))
            if any(value.strip() for value in values):
                blocks.append(Block(f"{sheet.title}!{row_number}", "table_row", "\t".join(values).rstrip("\t")))
        if missing_cache:
            warnings.append(f"Some formulas on {sheet.title!r} have no cached value. Recalculate them in Excel.")
    return Document("xlsx", blocks, warnings)
