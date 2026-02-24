# Document Parse + Split (From Description)

## Summary
Add a dedicated “parse document” entry in the “from description” tab. Users upload a `doc/docx/txt`, click **Parse Document** to extract text and populate the textarea. After reviewing, they click **Split to Pages** to send the text to the LLM, which returns per-slide descriptions and fills the textarea for the existing generation flow.

## Goals
- Provide an independent document parsing entry (not using reference file list).
- Make parsing and LLM splitting explicit, two-step actions.
- Keep the existing “Next” flow unchanged.

## Non-Goals
- Do not create or associate reference files.
- Do not create a project until the user clicks “Next.”
- Do not add new storage for parsed docs.

## Architecture
- Backend: add two lightweight endpoints.
  - `POST /api/documents/parse` for file upload and text extraction.
  - `POST /api/documents/split-to-pages` for LLM splitting.
- Frontend: add a compact “Document Parse” panel in the description tab with file input and two buttons.

## Components
### Backend
- New controller: `documents_controller.py`
- Service usage:
  - `FileParserService.parse_file(...)` for `doc/docx/txt` -> markdown/text.
  - `AIService.parse_description_to_outline(...)` + `parse_description_to_page_descriptions(...)` for splitting.

### Frontend
- `frontend/src/pages/Home.tsx`
  - New panel shown only when `activeTab === 'description'`.
  - State: `docFile`, `isParsingDoc`, `isSplittingDoc`, `parsedText`.
  - Buttons: **解析文档** and **拆解为每页**.

## Data Flow
1. User selects a file (`doc/docx/txt`) in the new panel.
2. **解析文档**
   - Upload to `/api/documents/parse`.
   - Response returns extracted text.
   - Frontend sets `content` (textarea) and `parsedText`.
3. User edits text if needed.
4. **拆解为每页**
   - Send current textarea content to `/api/documents/split-to-pages`.
   - Response returns `page_descriptions` and `formatted_text`.
   - Frontend replaces `content` with `formatted_text`.
5. User clicks existing **下一步** and proceeds as today.

## Error Handling
- File validation: frontend + backend allow only `doc/docx/txt`.
- Parse failure: toast with error, keep current textarea.
- Split failure: toast with error, keep current textarea.

## API Contracts
### `POST /api/documents/parse`
- Request: multipart form with file.
- Response:
  - `text`: extracted markdown/text.
  - `filename`

### `POST /api/documents/split-to-pages`
- Request JSON:
  - `text`: string
  - `language`: optional
- Response:
  - `page_descriptions`: string[]
  - `formatted_text`: string (human-editable per-page format)

## Testing
- Backend unit tests:
  - parse endpoint: accepts valid extensions, rejects invalid, returns text.
  - split endpoint: validates input, returns list + formatted text.
- Frontend tests (light):
  - loading state toggles for both buttons.
  - parsed text populates textarea.
  - split response replaces textarea.

## Risks / Notes
- MinerU availability impacts doc parsing. Fail with a clear error if unavailable.
- For very large documents, consider max file size and timeouts; follow existing upload limits.
