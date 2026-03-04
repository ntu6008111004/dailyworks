# Daily Work Logging System

This is a Fullstack Web Application consisting of a React (Vite+Tailwind 4) frontend and a Google Apps Script (GAS) backend using Google Sheets as the database.

## Architecture

- **Frontend**: React, Vite, Tailwind CSS 4, Recharts, Lucide Icons.
- **Backend/Database**: Google Apps Script (GAS) handling REST API requests and mapping them to Google Sheets rows.

## 1. Backend Setup (Google Apps Script)

1. Create a new Google Sheet. Rename the first tab to `Users`. Add two more tabs: `Tasks` and `ActivityLogs`.
2. Set the Headers in the `Tasks` sheet on Row 1 exactly as: `ID`, `Detail`, `StartDate`, `DueDate`, `Priority`, `Status`, `StaffName`, `CustomFields`, `CreatedAt`, `UpdatedAt`.
3. Go to **Extensions > Apps Script**.
4. Clear the default `Code.gs` and replace it with the contents of `backend/Code.gs` from this project.
5. In the Apps Script editor, run the `setup()` function once (it will ask for permissions to read your Sheet and modify Drive files).
6. Click **Deploy > New Deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the generated **Web app URL**.
8. (Optional) Set up a Time-driven Trigger to run `scheduledCheckAndExpand()` daily to ensure the 50,000 rows buffer is maintained securely.

## 2. Frontend Setup (React)

1. Open terminal and navigate to the `frontend` directory.
2. In `frontend/.env`, replace the URL with your deployed Web App URL:
   ```
   VITE_GAS_WEBAPP_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
   ```
3. Run `npm install` (if not done already).
4. Run `npm run dev` to start the local development server.

## Dynamic Fields (JSON)

The core feature of this platform allows different roles to create specific custom fields. These are serialized dynamically in the React `<TaskModal />` using the `CustomFields` state array. Upon submit, they are stringified and stored in the `CustomFields` column in Google Sheets without modifying the database schema.
