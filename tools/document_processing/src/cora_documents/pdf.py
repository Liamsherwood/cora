"""Page extraction adapted from Cielo Pseudonym’s pdf_extract.py."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from io import BytesIO
from typing import Any

import pdf_inspector
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .model import Block, Document, ExtractionError

MAX_PDF_PAGES = 1_000


@dataclass(slots=True)
class _PageExtraction:
    texts: dict[int, str]
    ocr_pages: set[int]
    parser: str
    fallback_used: bool = False
    complex_layout: bool = False
    pages_with_tables: list[int] = field(default_factory=list)
    pages_with_columns: list[int] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _resolve(value: Any) -> Any:
    try:
        return value.get_object()
    except AttributeError:
        return value


def _resources_have_image(resources: Any, *, depth: int = 0) -> bool:
    if resources is None or depth > 2:
        return False
    resources = _resolve(resources)
    xobjects = _resolve(resources.get("/XObject")) if hasattr(resources, "get") else None
    if not xobjects:
        return False
    for reference in xobjects.values():
        obj = _resolve(reference)
        if not hasattr(obj, "get"):
            continue
        subtype = str(obj.get("/Subtype", ""))
        if subtype == "/Image":
            return True
        if subtype == "/Form" and _resources_have_image(obj.get("/Resources"), depth=depth + 1):
            return True
    return False


def _normalise_extracted_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u00ad", "").replace("\u200b", "").replace("\ufeff", "")
    text = text.replace("\u00a0", " ")
    # Join words split by PDF line wrapping when the continuation is lowercase.
    text = re.sub(r"(?<=[A-Za-zÄÖÜäöüß])-[ \t]*\n[ \t]*(?=[a-zäöüß])", "", text)
    lines = [line.rstrip() for line in text.splitlines()]
    text = "\n".join(lines)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _text_quality(text: str) -> tuple[int, float]:
    visible = [char for char in text if not char.isspace()]
    if not visible:
        return 0, 0.0
    meaningful = sum(char.isalnum() for char in visible)
    suspicious = sum(
        char == "\ufffd" or (unicodedata.category(char).startswith("C") and char not in "\n\t")
        for char in visible
    )
    quality = max(0.0, (meaningful - suspicious * 4) / len(visible))
    return meaningful, quality


def _annotation_text(page: Any) -> list[str]:
    values: list[str] = []
    references = _resolve(page.get("/Annots"))
    if not isinstance(references, list):
        return values
    for reference in references:
        annotation = _resolve(reference)
        if not hasattr(annotation, "get"):
            continue
        content = annotation.get("/Contents")
        if content is not None and str(content).strip():
            values.append(str(content).strip())
    return values


def _pypdf_page_texts(reader: PdfReader) -> dict[int, str]:
    texts: dict[int, str] = {}
    for page_number, page in enumerate(reader.pages, start=1):
        try:
            raw_text = page.extract_text(
                extraction_mode="layout",
                layout_mode_space_vertically=False,
            ) or ""
        except Exception as exc:
            raise ExtractionError(
                f"Could not read page {page_number}.",
                code="pdf_page_error",
                pages=[page_number],
            ) from exc
        texts[page_number] = _normalise_extracted_text(raw_text)
    return texts


def _inspector_page_texts(data: bytes, page_count: int) -> _PageExtraction:
    """Normalize the inspector's page indices to one-based page numbers."""
    result = pdf_inspector.extract_pages_markdown_bytes(data)
    page_map: dict[int, str] = {}
    ocr_pages: set[int] = set()

    for page in result.pages:
        page_number = int(page.page) + 1
        if page_number < 1 or page_number > page_count or page_number in page_map:
            raise RuntimeError("pdf-inspector returned inconsistent page numbers")
        page_map[page_number] = _normalise_extracted_text(str(page.markdown or ""))
        if bool(page.needs_ocr):
            ocr_pages.add(page_number)

    if set(page_map) != set(range(1, page_count + 1)):
        raise RuntimeError("pdf-inspector omitted one or more pages")

    # The summary lists are already one-based.
    reported_ocr = {int(page) for page in result.pages_needing_ocr}
    if any(page < 1 or page > page_count for page in reported_ocr):
        raise RuntimeError("pdf-inspector returned invalid OCR page numbers")
    ocr_pages.update(reported_ocr)

    tables = sorted({int(page) for page in result.pages_with_tables})
    columns = sorted({int(page) for page in result.pages_with_columns})
    if any(page < 1 or page > page_count for page in tables + columns):
        raise RuntimeError("pdf-inspector returned invalid layout page numbers")

    return _PageExtraction(
        texts=page_map,
        ocr_pages=ocr_pages,
        parser="pdf-inspector",
        complex_layout=bool(result.is_complex),
        pages_with_tables=tables,
        pages_with_columns=columns,
    )


