# Credentials

Web app to generate printable PDFs with contest login credentials from a CSV.
It is a browser port of the [`credentials` TUI](../../legacy/credentials)
and runs entirely client side: the data never leaves the page, unless you upload the PDFs to
Google Drive.

## Usage

1. **Load data**: drop a CSV file, browse for one, or paste rows anywhere on the page
   (e.g. a range copied from Google Sheets). The delimiter is detected automatically.
2. **Match columns**: drag each column onto the field it belongs to (username, password,
   first names, last names, site), or tap a column and then a field. If the first row is a
   header it is detected and used to match columns automatically; otherwise columns are
   assigned in the TUI's order. Expand "Check data" to review the resulting credentials.
3. **Options**: phase (Regional/Final), year and whether to generate one PDF per site.
4. **Preview, download & upload**: pick a PDF to preview it, download it alone, download all
   of them as a `.zip`, or upload all of them to a Google Drive folder. Each PDF is uploaded as a
   separate file, with the same names as in the `.zip`. Uploading needs the Google sign-in
   (top right) and opens the Google Picker to choose the folder. The data and options are locked
   while uploading; if an upload fails, the PDFs already uploaded stay in the folder.

## Development

See the [repository README](../../README.md) for how to run, test and build the site.

The PDF layout lives in `lib/pdf.ts` and reproduces the Typst template of the TUI using
jsPDF with the Computer Modern fonts (CMU Serif / CMU Typewriter, SIL OFL, see
`public/credentials/fonts/OFL.txt`). Previews are rendered with pdf.js.
