# Cora document processing

Extract text and structured fields from local invoices, leases, and other property-management documents. The package runs offline and accepts either a file path or document bytes. It can run independently of the Cora web app and database.

## Run from the Cora repository

```sh
python3 -m venv tools/document_processing/.venv
source tools/document_processing/.venv/bin/activate
python -m pip install ./tools/document_processing

cora-documents invoice.pdf --profile invoice
cora-documents lease.docx --profile lease
cora-documents handover-notes.pdf
```

Use Python 3.10 or later. Each command writes JSON to stdout. Omit the profile to return the document's text blocks, or add `--include-text` to include them alongside extracted fields. Results and field evidence can contain personal information. Keep exported JSON with the source documents.

| Profile | Labeled fields |
| --- | --- |
| `invoice` | Invoice number, supplier, issue date, due date, property address, unit, net, tax, and gross totals |
| `lease` | Property address, unit, tenant, landlord, start and end dates, base rent, service charges, and deposit |

The starter profiles recognize common German and English labels. Supported layouts include `Invoice number: INV-012` on its own line and a two-column label/value row. Dates use ISO or German dotted input and return ISO dates. Amounts return decimal strings with a currency when the value identifies it. Amounts such as `1.234` with an ambiguous decimal or thousands separator require review. Spreadsheet display formatting, such as an implicit currency symbol, does not carry over.

Each field includes the matching source line, block ID, and PDF page when available. Conflicting values go into `issues` with all candidates. A missing required field, an invalid labeled value, conflicting candidates, or a reader warning sets `status` to `needs_review`. Review any result against the original before using it for a payment or property record. The profiles extract labeled fields and have no document classification, invoice line-item parsing, or ledger validation.

Malformed or unsupported inputs produce JSON on stderr and exit with status 1. When a PDF page needs OCR, the error is `pdf_needs_ocr` with the affected page numbers. Create a searchable PDF and pass that copy to the command. Profiles with `needs_review` still return successfully with the available evidence.

## Use in Python

```python
from cora_documents import FieldRule, INVOICE, extract_fields, read_file

document = read_file("invoice.pdf")
result = extract_fields(document, INVOICE)

rules = (
    FieldRule("work_order", ("Auftragsnummer", "Work order"), required=True),
    FieldRule("property", ("Objektadresse", "Property address"), required=True),
)
work_order = extract_fields(read_file("maintenance.docx"), rules)
```

For a worker that already has the bytes, use `read_document(data, filename)`. Read `document.warnings` for format-specific review notes. A custom rule can provide a parser that returns a string or an amount object, or raises `ValueError` for an invalid value.

## Readers taken from Cielo

- PDF uses `pdf-inspector` for layout-aware text extraction and `pypdf` as a fallback. Text blocks retain page numbers and layout diagnostics. OCR is a separate step. Embedded e-invoice XML is outside this reader's scope.
- DOCX uses `python-docx` for paragraphs, table rows, headers, footers, and comments. Tracked changes and text the reader cannot account for are reported as errors.
- XLSX uses `openpyxl` for rows from visible and hidden sheets. Numeric cell values are included and formulas use cached values where available.
- TXT and Markdown use UTF-8 input.

The extracted layer includes Cielo's document reading and block model. Cielo's desktop app, pseudonymization, and token vault are outside this package. The CLI is a local entry point and does not post data to Cora.
