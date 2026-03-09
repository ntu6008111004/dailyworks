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
      "UserID",
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
      "CompletedAt",
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
      case "getTasksPaged":
        result = getTasksPaged(doc, data);
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
  const headers = data[0].map((h) => h.toString().trim()); // Trim headers here

  const result = data.slice(1).map((row) => {
    let task = {};
    headers.forEach((header, i) => {
      if (!header) return; // Skip empty headers
      let val = row[i];
      if (val instanceof Date) {
        if (header === "CreatedAt" || header === "UpdatedAt") {
          val = val.toISOString();
        } else {
          val = Utilities.formatDate(
            val,
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
          );
        }
      }
      task[header] = val;
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
    cache.put("tasks_full", JSON.stringify(result), 120); // 2 mins
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
  const headers = data[0].map((h) => h.toString().trim()); // Trim headers here

  // Only keep essential columns for summary
  const summaryHeaders = [
    "ID",
    "Detail",
    "Status",
    "Priority",
    "StartDate",
    "DueDate",
    "UserID",
    "StaffName",
    "Department",
    "CustomFields",
    "CreatedAt",
    "CompletedAt",
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
      let val = colIdx !== -1 ? row[colIdx] : "";

      // Prevent timezone shift issue by formatting Date objects to explicit strings
      if (val instanceof Date) {
        if (header === "CreatedAt" || header === "UpdatedAt") {
          val = val.toISOString(); // keep full time for timestamps
        } else {
          val = Utilities.formatDate(
            val,
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
          );
        }
      }

      // Parse CustomFields JSON
      if (header === "CustomFields") {
        try {
          val = val ? JSON.parse(val) : {};
        } catch (e) {
          val = {};
        }
      }

      task[header] = val;
    });

    // Add lightweight indicator for images
    task.HasImages = imgIndices.some(
      (idx) => idx !== -1 && row[idx] && row[idx].toString().length > 0,
    );

    return task;
  });

  try {
    cache.put("tasks_summary", JSON.stringify(result), 120); // 2 mins
  } catch (e) {}
  return result;
}

function clearTasksCache() {
  const cache = CacheService.getScriptCache();
  cache.removeAll(["tasks_full", "tasks_summary"]);
}

/**
 * Server-Side Pagination with Filtering and RBAC.
 * Receives: { page, pageSize, keyword, status, department, user,
 *             startDate, endDate, userRole, userName, userDept, userId }
 * Returns:  { tasks, totalCount, totalPages, currentPage }
 */
function getTasksPaged(doc, params) {
  const page     = parseInt(params.page || 1, 10);
  const pageSize = parseInt(params.pageSize || 10, 10);

  // Reuse the cached summary (avoids re-reading the sheet)
  let allTasks = getTasksSummary(doc);

  // Also include CustomFields for task card (lightweight — already in cache)
  // Note: getTasksSummary does NOT include CustomFields, so we need to
  // read those separately only if required. For now we add them from full cache.
  // To keep payload light we only pull CustomFields via a merged approach.
  const fullCache = (function() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("tasks_full");
    if (cached) {
      try { return JSON.parse(cached); } catch(e) {}
    }
    return null;
  })();

  // Build a quick lookup of CustomFields + HasImages from summary (already has HasImages)
  // If full cache is warm, merge CustomFields; otherwise just use summary data.
  if (fullCache) {
    const cfMap = {};
    fullCache.forEach(function(t) { cfMap[t.ID] = t.CustomFields; });
    allTasks = allTasks.map(function(t) {
      return Object.assign({}, t, { CustomFields: cfMap[t.ID] || null });
    });
  }

  // --------- APPLY FILTERS ---------
  var keyword    = (params.keyword    || '').toLowerCase().trim();
  var status     = params.status     || 'All';
  var department = params.department || 'All';
  var filterUser = params.user       || 'All';
  var startDate  = params.startDate  || '';
  var endDate    = params.endDate    || '';

  // RBAC params sent from frontend
  var userRole   = (params.userRole   || 'Staff').toString().trim();
  var userName   = (params.userName   || '').toString().trim().toLowerCase();
  var userDept   = (params.userDept   || '').toString().trim();
  var canSeeAll  = userRole === 'Admin' || (userRole === 'Head' && userDept === 'HR');

  var filtered = allTasks.filter(function(t) {
    var taskStaffName = (t.StaffName || '').toString().trim().toLowerCase();

    // RBAC
    if (!canSeeAll) {
      if (userRole === 'Staff' && taskStaffName !== userName) return false;
      if (userRole === 'Head') {
        if ((t.Department || '').toString().trim() !== userDept) return false;
        if (filterUser !== 'All' && taskStaffName !== (filterUser || '').toString().trim().toLowerCase()) return false;
      }
    } else {
      if (department !== 'All' && (t.Department || '').toString().trim() !== department) return false;
      if (filterUser !== 'All' && taskStaffName !== (filterUser || '').toString().trim().toLowerCase()) return false;
    }

    // Status filter
    if (status !== 'All' && t.Status !== status) return false;

    // Keyword search
    if (keyword && !(t.Detail || '').toLowerCase().includes(keyword)) return false;

    // Date range filter
    if (startDate && t.StartDate && t.StartDate < startDate) return false;
    if (endDate   && t.StartDate && t.StartDate > endDate)   return false;

    return true;
  });

  // Sort newest first (by CreatedAt DESC)
  filtered.sort(function(a, b) {
    var da = a.CreatedAt ? new Date(a.CreatedAt) : new Date(0);
    var db = b.CreatedAt ? new Date(b.CreatedAt) : new Date(0);
    return db - da;
  });

  // --------- SLICE FOR PAGE ---------
  var totalCount = filtered.length;
  var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  var safePage   = Math.min(Math.max(page, 1), totalPages);
  var start      = (safePage - 1) * pageSize;
  var pageTasks  = filtered.slice(start, start + pageSize);

  return {
    tasks:       pageTasks,
    totalCount:  totalCount,
    totalPages:  totalPages,
    currentPage: safePage
  };
}

