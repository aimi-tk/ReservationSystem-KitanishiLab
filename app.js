/**
 * Kitanishi Lab 共通機器・部屋予約システム フロントエンド (app.js)
 */

// 20色のカラーパレット定義 (紺色・深緑・ワインレッド・ダークグレーを含む)
const PRESET_COLORS = [
  "#2563eb", // Blue
  "#1e3a8a", // Navy (紺色)
  "#0284c7", // Sky Blue
  "#06b6d4", // Cyan
  "#14b8a6", // Teal
  "#10b981", // Emerald
  "#14532d", // Dark Green (深緑)
  "#84cc16", // Lime
  "#eab308", // Yellow
  "#f59e0b", // Amber
  "#f97316", // Orange
  "#ef4444", // Red
  "#831843", // Wine Red (ワインレッド)
  "#f43f5e", // Rose
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#6366f1", // Indigo
  "#78350f", // Brown
  "#475569", // Slate
  "#18181b"  // Charcoal (ダークグレー)
];

// アプリケーション設定 (デプロイ済みGAS URL・カレンダーIDの既定値。事前埋め込みでスマホ側入力不要)
const DEFAULT_GAS_URL = window.DEFAULT_GAS_URL || "https://calendar.google.com/calendar/embed?src=c_a43e9815af71f5b415dc86345a06e218de8d686f8667ec06c9d740b74bbbe451%40group.calendar.google.com&ctz=Asia%2FTokyo";
const DEFAULT_CALENDAR_ID = window.DEFAULT_CALENDAR_ID || "";

// アプリケーション状態
let state = {
  gasUrl: localStorage.getItem('kitanishi_gas_url') || DEFAULT_GAS_URL,
  calendarId: localStorage.getItem('kitanishi_gas_calendar_id') || DEFAULT_CALENDAR_ID,
  isLiveMode: false,
  currentDate: new Date(),
  currentView: 'timeline', // 'timeline', 'monthly', 'list', 'resourceMgmt'
  currentMonth: new Date(),
  selectedMonthlyResourceId: '',
  resources: [],
  reservations: []
};

// 初期サンプルデータ
const DEFAULT_RESOURCES = [
  { id: "res-1", name: "共焦点顕微鏡 (Confocal Laser)", location: "201号室", description: "蛍光観察・画像解析用" },
  { id: "res-2", name: "微量高速遠心機 (Centrifuge)", location: "202号室", description: "最大15,000 rpm" },
  { id: "res-3", name: "リアルタイムPCR (qPCR System)", location: "203号室", description: "96ウェルプレート対応" },
  { id: "res-4", name: "次世代シーケンサー (NGS)", location: "203号室", description: "事前講習受講者のみ" },
  { id: "res-5", name: "セミナー室 (Seminar Room)", location: "301号室", description: "プロジェクター・マイク完備" },
  { id: "res-6", name: "実験室 A (Lab Room A)", location: "2階", description: "クリーンベンチ2台" }
];

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  updateDateDisplay();
  initColorPicker();
  populateTimeSelects();
  initModalTouchEvents();

  const calInput = document.getElementById('gasCalendarIdInput');
  if (calInput) calInput.value = state.calendarId;
  
  if (state.gasUrl) {
    document.getElementById('gasUrlInput').value = state.gasUrl;
    refreshData();
  } else {
    loadLocalDemoData();
  }

  resetReservationFormTimes();
}

function initModalTouchEvents() {
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('touchmove', (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
      }
    }, { passive: false });
  });
}

/**
 * 15分刻み限定のドロップダウンオプション生成 (00:00 〜 23:45)
 */
function populateTimeSelects() {
  const startSelect = document.getElementById('resStartTime');
  const endSelect = document.getElementById('resEndTime');

  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      const opt1 = document.createElement('option');
      opt1.value = timeStr;
      opt1.textContent = timeStr;
      startSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = timeStr;
      opt2.textContent = timeStr;
      endSelect.appendChild(opt2);
    }
  }

  const optEnd = document.createElement('option');
  optEnd.value = '23:59';
  optEnd.textContent = '23:59 (日跨ぎ前)';
  endSelect.appendChild(optEnd);
}

