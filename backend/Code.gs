const SCRIPT_PROP = PropertiesService.getScriptProperties();

// Define sheet names
const SHEET_USERS = "Users";
const SHEET_TASKS = "Tasks";
const SHEET_LOGS = "ActivityLogs";
const SHEET_POSITIONS = "Positions";
const SHEET_BRIEFINGS = "Briefings";
const SHEET_BRIEFING_RESPONSES = "BriefingResponses";

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

  // 3. Setup Briefings Sheet
  let briefingsSheet = doc.getSheetByName(SHEET_BRIEFINGS);
  if (!briefingsSheet) {
    briefingsSheet = doc.insertSheet(SHEET_BRIEFINGS);
    briefingsSheet.appendRow([
      "ID",
      "RunningID",
      "Title",
      "CreatorID",
      "Detail",
      "CreatorNote",
      "Assignees",
      "Status",
      "Priority",
      "StartDate",
      "DueDate",
      "RefImage1",
      "RefImage2",
      "RefImage3",
      "RefImage4",
      "RefImage5",
      "RefImage6",
      "CreatedAt",
      "UpdatedAt",
      "LastUpdatedBy",
      "CompletedAt",
      "CardColor",
    ]);
  }

  // 4. Setup BriefingResponses Sheet
  let responsesSheet = doc.getSheetByName(SHEET_BRIEFING_RESPONSES);
  if (!responsesSheet) {
    responsesSheet = doc.insertSheet(SHEET_BRIEFING_RESPONSES);
    responsesSheet.appendRow([
      "ID",
      "BriefingID",
      "UserID",
      "ResultImage1",
      "ResultImage2",
      "ResultImage3",
      "ResultImage4",
      "ResultImage5",
      "ResultImage6",
      "URL1",
      "URL2",
      "Status",
      "Note",
      "ReviewImage1",
      "ReviewImage2",
      "ReviewImage3",
      "ReviewImage4",
      "ReviewImage5",
      "ReviewImage6",
      "UpdatedAt",
    ]);
  }

  // 5. Setup ActivityLogs Sheet
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

    action = (action || "").toString().trim();
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
      case "MIGRATE_USERS_SHEET":
        result = migrateUsersSheet(doc);
        break;
      case "MIGRATE_TASKS_SHEET":
        result = migrateTasksSheet(doc);
        break;
      case "getPositions":
        result = getPositions(doc);
        break;
      case "init":
        result = getInitData(doc, data);
        break;
      case "addPosition":
        result = addPosition(doc, data, executorId);
        break;
      case "updatePosition":
        result = updatePosition(doc, data, executorId);
        break;
      case "deletePosition":
        result = deletePosition(doc, data.id, executorId);
        break;
      case "MIGRATE_POSITIONS_SHEET":
        result = migratePositionsSheet(doc);
        break;
      case "MIGRATE_USERS_ADD_POSITION":
        result = migrateUsersAddPosition(doc);
        break;
      case "MIGRATE_USERS_ADD_PERMISSIONS":
        result = migrateUsersAddPermissions(doc);
        break;
      case "MIGRATE_USERS_POSITION_TO_ID":
        result = migrateUsersPositionToId(doc);
        break;
      case "getBriefings":
        result = getBriefings(doc);
        break;
      case "addBriefing":
        result = addBriefing(doc, data, executorId);
        break;
      case "updateBriefing":
        result = updateBriefing(doc, data, executorId);
        break;
      case "deleteBriefing":
        result = deleteBriefing(doc, data.id, executorId);
        break;
      case "saveBriefingResponse":
        result = saveBriefingResponse(doc, data, executorId);
        break;
      case "getBriefingResponses":
        result = getBriefingResponses(doc, data.briefingId);
        break;
      case "MIGRATE_USERS_ADD_BRIEFING_PERMISSIONS":
        result = migrateUsersAddBriefingPermissions(doc);
        break;
      case "MIGRATE_BRIEFINGS_ADD_FIELDS":
        result = migrateBriefingsAddFields(doc);
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
  let headers = data[0].map((h) => h.toString().trim());

  // Auto-migration: check if CompletedAt exists, if not, add it
  if (headers.indexOf("CompletedAt") === -1) {
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1).setValue("CompletedAt");
    headers.push("CompletedAt");
    SpreadsheetApp.flush();
  }

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
        if (
          header === "CreatedAt" ||
          header === "UpdatedAt" ||
          header === "CompletedAt"
        ) {
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
  const page = parseInt(params.page || 1, 10);
  const pageSize = parseInt(params.pageSize || 10, 10);

  // Reuse the cached summary (avoids re-reading the sheet)
  let allTasks = getTasksSummary(doc);

  // Also include CustomFields for task card (lightweight — already in cache)
  // Note: getTasksSummary does NOT include CustomFields, so we need to
  // read those separately only if required. For now we add them from full cache.
  // To keep payload light we only pull CustomFields via a merged approach.
  const fullCache = (function () {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("tasks_full");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  })();

  // Build a quick lookup of CustomFields + HasImages from summary (already has HasImages)
  // If full cache is warm, merge CustomFields; otherwise just use summary data.
  if (fullCache) {
    const cfMap = {};
    fullCache.forEach(function (t) {
      cfMap[t.ID] = t.CustomFields;
    });
    allTasks = allTasks.map(function (t) {
      return Object.assign({}, t, { CustomFields: cfMap[t.ID] || null });
    });
  }

  // --------- APPLY FILTERS ---------
  var keyword = (params.keyword || "").toLowerCase().trim();
  var status = params.status || "All";
  var department = params.department || "All";
  var filterUser = params.user || "All";
  var startDate = params.startDate || "";
  var endDate = params.endDate || "";

  // RBAC params sent from frontend
  var userRole = (params.userRole || "Staff").toString().trim();
  var userName = (params.userName || "").toString().trim().toLowerCase();
  var userDept = (params.userDept || "").toString().trim();
  var canSeeAll =
    userRole === "Admin" || (userRole === "Head" && userDept === "HR");

  var filtered = allTasks.filter(function (t) {
    // RBAC
    const tUserId = String(t.UserID || "");
    const currentUserId = String(params.userId || "");
    const tDept = (t.Department || "").toString().trim().toLowerCase();

    if (!canSeeAll) {
      if (userRole === "Staff" && tUserId !== currentUserId) return false;
      if (userRole === "Head") {
        if (tDept !== userDept.toLowerCase()) return false;
        if (filterUser !== "All" && tUserId !== String(filterUser))
          return false;
      }
    } else {
      if (department !== "All" && tDept !== department.toLowerCase())
        return false;
      if (filterUser !== "All" && tUserId !== String(filterUser)) return false;
    }

    // Status filter
    if (status !== "All" && t.Status !== status) return false;

    // Keyword search — search Detail AND CustomFields.Project
    if (keyword) {
      var detailMatch = (t.Detail || "").toLowerCase().includes(keyword);
      var projectVal = "";
      if (t.CustomFields && typeof t.CustomFields === "object") {
        projectVal = (t.CustomFields.Project || "").toLowerCase();
      } else if (t.CustomFields && typeof t.CustomFields === "string") {
        try {
          projectVal = (JSON.parse(t.CustomFields).Project || "").toLowerCase();
        } catch (e) {}
      }
      var projectMatch = projectVal.includes(keyword);
      if (!detailMatch && !projectMatch) return false;
    }

    // Date range filter
    if (startDate && t.StartDate && t.StartDate < startDate) return false;
    if (endDate && t.StartDate && t.StartDate > endDate) return false;

    return true;
  });

  // Sort newest first (by CreatedAt DESC)
  filtered.sort(function (a, b) {
    var da = a.CreatedAt ? new Date(a.CreatedAt) : new Date(0);
    var db = b.CreatedAt ? new Date(b.CreatedAt) : new Date(0);
    return db - da;
  });

  // --------- SLICE FOR PAGE ---------
  var totalCount = filtered.length;
  var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  var safePage = Math.min(Math.max(page, 1), totalPages);
  var start = (safePage - 1) * pageSize;
  var pageTasks = filtered.slice(start, start + pageSize);

  return {
    tasks: pageTasks,
    totalCount: totalCount,
    totalPages: totalPages,
    currentPage: safePage,
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

function getUsers(doc, options = {}) {
  const sheet = doc.getSheetByName(SHEET_USERS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map((h) => h.toString().trim());
  const includeImage = options.includeImage !== false;

  return data.slice(1).map((row) => {
    let user = {};
    headers.forEach((header, i) => {
      if (!includeImage && header === "ProfileImage") {
        user[header] = row[i] ? "has_image" : ""; // Tiny indicator instead of base64
        return;
      }
      let val = row[i];
      // Parse Permissions JSON if present
      if (header === "Permissions") {
        try {
          val = val ? JSON.parse(val) : {};
        } catch (e) {
          val = {};
        }
      }
      user[header] = val;
    });
    return user;
  });
}

function getInitData(doc, params) {
  const positions = getPositions(doc);
  const users = getUsers(doc, { includeImage: false });

  // Extract unique departments
  const departments = [
    ...new Set(users.map((u) => u.Department).filter(Boolean)),
  ].sort();

  // Get current user data if ID provided
  let currentUser = null;
  if (params && params.userId) {
    // We need the profile image for the current logged-in user
    const allUsersWithImages = getUsers(doc, { includeImage: true });
    currentUser = allUsersWithImages.find((u) => u.ID == params.userId) || null;
  }

  return {
    positions,
    departments,
    currentUser,
  };
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
      const roleIdx = headers.indexOf("Role");
      const posIdx = headers.indexOf("Position");

      const oldName = nameIdx !== -1 ? oldRow[nameIdx] : null;
      const oldDept = deptIdx !== -1 ? oldRow[deptIdx] : null;
      const oldRole = roleIdx !== -1 ? oldRow[roleIdx] : null;
      const oldPos = posIdx !== -1 ? oldRow[posIdx] : null;

      // Authenticated user (executor) info
      const usersInfo = getUsers(doc, { includeImage: false });
      const executor = usersInfo.find((u) => u.ID == executorId) || {
        Role: "Staff",
      };
      const isAdmin = executor.Role === "Admin";

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
          // SECURITY: Only Admin can change certain fields
          if (!isAdmin) {
            if (
              header === "Role" ||
              header === "Department" ||
              header === "Position"
            ) {
              return; // Skip sensitive fields for non-admins
            }
          }

          // Serialize Permissions if it's an object
          if (
            header === "Permissions" &&
            typeof val === "object" &&
            val !== null
          ) {
            val = JSON.stringify(val);
          }
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

function migrateTasksSheet(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_TASKS);
  if (!sheet) return { error: "Tasks sheet not found" };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf("CompletedAt") === -1) {
    const newColIndex = sheet.getLastColumn() + 1;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, newColIndex).setValue("CompletedAt");
    SpreadsheetApp.flush();
    return { message: "CompletedAt column added successfully" };
  }
  return { message: "CompletedAt column already exists" };
}

// ───────────────────────────────────────────────────────────────────────────
// Positions CRUD
// ───────────────────────────────────────────────────────────────────────────

function getPositions(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_POSITIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0].map((h) => h.toString().trim());
  return data
    .slice(1)
    .map((row) => {
      let pos = {};
      headers.forEach((h, i) => {
        pos[h] = row[i];
      });
      // Default color if missing
      if (!pos.Color) pos.Color = "bg-blue-100 text-blue-600";
      return pos;
    })
    .filter((p) => p.ID && p.Name);
}

