const SCRIPT_PROP = PropertiesService.getScriptProperties();

// Define sheet names
const SHEET_USERS = "Users";
const SHEET_TASKS = "Tasks";
const SHEET_LOGS = "ActivityLogs";

function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  SCRIPT_PROP.setProperty("key", doc.getId());
}

function initializeSheets() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Setup Users Sheet
  let usersSheet = doc.getSheetByName("Users");
  if (!usersSheet) {
    usersSheet = doc.insertSheet("Users");
    usersSheet.appendRow([
      "ID",
      "Username",
      "Password",
      "Role",
      "Department",
      "Name",
    ]);
    // Add default admin user (password is base64 for 'pass123')
    usersSheet.appendRow([
      "1",
      "admin1",
      "cGFzczEyMw==",
      "Admin",
      "Management",
      "Super Admin",
    ]);
    usersSheet.appendRow([
      "2",
      "staff_it",
      "cGFzczEyMw==",
      "Staff",
      "IT",
      "พนักงาน ไอที",
    ]);
  }

  // 2. Setup Tasks Sheet
  let tasksSheet = doc.getSheetByName("Tasks");
  if (!tasksSheet) {
    tasksSheet = doc.insertSheet("Tasks");
    tasksSheet.appendRow([
      "ID",
      "Detail",
      "Status",
      "Priority",
      "StartDate",
      "DueDate",
      "StaffName",
      "Department",
      "Note",
      "CustomFields",
      "CreatedAt",
      "UpdatedAt",
    ]);
  }

  // 3. Setup ActivityLogs Sheet
  let logsSheet = doc.getSheetByName("ActivityLogs");
  if (!logsSheet) {
    logsSheet = doc.insertSheet("ActivityLogs");
    logsSheet.appendRow(["Timestamp", "UserID", "Action", "Details"]);
  }

  // Delete default sheets if they exist
  const defaultSheetTh = doc.getSheetByName("ชีต1");
  if (defaultSheetTh && doc.getSheets().length > 1)
    doc.deleteSheet(defaultSheetTh);
  const defaultSheetEn = doc.getSheetByName("Sheet1");
  if (defaultSheetEn && doc.getSheets().length > 1)
    doc.deleteSheet(defaultSheetEn);

  SCRIPT_PROP.setProperty("key", doc.getId());
  return "บันทึกและสร้างหน้าตารางเรียบร้อยแล้ว!";
}

function doPost(e) {
  return handleResponse(e);
}

function doGet(e) {
  return handleResponse(e);
}

