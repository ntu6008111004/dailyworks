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
      "ProfileImage",
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
    usersSheet.appendRow([
      "3",
      "head_it",
      "cGFzczEyMw==",
      "Head",
      "IT",
      "หัวหน้าแผนก ไอที",
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
      "Image1",
      "Image2",
      "Image3",
      "Image4",
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
    let executorId = "System";

    if (e.postData && e.postData.contents) {
      const postData = JSON.parse(e.postData.contents);
      action = postData.action || action;
      data = postData.data;
      executorId = postData.executorId || executorId;
    }

    let result = {};

    switch (action) {
      case "login":
        result = loginUser(doc, data);
        break;
      case "getTasks":
        result = getTasks(doc);
        break;
      case "getTasksSummary":
        result = getTasksSummary(doc);
        break;
      case "getTaskById":
        result = getTaskById(doc, data.id);
        break;
      case "addTask":
        result = addTask(doc, data, executorId);
        break;
      case "updateTask":
        result = updateTask(doc, data, executorId);
        break;
      case "deleteTask":
        result = deleteTask(doc, data.id, executorId);
        break;
      case "uploadImage":
        result = uploadImage(data.base64, data.filename, data.mimeType);
        break;
      case "getUsers":
        result = getUsers(doc);
        break;
      case "addUser":
        result = addUser(doc, data, executorId);
        break;
      case "updateUser":
        result = updateUser(doc, data, executorId);
        break;
      case "deleteUser":
        result = deleteUser(doc, data.id, executorId);
        break;
      case "getTaskById":
        result = getTaskById(doc, data.id);
        break;
      case "MIGRATE_USERS_SHEET":
        result = migrateUsersSheet(doc);
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
  const cache = CacheService.getScriptCache();
  const cached = cache.get("tasks_full");
  if (cached) return JSON.parse(cached);

  const sheet = doc.getSheetByName(SHEET_TASKS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const result = data.slice(1).map((row) => {
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

  try {
    cache.put("tasks_full", JSON.stringify(result), 600); // 10 mins
  } catch (e) {}
  return result;
}

function getTasksSummary(doc) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("tasks_summary");
  if (cached) return JSON.parse(cached);

  const sheet = doc.getSheetByName(SHEET_TASKS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Only keep essential columns for summary
  const summaryHeaders = [
    "ID",
    "Detail",
    "Status",
    "Priority",
    "StartDate",
    "DueDate",
    "StaffName",
    "Department",
    "CreatedAt",
  ];
  const indices = summaryHeaders.map((h) => headers.indexOf(h));

  // Find image indices to check for existence
  const imgIndices = ["Image1", "Image2", "Image3", "Image4"].map((h) =>
    headers.indexOf(h),
  );

  const result = data.slice(1).map((row) => {
    let task = {};
    summaryHeaders.forEach((header, i) => {
      const colIdx = indices[i];
      task[header] = colIdx !== -1 ? row[colIdx] : "";
    });

    // Add lightweight indicator for images
    task.HasImages = imgIndices.some(
      (idx) => idx !== -1 && row[idx] && row[idx].toString().length > 0,
    );

    return task;
  });

  try {
    cache.put("tasks_summary", JSON.stringify(result), 600); // 10 mins
  } catch (e) {}
  return result;
}

function clearTasksCache() {
  const cache = CacheService.getScriptCache();
  cache.removeAll(["tasks_full", "tasks_summary"]);
}

function getTaskById(doc, id) {
  const tasks = getTasks(doc); // This uses cache if available
  const task = tasks.find((t) => t.ID === id);
  if (!task) throw new Error("Task not found");
  return task;
}

function addTask(doc, data, executorId) {
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
  clearTasksCache();

  logActivity(doc, executorId || "System", "ADD_TASK", `Task created`);
  return { message: "Task added successfully" };
}

function updateTask(doc, data, executorId) {
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
      clearTasksCache();
      logActivity(
        doc,
        executorId || "System",
        "UPDATE_TASK",
        `Task ${data.ID} updated`,
      );
      return { message: "Task updated successfully" };
    }
  }
  throw new Error("Task not found");
}

function deleteTask(doc, id, executorId) {
  const sheet = doc.getSheetByName(SHEET_TASKS);
  const rows = sheet.getDataRange().getValues();
  const idIndex = rows[0].indexOf("ID");

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] === id) {
      sheet.deleteRow(i + 1);
      clearTasksCache();
      logActivity(
        doc,
        executorId || "System",
        "DELETE_TASK",
        `Task ${id} deleted`,
      );
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

function addUser(doc, data, executorId) {
  const sheet = doc.getSheetByName(SHEET_USERS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow = [];

  headers.forEach((header) => {
    if (header === "ID") {
      newRow.push(Utilities.getUuid());
    } else {
      newRow.push(data[header] || "");
    }
  });

  sheet.appendRow(newRow);
  checkAndExpandSheet(sheet);

  logActivity(
    doc,
    executorId || "System",
    "ADD_USER",
    `User created: ${data.Username}`,
  );
  return { message: "User added successfully" };
}

function updateUser(doc, data, executorId) {
  const sheet = doc.getSheetByName(SHEET_USERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIndex = headers.indexOf("ID");

  if (idIndex === -1) throw new Error("ID column not found");

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] == data.ID) {
      headers.forEach((header, j) => {
        if (data[header] !== undefined && header !== "ID") {
          sheet.getRange(i + 1, j + 1).setValue(data[header]);
        }
      });
      logActivity(
        doc,
        executorId || "System",
        "UPDATE_USER",
        `User ${data.ID} updated`,
      );
      return { message: "User updated successfully" };
    }
  }
  throw new Error("User not found");
}

function deleteUser(doc, id, executorId) {
  const sheet = doc.getSheetByName(SHEET_USERS);
  const rows = sheet.getDataRange().getValues();
  const idIndex = rows[0].indexOf("ID");

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] == id) {
      sheet.deleteRow(i + 1);
      logActivity(
        doc,
        executorId || "System",
        "DELETE_USER",
        `User ${id} deleted`,
      );
      return { message: "User deleted successfully" };
    }
  }
  throw new Error("User not found");
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

function migrateUsersSheet(doc) {
  const sheet = doc.getSheetByName(SHEET_USERS);
  if (!sheet) return { error: "Users sheet not found" };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf("ProfileImage") === -1) {
    const newColIndex = sheet.getLastColumn() + 1;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, newColIndex).setValue("ProfileImage");
    SpreadsheetApp.flush();
    return { message: "ProfileImage column added successfully" };
  }
  return { message: "ProfileImage column already exists" };
}