function addPosition(doc, data, executorId) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_POSITIONS);
  if (!sheet) throw new Error("Positions sheet not found");
  const id = Utilities.getUuid();
  sheet.appendRow([id, data.Name || ""]);
  clearPositionsCache();
  logActivity(
    doc,
    executorId || "System",
    "ADD_POSITION",
    "Position: " + data.Name,
  );
  return { message: "Position added", id };
}

function clearPositionsCache() {
  const cache = CacheService.getScriptCache();
  cache.remove("positions_list");
}

function updatePosition(doc, data, executorId) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_POSITIONS);
  if (!sheet) throw new Error("Positions sheet not found");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map((h) => h.toString().trim());
  const idIdx = headers.indexOf("ID");
  const nameIdx = headers.indexOf("Name");
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIdx] == data.ID) {
      if (nameIdx !== -1)
        sheet
          .getRange(i + 1, nameIdx + 1)
          .setValue(data.Name || rows[i][nameIdx]);
      logActivity(
        doc,
        executorId || "System",
        "UPDATE_POSITION",
        "Position " + data.ID,
      );
      return { message: "Position updated" };
    }
  }
  throw new Error("Position not found");
}

function deletePosition(doc, id, executorId) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_POSITIONS);
  if (!sheet) throw new Error("Positions sheet not found");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map((h) => h.toString().trim());
  const idIdx = headers.indexOf("ID");
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIdx] == id) {
      sheet.deleteRow(i + 1);
      clearPositionsCache();
      logActivity(
        doc,
        executorId || "System",
        "DELETE_POSITION",
        "Position " + id,
      );
      return { message: "Position deleted" };
    }
  }
  throw new Error("Position not found");
}

