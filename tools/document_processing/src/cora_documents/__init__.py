"""Read documents and extract evidence-backed property-management fields."""

from .model import Block, Document, ExtractionError
from .profiles import INVOICE, LEASE, FieldRule, extract_fields
from .readers import read_document, read_file

__all__ = [
    "Block",
    "Document",
    "ExtractionError",
    "FieldRule",
    "INVOICE",
    "LEASE",
    "extract_fields",
    "read_document",
    "read_file",
]
