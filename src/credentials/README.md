# Credentials

Web app to generate printable PDFs with contest login credentials from a CSV.
It is a browser port of the [`credentials` TUI](https://github.com/OCIoficial/tools/tree/main/credentials)
and runs entirely client side: the data never leaves the page.

## Usage

1. **Load data**: drop a CSV file, browse for one, or paste rows anywhere on the page
   (e.g. a range copied from Google Sheets). The delimiter is detected automatically.
2. **Match columns**: drag each column onto the field it belongs to (username, password,
   first names, last names, site), or tap a column and then a field. If the first row is a
   header it is detected and used to match columns automatically; otherwise columns are
   assigned in the TUI's order. Expand "Check data" to review the resulting credentials.
3. **Options**: phase (Regional/Final), year and whether to generate one PDF per site.
4. **Preview & download**: pick a PDF to preview it, download it alone, or download all of
   them as a `.zip`.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # unit tests
npm run build    # static build in dist/
```

The PDF layout lives in `src/lib/pdf.ts` and reproduces the Typst template of the TUI using
jsPDF with the Computer Modern fonts (CMU Serif / CMU Typewriter, SIL OFL, see
`public/fonts/OFL.txt`). Previews are rendered with pdf.js.

## Deployment

`.github/workflows/deploy.yml` builds the app and publishes it to GitHub Pages on every push
to `main`. In the repository settings, set **Pages → Build and deployment → Source** to
**GitHub Actions**.