def _extract_pages(data: bytes, reader: PdfReader, page_count: int) -> _PageExtraction:
    try:
        return _inspector_page_texts(data, page_count)
    except Exception:
        # The fallback goes through the same image and text quality checks.
        return _PageExtraction(
            texts=_pypdf_page_texts(reader),
            ocr_pages=set(),
            parser="pypdf",
            fallback_used=True,
            warnings=["Used pypdf fallback. Check the extracted reading order."],
        )


def extract_pdf(data: bytes) -> Document:
    """Extract PDF pages, or report which pages need OCR."""
    if not data.startswith(b"%PDF-"):
        raise ExtractionError(
            "The file does not have a valid PDF signature.",
            code="pdf_invalid",
        )
    try:
        reader = PdfReader(BytesIO(data), strict=False)
    except (PdfReadError, OSError, ValueError) as exc:
        raise ExtractionError(
            "Could not read the PDF.",
            code="pdf_invalid",
        ) from exc

    if reader.is_encrypted:
        try:
            unlocked = bool(reader.decrypt(""))
        except Exception:
            unlocked = False
        if not unlocked:
            raise ExtractionError(
                "The PDF requires a password.",
                code="pdf_password",
            )

    try:
        page_count = len(reader.pages)
    except (PdfReadError, OSError, ValueError, TypeError, KeyError) as exc:
        raise ExtractionError("Could not read the PDF page tree.", code="pdf_invalid") from exc
    if page_count == 0:
        raise ExtractionError("The PDF has no pages.", code="pdf_empty")
    if page_count > MAX_PDF_PAGES:
        raise ExtractionError(
            f"The PDF exceeds the {MAX_PDF_PAGES}-page limit.",
            code="pdf_too_many_pages",
        )

    extraction = _extract_pages(data, reader, page_count)
    blocks: list[Block] = []
    ocr_pages: set[int] = set(extraction.ocr_pages)
    warnings: list[str] = list(extraction.warnings)

    for page_number, page in enumerate(reader.pages, start=1):
        text = extraction.texts[page_number]
        meaningful, quality = _text_quality(text)
        has_image = _resources_have_image(page.get("/Resources"))
        if has_image and (meaningful < 25 or quality < 0.48):
            ocr_pages.add(page_number)
            continue
        if has_image and text:
            warnings.append(f"Page {page_number} contains an image and a text layer. Check both.")
        if text:
            blocks.append(Block(f"page-{page_number}", "page", text, page=page_number))
        elif not has_image:
            warnings.append(f"No text was extracted from page {page_number}.")

        for index, note in enumerate(_annotation_text(page), start=1):
            blocks.append(Block(f"page-{page_number}-note-{index}", "annotation", note, page=page_number))

    if ocr_pages:
        sorted_ocr_pages = sorted(ocr_pages)
        page_list = ", ".join(str(page) for page in sorted_ocr_pages)
        raise ExtractionError(
            f"OCR required on page(s): {page_list}.",
            code="pdf_needs_ocr",
            pages=sorted_ocr_pages,
        )

    body_lines = {line for block in blocks if block.kind == "page" for line in block.text.splitlines()}
    try:
        fields = reader.get_fields() or {}
    except Exception:
        fields = {}
        warnings.append("Could not read the PDF form fields.")
    for index, (name, form_field) in enumerate(fields.items(), start=1):
        value = form_field.get("/V") if hasattr(form_field, "get") else None
        if value not in (None, "", "/Off"):
            line = f"{name}: {value}"
            if line not in body_lines:
                blocks.append(Block(f"form-{index}", "form_field", line))

    if not blocks:
        raise ExtractionError("No readable text found in the PDF.", code="pdf_empty")
    if extraction.complex_layout:
        warnings.append("Complex PDF layout detected. Check the table and column reading order.")
    return Document(
        format="pdf",
        blocks=blocks,
        warnings=warnings,
        metadata={
            "page_count": page_count,
            "parser": extraction.parser,
            "fallback_used": extraction.fallback_used,
            "pages_with_tables": extraction.pages_with_tables,
            "pages_with_columns": extraction.pages_with_columns,
        },
    )
