/**
 * Kitanishi Lab 共通機器・部屋予約システム バックエンド (Google Apps Script)
 * 
 * 【機能】
 * - 予約一覧・リソース一覧の取得、追加、編集、削除
 * - 各予約ごとのカラー指定（20色対応）
 * - 最終編集日時 (UpdatedAt) の保存・取得
 * - 時間重複予約の自動防止チェック
 */

const SHEET_RESERVATIONS = "Reservations";
const SHEET_RESOURCES = "Resources";

/**
 * 初期データベース構築
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let resSheet = ss.getSheetByName(SHEET_RESOURCES);
  if (!resSheet) {
    resSheet = ss.insertSheet(SHEET_RESOURCES);
    resSheet.appendRow(["ID", "Name", "Location", "Description"]);
    const defaultResources = [
      ["res-1", "Surgery table1", "005室", "吸入麻酔機、可動アーム"],
      ["res-2", "Surgery table2", "005室", "Acute recording"],
      ["res-3", "Perfusion", "005室", "使用中は水道利用不可"],
      ["res-4", "Microtome", "005室", "Leica"],
      ["res-5", "3D printer (Asiga)", "005室", "LogNoteあり"],
      ["res-6", "3D printer (Bambu lab)", "012室", "LogNoteなし"],
      ["res-7", "Microscopy", "012室", "ZEISS"],
      ["res-8", "Mouse behavior1", "003A室", "Miura"],
      ["res-9", "Mouse behavior2", "003A室", "Iida/Endo"],
      ["res-10", "Mouse behavior3", "003A室", "Nakanose"],
      ["res-11", "Mouse behavior4", "003A室", "Shibuya"],
      ["res-12", "Rat behavior1", "003B室", "Wang"],
      ["res-13", "Rat behavior2", "003B室", "Aimi"],
      ["res-14", "Workstaion", "012室", "Sorting, DLC"],
    ];
    defaultResources.forEach(r => resSheet.appendRow(r));
    resSheet.getRange("1:1").setFontWeight("bold").setBackground("#EFEFEF");
  }

  let revSheet = ss.getSheetByName(SHEET_RESERVATIONS);
  if (!revSheet) {
    revSheet = ss.insertSheet(SHEET_RESERVATIONS);
    revSheet.appendRow(["ID", "ResourceId", "ResourceName", "StartTime", "EndTime", "UserName", "Notes", "CreatedAt", "Color", "UpdatedAt", "GoogleEventId", "CalendarId"]);
    revSheet.getRange("1:1").setFontWeight("bold").setBackground("#EFEFEF");
  } else {
    const headers = revSheet.getRange(1, 1, 1, revSheet.getLastColumn()).getValues()[0];
    if (headers.length < 10 || headers[9] !== "UpdatedAt") {
      revSheet.getRange(1, 10).setValue("UpdatedAt").setFontWeight("bold");
    }
    if (headers.length < 11 || headers[10] !== "GoogleEventId") {
      revSheet.getRange(1, 11).setValue("GoogleEventId").setFontWeight("bold");
    }
    if (headers.length < 12 || headers[11] !== "CalendarId") {
      revSheet.getRange(1, 12).setValue("CalendarId").setFontWeight("bold");
    }
  }

  Logger.log("Database setup complete!");
}

/**
 * HTTP GET
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : null;
    
    // API データ取得呼び出し
    if (action === "getData") {
      return jsonResponse({ status: "success", ...getAllData() });
    }

    // ブラウザで直接 GAS URL を開いた場合（GASでのHTML直配信モード / Option B）
    if (!action || action === "page") {
      try {
        return HtmlService.createHtmlOutputFromFile('index')
          .setTitle('Kitanishi Lab 機器・部屋予約')
          .setXframeOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
          .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=5.0');
      } catch (htmlErr) {
        // index.htmlがGASプロジェクトに貼り付けられていない場合は既存のJSONデータを返す
        return jsonResponse({ status: "success", ...getAllData() });
      }
    }

    return jsonResponse({ status: "error", message: "Unknown action" });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * HTTP POST
 */
function doPost(e) {
  try {
    let postData;
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      postData = e.parameter;
    } else {
      postData = {};
    }

    const action = postData.action;

    if (action === "addReservation") return jsonResponse(addReservation(postData.data));
    if (action === "editReservation") return jsonResponse(editReservation(postData.data));
    if (action === "deleteReservation") return jsonResponse(deleteReservation(postData.id, postData.calendarId));

    if (action === "addResource") return jsonResponse(addResource(postData.data));
    if (action === "editResource") return jsonResponse(editResource(postData.data));
    if (action === "deleteResource") return jsonResponse(deleteResource(postData.id));
    if (action === "reorderResources") return jsonResponse(reorderResources(postData.orderedIds || postData.data));

    return jsonResponse({ status: "error", message: "Invalid action" });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

function getAllData() {
  return {
    resources: getResources(),
    reservations: getReservations()
  };
}

function getResources() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESOURCES);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const resources = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    resources.push({
      id: String(row[0]),
      name: String(row[1]),
      location: String(row[2] || ""),
      description: String(row[3] || "")
    });
  }
  return resources;
}