function handleResponse(e) {
  // CORS setup
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const doc = SpreadsheetApp.openById(SCRIPT_PROP.getProperty("key"));
    let action = e.parameter.action;
    let data;

    if (e.postData && e.postData.contents) {
      const postData = JSON.parse(e.postData.contents);
      action = postData.action || action;
      data = postData.data;
    }

    let result = {};

    switch (action) {
      case "login":
        result = loginUser(doc, data);
        break;
      case "getTasks":
        result = getTasks(doc);
        break;
      case "addTask":
        result = addTask(doc, data);
        break;
      case "updateTask":
        result = updateTask(doc, data);
        break;
      case "deleteTask":
        result = deleteTask(doc, data.id);
        break;
      case "uploadImage":
        result = uploadImage(data.base64, data.filename, data.mimeType);
        break;
      case "getUsers":
        result = getUsers(doc);
        break;
      default:
        throw new Error("Invalid action");
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", data: result }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function getTasks(doc) {
  const sheet = doc.getSheetByName(SHEET_TASKS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  return data.slice(1).map((row) => {
    let task = {};
    headers.forEach((header, i) => {
      task[header] = row[i];
    });
    // Parse JSON custom fields if exist
    if (task.CustomFields) {
      try {
        task.CustomFields = JSON.parse(task.CustomFields);
      } catch (e) {
        task.CustomFields = {};
      }
    }
    return task;
  });
}

function addTask(doc, data) {
  const sheet = doc.getSheetByName(SHEET_TASKS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow = [];

  headers.forEach((header) => {
    if (header === "ID") {
      newRow.push(Utilities.getUuid());
    } else if (header === "CustomFields") {
      newRow.push(data[header] ? JSON.stringify(data[header]) : "{}");
    } else if (header === "CreatedAt") {
      newRow.push(new Date());
    } else {
      newRow.push(data[header] || "");
    }
  });

  sheet.appendRow(newRow);
  checkAndExpandSheet(sheet);

  logActivity(doc, data.StaffID || "System", "ADD_TASK", `Task created`);
  return { message: "Task added successfully" };
}

function updateTask(doc, data) {
  const sheet = doc.getSheetByName(SHEET_TASKS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIndex = headers.indexOf("ID");

  if (idIndex === -1) throw new Error("ID column not found");

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] === data.ID) {
      headers.forEach((header, j) => {
        if (header === "CustomFields" && data[header]) {
          sheet.getRange(i + 1, j + 1).setValue(JSON.stringify(data[header]));
        } else if (data[header] !== undefined && header !== "ID") {
          sheet.getRange(i + 1, j + 1).setValue(data[header]);
        }
        if (header === "UpdatedAt") {
          sheet.getRange(i + 1, j + 1).setValue(new Date());
        }
      });
      logActivity(
        doc,
        data.StaffID || "System",
        "UPDATE_TASK",
        `Task ${data.ID} updated`,
      );
      return { message: "Task updated successfully" };
    }
  }
  throw new Error("Task not found");
}

function deleteTask(doc, id) {
  const sheet = doc.getSheetByName(SHEET_TASKS);
  const rows = sheet.getDataRange().getValues();
  const idIndex = rows[0].indexOf("ID");

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] === id) {
      sheet.deleteRow(i + 1);
      logActivity(doc, "System", "DELETE_TASK", `Task ${id} deleted`);
      return { message: "Task deleted successfully" };
    }
  }
  throw new Error("Task not found");
}

function getUsers(doc) {
  const sheet = doc.getSheetByName(SHEET_USERS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  return data.slice(1).map((row) => {
    let user = {};
    headers.forEach((header, i) => {
      user[header] = row[i];
    });
    return user;
  });
}

function loginUser(doc, { username, password }) {
  const sheet = doc.getSheetByName(SHEET_USERS);
  if (!sheet) throw new Error("Users sheet not found");

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const userIndex = headers.indexOf("Username");
  const passIndex = headers.indexOf("Password");

  if (userIndex === -1 || passIndex === -1) {
    throw new Error("Username or Password column not found in Users sheet");
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[userIndex] == username && row[passIndex] == password) {
      let user = {};
      headers.forEach((header, j) => {
        if (header !== "Password") {
          user[header] = row[j];
        }
      });
      return user;
    }
  }
  throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
}

function uploadImage(base64Data, filename, mimeType) {
  // Create or get folder
  let folder;
  const folderName = "DailyWorkLogs_Images";
  const folders = DriveApp.getFoldersByName(folderName);

  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  // Decode base64
  const decodedData = Utilities.base64Decode(base64Data.split(",")[1]);
  const blob = Utilities.newBlob(decodedData, mimeType, filename);

  const file = folder.createFile(blob);

  return {
    id: file.getId(),
    url: file.getUrl(),
    downloadUrl: file.getDownloadUrl(),
  };
}

function checkAndExpandSheet(sheet) {
  const maxRows = sheet.getMaxRows();
  const lastRow = sheet.getLastRow();

  // If approaching the limit within 50 rows
  if (maxRows - lastRow < 50) {
    sheet.insertRowsAfter(maxRows, 5000);
  }
}

// Time-driven trigger wrapper for auto expand
function scheduledCheckAndExpand() {
  const doc = SpreadsheetApp.openById(SCRIPT_PROP.getProperty("key"));
  const sheets = [SHEET_USERS, SHEET_TASKS, SHEET_LOGS];

  sheets.forEach((sheetName) => {
    const sheet = doc.getSheetByName(sheetName);
    if (sheet) {
      checkAndExpandSheet(sheet);
    }
  });
}

function logActivity(doc, userId, action, details) {
  const sheet = doc.getSheetByName(SHEET_LOGS);
  if (!sheet) return;
  sheet.appendRow([new Date(), userId, action, details]);
}
