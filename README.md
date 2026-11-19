# DocMind by Saiteja

Upload a PDF, ask questions, and get streamed answers with page references. DocMind uses React, FastAPI, ChromaDB, and Gemini. [Current public demo](https://docmind-mocha.vercel.app/)

## Access

| Role | Features |
|---|---|
| Guest | Five questions per guest session about a built-in sample library guide. Guest chats live in the open tab. |
| Registered user | Private indexing of uploaded PDFs, page references, and saved chat history available after signing back in. |
| Admin | A user list with registered emails, roles, signup dates, and last activity. Counts include accounts, accounts active in the last 24 hours, and guest sessions. A guest session is a visit session and may represent a repeat visitor. |

Chat and document access is scoped to the authenticated account on the backend. The admin endpoint returns account metadata and counts. Passwords are stored as salted PBKDF2 hashes, and sign-out revokes the current session. The browser stores the session token in tab storage and keeps chat content out of browser local storage.

Uploaded PDFs are parsed in memory. The document index persists extracted text, embeddings, file names, and page numbers. Gemini receives text for embedding and matching excerpts and chat context for answer generation. Each PDF can contain up to 10 MiB, 100 pages, and 1,000 chunks. Upload counts depend on the account plan. Scanned and encrypted PDFs are outside the current workflow. Existing shared and anonymous indexes are excluded because their files cannot be mapped safely to signed-in accounts. Account owners should upload their source files again.

## Plans

Signed-in accounts start on Free. Free allows 10 questions and 3 PDFs per day, 1 PDF per upload, and up to 1,000 indexed text chunks. Pro costs ₹600 for 30 days and allows 100 questions and 25 PDFs per day, 5 PDFs per upload, and 5,000 indexed text chunks. Both plans include private PDFs and saved chats. Shared service quotas also apply.

Users request Pro in **Plans**. Requests appear first in the **Admin** dashboard. After receiving and confirming payment outside DocMind, select **Activate Pro**. DocMind records the expiration date. The account returns to Free after 30 days and keeps its previously indexed PDFs and chat history. Payment collection and automatic renewal require a separate integration.

## Local setup

From `backend/`, create a Python 3.12 virtual environment, install `requirements.txt`, and copy `.env.example` to `.env`. Set `GEMINI_API_KEY`, then run `uvicorn main:app --reload`.

From `frontend/`, run `npm ci` and `npm start` with Node 22. Open http://localhost:3000. The local API uses http://localhost:8000.

## Deployment

The public demo runs on Render Free. A restart, idle spin-down, or redeploy clears registered accounts, sessions, saved chats, and the PDF index.

For a deployment that retains accounts and documents, configure a single API instance and one worker with durable storage for both `DOCMIND_DB_PATH` and `CHROMA_PATH`. Set both paths under the actual mounted directory. For a disk mounted at `/var/data`, use `/var/data/docmind.sqlite3` and `/var/data/chroma`. Use a fresh per-account index and back up both stores. SQLite holds account, session, chat, and usage data. Chroma holds the private PDF index.

Set `CORS_ORIGINS` to the exact HTTPS frontend origin and configure the frontend's `REACT_APP_API_URL` with the HTTPS API base URL. Keep provider API keys in backend environment settings.

In the running backend shell, from the directory containing `accounts.py`, run `python accounts.py` to create the admin account on the persistent database. The password prompts are hidden. Use a separate admin email if that address already has a registered account. Sign in with the admin account and open **Admin** in the header.

The current beta uses email addresses supplied during registration. Email verification and self-service password recovery are future work. The API enforces daily quotas for guest starts, authentication, questions, and upload requests. Configure provider quotas and gateway request-size limits before broad rollout. Counts start with the new deployment's database.

## Google and mobile sign-in

1. Create or select a Firebase project, register a web app, enable **Google** in Firebase Authentication, and add the frontend hostname under **Authorized domains**. For the public demo, use `docmind-mocha.vercel.app`.
2. Set `DOCMIND_FIREBASE_PROJECT_ID` on the API. Copy the Firebase web app's API key, auth domain, project ID, and app ID into the matching `REACT_APP_FIREBASE_*` frontend variables shown in `frontend/.env.example`. The project IDs must match. The API verifies tokens against Firebase public signing keys.
3. To enable mobile sign-in, enable **Phone** in Firebase Authentication, allow the intended SMS regions, and set `REACT_APP_FIREBASE_PHONE_ENABLED=true`. Real verification texts require the Firebase Blaze plan. Test with the fictional numbers configured in Firebase before enabling real SMS.
4. Deploy the API first, then rebuild and deploy the frontend. Verify Google sign-in, SMS code entry, sign-out, and workspace isolation on the authorized HTTPS domain.

Google and mobile sign-ins create or reopen workspaces by verified Firebase identity. Existing email/password accounts continue to use their original login. Google sign-in rejects a matching email until an explicit account-linking flow is available. DocMind does not store phone numbers or OTPs in its account database.

## Validation

- Backend. Run `python -m pytest -q` from `backend/` with pytest and httpx installed. Isolation tests use a temporary database and mock Gemini.
- Frontend. Run `CI=true npm test -- --watchAll=false` and `CI=true npm run build` from `frontend/`.
- After deployment, use a sample PDF and two regular accounts to verify the second account cannot see the first account's documents or chats. Check guest limits and admin access separately.

Author: Sai Teja Golla · [GitHub](https://github.com/iamsaiteja) · [LinkedIn](https://www.linkedin.com/in/golla-saiteja)