// ───────────────────────────────────────────────────────────────────────────
// Migration helpers
// ───────────────────────────────────────────────────────────────────────────

function migratePositionsSheet(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = doc.getSheetByName(SHEET_POSITIONS);
  if (!sheet) {
    sheet = doc.insertSheet(SHEET_POSITIONS);
    sheet.appendRow(["ID", "Name", "Color"]);
    SpreadsheetApp.flush();
    return { message: "Positions sheet created" };
  } else {
    // Check if Color column exists
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    if (headers.indexOf("Color") === -1) {
      const newCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newCol).setValue("Color");
      SpreadsheetApp.flush();
      return { message: "Color column added to Positions" };
    }
  }
  return { message: "Positions sheet already exists" };
}

function migrateUsersAddPosition(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_USERS);
  if (!sheet) return { error: "Users sheet not found" };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf("Position") === -1) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, newCol).setValue("Position");
    SpreadsheetApp.flush();
    return { message: "Position column added to Users" };
  }
  return { message: "Position column already exists" };
}

function migrateUsersAddPermissions(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_USERS);
  if (!sheet) return { error: "Users sheet not found" };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf("Permissions") === -1) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, newCol).setValue("Permissions");
    SpreadsheetApp.flush();
    return { message: "Permissions column added to Users" };
  }
  return { message: "Permissions column already exists" };
}

