const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Task = require('../models/Task');

dotenv.config();

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await doc.loadInfo();
  console.log('Connected to Google Sheets:', doc.title);

  // 1. Migrate Users
  const userSheet = doc.sheetsByTitle['Users'];
  if (userSheet) {
    const rows = await userSheet.getRows();
    for (const row of rows) {
      const userData = row.toObject();
      await User.findOneAndUpdate(
        { ID: userData.ID },
        userData,
        { upsert: true }
      );
    }
    console.log(`Migrated ${rows.length} users`);
  }

  // 2. Migrate Tasks
  const taskSheet = doc.sheetsByTitle['Tasks'];
  if (taskSheet) {
    const rows = await taskSheet.getRows();
    for (const row of rows) {
      const taskData = row.toObject();
      // Handle CustomFields JSON
      if (taskData.CustomFields) {
        try { taskData.CustomFields = JSON.parse(taskData.CustomFields); } catch(e) {}
      }
      await Task.findOneAndUpdate(
        { ID: taskData.ID },
        taskData,
        { upsert: true }
      );
    }
    console.log(`Migrated ${rows.length} tasks`);
  }

  console.log('Migration completed!');
  process.exit();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
