# Mathematical equations — QPaper Studio

## What was added

- A **∑ Equation** button beside the question prompt, MCQ answer options,
  matching-column entries and answer / marking notes.
- A LaTeX editor with a live, accessible MathML/HTML preview. Quick-pick templates
  include fractions, exponents, square roots, integrals, summations, matrices,
  Greek letters, inequalities, and limits.
- Inline and block math in the *same* React component used for the live paper
  preview and the Print → Save as PDF view. The answer-key print view also renders
  formulas. KaTeX fonts are bundled into the frontend build, not fetched from a CDN.
- Math display in the question bank and question-bank picker.

## How teachers use it

1. Open **Question Builder**, select a question, and place the cursor in the text.
2. Click **∑ Equation** beside that field.
3. Choose a symbol/template or type LaTeX such as `\\frac{a}{b}` or `x^2`.
4. Check the live preview. Choose **Display equation on its own line** if needed.
5. Click **Insert equation**. The text will contain `\\(...\\)` (inline) or
   `\\[...\\]` (display). Save and export normally.

You can also type directly:

- Inline: `Find \\(x^2 + y^2\\)`
- Display: `\\[\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\\]`
- Import-compatible inline: `$x^2$` and display: `$$\\sum_{i=1}^n i$$`

All of these formats work inside normal text, question-bank entries, JSON/CSV
imports, saved papers, templates, and historical versions without a SQL migration.

## Export behavior

- **PDF:** the browser Print → Save as PDF command prints the rendered formula.
  Configure A4, scale 100%, and disable browser headers/footers.
- **DOCX:** the existing editable DOCX export continues to work. Equations stay
  as editable LaTeX source text in Word; they are **not converted into native
  Word Equation / OMML objects** in this release. For typeset equations, use PDF.

## Deploying on an existing EC2 Docker Compose server

This release only changes frontend source and the root `package.json`.
No database schema migration, API restart, or new S3 configuration is needed.

1. Make a backup (or snapshot) of the current application.
2. Upload `qpaper-equations-patch.zip` to `/home/ubuntu/` on the EC2 host.
3. Run:

   ```bash
   cd /home/ubuntu/deploy
   unzip -o /home/ubuntu/qpaper-equations-patch.zip -d /home/ubuntu/deploy
   docker compose up -d --build web
   docker compose ps
   ```

4. Refresh the browser (Ctrl + Shift + R), log in as a teacher, and test
   `\\frac{a}{b}`, PDF preview, Question Bank, and saved paper reload.

**Do not overwrite `.env` or run `docker compose down -v`.** The Compose
configuration and persistent PostgreSQL volume remain untouched.

## Tests

Run the pure-module tests with `node --test tests/math.test.mjs`.
For a complete build run `npm install && npm run build` in the project root,
or use the provided Docker build command.