function initColorPicker() {
  const container = document.getElementById('colorPickerGrid');
  if (!container) return;
  container.innerHTML = '';

  PRESET_COLORS.forEach((color, idx) => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch ${idx === 0 ? 'selected' : ''}`;
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;
    swatch.title = `カラー ${idx + 1}`;
    if (idx === 0) swatch.innerHTML = '<i class="fa-solid fa-check"></i>';
    swatch.onclick = () => selectColor(color);
    container.appendChild(swatch);
  });
}

function selectColor(color) {
  document.getElementById('resColor').value = color;
  const swatches = document.querySelectorAll('#colorPickerGrid .color-swatch');
  swatches.forEach(s => {
    const isSelected = s.dataset.color === color;
    s.classList.toggle('selected', isSelected);
    s.innerHTML = isSelected ? '<i class="fa-solid fa-check"></i>' : '';
  });
}

function loadLocalDemoData() {
  state.isLiveMode = false;
  updateStatusBadge();

  const storedRes = localStorage.getItem('kitanishi_local_resources');
  state.resources = storedRes ? JSON.parse(storedRes) : DEFAULT_RESOURCES;

  const storedRev = localStorage.getItem('kitanishi_local_reservations');
  if (storedRev) {
    state.reservations = JSON.parse(storedRev);
  } else {
    const todayStr = formatDateISO(state.currentDate);
    const nowISO = new Date().toISOString();

    state.reservations = [
      {
        id: "rev-demo-1",
        resourceId: "res-1",
        resourceName: "共焦点顕微鏡 (Confocal Laser)",
        startTime: `${todayStr}T09:30:00`,
        endTime: `${todayStr}T11:30:00`,
        userName: "北西 太郎",
        notes: "神経細胞の蛍光抗体染色サンプル観察",
        color: "#2563eb",
        createdAt: nowISO,
        updatedAt: nowISO
      },
      {
        id: "rev-demo-2",
        resourceId: "res-3",
        resourceName: "リアルタイムPCR (qPCR System)",
        startTime: `${todayStr}T13:00:00`,
        endTime: `${todayStr}T15:00:00`,
        userName: "山下 花子",
        notes: "遺伝子発現解析 (96well)",
        color: "#10b981",
        createdAt: nowISO,
        updatedAt: nowISO
      },
      {
        id: "rev-demo-3",
        resourceId: "res-5",
        resourceName: "セミナー室 (Seminar Room)",
        startTime: `${todayStr}T16:00:00`,
        endTime: `${todayStr}T17:30:00`,
        userName: "進捗報告ミーティング",
        notes: "研究室全体ゼミ",
        color: "#8b5cf6",
        createdAt: nowISO,
        updatedAt: nowISO
      }
    ];
    saveLocalReservations();
  }

  renderAll();
}

async function refreshData() {
  if (!state.gasUrl) {
    loadLocalDemoData();
    return;
  }

  try {
    updateStatusText("データ取得中...", false);
    const res = await fetch(`${state.gasUrl}?action=getData`);
    const data = await res.json();

    if (data.status === "success") {
      state.isLiveMode = true;
      state.resources = data.resources.length > 0 ? data.resources : DEFAULT_RESOURCES;
      state.reservations = data.reservations || [];
      updateStatusBadge();
      renderAll();
    } else {
      throw new Error(data.message || "取得エラー");
    }
  } catch (err) {
    console.error("GAS Fetch error:", err);
    alert(`Google Driveからのデータ取得に失敗しました。\nデモモードに切り替えます。\nエラー: ${err.message}`);
    loadLocalDemoData();
  }
}

function renderAll() {
  renderModalResourceOptions();
  renderViews();
}

function updateStatusBadge() {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');

  if (state.isLiveMode) {
    badge.className = 'status-badge live';
    text.textContent = 'Google Drive 連携中';
  } else {
    badge.className = 'status-badge demo';
    text.textContent = 'デモモード (ローカル)';
  }
}

function updateStatusText(msg) {
  document.getElementById('statusText').textContent = msg;
}

function changeDate(days) {
  state.currentDate.setDate(state.currentDate.getDate() + days);
  updateDateDisplay();
  renderViews();
}

function setDateToToday() {
  state.currentDate = new Date();
  updateDateDisplay();
  renderViews();
}

function onDatePickerChange(value) {
  if (value) {
    state.currentDate = new Date(value);
    updateDateDisplay();
    renderViews();
  }
}

function updateDateDisplay() {
  const yyyy = state.currentDate.getFullYear();
  const mm = state.currentDate.getMonth() + 1;
  const dd = state.currentDate.getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = dayNames[state.currentDate.getDay()];

  document.getElementById('currentDateDisplay').textContent = `${yyyy}年${mm}月${dd}日(${dayOfWeek})`;
  
  const isoStr = formatDateISO(state.currentDate);
  document.getElementById('datePicker').value = isoStr;
}

function switchView(viewName) {
  state.currentView = viewName;
  const tabTimeline = document.getElementById('tabTimeline');
  if (tabTimeline) tabTimeline.classList.toggle('active', viewName === 'timeline');
  const tabMonthly = document.getElementById('tabMonthly');
  if (tabMonthly) tabMonthly.classList.toggle('active', viewName === 'monthly');
  const tabList = document.getElementById('tabList');
  if (tabList) tabList.classList.toggle('active', viewName === 'list');
  const tabResourceMgmt = document.getElementById('tabResourceMgmt');
  if (tabResourceMgmt) tabResourceMgmt.classList.toggle('active', viewName === 'resourceMgmt');

  const timelineView = document.getElementById('timelineView');
  if (timelineView) timelineView.style.display = viewName === 'timeline' ? 'flex' : 'none';
  const monthlyView = document.getElementById('monthlyView');
  if (monthlyView) monthlyView.style.display = viewName === 'monthly' ? 'block' : 'none';
  const listView = document.getElementById('listView');
  if (listView) listView.style.display = viewName === 'list' ? 'block' : 'none';
  const resourceMgmtView = document.getElementById('resourceMgmtView');
  if (resourceMgmtView) resourceMgmtView.style.display = viewName === 'resourceMgmt' ? 'block' : 'none';

  renderViews();
}

function renderViews() {
  if (state.currentView === 'timeline') {
    renderTimelineView();
  } else if (state.currentView === 'monthly') {
    renderMonthlyView();
  } else if (state.currentView === 'list') {
    renderListView();
  } else if (state.currentView === 'resourceMgmt') {
    renderResourceMgmtView();
  }
}

function changeMonth(delta) {
  state.currentMonth.setMonth(state.currentMonth.getMonth() + delta);
  renderMonthlyView();
}

function setMonthToCurrent() {
  state.currentMonth = new Date();
  renderMonthlyView();
}

function onMonthlyResourceChange(resId) {
  state.selectedMonthlyResourceId = resId;
  renderMonthlyView();
}

function populateMonthlyResourceOptions() {
  const select = document.getElementById('monthlyResourceSelect');
  if (!select) return;

  const currentVal = (select.value !== undefined && select.value !== null) ? select.value : state.selectedMonthlyResourceId;
  select.innerHTML = '';

  const optDefault = document.createElement('option');
  optDefault.value = '';
  optDefault.textContent = '-- 機器・部屋を選択してください --';
  select.appendChild(optDefault);

  state.resources.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name}${r.location ? ' (' + r.location + ')' : ''}`;
    select.appendChild(opt);
  });

  if (Array.from(select.options).some(o => o.value === currentVal)) {
    select.value = currentVal;
  } else {
    select.value = '';
  }
  state.selectedMonthlyResourceId = select.value;
}

