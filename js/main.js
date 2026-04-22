// 主应用入口文件
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_CONFIG, APP_CONFIG } from './config.js?v=2';
import { Auth } from './auth.js?v=2';
import { Timer } from './timer.js?v=5';
import { TaskManager } from './tasks.js?v=2';
import { Heatmap } from './heatmap.js?v=2';

// 初始化 Supabase
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// 初始化模块
const auth = new Auth(supabase);
const timer = new Timer(supabase, auth);
const taskManager = new TaskManager(supabase, auth);
const heatmap = new Heatmap(supabase, auth);

// 应用状态
let appReady = false;
let selectedTaskDate = null;
let currentRankType = "daily";
let dailyGoal = 240;
let reviewDirty = false;
let reviewSaveTimer = null;
let reviewSaveDate = null;
let reviewSaving = false;
let timerCompletionInProgress = false;
let currentTodayMinutes = 0;
let undoTimer = null;
let pendingTaskDelete = null; // { taskId }
let lastLinkedTaskId = null;

// DOM 元素选择器
const $ = (id) => document.getElementById(id);

// 工具函数
const loadJSON = (k, f) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : f;
  } catch {
    return f;
  }
};

const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let msgToastTimer = null;
const showMessage = (m, type = "") => {
  if (!m) { console.warn("[showMessage] 空消息被拦截", new Error().stack); return; }
  const el = document.getElementById("msgToast");
  if (!el) return;
  if (msgToastTimer) clearTimeout(msgToastTimer);
  el.textContent = m;
  el.className = "msg-toast" + (type ? ` ${type}` : "");
  el.classList.add("show");
  msgToastTimer = setTimeout(() => {
    el.classList.remove("show");
    msgToastTimer = null;
  }, 3000);
};
const esc = (s) => String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");

const formatMinutes = (min) => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const getDisplayName = () => {
  const profileName = auth.getProfile()?.username?.trim();
  if (profileName) return profileName;

  const currentUser = auth.getCurrentUser();
  const metadataName = currentUser?.user_metadata?.username?.trim();
  if (metadataName) return metadataName;

  const emailName = currentUser?.email?.split("@")[0]?.trim();
  return emailName || "已登录";
};

const getBeijingDate = (utcDate = new Date()) => {
  // UTC+8，无论用户设备时区
  const offset = 8 * 60 * 60 * 1000;
  return new Date(utcDate.getTime() + offset);
};

const getLocalDateISO = (date = new Date()) => {
  const bj = getBeijingDate(date instanceof Function ? date() : date);
  const year  = bj.getUTCFullYear();
  const month = String(bj.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(bj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// DOM 元素引用
const el = {
  userChip: $("userChip"),
  themeBtn: $("themeBtn"),
  fullBtn: $("fullBtn"),
  logoutBtn: $("logoutBtn"),
  appStatus: $("appStatus"),
  authView: $("authView"),
  studyView: $("studyView"),
  loginEmail: $("loginEmail"),
  loginPassword: $("loginPassword"),
  loginBtn: $("loginBtn"),
  signupUsername: $("signupUsername"),
  signupEmail: $("signupEmail"),
  signupPassword: $("signupPassword"),
  signupBtn: $("signupBtn"),
  timer: $("timer"),
  statusText: $("statusText"),
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  resetBtn: $("resetBtn"),
  finishFocusBtn: $("finishFocusBtn"),
  saveManualBtn: $("saveManualBtn"),
  immersiveBtn: $("immersiveBtn"),
  exitImmersiveBtn: $("exitImmersiveBtn"),
  todayMinutes: $("todayMinutes"),
  totalHours: $("totalHours"),
  sessionCount: $("sessionCount"),
  editGoalBtn: $("editGoalBtn"),
  taskDatePicker: $("taskDatePicker"),
  goYesterdayBtn: $("goYesterdayBtn"),
  goTodayBtn: $("goTodayBtn"),
  taskInput: $("taskInput"),
  addTaskBtn: $("addTaskBtn"),
  taskList: $("taskList"),
  taskStatsText: $("taskStatsText"),
  taskTotalTime: $("taskTotalTime"),
  taskTotalText: $("taskTotalText"),
  mobileAddTaskBtn: $("openDrawerBtn"),
  taskDrawer: $("taskDrawer"),
  drawerOverlay: $("drawerOverlay"),
  closeDrawerBtn: $("closeDrawerBtn"),
  drawerTaskInput: $("drawerTaskInput"),
  drawerDurationInput: $("drawerTimeInput"),
  drawerAddBtn: $("drawerAddBtn"),
  dailyRankTab: $("dailyRankTab"),
  totalRankTab: $("totalRankTab"),
  leaderList: $("leaderList"),
  refreshLeaderboardBtn: $("refreshLeaderboardBtn"),
  historyList: $("historyList"),
  refreshHistoryBtn: $("refreshHistoryBtn"),
  checkinArea: $("checkinArea"),
  editUsernameBtn: $("editUsernameBtn"),
  usernameDrawer: $("usernameDrawer"),
  usernameDrawerOverlay: $("usernameDrawerOverlay"),
  closeUsernameDrawerBtn: $("closeUsernameDrawerBtn"),
  usernameInput: $("usernameInput"),
  saveUsernameBtn: $("saveUsernameBtn"),
  breakdownDrawer: $("breakdownDrawer"),
  breakdownDrawerOverlay: $("breakdownDrawerOverlay"),
  closeBreakdownDrawerBtn: $("closeBreakdownDrawerBtn"),
  breakdownTitle: $("breakdownTitle"),
  breakdownSubtitle: $("breakdownSubtitle"),
  breakdownList: $("breakdownList"),
  displayDate: $("displayDate"),
  checkinStatus: $("checkinStatus"),
  streakDays: $("streakDays"),
  checkinBtn: $("checkinBtn"),
  openHeatmapBtn: $("openHeatmapBtn"),
  backToMainBtn: $("backToMainBtn"),
  refreshHeatmapBtn: $("refreshHeatmapBtn"),
  heatmapGrid: $("heatmapGrid"),
  heatmapSubtitle: $("heatmapSubtitle"),
  monthRow: $("monthRow"),
  mainPage: $("mainPage"),
  heatmapPage: $("heatmapPage"),
  heatmapUserChip: $("heatmapUserChip"),
  heatmapTitle: $("heatmapTitle"),
  heatmap30Btn: $("heatmap30Btn"),
  heatmap365Btn: $("heatmap365Btn"),
};

// 初始化
dailyGoal = loadJSON(APP_CONFIG.GOAL_KEY, APP_CONFIG.DEFAULT_DAILY_GOAL);

console.log("自习室应用已加载");

// UI 更新函数
function updateProgress(today) {
  const validGoal = dailyGoal > 0 ? dailyGoal : 240;
  const percent = (today / validGoal) * 100;
  const display = Math.min(100, percent);
  document.getElementById("progressBar").style.width = display + "%";
  document.getElementById("progressText").innerHTML = 
    `${Math.floor(percent)}% <span style="font-size:12px;color:var(--muted);font-weight:normal;margin-left:4px;">/ ${formatMinutes(validGoal)}</span>`;
}

function updateTimer() {
  el.timer.textContent = timer.getDisplayTime();
}

function updateAuthUI() {
  const currentUser = auth.getCurrentUser();
  if (currentUser) {
    const displayName = getDisplayName();
    el.userChip.textContent = displayName;
    if (el.heatmapUserChip) el.heatmapUserChip.textContent = displayName;
    el.authView.classList.add("hidden");
    el.studyView.classList.remove("hidden");
    el.logoutBtn.classList.remove("hidden");
    el.editUsernameBtn?.classList.remove("hidden");
    el.checkinArea.classList.remove("hidden");
    loadSubjectStats("today");
  } else {
    el.userChip.textContent = "未登录";
    if (el.heatmapUserChip) el.heatmapUserChip.textContent = "未登录";
    el.authView.classList.remove("hidden");
    el.studyView.classList.add("hidden");
    el.logoutBtn.classList.add("hidden");
    el.editUsernameBtn?.classList.add("hidden");
    el.checkinArea.classList.add("hidden");
    renderTasks();
    heatmap.clear();
    if (el.heatmapGrid) el.heatmapGrid.innerHTML = "";
    if (el.monthRow) el.monthRow.innerHTML = "";
    if (el.heatmapSubtitle) {
      el.heatmapSubtitle.textContent = "颜色越深，代表当天专注时间越长";
    }
    showMainPage();
  }
}

function setAppStatus(text, type = "") {
  if (!el.appStatus) return;
  el.appStatus.textContent = text || "";
  el.appStatus.classList.remove("error", "ok");
  if (type) el.appStatus.classList.add(type);
  if (!text) el.appStatus.classList.add("hidden");
  else el.appStatus.classList.remove("hidden");
}

function setButtonLoading(button, loadingText, isLoading) {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  if (isLoading) {
    button.textContent = loadingText;
    button.disabled = true;
    button.classList.add("loading");
  } else {
    button.textContent = button.dataset.originalText;
    button.disabled = false;
    button.classList.remove("loading");
  }
}

function setInteractiveState(enabled) {
  const ids = ["loginBtn", "signupBtn", "startBtn", "pauseBtn", "resetBtn", "saveManualBtn", "refreshLeaderboardBtn", "refreshHistoryBtn", "addTaskBtn", "editGoalBtn", "checkinBtn"];
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("disabled", !enabled);
  });
}

function animateNumber(element, target, duration = 600, unit = "") {
  const start = parseInt(element.textContent) || 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (target - start) * eased);
    element.textContent = current + (unit ? " " + unit : "");

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = target + (unit ? " " + unit : "");
    }
  }

  requestAnimationFrame(update);
}