function migrateUsersPositionToId(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = doc.getSheetByName(SHEET_USERS);
  const posSheet = doc.getSheetByName(SHEET_POSITIONS);
  if (!userSheet || !posSheet) return { error: "Sheets not found" };

  const userData = userSheet.getDataRange().getValues();
  const userHeaders = userData[0].map((h) => h.toString().trim());
  const posIdx = userHeaders.indexOf("Position");
  const userIdIdx = userHeaders.indexOf("ID");

  if (posIdx === -1) return { error: "Position column not found" };

  const positions = getPositions(doc);
  const posMap = {}; // Name -> ID
  positions.forEach((p) => {
    posMap[p.Name] = p.ID;
  });

  let updateCount = 0;
  for (let i = 1; i < userData.length; i++) {
    const currentVal = userData[i][posIdx];
    // If it is a name (exists in posMap) and not already a UUID (rough check for '-' presence)
    if (currentVal && posMap[currentVal] && !currentVal.includes("-")) {
      userSheet.getRange(i + 1, posIdx + 1).setValue(posMap[currentVal]);
      updateCount++;
    }
  }

  return { message: `Migrated ${updateCount} users from Position Name to ID` };
}

// Migration for new Briefing fields

// ───────────────────────────────────────────────────────────────────────────
// Briefing CRUD
// ───────────────────────────────────────────────────────────────────────────