function renderMonthlyView() {
  populateMonthlyResourceOptions();

  const yyyy = state.currentMonth.getFullYear();
  const mm = state.currentMonth.getMonth(); // 0-11

  const monthDisplay = document.getElementById('currentMonthDisplay');
  if (monthDisplay) {
    monthDisplay.textContent = `${yyyy}年${mm + 1}月`;
  }

  const wrapper = document.getElementById('monthlyTimelineWrapper');
  if (!wrapper) return;
  wrapper.innerHTML = '';

  if (!state.selectedMonthlyResourceId) {
    wrapper.innerHTML = `
      <div class="empty-state-card" style="padding: 3.5rem 1.5rem; text-align: center; color: var(--text-muted); background: white; border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
        <i class="fa-solid fa-hand-pointer" style="font-size: 2.5rem; color: var(--primary-color); margin-bottom: 0.85rem;"></i>
        <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.4rem;">機器・部屋を選択してください</h3>
        <p style="font-size: 0.875rem;">右上部のプルダウンメニューから予約状況を確認・入力したい機器・部屋を選択すると、1ヶ月分のタイムラインが表示されます。</p>
      </div>
    `;
    return;
  }

  const is24h = document.getElementById('toggle24h').checked;
  const startHour = is24h ? 0 : 8;
  const endHour = is24h ? 24 : 22;
  const totalHours = endHour - startHour;

  const daysInMonth = new Date(yyyy, mm + 1, 0).getDate();
  const todayStr = formatDateISO(new Date());

  const targetRes = state.resources.find(r => r.id === state.selectedMonthlyResourceId);
  const resName = targetRes ? targetRes.name : '';

  wrapper.innerHTML = `
    <div class="timeline-card">
      <div class="timeline-header">
        <div class="timeline-resource-col" style="font-weight: 700;">日付 (${escapeHtml(resName)})</div>
        <div id="monthlyHoursHeader" class="timeline-hours-header"></div>
      </div>
      <div id="monthlyRowsContainer"></div>
    </div>
  `;

  const hoursHeader = document.getElementById('monthlyHoursHeader');
  for (let h = startHour; h < endHour; h++) {
    const cell = document.createElement('div');
    cell.className = 'timeline-hour-cell';
    
    const label = document.createElement('span');
    label.className = 'timeline-hour-label';
    label.textContent = `${String(h).padStart(2, '0')}:00`;
    cell.appendChild(label);

    if (h === endHour - 1) {
      const endLabel = document.createElement('span');
      endLabel.className = 'timeline-hour-label end-label';
      endLabel.textContent = `${String(endHour).padStart(2, '0')}:00`;
      cell.appendChild(endLabel);
    }

    hoursHeader.appendChild(cell);
  }

  const container = document.getElementById('monthlyRowsContainer');
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(yyyy, mm, d);
    const dateStr = formatDateISO(dateObj);
    const dayOfWeek = dateObj.getDay();
    const dayName = dayNames[dayOfWeek];
    const isToday = (dateStr === todayStr);

    const row = document.createElement('div');
    row.className = 'timeline-row';
    if (isToday) row.style.backgroundColor = '#eff6ff';

    const infoCol = document.createElement('div');
    infoCol.className = 'timeline-resource-info';
    infoCol.style.padding = '0.35rem 0.65rem';

    let dayBadgeStyle = '';
    if (dayOfWeek === 0) dayBadgeStyle = 'color: #ef4444; font-weight: 700;';
    else if (dayOfWeek === 6) dayBadgeStyle = 'color: #2563eb; font-weight: 700;';

    let todayBadge = isToday ? '<span style="background: var(--primary-color); color: white; border-radius: 9999px; padding: 0.05rem 0.35rem; font-size: 0.65rem; margin-left: 0.35rem;">今日</span>' : '';

    infoCol.innerHTML = `
      <div class="timeline-resource-name" style="font-size: 0.825rem;">
        <strong style="${dayBadgeStyle}">${mm + 1}/${d} (${dayName})</strong>${todayBadge}
      </div>
    `;
    row.appendChild(infoCol);

    const gridArea = document.createElement('div');
    gridArea.className = 'timeline-grid';
    gridArea.dataset.resourceId = state.selectedMonthlyResourceId;

    for (let h = startHour; h < endHour; h++) {
      const gridCell = document.createElement('div');
      gridCell.className = 'timeline-grid-cell';
      gridArea.appendChild(gridCell);
    }

    setupGridDragSelection(gridArea, state.selectedMonthlyResourceId, dateStr, startHour, endHour);

    const dayRevs = state.reservations.filter(r => {
      if (r.resourceId !== state.selectedMonthlyResourceId) return false;
      const rStartISO = r.startTime.split('T')[0];
      const rEndISO = r.endTime.split('T')[0];
      return (rStartISO === dateStr || rEndISO === dateStr || (rStartISO < dateStr && rEndISO > dateStr));
    });

    dayRevs.forEach(rev => {
      const sDate = new Date(rev.startTime);
      const eDate = new Date(rev.endTime);

      const dayStart = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:00:00`);
      const dayEnd = new Date(`${dateStr}T${String(endHour).padStart(2, '0')}:00:00`);

      if (eDate <= dayStart || sDate >= dayEnd) return;

      const effectiveStart = sDate < dayStart ? dayStart : sDate;
      const effectiveEnd = eDate > dayEnd ? dayEnd : eDate;

      const startOffsetMinutes = (effectiveStart - dayStart) / (1000 * 60);
      const durationMinutes = (effectiveEnd - effectiveStart) / (1000 * 60);

      const leftPercent = (startOffsetMinutes / (totalHours * 60)) * 100;
      const widthPercent = (durationMinutes / (totalHours * 60)) * 100;

      const sTimeStr = formatTimeHHMM(sDate);
      const eTimeStr = formatTimeHHMM(eDate);

      const revColor = rev.color || '#2563eb';
      const updatedDisplay = formatDateTimeFull(rev.updatedAt || rev.createdAt);
      const notesPart = rev.notes ? ` - ${escapeHtml(rev.notes)}` : '';

      const block = document.createElement('div');
      block.className = 'reservation-block';
      block.style.left = `${leftPercent}%`;
      block.style.width = `${widthPercent}%`;
      block.style.backgroundColor = revColor;
      block.title = `使用者: ${rev.userName}\n時間: ${sTimeStr} ~ ${eTimeStr}\n備考: ${rev.notes || 'なし'}\n最終編集: ${updatedDisplay}\n(ドラッグで移動 / クリックで編集)`;

      block.innerHTML = `
        <span class="reservation-block-text">
          <i class="fa-solid fa-user"></i> <strong>${escapeHtml(rev.userName)}</strong> (${sTimeStr}-${eTimeStr})${notesPart}
        </span>
        <button class="reservation-del-btn" onclick="event.stopPropagation(); deleteReservation('${rev.id}')" title="削除">&times;</button>
      `;

      setupBlockDragAndDrop(block, rev, dateStr, startHour, endHour);

      gridArea.appendChild(block);
    });

    row.appendChild(gridArea);
    container.appendChild(row);
  }
}

function openReservationModalWithResourceAndDate(resId, dateStr) {
  openReservationModal();
  if (resId) {
    document.getElementById('resSelect').value = resId;
  }
  if (dateStr) {
    document.getElementById('resStartDate').value = dateStr;
    document.getElementById('resEndDate').value = dateStr;
  }
}

function renderTimelineView() {
  const is24h = document.getElementById('toggle24h').checked;
  const startHour = is24h ? 0 : 8;
  const endHour = is24h ? 24 : 22;
  const totalHours = endHour - startHour;

  const hoursHeader = document.getElementById('timelineHoursHeader');
  hoursHeader.innerHTML = '';
  for (let h = startHour; h < endHour; h++) {
    const cell = document.createElement('div');
    cell.className = 'timeline-hour-cell';
    
    const label = document.createElement('span');
    label.className = 'timeline-hour-label';
    label.textContent = `${String(h).padStart(2, '0')}:00`;
    cell.appendChild(label);

    if (h === endHour - 1) {
      const endLabel = document.createElement('span');
      endLabel.className = 'timeline-hour-label end-label';
      endLabel.textContent = `${String(endHour).padStart(2, '0')}:00`;
      cell.appendChild(endLabel);
    }

    hoursHeader.appendChild(cell);
  }

  const container = document.getElementById('timelineRowsContainer');
  container.innerHTML = '';

  const targetDayStr = formatDateISO(state.currentDate);

  state.resources.forEach(res => {
    const row = document.createElement('div');
    row.className = 'timeline-row';

    const infoCol = document.createElement('div');
    infoCol.className = 'timeline-resource-info';
    const locText = res.location ? ` (${escapeHtml(res.location)})` : '';
    infoCol.innerHTML = `
      <div class="timeline-resource-name" title="${escapeHtml(res.name)}${locText}">
        ${escapeHtml(res.name)}<span class="timeline-resource-location">${locText}</span>
      </div>
    `;
    row.appendChild(infoCol);

    const gridArea = document.createElement('div');
    gridArea.className = 'timeline-grid';
    gridArea.dataset.resourceId = res.id;

    for (let h = startHour; h < endHour; h++) {
      const gridCell = document.createElement('div');
      gridCell.className = 'timeline-grid-cell';
      gridArea.appendChild(gridCell);
    }

    setupGridDragSelection(gridArea, res.id, targetDayStr, startHour, endHour);

    const resRevs = state.reservations.filter(r => {
      if (r.resourceId !== res.id) return false;
      const rStartISO = r.startTime.split('T')[0];
      const rEndISO = r.endTime.split('T')[0];
      return (rStartISO === targetDayStr || rEndISO === targetDayStr);
    });

    resRevs.forEach(rev => {
      const sDate = new Date(rev.startTime);
      const eDate = new Date(rev.endTime);

      const dayStart = new Date(`${targetDayStr}T${String(startHour).padStart(2, '0')}:00:00`);
      const dayEnd = new Date(`${targetDayStr}T${String(endHour).padStart(2, '0')}:00:00`);

      if (eDate <= dayStart || sDate >= dayEnd) return;

      const effectiveStart = sDate < dayStart ? dayStart : sDate;
      const effectiveEnd = eDate > dayEnd ? dayEnd : eDate;

      const startOffsetMinutes = (effectiveStart - dayStart) / (1000 * 60);
      const durationMinutes = (effectiveEnd - effectiveStart) / (1000 * 60);

      const leftPercent = (startOffsetMinutes / (totalHours * 60)) * 100;
      const widthPercent = (durationMinutes / (totalHours * 60)) * 100;

      const sTimeStr = formatTimeHHMM(sDate);
      const eTimeStr = formatTimeHHMM(eDate);

      const revColor = rev.color || '#2563eb';
      const updatedDisplay = formatDateTimeFull(rev.updatedAt || rev.createdAt);
      const notesPart = rev.notes ? ` - ${escapeHtml(rev.notes)}` : '';

      const block = document.createElement('div');
      block.className = 'reservation-block';
      block.style.left = `${leftPercent}%`;
      block.style.width = `${widthPercent}%`;
      block.style.backgroundColor = revColor;
      block.title = `使用者: ${rev.userName}\n時間: ${sTimeStr} ~ ${eTimeStr}\n備考: ${rev.notes || 'なし'}\n最終編集: ${updatedDisplay}\n(ドラッグで移動 / クリックで編集)`;

      block.innerHTML = `
        <span class="reservation-block-text">
          <i class="fa-solid fa-user"></i> <strong>${escapeHtml(rev.userName)}</strong> (${sTimeStr}-${eTimeStr})${notesPart}
        </span>
        <button class="reservation-del-btn" onclick="event.stopPropagation(); deleteReservation('${rev.id}')" title="削除">&times;</button>
      `;

      setupBlockDragAndDrop(block, rev, targetDayStr, startHour, endHour);

      gridArea.appendChild(block);
    });

    row.appendChild(gridArea);
    container.appendChild(row);
  });
}

function setupGridDragSelection(gridArea, resourceId, targetDayStr, startHour, endHour) {
  const totalIntervals = (endHour - startHour) * 4;

  gridArea.onmousedown = (e) => {
    if (e.target.closest('.reservation-block')) return;

    e.preventDefault();
    const rect = gridArea.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const intervalWidth = rect.width / totalIntervals;

    let startIndex = Math.floor(startX / intervalWidth);
    startIndex = Math.max(0, Math.min(totalIntervals - 1, startIndex));

    let overlay = document.createElement('div');
    overlay.className = 'selection-drag-overlay';
    gridArea.appendChild(overlay);

    let finalStartStr = '';
    let finalEndStr = '';

    function updateSelection(currentClientX) {
      const currentX = currentClientX - rect.left;
      let currentIndex = Math.round(currentX / intervalWidth);
      currentIndex = Math.max(0, Math.min(totalIntervals, currentIndex));

      let i1 = Math.min(startIndex, currentIndex);
      let i2 = Math.max(startIndex, currentIndex);

      if (i1 === i2) {
        i2 = i1 + 1;
      }

      i1 = Math.max(0, Math.min(totalIntervals - 1, i1));
      i2 = Math.max(i1 + 1, Math.min(totalIntervals, i2));

      const leftPercent = (i1 / totalIntervals) * 100;
      const widthPercent = ((i2 - i1) / totalIntervals) * 100;

      overlay.style.left = `${leftPercent}%`;
      overlay.style.width = `${widthPercent}%`;

      const startTotalMin = startHour * 60 + i1 * 15;
      const endTotalMin = startHour * 60 + i2 * 15;

      const sH = Math.floor(startTotalMin / 60);
      const sM = startTotalMin % 60;
      const eH = Math.floor(endTotalMin / 60);
      const eM = endTotalMin % 60;

      finalStartStr = `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;
      finalEndStr = (eH === 24 && eM === 0) ? '23:59' : `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;

      const durMin = (i2 - i1) * 15;
      const durText = durMin >= 60 ? `${(durMin / 60).toFixed(durMin % 60 === 0 ? 0 : 1)}時間` : `${durMin}分`;

      overlay.textContent = `${finalStartStr} 〜 ${finalEndStr} (${durText})`;
    }

    updateSelection(e.clientX);

    function onMouseMove(moveEvent) {
      updateSelection(moveEvent.clientX);
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }

      openReservationModalWithTimeRange(resourceId, targetDayStr, finalStartStr, finalEndStr);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
}

function setupBlockDragAndDrop(block, rev, targetDayStr, startHour, endHour) {
  const totalHours = endHour - startHour;
  const totalIntervals = totalHours * 4;
  const sDate = new Date(rev.startTime);
  const eDate = new Date(rev.endTime);
  const durationMs = eDate.getTime() - sDate.getTime();
  const durationMin = Math.max(15, Math.round(durationMs / (1000 * 60)));

  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let previewOverlay = null;

  block.onmousedown = (e) => {
    if (e.target.closest('.reservation-del-btn')) return;

    e.stopPropagation();
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;

    function onMouseMove(moveEvent) {
      const dx = Math.abs(moveEvent.clientX - startX);
      const dy = Math.abs(moveEvent.clientY - startY);

      if (!isDragging && (dx > 4 || dy > 4)) {
        isDragging = true;
        block.classList.add('dragging');
        previewOverlay = document.createElement('div');
        previewOverlay.className = 'selection-drag-overlay';
        previewOverlay.style.borderStyle = 'solid';
        previewOverlay.style.backgroundColor = 'rgba(16, 185, 129, 0.35)';
        previewOverlay.style.borderColor = '#10b981';
      }

      if (isDragging) {
        moveEvent.preventDefault();
        const elemBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const gridBelow = elemBelow ? elemBelow.closest('.timeline-grid') : null;

        if (gridBelow) {
          if (previewOverlay.parentNode !== gridBelow) {
            if (previewOverlay.parentNode) previewOverlay.parentNode.removeChild(previewOverlay);
            gridBelow.appendChild(previewOverlay);
          }

          const rect = gridBelow.getBoundingClientRect();
          const xInGrid = moveEvent.clientX - rect.left;
          const intervalWidth = rect.width / totalIntervals;
          let targetIndex = Math.floor(xInGrid / intervalWidth);
          targetIndex = Math.max(0, Math.min(totalIntervals - 1, targetIndex));

          const startTotalMin = startHour * 60 + targetIndex * 15;
          const endTotalMin = startTotalMin + durationMin;

          const sH = Math.floor(startTotalMin / 60);
          const sM = startTotalMin % 60;
          let eH = Math.floor(endTotalMin / 60);
          let eM = endTotalMin % 60;

          let displayEndStr = '';
          if (eH > 24 || (eH === 24 && eM > 0)) {
            displayEndStr = '23:59';
          } else {
            displayEndStr = (eH === 24 && eM === 0) ? '23:59' : `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;
          }

          const sTimeStr = `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;

          const leftPercent = (targetIndex / totalIntervals) * 100;
          const widthPercent = (Math.min(endTotalMin - startTotalMin, (24 * 60) - startTotalMin) / (totalHours * 60)) * 100;

          previewOverlay.style.left = `${leftPercent}%`;
          previewOverlay.style.width = `${widthPercent}%`;
          previewOverlay.textContent = `${sTimeStr} 〜 ${displayEndStr}`;

          previewOverlay.dataset.targetStart = sTimeStr;
          previewOverlay.dataset.targetEnd = displayEndStr;
          previewOverlay.dataset.targetResourceId = gridBelow.dataset.resourceId;
        }
      }
    }

    async function onMouseUp(upEvent) {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (block) block.classList.remove('dragging');

      const targetResId = previewOverlay ? previewOverlay.dataset.targetResourceId : null;
      const targetStartStr = previewOverlay ? previewOverlay.dataset.targetStart : null;
      const targetEndStr = previewOverlay ? previewOverlay.dataset.targetEnd : null;

      if (previewOverlay && previewOverlay.parentNode) {
        previewOverlay.parentNode.removeChild(previewOverlay);
        previewOverlay = null;
      }

      if (!isDragging) {
        editReservationModal(rev.id);
        return;
      }

      if (targetResId && targetStartStr && targetEndStr) {
        const startISO = `${targetDayStr}T${targetStartStr}:00`;
        const endISO = (targetEndStr === '23:59') ? `${targetDayStr}T23:59:00` : `${targetDayStr}T${targetEndStr}:00`;

        const startDt = new Date(startISO);
        const endDt = new Date(endISO);

        const conflict = state.reservations.find(r => {
          if (String(r.id) === String(rev.id)) return false;
          if (r.resourceId !== targetResId) return false;
          const rStart = new Date(r.startTime);
          const rEnd = new Date(r.endTime);
          return (startDt < rEnd && endDt > rStart);
        });

        if (conflict) {
          alert(`指定された移動先の時間帯には、既に「${conflict.userName}」さんの予約が入っているため移動できません。`);
          renderAll();
          return;
        }

        const resObj = state.resources.find(r => r.id === targetResId);
        const nowISO = new Date().toISOString();

        const updatedRev = {
          ...rev,
          resourceId: targetResId,
          resourceName: resObj ? resObj.name : rev.resourceName,
          startTime: startISO,
          endTime: endISO,
          updatedAt: nowISO
        };

        if (state.isLiveMode && state.gasUrl) {
          try {
            updateStatusText("移動を保存中...", false);
            const res = await fetch(state.gasUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'editReservation', data: updatedRev })
            });
            const result = await res.json();
            if (result.status === 'success') {
              refreshData();
            } else {
              alert(result.message || '移動の保存に失敗しました。');
              renderAll();
            }
          } catch (err) {
            alert(`移動処理中にエラーが発生しました: ${err.message}`);
            renderAll();
          }
        } else {
          const idx = state.reservations.findIndex(r => r.id === rev.id);
          if (idx !== -1) {
            state.reservations[idx] = updatedRev;
            saveLocalReservations();
          }
          renderAll();
        }
      } else {
        renderAll();
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
}

function renderListView() {
  const tbody = document.getElementById('listTableBody');
  tbody.innerHTML = '';

  const searchKeyword = document.getElementById('listSearchInput').value.toLowerCase();
  const sorted = [...state.reservations].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const filtered = sorted.filter(r => {
    if (!searchKeyword) return true;
    return (
      (r.userName && r.userName.toLowerCase().includes(searchKeyword)) ||
      (r.resourceName && r.resourceName.toLowerCase().includes(searchKeyword)) ||
      (r.notes && r.notes.toLowerCase().includes(searchKeyword))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">該当する予約はありません</td></tr>`;
    return;
  }

  filtered.forEach(r => {
    const sDate = new Date(r.startTime);
    const eDate = new Date(r.endTime);
    const timeStr = `${formatDateFull(sDate)} ${formatTimeHHMM(sDate)} 〜 ${formatTimeHHMM(eDate)}`;
    const revColor = r.color || '#2563eb';
    const updatedDisplay = formatDateTimeFull(r.updatedAt || r.createdAt);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="color-swatch" style="background-color: ${revColor}; display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: middle;"></span>
        <strong>${escapeHtml(r.resourceName || getResourceName(r.resourceId))}</strong>
      </td>
      <td><i class="fa-solid fa-user"></i> ${escapeHtml(r.userName)}</td>
      <td>${timeStr}</td>
      <td>${escapeHtml(r.notes || '-')}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${updatedDisplay}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="editReservationModal('${r.id}')" style="margin-right: 4px;">
          <i class="fa-solid fa-pen-to-square"></i> 編集
        </button>
        <button class="btn btn-secondary btn-sm" style="color: var(--danger-color);" onclick="deleteReservation('${r.id}')">
          <i class="fa-solid fa-trash-can"></i> 削除
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderResourceMgmtView() {
  const tbody = document.getElementById('resourceTableBody');
  tbody.innerHTML = '';

  if (state.resources.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">登録されている機器・部屋はありません</td></tr>`;
    return;
  }

  const total = state.resources.length;

  state.resources.forEach((res, index) => {
    const isFirst = index === 0;
    const isLast = index === total - 1;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: center; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="moveResourceOrder('${res.id}', -1)" ${isFirst ? 'disabled' : ''} title="上へ移動" style="padding: 0.2rem 0.45rem; margin-right: 2px;">
          <i class="fa-solid fa-arrow-up"></i>
        </button>
        <button class="btn btn-secondary btn-sm" onclick="moveResourceOrder('${res.id}', 1)" ${isLast ? 'disabled' : ''} title="下へ移動" style="padding: 0.2rem 0.45rem;">
          <i class="fa-solid fa-arrow-down"></i>
        </button>
      </td>
      <td><strong>${escapeHtml(res.name)}</strong></td>
      <td><i class="fa-solid fa-location-dot"></i> ${escapeHtml(res.location || '-')}</td>
      <td>${escapeHtml(res.description || '-')}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="editResourceModal('${res.id}')" style="margin-right: 4px;">
          <i class="fa-solid fa-pen-to-square"></i> 編集
        </button>
        <button class="btn btn-secondary btn-sm" style="color: var(--danger-color);" onclick="deleteResourceModal('${res.id}')">
          <i class="fa-solid fa-trash-can"></i> 削除
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function getResourceName(resId) {
  const r = state.resources.find(item => item.id === resId);
  return r ? r.name : resId;
}

function toggleCalendarIdInput() {
  const syncCheck = document.getElementById('syncCalendarCheck');
  const row = document.getElementById('calendarIdRow');
  if (row) {
    row.style.display = (syncCheck && syncCheck.checked) ? 'flex' : 'none';
  }
}

function populateAutocompleteDatalists() {
  const nameList = document.getElementById('userNameList');

  if (nameList) {
    nameList.innerHTML = '';
    const uniqueNames = [...new Set(state.reservations.map(r => r.userName).filter(Boolean))];
    uniqueNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      nameList.appendChild(opt);
    });
  }

  const currentUserName = document.getElementById('userName') ? document.getElementById('userName').value : '';
  updatePerUserDatalists(currentUserName);
}

function updatePerUserDatalists(targetUserName) {
  const emailList = document.getElementById('userEmailList');
  const notesList = document.getElementById('resNotesList');

  const trimmedName = (targetUserName || '').trim().toLowerCase();

  // 過去予約データの中から、入力された「使用者名」に一致する予約のみを抽出
  const userReservations = trimmedName 
    ? state.reservations.filter(r => (r.userName || '').trim().toLowerCase() === trimmedName)
    : [];

  if (emailList) {
    emailList.innerHTML = '';
    const uniqueEmails = [...new Set(userReservations.map(r => r.calendarId).filter(Boolean))];
    uniqueEmails.forEach(email => {
      const opt = document.createElement('option');
      opt.value = email;
      emailList.appendChild(opt);
    });
  }

  if (notesList) {
    notesList.innerHTML = '';
    const uniqueNotes = [...new Set(userReservations.map(r => r.notes).filter(Boolean))];
    uniqueNotes.forEach(note => {
      const opt = document.createElement('option');
      opt.value = note;
      notesList.appendChild(opt);
    });
  }
}

function openReservationModal() {
  document.getElementById('editRevId').value = '';
  document.getElementById('reservationModalTitle').textContent = '新規予約登録';
  document.getElementById('saveRevBtn').textContent = '予約を確定する';
  document.getElementById('deleteRevModalBtn').style.display = 'none';
  document.getElementById('resMetaInfo').style.display = 'none';
  document.getElementById('modalError').style.display = 'none';
  document.getElementById('reservationForm').reset();

  const syncCheck = document.getElementById('syncCalendarCheck');
  if (syncCheck) syncCheck.checked = true;

  const calInput = document.getElementById('resCalendarId');
  if (calInput) calInput.value = state.calendarId || '';
  toggleCalendarIdInput();

  populateAutocompleteDatalists();
  selectColor(PRESET_COLORS[0]);
  resetReservationFormTimes();
  openModal('reservationModal');
}

function openReservationModalForResource(resId) {
  openReservationModal();
  document.getElementById('resSelect').value = resId;
}

function openReservationModalWithTime(resId, dateStr, hour) {
  openReservationModal();
  document.getElementById('resSelect').value = resId;
  document.getElementById('resStartDate').value = dateStr;
  document.getElementById('resEndDate').value = dateStr;
  
  const hStr = String(hour).padStart(2, '0');
  const hEndStr = String(hour + 1).padStart(2, '0');
  
  setSelectValue('resStartTime', `${hStr}:00`);
  setSelectValue('resEndTime', `${hEndStr}:00`);
}

function openReservationModalWithTimeRange(resId, dateStr, startTimeStr, endTimeStr) {
  openReservationModal();
  document.getElementById('resSelect').value = resId;
  document.getElementById('resStartDate').value = dateStr;
  setSelectValue('resStartTime', snapTimeToQuarterHHMM(startTimeStr));
  document.getElementById('resEndDate').value = dateStr;
  setSelectValue('resEndTime', snapTimeToQuarterHHMM(endTimeStr));
}

function editReservationModal(revId) {
  const rev = state.reservations.find(r => r.id === revId);
  if (!rev) return;

  populateAutocompleteDatalists();

  document.getElementById('editRevId').value = rev.id;
  document.getElementById('reservationModalTitle').textContent = '予約の編集・確認';
  document.getElementById('saveRevBtn').textContent = '変更を保存する';
  document.getElementById('deleteRevModalBtn').style.display = 'inline-flex';
  document.getElementById('modalError').style.display = 'none';

  const updatedStr = formatDateTimeFull(rev.updatedAt || rev.createdAt);
  document.getElementById('resUpdatedAtDisplay').textContent = updatedStr;
  document.getElementById('resMetaInfo').style.display = 'block';

  document.getElementById('resSelect').value = rev.resourceId;
  
  const sDate = new Date(rev.startTime);
  const eDate = new Date(rev.endTime);

  document.getElementById('resStartDate').value = formatDateISO(sDate);
  setSelectValue('resStartTime', snapTimeToQuarterHHMM(formatTimeHHMM(sDate)));
  document.getElementById('resEndDate').value = formatDateISO(eDate);
  setSelectValue('resEndTime', snapTimeToQuarterHHMM(formatTimeHHMM(eDate)));

  document.getElementById('userName').value = rev.userName || '';
  document.getElementById('resNotes').value = rev.notes || '';
  
  const syncCheck = document.getElementById('syncCalendarCheck');
  if (syncCheck) {
    syncCheck.checked = (rev.syncCalendar !== false);
  }

  const calInput = document.getElementById('resCalendarId');
  if (calInput) {
    calInput.value = rev.calendarId || '';
  }
  toggleCalendarIdInput();

  selectColor(rev.color || PRESET_COLORS[0]);

  openModal('reservationModal');
}

function closeReservationModal() {
  closeModal('reservationModal');
}

function renderModalResourceOptions() {
  const select = document.getElementById('resSelect');
  select.innerHTML = '';

  state.resources.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name} (${r.location})`;
    select.appendChild(opt);
  });
}

function resetReservationFormTimes() {
  const todayStr = formatDateISO(state.currentDate);
  document.getElementById('resStartDate').value = todayStr;
  document.getElementById('resEndDate').value = todayStr;

  const now = new Date();
  const minutes = now.getMinutes();
  const roundedMin = Math.ceil(minutes / 15) * 15;
  now.setMinutes(roundedMin);
  now.setSeconds(0);

  const startStr = snapTimeToQuarterHHMM(formatTimeHHMM(now));
  const endObj = new Date(now.getTime() + 60 * 60 * 1000);
  const endStr = snapTimeToQuarterHHMM(formatTimeHHMM(endObj));

  setSelectValue('resStartTime', startStr);
  setSelectValue('resEndTime', endStr);
}

function addDuration(minutes) {
  const startDateStr = document.getElementById('resStartDate').value;
  const startTimeStr = document.getElementById('resStartTime').value;
  if (!startDateStr || !startTimeStr) return;

  const start = new Date(`${startDateStr}T${startTimeStr}:00`);
  if (isNaN(start.getTime())) return;

  const end = new Date(start.getTime() + minutes * 60 * 1000);

  document.getElementById('resEndDate').value = formatDateISO(end);
  const endStr = snapTimeToQuarterHHMM(formatTimeHHMM(end));
  setSelectValue('resEndTime', endStr);
}

function setSelectValue(elementId, value) {
  const select = document.getElementById(elementId);
  if (!select) return;

  let exists = Array.from(select.options).some(opt => opt.value === value);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  select.value = value;
}

function snapTimeToQuarterHHMM(hhmmStr) {
  if (!hhmmStr) return '00:00';
  const parts = hhmmStr.split(':');
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  if (isNaN(h)) h = 0;
  if (isNaN(m)) m = 0;

  const roundedMin = Math.round(m / 15) * 15;
  if (roundedMin === 60) {
    h = (h + 1) % 24;
    m = 0;
  } else {
    m = roundedMin;
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function handleReservationSubmit(event) {
  event.preventDefault();
  const errorBanner = document.getElementById('modalError');
  errorBanner.style.display = 'none';

  const editRevId = document.getElementById('editRevId').value;
  const isEdit = Boolean(editRevId);

  const resourceId = document.getElementById('resSelect').value;
  const startDate = document.getElementById('resStartDate').value;
  let startTime = document.getElementById('resStartTime').value;
  const endDate = document.getElementById('resEndDate').value;
  let endTime = document.getElementById('resEndTime').value;
  const userName = document.getElementById('userName').value.trim();
  const notes = document.getElementById('resNotes').value.trim();
  const color = document.getElementById('resColor').value;

  startTime = snapTimeToQuarterHHMM(startTime);
  endTime = snapTimeToQuarterHHMM(endTime);

  const startISO = `${startDate}T${startTime}:00`;
  const endISO = `${endDate}T${endTime}:00`;

  const startDt = new Date(startISO);
  const endDt = new Date(endISO);

  if (startDt >= endDt) {
    showModalError("終了日時は開始日時より後の時間を指定してください。");
    return;
  }

  const conflict = state.reservations.find(r => {
    if (isEdit && String(r.id) === String(editRevId)) return false;
    if (r.resourceId !== resourceId) return false;
    const rStart = new Date(r.startTime);
    const rEnd = new Date(r.endTime);
    return (startDt < rEnd && endDt > rStart);
  });

  if (conflict) {
    showModalError(`指定された時間帯には既に「${escapeHtml(conflict.userName)}」さんの予約が入っています。`);
    return;
  }

  const resObj = state.resources.find(r => r.id === resourceId);
  const nowISO = new Date().toISOString();
  const syncCheckVal = document.getElementById('syncCalendarCheck') ? document.getElementById('syncCalendarCheck').checked : true;
  const calInput = document.getElementById('resCalendarId');
  const userEnteredCalId = (calInput && calInput.value.trim()) ? calInput.value.trim() : '';

  // カレンダーIDが入力されており、かつ同期チェックがONの場合のみGoogleカレンダーに同期
  const isSyncOn = Boolean(userEnteredCalId && syncCheckVal);

  const revData = {
    resourceId,
    resourceName: resObj ? resObj.name : '',
    startTime: startISO,
    endTime: endISO,
    userName,
    notes,
    color,
    syncCalendar: isSyncOn,
    calendarId: isSyncOn ? userEnteredCalId : '',
    updatedAt: nowISO
  };

  if (isEdit) {
    revData.id = editRevId;
    const existing = state.reservations.find(r => r.id === editRevId);
    if (existing) revData.createdAt = existing.createdAt || nowISO;
  } else {
    revData.createdAt = nowISO;
  }

  const btn = document.getElementById('saveRevBtn');
  btn.disabled = true;
  btn.textContent = isEdit ? '更新中...' : '保存中...';

  const action = isEdit ? 'editReservation' : 'addReservation';

  if (state.isLiveMode && state.gasUrl) {
    try {
      const res = await fetch(state.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, data: revData })
      });
      const result = await res.json();
      if (result.status === 'success') {
        closeReservationModal();
        refreshData();
      } else {
        showModalError(result.message || '処理エラーが発生しました。');
      }
    } catch (err) {
      showModalError(`通信エラーが発生しました: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = isEdit ? '変更を保存する' : '予約を確定する';
    }
  } else {
    if (isEdit) {
      const idx = state.reservations.findIndex(r => r.id === editRevId);
      if (idx !== -1) {
        state.reservations[idx] = { ...state.reservations[idx], ...revData };
      }
    } else {
      revData.id = 'rev-local-' + Date.now();
      state.reservations.push(revData);
    }
    saveLocalReservations();
    closeReservationModal();
    renderAll();
    btn.disabled = false;
    btn.textContent = isEdit ? '変更を保存する' : '予約を確定する';
  }
}

function showModalError(msg) {
  const banner = document.getElementById('modalError');
  banner.textContent = msg;
  banner.style.display = 'block';
}

function handleModalDeleteReservation() {
  const editRevId = document.getElementById('editRevId').value;
  if (!editRevId) return;
  deleteReservation(editRevId);
  closeReservationModal();
}

async function deleteReservation(revId) {
  if (!confirm('この予約を削除してもよろしいですか？')) return;

  const targetRev = state.reservations.find(r => r.id === revId);
  const targetCalId = (targetRev && targetRev.calendarId) ? targetRev.calendarId : (state.calendarId || 'primary');

  if (state.isLiveMode && state.gasUrl) {
    try {
      updateStatusText("削除中...", false);
      const res = await fetch(state.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteReservation',
          id: revId,
          calendarId: targetCalId
        })
      });
      const result = await res.json();
      if (result.status === 'success') {
        refreshData();
      } else {
        alert(result.message || '削除に失敗しました。');
      }
    } catch (err) {
      alert(`削除処理中にエラーが発生しました: ${err.message}`);
    }
  } else {
    state.reservations = state.reservations.filter(r => r.id !== revId);
    saveLocalReservations();
    renderAll();
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
  }
  const remainingOpen = document.querySelector('.modal-backdrop.open');
  if (!remainingOpen) {
    document.body.classList.remove('modal-open');
  }
}