// 页面切换
function showMainPage() {
  el.mainPage.classList.remove("hidden-page");
  el.heatmapPage.classList.add("hidden-page");
  window.scrollTo(0, 0);
}

function showHeatmapPage() {
  el.mainPage.classList.add("hidden-page");
  el.heatmapPage.classList.remove("hidden-page");
  window.scrollTo(0, 0);
}

// Undo Toast
function showUndoToast(minutes) {
  if (undoTimer) {
    clearTimeout(undoTimer);
    hideUndoToast();
  }
  const toast = document.getElementById("undoToast");
  const msg = document.getElementById("undoToastMsg");
  const bar = document.getElementById("undoBar");
  const undoBtn = document.getElementById("undoBtn");

  msg.textContent = `已记录 ${minutes} 分钟`;
  toast.classList.add("show");

  bar.style.animation = "none";
  bar.offsetHeight;
  bar.style.animation = "";

  let cancelled = false;

  undoBtn.onclick = () => {
    cancelled = true;
    clearTimeout(undoTimer);
    hideUndoToast();
  };

  undoTimer = setTimeout(async () => {
    if (!cancelled) await saveStudySession(minutes);
    hideUndoToast();
  }, 5000);
}

function showFocusCompleteToast(minutes) {
  if (undoTimer) {
    clearTimeout(undoTimer);
    hideUndoToast();
  }
  const toast = document.getElementById("undoToast");
  const msg = document.getElementById("undoToastMsg");
  const bar = document.getElementById("undoBar");
  const undoBtn = document.getElementById("undoBtn");

  msg.textContent = `已记录 ${minutes} 分钟专注时间`;
  toast.classList.add("show");

  bar.style.animation = "none";
  bar.offsetHeight;
  bar.style.animation = "";

  let cancelled = false;

  undoBtn.onclick = () => {
    cancelled = true;
    clearTimeout(undoTimer);
    hideUndoToast();
    showMessage("已取消记录");
  };

  undoTimer = setTimeout(async () => {
    if (!cancelled) {
      await saveStudySession(minutes);
    }
    hideUndoToast();
  }, 5000);
}

// 恢复计时状态
async function restoreTimerState() {
  const state = await timer.restoreTimerState();
  if (!state) return;

  // 恢复计时器属性
  timer.selectedDuration = state.duration;
  timer.timerMode = state.timer_mode;
  timer.isFreeMode = state.is_free_mode;
  timer.activeSessionId = state.id;

  // 计算实际经过的时间
  const startedAt = new Date(state.started_at).getTime();
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);

  if (state.is_free_mode) {
    // 专注计时模式：累加已用时间
    timer.elapsedInFreeMode = state.elapsed_in_free_mode + elapsedSeconds;
    timer.remaining = timer.elapsedInFreeMode;
  } else {
    // 倒计时模式：减去已用时间
    timer.remaining = Math.max(0, state.remaining - elapsedSeconds);

    // 如果时间已到，清除状态
    if (timer.remaining <= 0) {
      await timer.clearTimerState();
      return;
    }
  }

  // 更新UI
  updateTimer();

  // 自动开始计时
  timer.startedAt = startedAt;
  const onTick = () => updateTimer();
  const onComplete = async (minutes) => {
    await saveStudySession(minutes);
  };
  await timer.start(onTick, onComplete);

  // 显示恢复提示
  if (state.is_free_mode) {
    el.statusText.textContent = "已恢复专注计时";
    el.finishFocusBtn.style.display = "";
  } else {
    el.statusText.textContent = "已恢复计时";
  }

  showMessage("计时状态已恢复");
}

function hideUndoToast() {
  const toast = document.getElementById("undoToast");
  toast.classList.remove("show");
  undoTimer = null;
}


// 认证功能
async function signup() {
  if (!appReady || auth.isLoading()) return;
  const username = el.signupUsername.value.trim();
  const email = el.signupEmail.value.trim();
  const password = el.signupPassword.value.trim();
  
  setButtonLoading(el.signupBtn, "注册中...", true);
  const result = await auth.signup(username, email, password);
  setButtonLoading(el.signupBtn, "", false);
  
  showMessage(result.message, result.success ? "ok" : "error");
}

async function login() {
  if (!appReady || auth.isLoading()) return;
  const email = el.loginEmail.value.trim();
  const password = el.loginPassword.value.trim();

  setButtonLoading(el.loginBtn, "登录中...", true);
  const result = await auth.login(email, password);
  setButtonLoading(el.loginBtn, "", false);

  if (result.success) {
    updateAuthUI();
  } else {
    showMessage(result.message, "error");
  }
}

async function logout() {
  await auth.logout();
  updateAuthUI();
}

function openUsernameDrawer() {
  const currentUser = auth.getCurrentUser();
  if (!currentUser) return;

  if (el.usernameInput) {
    el.usernameInput.value = getDisplayName();
  }
  el.usernameDrawer?.classList.add("show");
  el.usernameDrawerOverlay?.classList.add("show");
  setTimeout(() => el.usernameInput?.focus(), 50);
}

function closeUsernameDrawer() {
  el.usernameDrawer?.classList.remove("show");
  el.usernameDrawerOverlay?.classList.remove("show");
}

async function saveUsername() {
  const currentUser = auth.getCurrentUser();
  if (!currentUser || auth.isLoading()) return;

  const nextName = el.usernameInput?.value?.trim() || "";
  setButtonLoading(el.saveUsernameBtn, "保存中...", true);
  const result = await auth.updateUsername(nextName);
  setButtonLoading(el.saveUsernameBtn, "", false);
  showMessage(result.message, result.success ? "ok" : "error");

  if (!result.success) return;

  closeUsernameDrawer();
  updateAuthUI();
  await loadLeaderboard();
}

// 学习记录
async function saveStudySession(minutes) {
  const subjectInput = document.getElementById("customSubjectInput");
  const taskLinkSelect = document.getElementById("taskLinkSelect");
  let subject = subjectInput ? subjectInput.value.trim() : "";

  // If no manual subject, fall back to the linked task's name
  const linkedId = (taskLinkSelect && taskLinkSelect.value) || lastLinkedTaskId;
  console.log("[debug] subjectInput:", subject, "| taskLinkSelect.value:", taskLinkSelect?.value, "| lastLinkedTaskId:", lastLinkedTaskId, "| linkedId:", linkedId);
  console.log("[debug] currentTasks:", taskManager.getCurrentTasks().map(t => ({id: t.id, type: typeof t.id, text: t.text})));
  if (!subject && linkedId) {
    // 从数据库查找任务，避免 getCurrentTasks() 按日期过滤导致的任务丢失
    const { data: linkedTask } = await supabase.from("tasks").select("text").eq("id", linkedId).single();
    console.log("[debug] linkedTask found:", linkedTask);
    if (linkedTask) subject = linkedTask.text.slice(0, 20);
  }

  console.log("[debug] final subject:", subject);
  if (!subject) subject = "未分类";

  const result = await timer.saveSession(minutes, subject);
  showMessage(result.message || (result.success ? `已记录 ${minutes} 分钟` : "记录失败"), result.success ? "ok" : "error");

  if (result.success) {
    await loadMyStats();
    await loadHistory();
    await loadLeaderboard();
    await loadWeeklyChart();
    await loadSubjectStats();

    if (!el.heatmapPage.classList.contains("hidden-page")) {
      await renderHeatmap();
    }

    // Feature 3: 自动签到（静默）
    const checkinResult = await auth.checkin(currentTodayMinutes, getLocalDateISO);

    // Feature 4: 关联任务完成提示
    const taskLinkSelect = document.getElementById("taskLinkSelect");
    if (taskLinkSelect && taskLinkSelect.value) {
      const linkedTaskId = taskLinkSelect.value;
      const linkedTaskText = taskLinkSelect.options[taskLinkSelect.selectedIndex]?.text || "该任务";
      const checkinNote = checkinResult.success ? `已签到，连续 ${checkinResult.streak} 天 🔥` : "";
      showTaskLinkPrompt(linkedTaskId, linkedTaskText, checkinNote);
    } else if (checkinResult.success) {
      showMessage(`连续专注 ${checkinResult.streak} 天 🔥`, "ok");
    }
  }
}

