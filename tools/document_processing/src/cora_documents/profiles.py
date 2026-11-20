"""Labeled-field extraction with evidence for review."""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from .model import Document

Value = str | dict[str, str | None]


def _text(raw: str) -> str:
    return " ".join(raw.split())


def _date(raw: str) -> str:
    if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", raw):
        return date.fromisoformat(raw).isoformat()
    return datetime.strptime(raw, "%d.%m.%Y").date().isoformat()


CURRENCIES = {"EUR": "EUR", "€": "EUR", "USD": "USD", "GBP": "GBP", "£": "GBP", "CHF": "CHF"}
MONEY = re.compile(
    r"(?P<prefix>EUR|USD|GBP|CHF|[€$£])?\s*(?P<number>[+-]?[0-9][0-9., ]*)"
    r"\s*(?P<suffix>EUR|USD|GBP|CHF|[€$£])?",
    re.IGNORECASE,
)
NUMBER_FORMATS = (
    re.compile(r"(?P<whole>[0-9]+)(?:[.,](?P<fraction>[0-9]{1,2}))?"),
    re.compile(r"(?P<whole>[0-9]{1,3}(?:\.[0-9]{3})+)(?:,(?P<fraction>[0-9]{1,2}))?"),
    re.compile(r"(?P<whole>[0-9]{1,3}(?:,[0-9]{3})+)(?:\.(?P<fraction>[0-9]{1,2}))?"),
    re.compile(r"(?P<whole>[0-9]{1,3}(?: [0-9]{3})+)(?:[.,](?P<fraction>[0-9]{1,2}))?"),
)


def _money(raw: str) -> Value:
    match = MONEY.fullmatch(_text(raw))
    if not match:
        raise ValueError("Unrecognized amount")
    prefix, number, suffix = match.groups()
    currencies = {
        CURRENCIES[marker.upper()] for marker in (prefix, suffix) if marker and marker.upper() in CURRENCIES
    }
    if len(currencies) > 1:
        raise ValueError("Conflicting currencies")
    currency = next(iter(currencies), None)
    number = number.strip()
    if re.fullmatch(r"[+-]?[0-9]{1,3}[,.][0-9]{3}", number):
        raise ValueError("Ambiguous grouping or decimal separator")
    sign = "-" if number.startswith("-") else ""
    for pattern in NUMBER_FORMATS:
        parsed = pattern.fullmatch(number.lstrip("+-"))
        if parsed:
            whole = re.sub(r"[., ]", "", parsed["whole"]).lstrip("0") or "0"
            fraction = (parsed["fraction"] or "").ljust(2, "0")
            return {"amount": f"{sign}{whole}.{fraction}", "currency": currency}
    raise ValueError("Unrecognized amount")


@dataclass(frozen=True, slots=True)
class FieldRule:
    name: str
    labels: tuple[str, ...]
    parse: Callable[[str], Value] = _text
    required: bool = False


INVOICE = (
    FieldRule(
        "invoice_number",
        ("Rechnungsnummer", "Rechnungsnr.", "Rechnungs-Nr.", "Rechnung Nr.", "Invoice number", "Invoice no.", "Invoice #"),
        required=True,
    ),
    FieldRule("supplier", ("Rechnungssteller", "Lieferant", "Supplier", "Vendor", "Issued by")),
    FieldRule("invoice_date", ("Rechnungsdatum", "Invoice date", "Date of issue"), _date, required=True),
    FieldRule("due_date", ("Fällig am", "Fälligkeitsdatum", "Zahlbar bis", "Due date", "Payment due"), _date),
    FieldRule("property_address", ("Objektadresse", "Adresse des Objekts", "Property address", "Service address")),
    FieldRule("unit", ("Einheit", "Wohnung", "Unit", "Unit number")),
    FieldRule("net_total", ("Nettobetrag", "Summe netto", "Gesamt netto", "Net total", "Total net", "Subtotal"), _money),
    FieldRule("tax_total", ("MwSt.", "Umsatzsteuer", "MwSt.-Betrag", "VAT amount", "Tax total", "Total VAT"), _money),
    FieldRule(
        "gross_total",
        ("Bruttobetrag", "Summe brutto", "Gesamtbetrag", "Rechnungsbetrag", "Gross total", "Invoice total", "Total incl. VAT"),
        _money,
        required=True,
    ),
)