function getBriefings(doc) {
  let sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  if (!sheet) {
    initializeSheets();
    sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  }
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0].map((h) => h.toString().trim());

  return data.slice(1).map((row) => {
    let b = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) {
        if (h === "CreatedAt" || h === "UpdatedAt" || h === "CompletedAt") {
          val = val.toISOString();
        } else {
          val = Utilities.formatDate(
            val,
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
          );
        }
      }
      if (h === "Assignees") {
        try {
          val = val ? JSON.parse(val) : [];
        } catch (e) {
          val = [];
        }
      }
      b[h] = val;
    });
    return b;
  });
}

function addBriefing(doc, data, executorId) {
  let sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  if (!sheet) {
    initializeSheets();
    sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  }
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((h) => h.toString().trim());

  // Generate RunningID: BR-YYMM-XXX
  const now = new Date();
  const dateStr = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "yyMM",
  );
  const count = sheet.getLastRow();
  const runningId = "BR-" + dateStr + "-" + ("000" + count).slice(-3);

  const newRow = headers.map((h) => {
    if (h === "ID") return Utilities.getUuid();
    if (h === "RunningID") return runningId;
    if (h === "CreatorID") return executorId;
    if (h === "Assignees") return JSON.stringify(data.Assignees || []);
    if (h === "CreatedAt" || h === "UpdatedAt") return new Date();
    if (h === "LastUpdatedBy") return executorId;
    if (h === "Status") return data.Status || "รอดำเนินการ";
    return data[h] || "";
  });

  sheet.appendRow(newRow);
  logActivity(
    doc,
    executorId,
    "ADD_BRIEFING",
    "Briefing created: " + runningId,
  );
  return { message: "Briefing created", runningId };
}

function updateBriefing(doc, data, executorId) {
  let sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  if (!sheet) {
    initializeSheets();
    sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  }
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map((h) => h.toString().trim());
  const idIdx = headers.indexOf("ID");

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.ID)) {
      const colMap = {};
      headers.forEach((h, j) => {
        if (!colMap[h]) colMap[h] = j + 1;
      });

      // Update basic fields
      Object.keys(data).forEach((key) => {
        if (key === "ID") return;
        const colIdx = colMap[key];
        if (colIdx) {
          let val = data[key];
          if (key === "Assignees") val = JSON.stringify(val || []);
          sheet.getRange(i + 1, colIdx).setValue(val);
        }
      });

      // Update system fields
      if (colMap["UpdatedAt"]) {
        sheet.getRange(i + 1, colMap["UpdatedAt"]).setValue(new Date());
      }
      if (colMap["LastUpdatedBy"]) {
        sheet.getRange(i + 1, colMap["LastUpdatedBy"]).setValue(executorId);
      }

      // Update CompletedAt if status is Done
      const compIdx = colMap["CompletedAt"];
      if (compIdx) {
        if (data.Status === "เสร็จสิ้น") {
          sheet.getRange(i + 1, compIdx).setValue(new Date());
        } else if (data.Status && data.Status !== "เสร็จสิ้น") {
          sheet.getRange(i + 1, compIdx).setValue("");
        }
      }

      logActivity(
        doc,
        executorId,
        "UPDATE_BRIEFING",
        "Briefing updated: " + data.ID,
      );
      return { message: "Briefing updated" };
    }
  }
  throw new Error("Briefing not found");
}

function deleteBriefing(doc, id, executorId) {
  let sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  if (!sheet) {
    initializeSheets();
    sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  }
  const rows = sheet.getDataRange().getValues();
  const idIdx = rows[0].map((h) => h.toString().trim()).indexOf("ID");

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(id)) {
      sheet.deleteRow(i + 1);

      // Cascading delete: Remove all responses for this briefing
      const respSheet = doc.getSheetByName(SHEET_BRIEFING_RESPONSES);
      if (respSheet) {
        const respData = respSheet.getDataRange().getValues();
        const respHeaders = respData[0].map((h) => h.toString().trim());
        const bIdIdxInResp = respHeaders.indexOf("BriefingID");
        if (bIdIdxInResp !== -1) {
          // Delete from bottom to top to avoid index shifts
          for (let k = respData.length - 1; k >= 1; k--) {
            if (String(respData[k][bIdIdxInResp]) === String(id)) {
              respSheet.deleteRow(k + 1);
            }
          }
        }
      }

      logActivity(
        doc,
        executorId,
        "DELETE_BRIEFING",
        "Briefing deleted: " + id,
      );
      return { message: "Briefing and related responses deleted" };
    }
  }
  throw new Error("Briefing not found");
}

