from pathlib import Path

from .model import Block, Document, ExtractionError

MAX_INPUT_BYTES = 25 * 1024 * 1024


def read_document(data: bytes, filename: str) -> Document:
    """Read supported document bytes into ordered text blocks."""
    extension = Path(filename).suffix.lower()
    if len(data) > MAX_INPUT_BYTES:
        raise ExtractionError("The input exceeds the 25 MiB limit.", code="file_too_large")
    if extension == ".pdf":
        from .pdf import extract_pdf

        return extract_pdf(data)
    if extension in {".docx", ".xlsx"}:
        from .office import read_office

        return read_office(data, extension[1:])
    if extension in {".txt", ".md", ".markdown"}:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ExtractionError("Text files must use UTF-8.", code="invalid_encoding") from exc
        if not text.strip():
            raise ExtractionError("The text file is empty.", code="empty_document")
        return Document(extension[1:], [Block("text-1", "text", text)])
    raise ExtractionError(f"Unsupported document format: {extension or '(none)'}.", code="unsupported_format")


def read_file(path: str | Path) -> Document:
    path = Path(path)
    try:
        with path.open("rb") as source:
            data = source.read(MAX_INPUT_BYTES + 1)
    except OSError as exc:
        raise ExtractionError("Could not open the input file.", code="file_unreadable") from exc
    return read_document(data, path.name)