function openResourceModal() {
  document.getElementById('editResId').value = '';
  document.getElementById('resourceModalTitle').textContent = '機器・部屋の追加';
  document.getElementById('saveResBtn').textContent = '登録する';
  document.getElementById('resourceForm').reset();
  openModal('resourceModal');
}

function editResourceModal(resId) {
  const res = state.resources.find(r => r.id === resId);
  if (!res) return;

  document.getElementById('editResId').value = res.id;
  document.getElementById('resourceModalTitle').textContent = '機器・部屋の編集';
  document.getElementById('saveResBtn').textContent = '更新する';
  
  document.getElementById('newResName').value = res.name;
  document.getElementById('newResLocation').value = res.location || '';
  document.getElementById('newResDesc').value = res.description || '';

  openModal('resourceModal');
}

function closeResourceModal() {
  closeModal('resourceModal');
}

async function handleResourceSubmit(event) {
  event.preventDefault();
  const editId = document.getElementById('editResId').value;
  const name = document.getElementById('newResName').value.trim();
  const location = document.getElementById('newResLocation').value.trim();
  const description = document.getElementById('newResDesc').value.trim();

  const resData = { name, location, description };
  if (editId) resData.id = editId;

  const isEdit = Boolean(editId);
  const action = isEdit ? 'editResource' : 'addResource';

  if (state.isLiveMode && state.gasUrl) {
    try {
      const res = await fetch(state.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, data: resData })
      });
      const result = await res.json();
      if (result.status === 'success') {
        closeResourceModal();
        refreshData();
      } else {
        alert(result.message || '操作に失敗しました。');
      }
    } catch (err) {
      alert(`通信エラー: ${err.message}`);
    }
  } else {
    if (isEdit) {
      const idx = state.resources.findIndex(r => r.id === editId);
      if (idx !== -1) state.resources[idx] = { ...state.resources[idx], ...resData };
    } else {
      resData.id = 'res-local-' + Date.now();
      state.resources.push(resData);
    }
    saveLocalResources();
    closeResourceModal();
    renderAll();
  }
}