function getBriefingResponses(doc, briefingId) {
  let sheet = doc.getSheetByName(SHEET_BRIEFING_RESPONSES);
  if (!sheet) {
    initializeSheets();
    sheet = doc.getSheetByName(SHEET_BRIEFING_RESPONSES);
  }
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0].map((h) => h.toString().trim());
  const bIdIdx = headers.indexOf("BriefingID");

  return data
    .slice(1)
    .filter((row) => row[bIdIdx] === briefingId)
    .map((row) => {
      let r = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (val instanceof Date) val = val.toISOString();
        r[h] = val;
      });
      return r;
    });
}

function saveBriefingResponse(doc, data, executorId) {
  let sheet = doc.getSheetByName(SHEET_BRIEFING_RESPONSES);
  if (!sheet) {
    initializeSheets();
    sheet = doc.getSheetByName(SHEET_BRIEFING_RESPONSES);
  }
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map((h) => h.toString().trim());
  const bIdIdx = headers.indexOf("BriefingID");
  const uIdIdx = headers.indexOf("UserID");

  // Look for existing response from this user for this briefing
  let existingRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (
      String(rows[i][bIdIdx]) === String(data.BriefingID) &&
      String(rows[i][uIdIdx]) === String(data.UserID || executorId)
    ) {
      existingRow = i + 1;
      break;
    }
  }

  // Create a map of header names to the FIRST column index they appear in
  const colMap = {};
  headers.forEach((h, j) => {
    const name = h.toString().trim();
    if (name && !colMap[name]) colMap[name] = j + 1;
  });

  if (existingRow !== -1) {
    // Update mode: Only write fields that exist in payload
    const skip = ["ID", "BriefingID", "UserID"];

    // 1. Explicitly update fields from payload
    Object.keys(data).forEach((key) => {
      if (skip.indexOf(key) !== -1) return;
      const colIdx = colMap[key];
      if (colIdx) {
        sheet.getRange(existingRow, colIdx).setValue(data[key]);
      }
    });

    // 2. Handle UpdatedAt if exists
    if (colMap["UpdatedAt"]) {
      sheet.getRange(existingRow, colMap["UpdatedAt"]).setValue(new Date());
    }
  } else {
    // Add mode: Use the existing loop but be careful
    const newRow = headers.map((h) => {
      const name = h.toString().trim();
      if (name === "ID") return Utilities.getUuid();
      if (name === "BriefingID") return data.BriefingID;
      if (name === "UserID") return data.UserID || executorId;
      if (name === "UpdatedAt") return new Date();
      return data[name] !== undefined ? data[name] : "";
    });
    sheet.appendRow(newRow);
  }

  // Also update the main briefing's UpdatedAt and LastUpdatedBy
  updateBriefingTimestamp(doc, data.BriefingID, executorId);

  // Auto-update Briefing status if necessary (e.g. if all assignees are done)
  // Logic omitted for now or handled by frontend

  return { message: "Response saved" };
}

function updateBriefingTimestamp(doc, briefingId, executorId) {
  let sheet = doc.getSheetByName(SHEET_BRIEFINGS);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map((h) => h.toString().trim());
  const idIdx = headers.indexOf("ID");
  const upIdx = headers.indexOf("UpdatedAt");
  const lubIdx = headers.indexOf("LastUpdatedBy");

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(briefingId)) {
      if (upIdx !== -1) sheet.getRange(i + 1, upIdx + 1).setValue(new Date());
      if (lubIdx !== -1) sheet.getRange(i + 1, lubIdx + 1).setValue(executorId);
      break;
    }
  }
}

