from dataclasses import dataclass, field


class ExtractionError(ValueError):
    """An input that could not be read. PDF page numbers are one-based."""

    def __init__(self, message: str, *, code: str, pages: list[int] | None = None):
        super().__init__(message)
        self.code = code
        self.pages = pages or []


@dataclass(frozen=True, slots=True)
class Block:
    id: str
    kind: str
    text: str
    page: int | None = None


@dataclass(slots=True)
class Document:
    format: str
    blocks: list[Block]
    warnings: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