function getReservations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVATIONS);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const reservations = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;

    let startTime = row[3];
    let endTime = row[4];
    let createdAt = row[7];
    let updatedAt = row[9] || row[7];

    if (startTime instanceof Date) startTime = startTime.toISOString();
    if (endTime instanceof Date) endTime = endTime.toISOString();
    if (createdAt instanceof Date) createdAt = createdAt.toISOString();
    if (updatedAt instanceof Date) updatedAt = updatedAt.toISOString();

    reservations.push({
      id: String(row[0]),
      resourceId: String(row[1]),
      resourceName: String(row[2]),
      startTime: String(startTime),
      endTime: String(endTime),
      userName: String(row[5]),
      notes: String(row[6] || ""),
      createdAt: String(createdAt || ""),
      color: String(row[8] || "#2563eb"),
      updatedAt: String(updatedAt || createdAt || ""),
      googleEventId: String(row[10] || ""),
      calendarId: String(row[11] || "")
    });
  }
  return reservations;
}

/**
 * Google カレンダー同期ヘルパー
 */
function getTargetCalendar(calendarId) {
  if (!calendarId) return null;
  try {
    if (calendarId === 'primary') return CalendarApp.getDefaultCalendar();
    const cal = CalendarApp.getCalendarById(calendarId);
    if (cal) return cal;
    return null;
  } catch (err) {
    Logger.log("Calendar fetch error: " + err.toString());
    return null;
  }
}

function syncGoogleCalendarEvent(data, calendarId) {
  const targetCalId = calendarId || data.calendarId;
  if (!targetCalId || data.syncCalendar === false) return "";

  try {
    const cal = getTargetCalendar(targetCalId);
    if (!cal) return "";

    const title = `[予約] ${data.resourceName || '機器・部屋'} (${data.userName})`;
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    const description = `使用者名: ${data.userName}\n機器・部屋: ${data.resourceName}\n備考: ${data.notes || 'なし'}`;

    const event = cal.createEvent(title, startTime, endTime, { description });
    return event ? event.getId() : "";
  } catch (err) {
    Logger.log("Google Calendar Creation error: " + err.toString());
    return "";
  }
}

function updateGoogleCalendarEvent(googleEventId, data, calendarId) {
  const calId = calendarId || data.calendarId;
  if (!calId || data.syncCalendar === false) {
    if (googleEventId) deleteGoogleCalendarEvent(googleEventId, calId);
    return "";
  }

  if (!googleEventId) {
    return syncGoogleCalendarEvent(data, calId);
  }

  try {
    const cal = getTargetCalendar(calId);
    if (!cal) return googleEventId;

    let event = null;
    try {
      event = cal.getEventById(googleEventId);
    } catch (e) {
      Logger.log("Event lookup failed: " + e.toString());
    }

    if (!event) {
      return syncGoogleCalendarEvent(data, calId);
    }

    const title = `[予約] ${data.resourceName || '機器・部屋'} (${data.userName})`;
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    const description = `使用者名: ${data.userName}\n機器・部屋: ${data.resourceName}\n備考: ${data.notes || 'なし'}`;

    event.setTitle(title);
    event.setTime(startTime, endTime);
    event.setDescription(description);

    return googleEventId;
  } catch (err) {
    Logger.log("Google Calendar Update error: " + err.toString());
    return googleEventId;
  }
}

function deleteGoogleCalendarEvent(googleEventId, calendarId) {
  if (!googleEventId) return;
  try {
    const cal = getTargetCalendar(calendarId);
    if (!cal) return;
    const event = cal.getEventById(googleEventId);
    if (event) event.deleteEvent();
  } catch (err) {
    Logger.log("Google Calendar Delete error: " + err.toString());
  }
}