function migrateUsersAddBriefingPermissions(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = doc.getSheetByName(SHEET_USERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map((h) => h.toString().trim());
  const permsIdx = headers.indexOf("Permissions");
  const roleIdx = headers.indexOf("Role");

  if (permsIdx === -1) return { error: "Permissions column not found" };

  for (let i = 1; i < data.length; i++) {
    let perms = {};
    try {
      perms = data[i][permsIdx] ? JSON.parse(data[i][permsIdx]) : {};
    } catch (e) {}

    const role = data[i][roleIdx];
    // Default permissions for new feature
    if (perms.canViewBriefingPage === undefined)
      perms.canViewBriefingPage = role === "Admin" || role === "Head";
    if (perms.canCreateBriefing === undefined)
      perms.canCreateBriefing = role === "Admin" || role === "Head";

    sheet.getRange(i + 1, permsIdx + 1).setValue(JSON.stringify(perms));
  }
  return { message: "Briefing permissions migrated" };
}

function migrateBriefingsAddFields(doc) {
  if (!doc) doc = SpreadsheetApp.getActiveSpreadsheet();

  const sheetsToFix = [SHEET_BRIEFINGS, SHEET_BRIEFING_RESPONSES];

  sheetsToFix.forEach((sheetName) => {
    const sheet = doc.getSheetByName(sheetName);
    if (!sheet) return;

    // 1. Get current headers and deduplicate (Case Insensitive)
    let currentLastCol = sheet.getLastColumn();
    if (currentLastCol < 1) return;

    let headers = sheet
      .getRange(1, 1, 1, currentLastCol)
      .getValues()[0]
      .map((h) => h.toString().trim());

    const seen = new Set();
    const colsToDelete = [];

    // Find duplicate names or Empty headers
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) {
        colsToDelete.push(i + 1); // Delete empty header columns
        continue;
      }
      if (seen.has(h.toLowerCase())) {
        colsToDelete.push(i + 1);
      } else {
        seen.add(h.toLowerCase());
      }
    }

    // Delete duplicate columns from right to left
    colsToDelete
      .sort((a, b) => b - a)
      .forEach((colIdx) => {
        sheet.deleteColumn(colIdx);
      });

    // 2. Refresh headers
    currentLastCol = sheet.getLastColumn();
    headers = sheet
      .getRange(1, 1, 1, Math.max(1, currentLastCol))
      .getValues()[0]
      .map((h) => h.toString().trim());

    // 3. Define REQUIRED FIELD SEQUENCE (Optionally re-order)
    // For now, we just ensure they exist. The map-based saving will handle the rest.
    const required =
      sheetName === SHEET_BRIEFINGS
        ? [
            "ID",
            "RunningID",
            "Title",
            "CreatorID",
            "Detail",
            "CreatorNote",
            "Assignees",
            "Status",
            "Priority",
            "StartDate",
            "DueDate",
            "RefURL",
            "LastUpdatedBy",
            "UpdatedAt",
            "CompletedAt",
            "CardColor",
          ]
        : [
            "ID",
            "BriefingID",
            "UserID",
            "ResultImage1",
            "ResultImage2",
            "ResultImage3",
            "ResultImage4",
            "ResultImage5",
            "ResultImage6",
            "URL1",
            "URL2",
            "Status",
            "Note",
            "ReviewImage1",
            "ReviewImage2",
            "ReviewImage3",
            "ReviewImage4",
            "ReviewImage5",
            "ReviewImage6",
            "UpdatedAt",
          ];

    required.forEach((h) => {
      if (
        !headers.some((existing) => existing.toLowerCase() === h.toLowerCase())
      ) {
        const lastCol = sheet.getLastColumn();
        sheet.insertColumnAfter(lastCol);
        sheet.getRange(1, lastCol + 1).setValue(h);
        headers.push(h);
      }
    });
  });

  return {
    message: "Briefing fields migrated & headers deduplicated robustly",
  };
}
