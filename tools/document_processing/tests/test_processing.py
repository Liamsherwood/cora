import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import date
from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import docx
import openpyxl
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject

from cora_documents import INVOICE, LEASE, ExtractionError, extract_fields, read_document
from cora_documents.__main__ import main


def _pdf_bytes(*, text_pages: list[str] | None = None, image_pages: int = 0) -> bytes:
    writer = PdfWriter()
    for text in text_pages or []:
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject({
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        })
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        })
        content = DecodedStreamObject()
        safe_text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        lines = ") Tj 0 -18 Td (".join(safe_text.splitlines())
        content.set_data(f"BT /F1 12 Tf 72 720 Td ({lines}) Tj ET".encode("latin-1"))
        page[NameObject("/Contents")] = writer._add_object(content)

    for _ in range(image_pages):
        page = writer.add_blank_page(width=612, height=792)
        image = DecodedStreamObject()
        image.set_data(b"\x80")
        image.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Image"),
            NameObject("/Width"): NumberObject(1),
            NameObject("/Height"): NumberObject(1),
            NameObject("/ColorSpace"): NameObject("/DeviceGray"),
            NameObject("/BitsPerComponent"): NumberObject(8),
        })
        image_ref = writer._add_object(image)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Im0"): image_ref}),
        })
        content = DecodedStreamObject()
        content.set_data(b"q 612 0 0 792 0 0 cm /Im0 Do Q")
        page[NameObject("/Contents")] = writer._add_object(content)

    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class DocumentProcessingTests(unittest.TestCase):
    def test_invoice_pdf_extraction_references_source_pages(self):
        pdf = _pdf_bytes(text_pages=[
            "Supplier: Sample Plumbing\nInvoice number: HA-012\nInvoice date: 2026-11-20",
            "Gross total: EUR 1,190.00",
        ])
        document = read_document(pdf, "invoice.pdf")
        result = extract_fields(document, INVOICE)
        self.assertEqual(document.metadata["parser"], "pdf-inspector")
        self.assertEqual(document.metadata["page_count"], 2)
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["fields"]["invoice_number"]["value"], "HA-012")
        self.assertEqual(result["fields"]["supplier"]["value"], "Sample Plumbing")
        self.assertEqual(result["fields"]["gross_total"]["value"], {"amount": "1190.00", "currency": "EUR"})
        self.assertEqual(result["fields"]["gross_total"]["evidence"][0]["page"], 2)

    def test_primary_pdf_parser_failure_uses_fallback(self):
        with patch("cora_documents.pdf.pdf_inspector.extract_pages_markdown_bytes", side_effect=RuntimeError):
            document = read_document(_pdf_bytes(text_pages=["Invoice number: HA-012"]), "invoice.pdf")
        self.assertEqual(document.metadata["parser"], "pypdf")
        self.assertTrue(document.metadata["fallback_used"])
        self.assertIn("HA-012", document.blocks[0].text)
        self.assertTrue(document.warnings)

    def test_mixed_pdf_reports_scan_page(self):
        pdf = _pdf_bytes(text_pages=["Invoice number: HA-012"], image_pages=1)
        with self.assertRaises(ExtractionError) as raised:
            read_document(pdf, "scan.pdf")
        self.assertEqual(raised.exception.code, "pdf_needs_ocr")
        self.assertEqual(raised.exception.pages, [2])

    def test_office_lease_table_and_non_default_header(self):
        source = docx.Document()
        source.sections[0].first_page_header.paragraphs[0].text = "Vermieter: Beispiel GmbH"
        table = source.add_table(rows=0, cols=2)
        for label, value in (
            ("Objektadresse", "Musterstraße 12"),
            ("Mieter", "Alex Beispiel"),
            ("Mietbeginn", "01.12.2026"),
            ("Kaltmiete", "1.250,50 EUR"),
        ):
            left, right = table.add_row().cells
            left.text = label
            right.text = value
        data = BytesIO()
        source.save(data)
        result = extract_fields(read_document(data.getvalue(), "lease.docx"), LEASE)
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["fields"]["landlord"]["value"], "Beispiel GmbH")
        self.assertEqual(result["fields"]["start_date"]["value"], "2026-12-01")
        self.assertEqual(result["fields"]["base_rent"]["value"], {"amount": "1250.50", "currency": "EUR"})

    def test_invoice_xlsx_retains_numbers_dates_and_formula_warnings(self):
        source = openpyxl.Workbook()
        sheet = source.active
        sheet.title = "Invoice"
        sheet.append(["Invoice number", "HA-012"])
        sheet.append(["Invoice date", date(2026, 11, 20)])
        sheet.append(["Gross total", 1190])
        sheet.append(["Net total", "=1190/1.19"])
        data = BytesIO()
        source.save(data)

        document = read_document(data.getvalue(), "invoice.xlsx")
        result = extract_fields(document, INVOICE)
        self.assertEqual(result["fields"]["gross_total"]["value"], {"amount": "1190.00", "currency": None})
        self.assertEqual(result["fields"]["gross_total"]["evidence"][0]["block_id"], "Invoice!3")
        self.assertEqual(result["fields"]["invoice_date"]["value"], "2026-11-20")
        self.assertEqual(result["status"], "needs_review")
        self.assertTrue(any("no cached value" in warning for warning in document.warnings))

    def test_conflicting_amounts_and_invalid_date_go_to_review(self):
        text = """**Invoice number:** HA-012_
Rechnungsdatum: 31.02.2026
| Gesamtbetrag | 1.190,00 EUR |
Gross total: EUR 2,190.00
"""
        result = extract_fields(read_document(text.encode(), "invoice.md"), INVOICE)
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["fields"]["invoice_number"]["value"], "HA-012_")
        self.assertNotIn("gross_total", result["fields"])
        self.assertEqual([issue["code"] for issue in result["issues"]], ["invalid_value", "ambiguous"])

    def test_ambiguous_amount_separator_goes_to_review(self):
        text = b"Invoice number: HA-012\nInvoice date: 2026-11-20\nGross total: 1.234"
        result = extract_fields(read_document(text, "invoice.txt"), INVOICE)
        self.assertNotIn("gross_total", result["fields"])
        self.assertEqual(result["issues"][0]["code"], "invalid_value")

    def test_cli_returns_structured_errors_without_stdout(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "input.pdf"
            path.write_bytes(b"not a PDF")
            with redirect_stdout(StringIO()) as output, redirect_stderr(StringIO()) as errors:
                code = main([str(path), "--profile", "invoice"])
        self.assertEqual(code, 1)
        self.assertEqual(output.getvalue(), "")
        self.assertEqual(json.loads(errors.getvalue())["error"]["code"], "pdf_invalid")


if __name__ == "__main__":
    unittest.main()