async function deleteResourceModal(resId) {
  const res = state.resources.find(r => r.id === resId);
  if (!res) return;

  const revCount = state.reservations.filter(r => r.resourceId === resId).length;
  let msg = `「${res.name}」を削除してもよろしいですか？`;
  if (revCount > 0) {
    msg += `\n※現在この機器・部屋には ${revCount} 件の予約が存在します。`;
  }

  if (!confirm(msg)) return;

  if (state.isLiveMode && state.gasUrl) {
    try {
      updateStatusText("削除中...", false);
      const response = await fetch(state.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deleteResource', id: resId })
      });
      const result = await response.json();
      if (result.status === 'success') {
        refreshData();
      } else {
        alert(result.message || '削除に失敗しました。');
      }
    } catch (err) {
      alert(`通信エラー: ${err.message}`);
    }
  } else {
    state.resources = state.resources.filter(r => r.id !== resId);
    saveLocalResources();
    renderAll();
  }
}

async function moveResourceOrder(resId, direction) {
  const index = state.resources.findIndex(r => r.id === resId);
  if (index === -1) return;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.resources.length) return;

  const temp = state.resources[index];
  state.resources[index] = state.resources[targetIndex];
  state.resources[targetIndex] = temp;

  renderAll();

  const orderedIds = state.resources.map(r => r.id);

  if (state.isLiveMode && state.gasUrl) {
    try {
      updateStatusText("順序を保存中...", false);
      const res = await fetch(state.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'reorderResources', orderedIds })
      });
      const result = await res.json();
      if (result.status === 'success') {
        updateStatusBadge();
      } else {
        alert(result.message || '順序の更新に失敗しました。');
        refreshData();
      }
    } catch (err) {
      alert(`順序の更新中にエラーが発生しました: ${err.message}`);
      refreshData();
    }
  } else {
    saveLocalResources();
  }
}