LEASE = (
    FieldRule(
        "property_address",
        ("Objektadresse", "Adresse des Mietobjekts", "Property address", "Premises address"),
        required=True,
    ),
    FieldRule("unit", ("Einheit", "Wohnung", "Wohnungsnummer", "Unit", "Unit number")),
    FieldRule("tenant", ("Mieter", "Mieter/in", "Mietername", "Tenant", "Tenant name"), required=True),
    FieldRule("landlord", ("Vermieter", "Vermieter/in", "Landlord", "Landlord name")),
    FieldRule(
        "start_date",
        ("Mietbeginn", "Vertragsbeginn", "Lease start", "Lease start date", "Commencement date"),
        _date,
        required=True,
    ),
    FieldRule("end_date", ("Mietende", "Vertragsende", "Lease end", "Lease end date", "Expiration date"), _date),
    FieldRule("base_rent", ("Kaltmiete", "Nettokaltmiete", "Grundmiete", "Base rent", "Net rent"), _money),
    FieldRule("service_charges", ("Nebenkosten", "Betriebskostenvorauszahlung", "Service charges", "Operating costs"), _money),
    FieldRule("deposit", ("Kaution", "Mietkaution", "Deposit", "Security deposit"), _money),
)

PROFILES = {"invoice": INVOICE, "lease": LEASE}


def _unemphasize(text: str) -> str:
    text = text.strip()
    for marker in ("**", "__"):
        if text.startswith(marker) and text.endswith(marker) and len(text) > 2 * len(marker):
            return text[len(marker):-len(marker)].strip()
    return text


def _label(raw: str) -> str:
    raw = re.sub(r"^#{1,6}\s+", "", raw.strip())
    return _text(_unemphasize(raw).rstrip(":")).casefold()


def _pair(line: str) -> tuple[str, str] | None:
    # A table row can express a label and value without a colon.
    if "\t" in line or line.strip().startswith("|"):
        separator = "\t" if "\t" in line else "|"
        cells = line.strip(" |").split(separator)
        if len(cells) == 2:
            return cells[0], cells[1]
    bold_label = re.fullmatch(r"(\*\*|__)([^:]+):\1\s*(.*)", line.strip())
    if bold_label:
        return bold_label[2], bold_label[3]
    if ":" in line:
        label, raw = line.split(":", 1)
        return label, raw
    parts = re.split(r" {2,}|\s+[–—]\s+", line.strip(), maxsplit=1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return None


def _pairs(line: str, inline_labels: re.Pattern[str]) -> Iterator[tuple[str, str]]:
    # Layout-aware PDF extraction can combine adjacent printed lines into one paragraph.
    text = re.sub(r"^#{1,6}\s+", "", line.strip())
    if "\t" not in text and not text.startswith("|"):
        matches = list(inline_labels.finditer(text))
        if len(matches) > 1 and matches[0].start() == 0:
            for index, match in enumerate(matches):
                end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
                yield match["label"], text[match.end():end]
            return
    pair = _pair(line)
    if pair is not None:
        yield pair


def extract_fields(document: Document, rules: Sequence[FieldRule]) -> dict[str, Any]:
    """Return normalized field candidates and their exact source lines."""
    rules_by_label = {_label(label): rule for rule in rules for label in rule.labels}
    labels = sorted(rules_by_label, key=len, reverse=True)
    inline_labels = re.compile(r"(?<!\S)(?P<label>" + "|".join(map(re.escape, labels)) + r")\s*:", re.I)
    candidates: dict[str, list[dict[str, Any]]] = {rule.name: [] for rule in rules}
    invalid: dict[str, list[dict[str, Any]]] = {rule.name: [] for rule in rules}

    for block in document.blocks:
        if block.kind in {"comment", "annotation"}:
            continue
        for line_number, line in enumerate(block.text.splitlines(), start=1):
            for label, raw in _pairs(line, inline_labels):
                rule = rules_by_label.get(_label(label))
                if rule is None:
                    continue
                evidence = {"block_id": block.id, "line": line_number, "page": block.page, "text": line}
                try:
                    value = rule.parse(_unemphasize(raw))
                    if not value:
                        raise ValueError("Missing value")
                except ValueError:
                    invalid[rule.name].append(evidence)
                    continue

                field_candidates = candidates[rule.name]
                for candidate in field_candidates:
                    if candidate["value"] == value:
                        candidate["evidence"].append(evidence)
                        break
                else:
                    field_candidates.append({"value": value, "evidence": [evidence]})

    fields = {}
    issues = []
    for rule in rules:
        field_candidates = candidates[rule.name]
        if invalid[rule.name]:
            issues.append({"field": rule.name, "code": "invalid_value", "evidence": invalid[rule.name]})
        if len(field_candidates) == 1:
            fields[rule.name] = field_candidates[0]
        elif field_candidates:
            issues.append({"field": rule.name, "code": "ambiguous", "candidates": field_candidates})
        elif rule.required and not invalid[rule.name]:
            issues.append({"field": rule.name, "code": "missing"})

    return {
        "status": "needs_review" if issues or document.warnings else "extracted",
        "fields": fields,
        "issues": issues,
    }