function showTaskLinkPrompt(taskId, taskText, checkinNote = "") {
  const existing = document.getElementById("taskLinkPrompt");
  if (existing) existing.remove();

  const isDark = document.body.classList.contains("dark");
  const bgColor = isDark ? "#2a2a2a" : "#ffffff";
  const textColor = isDark ? "#f4efe8" : "#2c2724";
  const mutedColor = isDark ? "#a89f97" : "#7a726c";
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const skipBg = isDark ? "#333" : "#f0ece8";

  const overlay = document.createElement("div");
  overlay.id = "taskLinkPrompt";
  overlay.style.cssText = `position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-end;justify-content:center;`;

  overlay.innerHTML = `
    <div id="_tlpBackdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.35);"></div>
    <div style="position:relative;width:100%;max-width:520px;background:${bgColor};border-radius:20px 20px 0 0;padding:20px 20px 32px;box-shadow:0 -4px 24px rgba(0,0,0,0.18);">
      <div style="width:36px;height:4px;border-radius:2px;background:${borderColor};margin:0 auto 16px;"></div>
      <div style="font-size:14px;font-weight:600;color:${textColor};margin-bottom:6px;">标记任务完成？</div>
      <div style="font-size:13px;color:${mutedColor};margin-bottom:${checkinNote ? '6px' : '20px'};">「${esc(taskText)}」</div>
      ${checkinNote ? `<div style="font-size:12px;color:${mutedColor};margin-bottom:16px;">✅ ${esc(checkinNote)}</div>` : ""}
      <div style="display:flex;gap:10px;">
        <button id="taskLinkSkip" style="flex:1;padding:11px;border-radius:12px;border:none;background:${skipBg};color:${mutedColor};font-size:14px;cursor:pointer;font-weight:500;">跳过</button>
        <button id="taskLinkDone" style="flex:2;padding:11px;border-radius:12px;border:none;background:#b46b5d;color:#fff;font-size:14px;cursor:pointer;font-weight:600;">标记完成</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("_tlpBackdrop").addEventListener("click", close);
  document.getElementById("taskLinkSkip").addEventListener("click", close);
  document.getElementById("taskLinkDone").addEventListener("click", async () => {
    close();
    const res = await taskManager.toggleTaskDone(taskId, true);
    if (res.success) {
      renderTasks();
      showMessage("任务已标记完成", "ok");
    }
  });
  setTimeout(close, 15000);
}

async function loadMyStats() {
  const result = await timer.loadStats(getLocalDateISO);
  if (result.success) {
    currentTodayMinutes = result.today;
    const todayHours = (result.today / 60).toFixed(1);
    el.todayMinutes.textContent = todayHours;
    animateNumber(el.totalHours, Math.round(result.total / 60));
    animateNumber(el.sessionCount, result.sessionCount);
    updateProgress(result.today);
  }
}

// 科目统计
async function loadSubjectStats(range = "today") {
  const result = await timer.loadSubjectStats(range);
  if (result.success) {
    renderSubjectStats(result.subjects);
  }
}

function renderSubjectStats(subjects) {
  const container = document.getElementById("subjectStatsList");
  if (!container) return;

  if (!subjects || subjects.length === 0) {
    container.innerHTML = '<div class="subject-empty">暂无科目数据</div>';
    return;
  }

  container.innerHTML = "";
  subjects.forEach(subject => {
    const item = document.createElement("div");
    item.className = "subject-item";
    item.innerHTML = `
      <div class="subject-name">${esc(subject.name)}</div>
      <div class="subject-bar-container">
        <div class="subject-bar" style="width:0%"></div>
      </div>
      <div class="subject-duration">${formatMinutes(subject.minutes)}</div>
    `;
    container.appendChild(item);

    setTimeout(() => {
      const bar = item.querySelector('.subject-bar');
      bar.style.width = subject.percent + '%';
    }, 50);
  });
}

// 本周条形图
async function loadWeeklyChart() {
  const barChart = document.getElementById("weeklyBarChart");
  const dayLabels = document.getElementById("weeklyDayLabels");
  const summary = document.getElementById("weeklySummary");
  if (!barChart) return;

  const user = auth.getCurrentUser();
  if (!user) {
    barChart.innerHTML = '<div class="muted" style="font-size:12px;">登录后查看本周数据</div>';
    dayLabels.innerHTML = "";
    if (summary) summary.textContent = "";
    return;
  }

  // 本周周一到周日（北京时间）
  const nowBJ = getBeijingDate();
  const dayOfWeek = nowBJ.getUTCDay(); // 0=Sun
  const mondayBJ = new Date(nowBJ.getTime() - ((dayOfWeek + 6) % 7) * 86400000);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayBJ.getTime() + i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }

  // 查询范围：周一 00:00 ~ 周日 23:59:59（北京时间转 UTC）
  const BJOffset = 8 * 3600000;
  const startISO = new Date(new Date(days[0] + "T00:00:00Z").getTime() - BJOffset).toISOString();
  const endISO   = new Date(new Date(days[6] + "T23:59:59Z").getTime() - BJOffset).toISOString();

  try {
    const { data, error } = await supabase
      .from("study_sessions")
      .select("ended_at, duration_minutes")
      .eq("user_id", user.id)
      .gte("ended_at", startISO)
      .lte("ended_at", endISO);

    if (error) throw error;

    const minutesByDay = {};
    days.forEach(d => { minutesByDay[d] = 0; });
    (data || []).forEach(row => {
      if (!row.ended_at) return;
      const bjDate = getBeijingDate(new Date(row.ended_at));
      const dayKey = `${bjDate.getUTCFullYear()}-${String(bjDate.getUTCMonth()+1).padStart(2,"0")}-${String(bjDate.getUTCDate()).padStart(2,"0")}`;
      if (minutesByDay[dayKey] !== undefined) {
        minutesByDay[dayKey] += row.duration_minutes || 0;
      }
    });

    const values = days.map(d => minutesByDay[d]);
    const maxVal = Math.max(...values, 1);
    const totalThisWeek = values.reduce((a, b) => a + b, 0);
    const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
    const todayStr = getLocalDateISO();

    barChart.innerHTML = "";
    dayLabels.innerHTML = "";

    values.forEach((mins, i) => {
      const heightPct = Math.max((mins / maxVal) * 100, mins > 0 ? 8 : 0);
      const isToday = days[i] === todayStr;

      // Wrapper column: value label on top, bar below
      const col = document.createElement("div");
      col.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;`;

      const valLabel = document.createElement("div");
      valLabel.style.cssText = `font-size:10px;color:${isToday ? "var(--accent)" : "var(--muted)"};font-weight:${isToday ? "700" : "400"};margin-bottom:2px;white-space:nowrap;`;
      valLabel.textContent = mins > 0 ? formatMinutes(mins) : "";

      const bar = document.createElement("div");
      bar.style.cssText = `width:100%;border-radius:6px 6px 0 0;background:${isToday ? "var(--accent)" : "rgba(180,107,93,0.22)"};height:${heightPct}%;min-height:${mins > 0 ? "6px" : "2px"};transition:height 0.5s ease;cursor:default;`;
      bar.title = `${DAY_LABELS[i]}：${formatMinutes(mins)}`;

      col.appendChild(valLabel);
      col.appendChild(bar);
      barChart.appendChild(col);

      const label = document.createElement("div");
      label.style.cssText = `flex:1;text-align:center;font-size:11px;color:${isToday ? "var(--accent)" : "var(--text-muted)"};font-weight:${isToday ? "700" : "400"};`;
      label.textContent = DAY_LABELS[i];
      dayLabels.appendChild(label);
    });

    if (summary) {
      const hours = (totalThisWeek / 60).toFixed(1);
      summary.textContent = `本周已专注 ${hours} 小时`;
    }
  } catch (err) {
    console.error("loadWeeklyChart error:", err);
  }
}