function addReservation(data) {
  if (!data.resourceId || !data.startTime || !data.endTime || !data.userName) {
    return { status: "error", message: "必須項目が不足しています。" };
  }

  const newStart = new Date(data.startTime);
  const newEnd = new Date(data.endTime);
  if (newStart >= newEnd) return { status: "error", message: "終了時間は開始時間より後の時刻を指定してください。" };

  const existingReservations = getReservations();
  const isConflict = existingReservations.some(r => {
    if (r.resourceId !== data.resourceId) return false;
    const rStart = new Date(r.startTime);
    const rEnd = new Date(r.endTime);
    return (newStart < rEnd && newEnd > rStart);
  });

  if (isConflict) return { status: "error", message: "指定された時間帯には既に他の予約が入っています。" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const revSheet = ss.getSheetByName(SHEET_RESERVATIONS);
  const newId = "rev-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
  const nowISO = new Date().toISOString();

  const googleEventId = syncGoogleCalendarEvent(data, data.calendarId);

  revSheet.appendRow([
    newId,
    data.resourceId,
    data.resourceName || "",
    data.startTime,
    data.endTime,
    data.userName,
    data.notes || "",
    nowISO,
    data.color || "#2563eb",
    nowISO,
    googleEventId,
    data.calendarId || ""
  ]);

  return { status: "success", message: "予約が完了しました。" };
}

function editReservation(data) {
  if (!data.id || !data.resourceId || !data.startTime || !data.endTime || !data.userName) {
    return { status: "error", message: "必須項目が不足しています。" };
  }

  const newStart = new Date(data.startTime);
  const newEnd = new Date(data.endTime);
  if (newStart >= newEnd) return { status: "error", message: "終了時間は開始時間より後の時刻を指定してください。" };

  const existingReservations = getReservations();
  const isConflict = existingReservations.some(r => {
    if (String(r.id) === String(data.id)) return false;
    if (r.resourceId !== data.resourceId) return false;
    const rStart = new Date(r.startTime);
    const rEnd = new Date(r.endTime);
    return (newStart < rEnd && newEnd > rStart);
  });

  if (isConflict) return { status: "error", message: "指定された時間帯には既に他の予約が入っています。" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVATIONS);
  const rows = sheet.getDataRange().getValues();
  const nowISO = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      const existingGEventId = String(rows[i][10] || "");
      const existingCalendarId = String(rows[i][11] || "");
      const targetCalendarId = data.calendarId || existingCalendarId;
      const newGEventId = updateGoogleCalendarEvent(existingGEventId, data, targetCalendarId);

      sheet.getRange(i + 1, 2).setValue(data.resourceId);
      sheet.getRange(i + 1, 3).setValue(data.resourceName || "");
      sheet.getRange(i + 1, 4).setValue(data.startTime);
      sheet.getRange(i + 1, 5).setValue(data.endTime);
      sheet.getRange(i + 1, 6).setValue(data.userName);
      sheet.getRange(i + 1, 7).setValue(data.notes || "");
      sheet.getRange(i + 1, 9).setValue(data.color || "#2563eb");
      sheet.getRange(i + 1, 10).setValue(nowISO);
      sheet.getRange(i + 1, 11).setValue(newGEventId);
      sheet.getRange(i + 1, 12).setValue(targetCalendarId || "");
      return { status: "success", message: "予約内容を更新しました。" };
    }
  }

  return { status: "error", message: "対象の予約が見つかりませんでした。" };
}

function deleteReservation(id, calendarId) {
  if (!id) return { status: "error", message: "予約IDが指定されていません。" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESERVATIONS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      const googleEventId = String(rows[i][10] || "");
      const storedCalendarId = String(rows[i][11] || "");
      const targetCalendarId = calendarId || storedCalendarId;
      if (googleEventId) {
        deleteGoogleCalendarEvent(googleEventId, targetCalendarId);
      }
      sheet.deleteRow(i + 1);
      return { status: "success", message: "予約を削除しました。" };
    }
  }

  return { status: "error", message: "対象の予約が見つかりませんでした。" };
}

function addResource(data) {
  if (!data.name) return { status: "error", message: "機器・部屋名は必須です。" };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESOURCES);
  const newId = "res-" + new Date().getTime();

  sheet.appendRow([
    newId,
    data.name,
    data.location || "",
    data.description || ""
  ]);

  return { status: "success", message: "新しい機器・部屋を追加しました。" };
}

function editResource(data) {
  if (!data.id || !data.name) return { status: "error", message: "IDと機器・部屋名は必須です。" };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESOURCES);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.getRange(i + 1, 2).setValue(data.name);
      sheet.getRange(i + 1, 3).setValue(data.location || "");
      sheet.getRange(i + 1, 4).setValue(data.description || "");
      return { status: "success", message: "機器・部屋情報を更新しました。" };
    }
  }

  return { status: "error", message: "対象のリソースが見つかりませんでした。" };
}

function deleteResource(id) {
  if (!id) return { status: "error", message: "リソースIDが指定されていません。" };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resSheet = ss.getSheetByName(SHEET_RESOURCES);
  const rows = resSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      resSheet.deleteRow(i + 1);
      return { status: "success", message: "機器・部屋を削除しました。" };
    }
  }

  return { status: "error", message: "対象のリソースが見つかりませんでした。" };
}

function reorderResources(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { status: "error", message: "IDの配列が指定されていません。" };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resSheet = ss.getSheetByName(SHEET_RESOURCES);
  if (!resSheet) return { status: "error", message: "Resourcesシートが見つかりません。" };

  const rows = resSheet.getDataRange().getValues();
  if (rows.length <= 1) return { status: "success", message: "順序を更新しました。" };

  const resourceMap = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[0]) resourceMap[String(row[0])] = row;
  }

  const newRows = [];
  orderedIds.forEach(id => {
    if (resourceMap[String(id)]) {
      newRows.push(resourceMap[String(id)]);
      delete resourceMap[String(id)];
    }
  });

  Object.values(resourceMap).forEach(row => {
    newRows.push(row);
  });

  if (rows.length > 1) {
    resSheet.getRange(2, 1, rows.length - 1, 4).clearContent();
  }

  if (newRows.length > 0) {
    resSheet.getRange(2, 1, newRows.length, 4).setValues(newRows);
  }

  return { status: "success", message: "機器・部屋の表示順を更新しました。" };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
