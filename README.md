# pdf2epub

A Deno application to convert PDF files to EPUB format.

Features:
- 👀 OCR and layout recognition via Mistral PDF OCR
- 🖼️ Includes images in the original location

## Usage

```sh
deno run --allow-all main.ts \
  --pdfUrl <pdfUrl> \
  --title <title> \
  --author <author> \
  --cover <coverUrl> \
  --mistralApiKey <mistralApiKey> \
  --epubPath output.epub
```