// 排行榜
async function loadLeaderboard() {
  setButtonLoading(el.refreshLeaderboardBtn, "刷新中...", true);
  const result = await timer.loadLeaderboard(currentRankType);
  setButtonLoading(el.refreshLeaderboardBtn, "", false);
  
  el.leaderList.innerHTML = "";
  
  if (!result.success || !result.data || !result.data.length) {
    el.leaderList.innerHTML = `<div class="item"><div class="main muted">${currentRankType === "daily" ? "看看哪位小杰泥先上榜～" : "暂时还没有总榜数据。"}</div></div>`;
    return;
  }
  
  const currentUser = auth.getCurrentUser();
  const currentUsername = getDisplayName();
  
  result.data.forEach((row, idx) => {
    const mins = Number(row.total_minutes || 0);
    const isMe = (row.user_id && currentUser && row.user_id === currentUser.id) || (row.username === currentUsername);
    const div = document.createElement("div");
    div.className = "item" + (isMe ? " me" : "");
    div.innerHTML = `<div style="width:34px;text-align:center">${idx === 0 ? '👑' : idx + 1}</div><div class="main"><div>${esc(row.username || "学习者")}${isMe ? '<span style="font-size:12px;color:var(--accent);">（我）</span>' : ""}</div><div class="small muted">${currentRankType === "daily" ? "今日学习时长" : "总学习时长"}：${formatMinutes(mins)}</div></div><button class="btn ghost leaderboard-detail-btn" style="padding:6px 10px;font-size:14px;" title="查看用时组成">✦</button>`;
    div.querySelector(".leaderboard-detail-btn").addEventListener("click", () => {
      openBreakdownDrawer(row, mins);
    });
    el.leaderList.appendChild(div);
  });
}

async function openBreakdownDrawer(row, totalMinutes) {
  if (!row.user_id) {
    showMessage("暂时无法查看该用户的用时组成。", "error");
    return;
  }

  const username = row.username || "学习者";
  const rangeText = currentRankType === "daily" ? "今日" : "累计";

  if (el.breakdownTitle) el.breakdownTitle.textContent = `${username} 的用时组成`;
  if (el.breakdownSubtitle) el.breakdownSubtitle.textContent = `${rangeText}总时长：${formatMinutes(totalMinutes)}`;
  if (el.breakdownList) el.breakdownList.innerHTML = '<div class="subject-empty">加载中...</div>';

  el.breakdownDrawer?.classList.add("show");
  el.breakdownDrawerOverlay?.classList.add("show");

  const result = await timer.loadUserSubjectBreakdown(row.user_id, currentRankType);
  if (!el.breakdownList) return;

  if (!result.success || !result.subjects.length) {
    el.breakdownList.innerHTML = '<div class="subject-empty">暂无可展示的科目组成</div>';
    return;
  }

  el.breakdownList.innerHTML = "";
  result.subjects.forEach(subject => {
    const item = document.createElement("div");
    item.className = "subject-item";
    item.innerHTML = `
      <div class="subject-name">${esc(subject.name)}</div>
      <div class="subject-bar-container">
        <div class="subject-bar" style="width:${subject.percent}%"></div>
      </div>
      <div class="subject-duration">${formatMinutes(subject.minutes)}</div>
    `;
    el.breakdownList.appendChild(item);
  });
}

function closeBreakdownDrawer() {
  el.breakdownDrawer?.classList.remove("show");
  el.breakdownDrawerOverlay?.classList.remove("show");
}

async function completeTimerIfNeeded() {
  if (timerCompletionInProgress || timer.isFreeMode || timer.getRemaining() > 0) return;

  timerCompletionInProgress = true;
  try {
    const minutes = Math.floor(timer.getSelectedDuration() / 60);
    timer.stop();
    updateTimer();
    await saveStudySession(minutes);
    await timer.clearTimerState();
    await timer.reset(true);
    updateTimer();
    el.finishFocusBtn.style.display = "none";
    el.statusText.textContent = "已完成专注";
  } finally {
    timerCompletionInProgress = false;
  }
}

async function syncVisibleTimer() {
  if (!timer.isRunning()) return;
  timer.syncWithClock();
  updateTimer();
  await completeTimerIfNeeded();
}

