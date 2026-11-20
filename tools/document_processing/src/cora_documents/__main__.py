import argparse
import json
import sys
from dataclasses import asdict

from .model import ExtractionError
from .profiles import PROFILES, extract_fields
from .readers import read_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract text or structured fields from a document.")
    parser.add_argument("file", help="Local PDF, DOCX, XLSX, TXT, or Markdown file")
    parser.add_argument("--profile", choices=PROFILES, help="Extract labeled fields for this document type")
    parser.add_argument("--include-text", action="store_true", help="Include the extracted blocks with a profile")
    args = parser.parse_args(argv)

    try:
        document = read_file(args.file)
    except ExtractionError as exc:
        error = {"code": exc.code, "message": str(exc), "pages": exc.pages}
        print(json.dumps({"error": error}, ensure_ascii=False), file=sys.stderr)
        return 1

    result = {"format": document.format, "metadata": document.metadata, "warnings": document.warnings}
    if args.profile:
        result["profile"] = args.profile
        result.update(extract_fields(document, PROFILES[args.profile]))
    if not args.profile or args.include_text:
        result["blocks"] = [asdict(block) for block in document.blocks]
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