function openConfigModal() {
  const urlInput = document.getElementById('gasUrlInput');
  if (urlInput) urlInput.value = state.gasUrl || DEFAULT_GAS_URL;

  const calInput = document.getElementById('gasCalendarIdInput');
  if (calInput) calInput.value = state.calendarId || DEFAULT_CALENDAR_ID;

  openModal('configModal');
}

function closeConfigModal() {
  closeModal('configModal');
}

function saveGasConfig() {
  const url = document.getElementById('gasUrlInput').value.trim();
  const calIdInput = document.getElementById('gasCalendarIdInput');
  const calId = calIdInput ? calIdInput.value.trim() : '';

  if (!url) {
    alert('URLを入力してください。');
    return;
  }
  state.gasUrl = url;
  state.calendarId = calId;
  localStorage.setItem('kitanishi_gas_url', url);
  localStorage.setItem('kitanishi_gas_calendar_id', calId);
  closeConfigModal();
  refreshData();
}

function switchToDemoMode() {
  state.gasUrl = '';
  localStorage.removeItem('kitanishi_gas_url');
  document.getElementById('gasUrlInput').value = '';
  closeConfigModal();
  loadLocalDemoData();
}

function saveLocalReservations() {
  localStorage.setItem('kitanishi_local_reservations', JSON.stringify(state.reservations));
}

function saveLocalResources() {
  localStorage.setItem('kitanishi_local_resources', JSON.stringify(state.resources));
}

function formatDateISO(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateFull(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = dateObj.getMonth() + 1;
  const dd = dateObj.getDate();
  return `${yyyy}/${mm}/${dd}`;
}

function formatTimeHHMM(dateObj) {
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDateTimeFull(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
