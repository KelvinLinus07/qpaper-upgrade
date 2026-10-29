# QPaper Studio v3 smoke-test checklist

Requires npm dependencies, PostgreSQL, and (for image cases) an S3 bucket. Run `npm run migrate` before starting the API.

1. **Navigation**: direct-open `/#/`, `/#/about`, `/#/contact`, `/#/login`, `/#/dashboard`, `/#/bank`, `/#/templates`, `/#/admin`. Refresh each route. Mobile nav opens/closes. Guests are redirected to login for private pages.
2. **Auth**: register teacher (password 12+ chars), login/logout, try wrong password, ensure disabled users cannot log in. Ensure students cannot access bank/admin, teachers cannot access admin API.
3. **Paper CRUD**: create paper, edit one of each question type, set marks and image, save, refresh/reopen, publish/unpublish, delete. After publishing, student sees only published papers.
4. **Answer confidentiality**: student `GET /api/papers/:id` JSON must have `answer: ""` for every question. Teachers and admins should receive actual answers. Student Export menu must not display answer key options.
5. **Bank**: add question, edit its answer, search, filter, check duplicates, insert into a paper, delete. Changing bank question later must not modify existing paper.
6. **Bulk import**: download sample CSV on bank page; import it, check number of items. Re-import it and verify duplicates are skipped. Import JSON arrays to both bank and builder.
7. **Templates**: open starter Unit test and Term examination; inspect section count and marks. Save custom template from builder and open it from Templates page.
8. **Autosave and revisions**: make an edit, wait for the save indicator (9-second idle debounce), refresh, review version history, restore an older snapshot, verify new revision appears.
9. **PDF/DOCX**: export a 2-page exam containing options, matching pairs and images. Open the PDF export overlay, compare the full-size A4 preview to the live sidebar preview (same columns, marks, numbering and options), click Print / Save as PDF, choose A4 and 100% scale, disable browser headers/footers, then inspect selectable text, page breaks, images and table borders. Repeat with a long multi-page test, Hindi and answer keys. Inspect editable DOCX separately in Word or LibreOffice.
10. **Admin**: invite a teacher with valid email (share returned URL if SMTP disabled), accept once with a secure password, verify token cannot be reused; edit institution branding/logo; create and activate academic year, assign it to a paper.
11. **Reset password**: configure SMTP; request reset, follow one-time link, set new password, verify old password is rejected and reset link cannot be reused. Unrecognized addresses should get the same response.
12. **Contact form**: send a message, verify it appears in Admin → Messages; test invalid email and too-short message.
13. **Breakpoints**: check 320px, 375px, 768px, 1024px, and desktop widths. Verify no horizontal overflow in main public/dashboard pages, and builder preview can be reached on mobile.

## Environment assumptions

- If `SMTP_HOST` is unset, password-reset links cannot be emailed; set `DEV_SHOW_RESET_LINKS=true` only in development to copy links from the API terminal.
- Uploaded S3 objects need a readable URL and `Access-Control-Allow-Origin` for the frontend origin to embed in PDF/DOCX exports.
- PDF export uses browser native printing of the same preview React component; print to A4 with CSS margins and disabled browser headers/footers.
- Production deployments need CSRF protection, upload content verification, quotas, database backups, and automated integration tests.

## v4: reusable templates and analytics regression checks

### Template flows (teacher)

- [ ] `/templates` → **Create template** → configure 2 sections and save → refresh/logout/login → template remains visible.
- [ ] **Edit** template description, section type, count and marks → save → click **Use** → new builder contains the updated layout.
- [ ] **Copy** custom or starter template → new independent saved template is created. Delete it → saved papers remain unchanged.
- [ ] Builder with mixed question types → **Save template → Layout only** → new paper from template preserves question types/section marks but not content or answers.
- [ ] Builder with MCQ and matching questions, answers and S3 images → **Save template → Layout + question content** → new paper retains these fields but each question gets a fresh ID.
- [ ] Old templates saved in v3 (questionCount-only layouts) can still be applied and edited.
- [ ] Other teachers cannot edit or delete someone else's private template. Admin can share a template; students cannot obtain staff templates/answers using the API.
- [ ] Deleting a template doesn't delete papers or paper revisions.

### Analytics graphs

- [ ] **Dashboard** displays non-placeholder counters, a creation graph and status chart.
- [ ] `/analytics` displays 30/90/365 day filtered creation graphs, subjects, question-type breakdown, status donut, and question-bank difficulty (when authorized).
- [ ] Create, publish and delete a paper, then refresh analytics to verify metrics change.
- [ ] Add a bank question and a custom template, then verify corresponding counts change.
- [ ] Teacher sees only personal data; admin sees platform totals; student sees published paper data and no teacher-only template/question bank statistics.
- [ ] Fresh database shows empty-state messages and no invented graph data. Mobile viewport has no clipped charts or horizontal page overflow.
- [ ] Existing **Preview → Export Question paper PDF** still produces the same print-faithful A4 layout and selectable text.