// 历史记录
async function loadHistory() {
  setButtonLoading(el.refreshHistoryBtn, "刷新中...", true);
  const result = await timer.loadHistory();
  setButtonLoading(el.refreshHistoryBtn, "", false);
  
  el.historyList.innerHTML = "";
  
  if (!result.success || !result.data.length) {
    el.historyList.innerHTML = '<div class="item"><div class="main muted">还没有学习记录。快去完成一次专注吧！</div></div>';
    return;
  }
  
  result.data.forEach(row => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div class="main"><div>${new Date(row.created_at).toLocaleString("zh-CN")}</div><div class="small muted">${formatMinutes(Number(row.duration_minutes || 0))}</div></div>`;
    el.historyList.appendChild(div);
  });
}


// 任务管理
async function loadTasksByDate(dateStr) {
  taskManager.setSelectedDate(dateStr);
  const result = await taskManager.loadTasksByDate(dateStr);
  renderTasks();
}

async function addTask(text, dateStr, durationMinutes, priority) {
  const result = await taskManager.addTask(text, dateStr, durationMinutes, priority);
  if (!result.success) {
    showMessage(result.message);
  } else {
    await loadTasksByDate(dateStr);
  }
}

async function toggleTaskDone(taskId, done) {
  await taskManager.toggleTaskDone(taskId, done);
  await loadTasksByDate(selectedTaskDate);
}

async function deleteTask(taskId) {
  // 如果有上一个待删除，立即执行
  if (pendingTaskDelete) {
    await taskManager.deleteTask(pendingTaskDelete.taskId);
    pendingTaskDelete = null;
  }
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }

  // 乐观移除
  taskManager.removeTaskLocally(taskId);
  renderTasks();

  // 显示 undo toast
  const toast = document.getElementById("undoToast");
  const msg = document.getElementById("undoToastMsg");
  const bar = document.getElementById("undoBar");
  const undoBtn = document.getElementById("undoBtn");

  pendingTaskDelete = { taskId };
  msg.textContent = "已删除任务";
  toast.classList.add("show");
  bar.style.animation = "none";
  bar.offsetHeight;
  bar.style.animation = "";

  undoBtn.onclick = () => {
    clearTimeout(undoTimer);
    undoTimer = null;
    pendingTaskDelete = null;
    hideUndoToast();
    loadTasksByDate(selectedTaskDate);
  };

  undoTimer = setTimeout(async () => {
    if (pendingTaskDelete) {
      await taskManager.deleteTask(pendingTaskDelete.taskId);
      pendingTaskDelete = null;
    }
    hideUndoToast();
  }, 5000);
}

async function toggleSubtasks(taskId, toggleBtn) {
  const container = document.getElementById(`subtasks-${taskId}`);
  if (!container) return;

  if (container.style.display === "none") {
    // 展开：加载并显示子任务
    toggleBtn.textContent = "▼";
    const subtasks = await taskManager.getSubtasks(taskId);
    container.innerHTML = "";
    subtasks.forEach(subtask => {
      renderSubtaskItem(subtask, container);
    });
    container.style.display = "block";
  } else {
    // 折叠
    toggleBtn.textContent = "▶";
    container.style.display = "none";
  }
}

function renderSubtaskItem(subtask, container) {
  const item = document.createElement("div");
  item.className = "item subtask-item" + (subtask.done ? " task-done" : "");

  const durationText = subtask.duration_minutes ? `${subtask.duration_minutes}分钟` : "";

  item.innerHTML = `
    <input type="checkbox" ${subtask.done ? "checked" : ""}>
    <div class="main">
      <div class="task-header">
        <span class="task-text">${esc(subtask.text)}</span>
        <span class="task-time">${durationText}</span>
      </div>
    </div>
    <button class="btn ghost btn-edit-task" title="编辑">✎</button>
    <button class="btn ghost btn-del-task" title="删除">✕</button>
  `;

  const checkbox = item.querySelector("input");
  const editBtn = item.querySelector(".btn-edit-task");
  const delBtn = item.querySelector(".btn-del-task");

  checkbox.addEventListener("change", () => {
    toggleTaskDone(subtask.id, checkbox.checked);
  });

  editBtn.addEventListener("click", () => {
    openEditDrawer(subtask);
  });

  delBtn.addEventListener("click", () => {
    deleteTask(subtask.id);
  });

  container.appendChild(item);
}

function showAddSubtaskDialog(parentId) {
  document.getElementById("subtaskParentId").value = parentId;
  document.getElementById("subtaskInput").value = "";
  document.getElementById("subtaskTimeInput").value = "";
  // 重置优先级为 medium
  document.querySelectorAll("[data-subtask-priority]").forEach(b => {
    b.classList.remove("active-high", "active-medium", "active-low");
  });
  document.querySelector("[data-subtask-priority='medium']").classList.add("active-medium");
  document.getElementById("subtaskDrawer").classList.add("show");
  document.getElementById("subtaskDrawerOverlay").classList.add("show");
}

async function addSubtask(text, dateStr, durationMinutes, priority, parentId) {
  const result = await taskManager.addTask(text, dateStr, durationMinutes, priority, parentId);
  if (!result.success) {
    showMessage(result.message);
  } else {
    await loadMyStats();
    // 如果子任务容器已展开，刷新显示
    const container = document.getElementById(`subtasks-${parentId}`);
    if (container && container.style.display !== "none") {
      const toggleBtn = document.querySelector(`[data-task-id="${parentId}"]`);
      if (toggleBtn) {
        container.style.display = "none";
        toggleBtn.textContent = "▶";
        await toggleSubtasks(parentId, toggleBtn);
      }
    }
  }
}

async function changeTaskDate(days) {
  await autoSaveReview();
  const d = new Date(selectedTaskDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  selectedTaskDate = getLocalDateISO(d);
  el.taskDatePicker.value = selectedTaskDate;
  await loadTasksByDate(selectedTaskDate);
  await loadReview(selectedTaskDate);
}

// 复盘
function setReviewSaveStatus(text) {
  const saveBtn = document.getElementById("saveReviewBtn");
  if (saveBtn) saveBtn.textContent = text;
}

function scheduleReviewAutoSave() {
  reviewDirty = true;
  reviewSaveDate = selectedTaskDate;
  setReviewSaveStatus("正在输入...");
  if (reviewSaveTimer) clearTimeout(reviewSaveTimer);
  reviewSaveTimer = setTimeout(async () => {
    await autoSaveReview(reviewSaveDate);
  }, 700);
}

async function autoSaveReview(date = selectedTaskDate) {
  if (!reviewDirty || reviewSaving) return;
  if (reviewSaveTimer) {
    clearTimeout(reviewSaveTimer);
    reviewSaveTimer = null;
  }
  await saveReview(date);
  reviewDirty = false;
}

async function loadReview(date) {
  const reviewInput  = document.getElementById("reviewInput");
  const dateLabel    = document.getElementById("reviewDateLabel");
  const today        = getLocalDateISO();
  if (!reviewInput) return;

  dateLabel.textContent = date === today ? "今天" : date;
  const user = auth.getCurrentUser();

  if (user) {
    const { data } = await supabase
      .from("daily_reviews")
      .select("content")
      .eq("user_id", user.id)
      .eq("review_date", date)
      .maybeSingle();
    reviewInput.innerHTML = data?.content ?? "";
  } else {
    reviewInput.innerHTML = localStorage.getItem("review_" + date) || "";
  }
  reviewDirty = false;
  setReviewSaveStatus("自动保存");
}

async function saveReview(date) {
  const reviewInput = document.getElementById("reviewInput");
  if (!reviewInput) return;

  const content = reviewInput.innerHTML;
  const user    = auth.getCurrentUser();

  reviewSaving = true;
  setReviewSaveStatus("保存中...");
  try {
    if (user) {
      await supabase.from("daily_reviews").upsert(
        { user_id: user.id, review_date: date, content, updated_at: new Date().toISOString() },
        { onConflict: "user_id,review_date" }
      );
    } else {
      localStorage.setItem("review_" + date, content);
    }

    setReviewSaveStatus("已自动保存");
  } catch (err) {
    console.error("saveReview error:", err);
    setReviewSaveStatus("保存失败");
  } finally {
    reviewSaving = false;
  }
}

function insertReviewChecklist() {
  const reviewInput = document.getElementById("reviewInput");
  if (!reviewInput) return;

  reviewInput.focus();
  document.execCommand(
    "insertHTML",
    false,
    '<div><input type="checkbox"></div>'
  );
  scheduleReviewAutoSave();
}

function openEditDrawer(task) {
  document.getElementById("editTaskId").value = task.id;
  document.getElementById("editTaskInput").value = task.text;
  document.getElementById("editTimeInput").value = task.duration_minutes || "";
  const priority = task.priority || "medium";
  document.querySelectorAll("[data-edit-priority]").forEach(b => {
    b.classList.remove("active-high", "active-medium", "active-low");
  });
  document.querySelector(`[data-edit-priority='${priority}']`).classList.add(`active-${priority}`);
  document.getElementById("editTaskDrawer").classList.add("show");
  document.getElementById("editDrawerOverlay").classList.add("show");
}

function updateTaskLinkSelect() {
  const select = document.getElementById("taskLinkSelect");
  if (!select) return;
  const current = select.value;
  const tasks = taskManager.getCurrentTasks().filter(t => !t.parent_id && !t.done);
  select.innerHTML = '<option value="">不关联</option>';
  tasks.forEach(task => {
    const opt = document.createElement("option");
    opt.value = task.id;
    opt.textContent = task.text.length > 18 ? task.text.slice(0, 18) + "…" : task.text;
    select.appendChild(opt);
  });
  select.value = current;
}

function renderTasks() {
  const tasks = taskManager.getCurrentTasks();
  const stats = taskManager.getTaskStats();

  el.taskList.innerHTML = "";

  const dateObj = new Date(selectedTaskDate + "T00:00:00");
  const displayDate = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;

  if (stats.total === 0) {
    el.taskStatsText.textContent = `${displayDate} 暂无任务`;
    el.taskStatsText.style.color = "var(--muted)";
    el.taskList.innerHTML = '<div class="item"><div class="main muted">这一天还没有任务，添一条试试。</div></div>';
    el.taskTotalTime.style.display = "none";
    return;
  }

  el.taskStatsText.textContent = `${displayDate} · 已完成 ${stats.done} / ${stats.total} 项 (${stats.percentage}%)`;
  if (stats.percentage === 100) {
    el.taskStatsText.textContent = `${displayDate} · 全部完成 🎉`;
    el.taskList.classList.add("celebrate");
    setTimeout(() => el.taskList.classList.remove("celebrate"), 600);
  }
  el.taskStatsText.style.color = stats.percentage === 100 ? "var(--ok)" : "var(--accent)";

  const hours = Math.floor(stats.totalMinutes / 60);
  const mins = stats.totalMinutes % 60;
  let timeText = "今日计划：";
  if (hours > 0) timeText += `${hours}小时`;
  if (mins > 0) timeText += `${mins}分钟`;
  if (stats.totalMinutes === 0) timeText += "0分钟";

  el.taskTotalText.textContent = timeText;
  el.taskTotalTime.style.display = "flex";

  const sortedTasks = taskManager.getSortedTasks();
  const parentTasks = sortedTasks.filter(t => !t.parent_id);

  parentTasks.forEach((task) => {
    renderTaskItem(task, 0);
  });

  updateTaskLinkSelect();
}

function renderTaskItem(task, level = 0) {
  const item = document.createElement("div");
  const priorityClass = task.priority || "medium";
  item.className = "item task-priority-" + priorityClass + (task.done ? " task-done" : "");
  item.style.paddingLeft = `${level * 20 + 12}px`;

  const priorityBadgeClass = `priority-${priorityClass}`;
  const durationText = task.duration_minutes ? `${task.duration_minutes}分钟` : "";

  const hasSubtasks = task.subtask_count > 0;
  const progressPercent = hasSubtasks && task.subtask_count > 0
    ? Math.round((task.completed_subtask_count / task.subtask_count) * 100)
    : 0;

  item.innerHTML = `
    <input type="checkbox" ${task.done ? "checked" : ""}>
    <div class="main">
      <div class="task-header">
        ${hasSubtasks ? `<span class="task-toggle" data-task-id="${task.id}">▶</span>` : ''}
        <span class="priority-badge ${priorityBadgeClass}"></span>
        <span class="task-text">${esc(task.text)}</span>
        <span class="task-time">${durationText}</span>
        ${hasSubtasks ? `<span class="task-progress">${task.completed_subtask_count}/${task.subtask_count}</span>` : ''}
      </div>
      ${hasSubtasks ? `<div class="task-progress-bar"><div class="task-progress-fill" style="width: ${progressPercent}%"></div></div>` : ''}
    </div>
    <button class="btn ghost btn-add-subtask" data-task-id="${task.id}" title="添加子任务">+</button>
    <button class="btn ghost btn-edit-task" title="编辑">✎</button>
    <button class="btn ghost btn-del-task" title="删除">✕</button>
  `;

  const checkbox = item.querySelector("input");
  const addSubtaskBtn = item.querySelector(".btn-add-subtask");
  const editBtn = item.querySelector(".btn-edit-task");
  const delBtn = item.querySelector(".btn-del-task");
  const toggleBtn = item.querySelector(".task-toggle");

  checkbox.addEventListener("change", () => {
    toggleTaskDone(task.id, checkbox.checked);
  });

  delBtn.addEventListener("click", () => {
    deleteTask(task.id);
  });

  addSubtaskBtn.addEventListener("click", () => {
    showAddSubtaskDialog(task.id);
  });

  editBtn.addEventListener("click", () => {
    openEditDrawer(task);
  });

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      toggleSubtasks(task.id, toggleBtn);
    });
  }

  el.taskList.appendChild(item);

  // 渲染子任务容器（初始隐藏）
  if (hasSubtasks) {
    const subtaskContainer = document.createElement("div");
    subtaskContainer.className = "subtask-container";
    subtaskContainer.id = `subtasks-${task.id}`;
    subtaskContainer.style.display = "none";
    el.taskList.appendChild(subtaskContainer);
  }
}

// 签到功能
async function loadCheckinInfo() {
  const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  el.displayDate.textContent = todayStr;
  
  const info = await auth.loadCheckinInfo();
  if (!info) return;
  
  const todayISO = getLocalDateISO();
  el.streakDays.textContent = info.consecutive_days || 0;
  
  if (info.last_checkin_date === todayISO) {
    el.checkinStatus.textContent = "已签到";
    el.checkinStatus.classList.add("ok");
    el.checkinBtn.textContent = "今日已完成";
    el.checkinBtn.disabled = true;
    el.checkinBtn.classList.add("disabled");
  } else {
    el.checkinStatus.textContent = "未签到";
    el.checkinStatus.classList.remove("ok");
    el.checkinBtn.textContent = "今日签到";
    el.checkinBtn.disabled = false;
    el.checkinBtn.classList.remove("disabled");
  }
}

async function handleCheckin() {
  if (auth.isLoading()) return;
  
  setButtonLoading(el.checkinBtn, "签到中...", true);
  const result = await auth.checkin(currentTodayMinutes, getLocalDateISO);
  setButtonLoading(el.checkinBtn, "", false);

  showMessage(result.message, result.success ? "ok" : "error");

  if (result.success) {
    await loadCheckinInfo();
  }
}

// 热力图
async function renderHeatmap() {
  if (!el.heatmapGrid) return;

  el.heatmapGrid.innerHTML = `<div class="muted" style="grid-column:1/-1;padding:20px 0;">加载热力图中...</div>`;
  if (el.monthRow) el.monthRow.innerHTML = "";

  await heatmap.loadData(getLocalDateISO);
  const { days, months, totalMinutes } = heatmap.generateHeatmapData(getLocalDateISO);

  const gridFrag = document.createDocumentFragment();
  const monthFrag = document.createDocumentFragment();

  months.forEach(month => {
    const monthCell = document.createElement("div");
    monthCell.textContent = month.text;
    monthCell.style.minHeight = "14px";
    monthFrag.appendChild(monthCell);
  });

  days.forEach(day => {
    const dayEl = document.createElement("div");
    dayEl.className = `heatmap-day ${day.heatClass} ${day.isToday ? "today" : ""}`;
    dayEl.title = `${day.date}｜专注 ${day.minutes} 分钟`;
    dayEl.style.opacity = day.opacity;

    if (day.isInRange) {
      dayEl.addEventListener("click", async () => {
        showMainPage();
        selectedTaskDate = day.date;
        el.taskDatePicker.value = day.date;
        document.querySelector('[data-side-tab="tasks"]').click();
        await loadTasksByDate(day.date);
      });
    }

    gridFrag.appendChild(dayEl);
  });

  el.heatmapGrid.innerHTML = "";
  el.heatmapGrid.appendChild(gridFrag);

  if (el.monthRow) {
    el.monthRow.innerHTML = "";
    el.monthRow.appendChild(monthFrag);
  }

  if (el.heatmapTitle) {
    el.heatmapTitle.textContent = `过去 ${heatmap.getRange()} 天专注分布`;
  }

  if (el.heatmapSubtitle) {
    const subjectText = heatmap.getSubjectFilter() === "全部" ? "" : `（${heatmap.getSubjectFilter()}）`;
    if (totalMinutes === 0) {
      el.heatmapSubtitle.innerHTML = `过去 ${heatmap.getRange()} 天${subjectText} · 暂无专注记录`;
    } else {
      el.heatmapSubtitle.innerHTML = `过去 ${heatmap.getRange()} 天${subjectText} · 共专注 <b>${Math.floor(totalMinutes / 60)}</b> 小时`;
    }
  }
}

async function loadSubjectList() {
  const result = await heatmap.loadSubjectList();
  if (!result.success) return;
  
  const filterEl = document.getElementById("subjectFilter");
  if (filterEl) {
    filterEl.innerHTML = '<option value="全部">全部科目</option>';
    result.subjects.forEach(subject => {
      const option = document.createElement("option");
      option.value = subject;
      option.textContent = subject;
      filterEl.appendChild(option);
    });
  }
}


// 计时器控制
async function startTimer() {
  const onTick = () => updateTimer();
  const onComplete = async (minutes) => {
    await saveStudySession(minutes);
  };

  setButtonLoading(el.startBtn, "启动中...", true);
  const started = await timer.start(onTick, onComplete);
  setButtonLoading(el.startBtn, "", false);

  if (started) {
    el.statusText.textContent = "专注正在进行...";
    el.finishFocusBtn.style.display = "";
  } else if (!timer.isRunning()) {
    el.statusText.textContent = "启动失败，请稍后重试。";
  }
}

async function pauseTimer() {
  const paused = await timer.pause();
  if (paused) {
    el.statusText.textContent = "已暂停。";
  }
}

async function resetTimer() {
  const elapsed = timer.getElapsedSeconds();
  if (elapsed > 0) {
    const ok = confirm("重置不会保存当前专注时间，确定要重置吗？");
    if (!ok) return;
  }

  await timer.reset(true);
  updateTimer();
  el.statusText.textContent = "现在只做这一件事。";
  el.finishFocusBtn.style.display = "none";
}

// 标签页切换
function bindTabs() {
  document.querySelectorAll("[data-auth-tab]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-auth-tab");
    $("loginPane").classList.toggle("hidden", tab !== "login");
    $("signupPane").classList.toggle("hidden", tab !== "signup");
  }));
  
  document.querySelectorAll("[data-side-tab]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-side-tab]").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-side-tab");
    $("tasksPane").classList.toggle("hidden", tab !== "tasks");
    $("leaderboardPane").classList.toggle("hidden", tab !== "leaderboard");
    $("historyPane").classList.toggle("hidden", tab !== "history");
  }));
}

// 事件绑定
function bindCommon() {
  // 时长选择
  document.querySelectorAll("[data-time]").forEach(btn => btn.addEventListener("click", () => {
    if (timer.isRunning()) return;
    document.querySelectorAll("[data-time]").forEach(x => x.classList.remove("time-btn-active"));
    btn.classList.add("time-btn-active");
    const seconds = Number(btn.dataset.time);
    timer.setDuration(seconds);
    updateTimer();
    const minutes = Math.floor(seconds / 60);
    document.getElementById("modeText").textContent = "当前专注：" + minutes + "分钟";
    el.saveManualBtn.textContent = "手动记 " + minutes + " 分钟";
    el.saveManualBtn.style.display = ""; // 恢复显示手动记录按钮
    el.finishFocusBtn.style.display = "none"; // 未开始前不显示记录按钮
  }));

  // 主题切换
  el.themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    localStorage.setItem(APP_CONFIG.THEME_KEY, dark ? "dark" : "light");
    el.themeBtn.textContent = dark ? "☀" : "☾";
  });

  // 全屏
  el.fullBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  });

  // 认证按钮
  el.logoutBtn.addEventListener("click", logout);
  el.editUsernameBtn?.addEventListener("click", openUsernameDrawer);
  el.loginBtn.addEventListener("click", login);
  el.signupBtn.addEventListener("click", signup);

  el.closeUsernameDrawerBtn?.addEventListener("click", closeUsernameDrawer);
  el.usernameDrawerOverlay?.addEventListener("click", closeUsernameDrawer);
  el.saveUsernameBtn?.addEventListener("click", saveUsername);
  el.usernameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveUsername();
  });

  // 计时器按钮
  el.startBtn.addEventListener("click", startTimer);
  el.pauseBtn.addEventListener("click", pauseTimer);
  el.resetBtn.addEventListener("click", resetTimer);
  el.saveManualBtn.addEventListener("click", () => {
    const elapsed = timer.getElapsedSeconds();
    const seconds = elapsed > 0 ? elapsed : timer.getSelectedDuration();
    const minutes = Math.max(1, Math.floor(seconds / 60));
    showUndoToast(minutes);
  });

  // 点击计时器切换模式
  el.timer.addEventListener("click", () => {
    if (!timer.isRunning()) return;
    const toggled = timer.toggleMode();
    if (toggled) {
      updateTimer();
      const modeText = timer.getTimerMode() === "countdown" ? "剩余时间" : "已用时间";
      showMessage(`切换为${modeText}模式`);
    }
  });

  // 自定义时长
  const applyCustomTime = () => {
    if (timer.isRunning()) return;
    const val = parseInt(document.getElementById("customMinInput").value, 10);
    if (isNaN(val) || val <= 0 || val > 600) {
      showMessage("请输入 1~600 之间的分钟数。");
      return;
    }
    document.querySelectorAll("[data-time]").forEach(x => x.classList.remove("time-btn-active"));
    timer.setDuration(val * 60);
    updateTimer();
    document.getElementById("modeText").textContent = "当前专注：" + val + "分钟";
    el.saveManualBtn.textContent = "手动记 " + val + " 分钟";
    el.saveManualBtn.dataset.originalText = "手动记 " + val + " 分钟";
  };
  document.getElementById("customTimeBtn").addEventListener("click", applyCustomTime);
  document.getElementById("customMinInput").addEventListener("keydown", e => {
    if (e.key === "Enter") applyCustomTime();
  });

  // 专注计时按钮
  document.getElementById("freeTimerBtn").addEventListener("click", () => {
    document.querySelectorAll("[data-time]").forEach(x => x.classList.remove("time-btn-active"));
    timer.setDuration(0); // 0 表示无限制正计时模式
    updateTimer();
    document.getElementById("modeText").textContent = "专注计时模式（无时间限制）";
  });

  // 完成并记录按钮
  el.finishFocusBtn.addEventListener("click", async () => {
    if (timer.isRunning()) timer.syncWithClock();

    const elapsed = timer.getElapsedSeconds();
    if (elapsed <= 0) {
      showMessage("还没有可记录的专注时间。");
      return;
    }

    const minutes = Math.max(1, Math.floor(elapsed / 60)); // 至少 1 分钟

    if (elapsed < 60) {
      showMessage("专注时间不足 1 分钟，将按 1 分钟记录");
    }

    if (timer.isRunning()) {
      await timer.pause();
    }
    await timer.reset();
    updateTimer();
    el.finishFocusBtn.style.display = "none";
    el.statusText.textContent = "已完成专注";

    // 显示撤销提示，5秒后自动保存
    showFocusCompleteToast(minutes);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncVisibleTimer();
    }
  });
  window.addEventListener("focus", syncVisibleTimer);

  // 任务优先级样式
  const prioritySelect = document.getElementById("taskPrioritySelect");
  if (prioritySelect) {
    const updatePriorityStyle = () => {
      const val = prioritySelect.value;
      prioritySelect.style.backgroundColor =
        val === "high" ? "rgba(239,68,68,0.1)" :
        val === "medium" ? "rgba(245,158,11,0.1)" :
        "rgba(156,163,175,0.05)";
      prioritySelect.style.borderColor =
        val === "high" ? "rgba(239,68,68,0.3)" :
        val === "medium" ? "rgba(245,158,11,0.3)" :
        "rgba(156,163,175,0.2)";
    };
    prioritySelect.addEventListener("change", updatePriorityStyle);
    updatePriorityStyle();
  }

  // 添加任务
  el.addTaskBtn.addEventListener("click", async () => {
    const text = el.taskInput.value.trim();
    const timeInput = document.getElementById("taskTimeInput");
    const prioritySelect = document.getElementById("taskPrioritySelect");
    const durationMinutes = parseInt(timeInput.value, 10);
    const priority = prioritySelect.value;

    if (!text) {
      showMessage("请输入任务内容。");
      return;
    }
    if (!durationMinutes || durationMinutes <= 0) {
      showMessage("请输入任务时长（分钟）。");
      return;
    }

    await addTask(text, selectedTaskDate, durationMinutes, priority);
    el.taskInput.value = "";
    timeInput.value = "";
    prioritySelect.value = "medium";
  });
  el.taskInput.addEventListener("keydown", e => {
    if (e.key === "Enter") el.addTaskBtn.click();
  });

  // 移动端抽屉
  let selectedDrawerPriority = "medium";

  if (el.mobileAddTaskBtn) {
    el.mobileAddTaskBtn.addEventListener("click", () => {
      el.taskDrawer.classList.add("show");
      el.drawerOverlay.classList.add("show");
    });
  }

  if (el.closeDrawerBtn) {
    el.closeDrawerBtn.addEventListener("click", () => {
      el.taskDrawer.classList.remove("show");
      el.drawerOverlay.classList.remove("show");
    });
  }

  if (el.drawerOverlay) {
    el.drawerOverlay.addEventListener("click", () => {
      el.taskDrawer.classList.remove("show");
      el.drawerOverlay.classList.remove("show");
    });
  }

  const drawerPriorityBtns = document.querySelectorAll(".drawer-priority-btn");
  drawerPriorityBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      drawerPriorityBtns.forEach(b => {
        b.classList.remove("active-high", "active-medium", "active-low");
      });
      selectedDrawerPriority = btn.dataset.priority;
      btn.classList.add(`active-${selectedDrawerPriority}`);
    });
  });

  if (el.drawerAddBtn) {
    el.drawerAddBtn.addEventListener("click", async () => {
      const text = el.drawerTaskInput.value.trim();
      if (!text) {
        showMessage("请输入任务内容。");
        return;
      }

      const durationMinutes = parseInt(el.drawerDurationInput.value);
      if (!durationMinutes || durationMinutes <= 0) {
        showMessage("请输入任务时长（分钟）。");
        return;
      }

      await addTask(text, selectedTaskDate, durationMinutes, selectedDrawerPriority);

      el.drawerTaskInput.value = "";
      el.drawerDurationInput.value = "";
      selectedDrawerPriority = "medium";
      drawerPriorityBtns.forEach(b => {
        b.classList.remove("active-high", "active-medium", "active-low");
      });
      drawerPriorityBtns[1].classList.add("active-medium");

      el.taskDrawer.classList.remove("show");
      el.drawerOverlay.classList.remove("show");
    });
  }

  // 编辑任务抽屉
  let selectedEditPriority = "medium";

  document.getElementById("closeEditDrawerBtn").addEventListener("click", () => {
    document.getElementById("editTaskDrawer").classList.remove("show");
    document.getElementById("editDrawerOverlay").classList.remove("show");
  });
  document.getElementById("editDrawerOverlay").addEventListener("click", () => {
    document.getElementById("editTaskDrawer").classList.remove("show");
    document.getElementById("editDrawerOverlay").classList.remove("show");
  });

  document.querySelectorAll("[data-edit-priority]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-edit-priority]").forEach(b =>
        b.classList.remove("active-high", "active-medium", "active-low"));
      selectedEditPriority = btn.dataset.editPriority;
      btn.classList.add(`active-${selectedEditPriority}`);
    });
  });

  document.getElementById("saveEditBtn").addEventListener("click", async () => {
    const taskId = document.getElementById("editTaskId").value;
    const text = document.getElementById("editTaskInput").value.trim();
    const duration = parseInt(document.getElementById("editTimeInput").value);
    const priority = document.querySelector("[data-edit-priority].active-high, [data-edit-priority].active-medium, [data-edit-priority].active-low")?.dataset.editPriority || "medium";

    if (!text) { showMessage("请输入任务内容。"); return; }
    if (!duration || duration <= 0) { showMessage("请输入有效时长。"); return; }

    const result = await taskManager.editTask(taskId, text, duration, priority);
    if (!result.success) { showMessage(result.message); return; }

    document.getElementById("editTaskDrawer").classList.remove("show");
    document.getElementById("editDrawerOverlay").classList.remove("show");
    renderTasks();
  });

  // 子任务抽屉
  let selectedSubtaskPriority = "medium";

  document.getElementById("closeSubtaskDrawerBtn").addEventListener("click", () => {
    document.getElementById("subtaskDrawer").classList.remove("show");
    document.getElementById("subtaskDrawerOverlay").classList.remove("show");
  });
  document.getElementById("subtaskDrawerOverlay").addEventListener("click", () => {
    document.getElementById("subtaskDrawer").classList.remove("show");
    document.getElementById("subtaskDrawerOverlay").classList.remove("show");
  });

  document.querySelectorAll("[data-subtask-priority]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-subtask-priority]").forEach(b =>
        b.classList.remove("active-high", "active-medium", "active-low"));
      selectedSubtaskPriority = btn.dataset.subtaskPriority;
      btn.classList.add(`active-${selectedSubtaskPriority}`);
    });
  });

  document.getElementById("addSubtaskDrawerBtn").addEventListener("click", async () => {
    const parentId = document.getElementById("subtaskParentId").value;
    const text = document.getElementById("subtaskInput").value.trim();
    const duration = parseInt(document.getElementById("subtaskTimeInput").value);

    if (!text) { showMessage("请输入子任务内容。"); return; }
    if (!duration || duration <= 0) { showMessage("请输入有效时长。"); return; }

    await addSubtask(text, selectedTaskDate, duration, selectedSubtaskPriority, parentId);

    document.getElementById("subtaskDrawer").classList.remove("show");
    document.getElementById("subtaskDrawerOverlay").classList.remove("show");
  });

  // 关联任务选择器
  const taskLinkSelect = document.getElementById("taskLinkSelect");
  if (taskLinkSelect) {
    taskLinkSelect.addEventListener("change", async () => {
      const taskId = taskLinkSelect.value;
      if (taskId) lastLinkedTaskId = taskId;
      else lastLinkedTaskId = null;
      // 始终从数据库查找任务，避免 getCurrentTasks() 按日期过滤导致的任务丢失
      const subjectInput = document.getElementById("customSubjectInput");
      if (taskId && subjectInput) {
        const { data: task } = await supabase.from("tasks").select("text").eq("id", taskId).single();
        if (task) subjectInput.value = task.text.slice(0, 20);
      } else if (subjectInput) {
        subjectInput.value = "";
      }
    });
  }

  // 任务日期
  el.taskDatePicker.addEventListener("change", async (e) => {
    if (e.target.value) {
      await autoSaveReview();
      selectedTaskDate = e.target.value;
      await loadTasksByDate(selectedTaskDate);
      await loadReview(selectedTaskDate);
    }
  });
  el.goTodayBtn.addEventListener("click", async () => {
    await autoSaveReview();
    selectedTaskDate = getLocalDateISO();
    el.taskDatePicker.value = selectedTaskDate;
    await loadTasksByDate(selectedTaskDate);
    await loadReview(selectedTaskDate);
  });
  el.goYesterdayBtn.addEventListener("click", () => changeTaskDate(-1));

  // 复盘保存按钮
  const saveReviewBtn = document.getElementById("saveReviewBtn");
  if (saveReviewBtn) {
    saveReviewBtn.addEventListener("click", () => autoSaveReview());
  }
  document.getElementById("reviewChecklistBtn")?.addEventListener("click", insertReviewChecklist);
  const reviewInput = document.getElementById("reviewInput");
  if (reviewInput) {
    reviewInput.addEventListener("input", scheduleReviewAutoSave);
    reviewInput.addEventListener("change", scheduleReviewAutoSave);
  }

  // 排行榜切换
  el.dailyRankTab.addEventListener("click", () => {
    if (currentRankType === "daily") return;
    currentRankType = "daily";
    el.dailyRankTab.classList.add("active");
    el.totalRankTab.classList.remove("active");
    loadLeaderboard();
  });

  el.totalRankTab.addEventListener("click", () => {
    if (currentRankType === "total") return;
    currentRankType = "total";
    el.totalRankTab.classList.add("active");
    el.dailyRankTab.classList.remove("active");
    loadLeaderboard();
  });

  el.refreshLeaderboardBtn.addEventListener("click", loadLeaderboard);
  el.refreshHistoryBtn.addEventListener("click", loadHistory);
  el.closeBreakdownDrawerBtn?.addEventListener("click", closeBreakdownDrawer);
  el.breakdownDrawerOverlay?.addEventListener("click", closeBreakdownDrawer);

  // 目标设置
  el.editGoalBtn.addEventListener("click", () => {
    const input = prompt("请输入目标学习时长（分钟）：", dailyGoal);
    if (input === null) return;
    const val = parseInt(input, 10);
    if (isNaN(val) || val <= 0) {
      showMessage("请输入大于 0 的有效分钟数。");
      return;
    }
    dailyGoal = val;
    saveJSON(APP_CONFIG.GOAL_KEY, dailyGoal);
    loadMyStats();
  });

  // 签到
  el.checkinBtn.addEventListener("click", handleCheckin);

  // 沉浸模式
  el.immersiveBtn.addEventListener("click", () => {
    document.body.classList.add("immersive");
    el.exitImmersiveBtn.classList.remove("hidden");
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  el.exitImmersiveBtn.addEventListener("click", () => {
    document.body.classList.remove("immersive");
    el.exitImmersiveBtn.classList.add("hidden");
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 热力图
  if (el.openHeatmapBtn) {
    el.openHeatmapBtn.addEventListener("click", async () => {
      heatmap.setRange(30);
      heatmap.setSubjectFilter("全部");
      if (el.heatmap30Btn) el.heatmap30Btn.classList.add("active");
      if (el.heatmap365Btn) el.heatmap365Btn.classList.remove("active");
      showHeatmapPage();
      await loadSubjectList();
      await renderHeatmap();
    });
  }

  if (el.backToMainBtn) {
    el.backToMainBtn.addEventListener("click", () => {
      showMainPage();
    });
  }

  if (el.refreshHeatmapBtn) {
    el.refreshHeatmapBtn.addEventListener("click", async () => {
      await renderHeatmap();
    });
  }

  if (el.heatmap30Btn) {
    el.heatmap30Btn.addEventListener("click", async () => {
      if (heatmap.getRange() === 30) return;
      heatmap.setRange(30);
      el.heatmap30Btn.classList.add("active");
      el.heatmap365Btn.classList.remove("active");
      await renderHeatmap();
    });
  }

  if (el.heatmap365Btn) {
    el.heatmap365Btn.addEventListener("click", async () => {
      if (heatmap.getRange() === 365) return;
      heatmap.setRange(365);
      el.heatmap365Btn.classList.add("active");
      el.heatmap30Btn.classList.remove("active");
      await renderHeatmap();
    });
  }

  const subjectFilterEl = document.getElementById("subjectFilter");
  if (subjectFilterEl) {
    subjectFilterEl.addEventListener("change", async (e) => {
      heatmap.setSubjectFilter(e.target.value);
      await renderHeatmap();
    });
  }

  // 科目统计范围切换
  document.querySelectorAll("[data-range]").forEach(btn => btn.addEventListener("click", async () => {
    document.querySelectorAll("[data-range]").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const range = btn.getAttribute("data-range");
    await loadSubjectStats(range);
  }));
}


// 会话刷新
async function refreshSession() {
  try {
    const result = await auth.getSession();
    updateAuthUI();

    if (result.success && result.user) {
      await auth.ensureProfile();
      updateAuthUI();
      await Promise.all([
        loadMyStats(),
        loadHistory(),
        loadCheckinInfo(),
        loadLeaderboard(),
        loadTasksByDate(selectedTaskDate),
        loadReview(selectedTaskDate),
        loadWeeklyChart()
      ]);

      // 恢复计时状态
      await restoreTimerState();
    } else {
      renderTasks();
      await loadLeaderboard();
    }
  } catch (err) {
    console.error("refreshSession error:", err);
    setAppStatus("登录状态恢复失败，请刷新重试。", "error");
  } finally {
    appReady = true;
    setInteractiveState(true);
    setAppStatus("");
  }
}

// 主函数
async function main() {
  try {
    // 主题初始化
    const theme = localStorage.getItem(APP_CONFIG.THEME_KEY);
    if (theme === "dark") {
      document.body.classList.add("dark");
      el.themeBtn.textContent = "☀";
    }
    
    // 日期初始化
    selectedTaskDate = getLocalDateISO();
    el.taskDatePicker.value = selectedTaskDate;
    
    // 绑定事件
    bindTabs();
    bindCommon();
    renderTasks();
    updateTimer();
    
    // 禁用交互
    setInteractiveState(false);
    setAppStatus("正在初始化...");
    
    // 每日提醒
    if (!localStorage.getItem("today_opened_v2_" + getLocalDateISO())) {
      setTimeout(() => showMessage("今天也要保持专注 🔥"), 800);
      localStorage.setItem("today_opened_v2_" + getLocalDateISO(), "true");
    }
    
    // 监听认证状态变化
    supabase.auth.onAuthStateChange((event, session) => {
      auth.setCurrentUser(session?.user || null);
      updateAuthUI();

      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTimeout(() => {
          refreshSession();
        }, 0);
      }
    });
    
    // 刷新会话
    await refreshSession();
    
  } catch (err) {
    console.error("main error:", err);
    setAppStatus("连接失败，请刷新重试。", "error");
  }
}

// 启动应用
main();