function getTaskById(doc, id) {
  const tasks = getTasks(doc); // This uses cache if available
  const task = tasks.find((t) => t.ID === id);
  if (!task) throw new Error("Task not found");
  return task;
}

function addTask(doc, data, executorId) {
  const sheet = doc.getSheetByName(SHEET_TASKS);
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((h) => h.toString().trim()); // Trim headers
  const newRow = [];

  headers.forEach((header) => {
    if (!header) {
      // Handle potential empty header cells
      newRow.push("");
      return;
    }

    if (header === "ID") {
      newRow.push(Utilities.getUuid());
    } else if (header === "CustomFields") {
      newRow.push(data[header] ? JSON.stringify(data[header]) : "{}");
    } else if (header === "CreatedAt") {
      newRow.push(new Date());
    } else {
      // Try exact match, then case-insensitive, then normalized (no special chars)
      let val = data[header];
      if (val === undefined) {
        const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
        const key = Object.keys(data).find((k) => {
          const normalizedKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normalizedKey === normalizedHeader;
        });
        val = key ? data[key] : "";
      }

      newRow.push(val === undefined ? "" : val);
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
        } else if (
          data[header] !== undefined &&
          header !== "ID" &&
          header !== "CreatedAt"
        ) {
          sheet.getRange(i + 1, j + 1).setValue(data[header]);
        }
        if (header === "UpdatedAt") {
          sheet.getRange(i + 1, j + 1).setValue(new Date());
        }
        if (header === "CompletedAt") {
          if (data.Status === "เสร็จสิ้น" && !rows[i][j]) {
            sheet.getRange(i + 1, j + 1).setValue(new Date());
          } else if (data.Status && data.Status !== "เสร็จสิ้น") {
            sheet.getRange(i + 1, j + 1).setValue("");
          }
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
  const headers = data[0].map((h) => h.toString().trim());

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
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((h) => h.toString().trim());
  const newRow = [];

  headers.forEach((header) => {
    if (!header) {
      newRow.push("");
      return;
    }
    if (header === "ID") {
      newRow.push(Utilities.getUuid());
    } else {
      let val = data[header];
      if (val === undefined) {
        const key = Object.keys(data).find(
          (k) => k.toLowerCase() === header.toLowerCase(),
        );
        val = key ? data[key] : "";
      }
      newRow.push(val);
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
  const headers = rows[0].map((h) => h.toString().trim());
  const idIndex = headers.indexOf("ID");

  if (idIndex === -1) throw new Error("ID column not found in Users sheet");

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] == data.ID) {
      const oldRow = rows[i];
      const nameIdx = headers.indexOf("Name");
      const deptIdx = headers.indexOf("Department");

      const oldName = nameIdx !== -1 ? oldRow[nameIdx] : null;
      const oldDept = deptIdx !== -1 ? oldRow[deptIdx] : null;

      let nameChanged = data.Name && data.Name !== oldName;
      let deptChanged = data.Department && data.Department !== oldDept;

      headers.forEach((header, j) => {
        if (!header || header === "ID") return;

        let val = data[header];
        if (val === undefined) {
          // Fallback to case-insensitive key search
          const key = Object.keys(data).find(
            (k) => k.toLowerCase() === header.toLowerCase(),
          );
          val = key ? data[key] : undefined;
        }

        if (val !== undefined) {
          sheet.getRange(i + 1, j + 1).setValue(val);
        }
      });

      if (nameChanged || deptChanged) {
        try {
          syncUserTasks(
            doc,
            data.ID,
            data.Name || oldName,
            data.Department || oldDept,
            oldName,
          );
        } catch (e) {
          console.error("Could not sync tasks", e);
        }
      }

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
  const headers = rows[0].map((h) => h.toString().trim());
  const idIndex = headers.indexOf("ID");

  if (idIndex === -1) throw new Error("ID column not found");

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
  const headers = data[0].map((h) => h.toString().trim());

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
        if (header && header !== "Password") {
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
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
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

function syncUserTasks(doc, userId, newName, newDept, oldName) {
  const tasksSheet = doc.getSheetByName(SHEET_TASKS);
  if (!tasksSheet) return;
  const data = tasksSheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const headers = data[0];
  const staffNameIdx = headers.indexOf("StaffName");
  const deptIdx = headers.indexOf("Department");
  const customFieldsIdx = headers.indexOf("CustomFields");
  const userIdIdx = headers.indexOf("UserID");

  if (staffNameIdx === -1) return;

  let updated = false;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let isMatch = false;

    // Check by UserID column if it exists
    if (userIdIdx !== -1 && row[userIdIdx] == userId) {
      isMatch = true;
    }

    // Fallback: Check by StaffID in CustomFields if exists
    if (!isMatch && customFieldsIdx !== -1 && row[customFieldsIdx]) {
      try {
        const cf = JSON.parse(row[customFieldsIdx]);
        if (cf && cf.StaffID == userId) {
          isMatch = true;
        }
      } catch (e) {}
    }

    // Fallback to name match for older tasks
    if (!isMatch && oldName && row[staffNameIdx] === oldName) {
      isMatch = true;
    }

    // Update if it's a match
    if (isMatch) {
      if (newName && row[staffNameIdx] !== newName) {
        tasksSheet.getRange(i + 1, staffNameIdx + 1).setValue(newName);
        updated = true;
      }
      if (newDept && deptIdx !== -1 && row[deptIdx] !== newDept) {
        tasksSheet.getRange(i + 1, deptIdx + 1).setValue(newDept);
        updated = true;
      }
      if (userIdIdx !== -1 && row[userIdIdx] != userId) {
        tasksSheet.getRange(i + 1, userIdIdx + 1).setValue(userId);
        updated = true;
      }
    }
  }

  if (updated) {
    clearTasksCache();
  }
}

function migrateTaskUserIds(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const tasksSheet = doc.getSheetByName(SHEET_TASKS);
  const usersSheet = doc.getSheetByName(SHEET_USERS);
  if (!tasksSheet || !usersSheet) return { error: "Sheets not found" };

  const taskHeaders = tasksSheet
    .getRange(1, 1, 1, tasksSheet.getLastColumn())
    .getValues()[0]
    .map((h) => h.toString().trim());
  let userIdColIdx = taskHeaders.indexOf("UserID");

  if (userIdColIdx === -1) {
    // Insert UserID column before StaffName
    const staffNameColIdx = taskHeaders.indexOf("StaffName");
    if (staffNameColIdx !== -1) {
      tasksSheet.insertColumnBefore(staffNameColIdx + 1);
      tasksSheet.getRange(1, staffNameColIdx + 1).setValue("UserID");
      userIdColIdx = staffNameColIdx; // Updated index after insert
    } else {
      // Fallback: append at end
      const newColIndex = tasksSheet.getLastColumn() + 1;
      tasksSheet.insertColumnAfter(tasksSheet.getLastColumn());
      tasksSheet.getRange(1, newColIndex).setValue("UserID");
      userIdColIdx = newColIndex - 1;
    }
  }

  // Get refreshed data
  const taskData = tasksSheet.getDataRange().getValues();
  const refreshedTaskHeaders = taskData[0];
  const staffNameIdx = refreshedTaskHeaders.indexOf("StaffName");
  userIdColIdx = refreshedTaskHeaders.indexOf("UserID");

  const userData = usersSheet.getDataRange().getValues();
  const userHeaders = userData[0];
  const uIdIdx = userHeaders.indexOf("ID");
  const uNameIdx = userHeaders.indexOf("Name");

  const userMap = {};
  for (let i = 1; i < userData.length; i++) {
    const row = userData[i];
    if (row[uNameIdx] && row[uIdIdx]) {
      userMap[row[uNameIdx]] = row[uIdIdx];
    }
  }

  let updateCount = 0;
  for (let i = 1; i < taskData.length; i++) {
    const taskRow = taskData[i];
    const currentUserId = taskRow[userIdColIdx];
    const staffName = taskRow[staffNameIdx];

    if (!currentUserId && staffName && userMap[staffName]) {
      tasksSheet.getRange(i + 1, userIdColIdx + 1).setValue(userMap[staffName]);
      updateCount++;
    }
  }

  return { message: "UserID migrated for " + updateCount + " tasks" };
}
