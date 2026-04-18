const STORAGE_KEY = "focus-grove-state-v1";

const state = {
  durationMinutes: 25,
  remainingSeconds: 25 * 60,
  isRunning: false,
  sessionStartMs: null,
  activeTag: "",
  history: [],
  settings: {
    dayStart: "07:00",
    dayEnd: "22:00",
    blocks: 3,
  },
};

const els = {
  timeReadout: document.getElementById("timeReadout"),
  progressBar: document.getElementById("progressBar"),
  treeStage: document.getElementById("treeStage"),
  minutesInput: document.getElementById("minutesInput"),
  tagInput: document.getElementById("tagInput"),
  startPauseBtn: document.getElementById("startPauseBtn"),
  completeBtn: document.getElementById("completeBtn"),
  resetTimerBtn: document.getElementById("resetTimerBtn"),
  sessionStatus: document.getElementById("sessionStatus"),
  todaySummary: document.getElementById("todaySummary"),
  totalSessionsStat: document.getElementById("totalSessionsStat"),
  totalMinutesStat: document.getElementById("totalMinutesStat"),
  streakStat: document.getElementById("streakStat"),
  topTagStat: document.getElementById("topTagStat"),
  weeklyAverageLabel: document.getElementById("weeklyAverageLabel"),
  weeklyChart: document.getElementById("weeklyChart"),
  historyList: document.getElementById("historyList"),
  dayStartInput: document.getElementById("dayStartInput"),
  dayEndInput: document.getElementById("dayEndInput"),
  blocksInput: document.getElementById("blocksInput"),
  planBtn: document.getElementById("planBtn"),
  planOutput: document.getElementById("planOutput"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
};

let timerId = null;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    state.durationMinutes = parsed.durationMinutes ?? state.durationMinutes;
    state.remainingSeconds = parsed.remainingSeconds ?? state.remainingSeconds;
    state.history = Array.isArray(parsed.history) ? parsed.history : [];
    state.settings = {
      ...state.settings,
      ...(parsed.settings || {}),
    };
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      durationMinutes: state.durationMinutes,
      remainingSeconds: state.remainingSeconds,
      history: state.history,
      settings: state.settings,
    }),
  );
}

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getProgressRatio() {
  const total = state.durationMinutes * 60;
  if (!total) return 0;
  return (total - state.remainingSeconds) / total;
}

function updateTree() {
  const ratio = Math.max(0, Math.min(1, getProgressRatio()));
  const scale = 0.42 + ratio * 0.68;
  els.treeStage.style.setProperty("--tree-scale", scale.toFixed(3));
}

function updateTimerUI() {
  els.timeReadout.textContent = formatSeconds(state.remainingSeconds);
  els.progressBar.style.width = `${Math.max(0, Math.min(100, getProgressRatio() * 100))}%`;
  els.startPauseBtn.textContent = state.isRunning ? "Pause focus" : "Start focus";
  updateTree();
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDateKey(dateLike) {
  return new Date(dateLike).toISOString().slice(0, 10);
}

function summarizeToday() {
  const todayKey = getTodayKey();
  const todaySessions = state.history.filter((entry) => getDateKey(entry.completedAt) === todayKey);
  const totalMinutes = todaySessions.reduce((sum, entry) => sum + entry.minutes, 0);

  if (!todaySessions.length) {
    els.todaySummary.textContent = "No sessions yet today";
    return;
  }

  els.todaySummary.textContent = `${todaySessions.length} session${
    todaySessions.length === 1 ? "" : "s"
  } today • ${totalMinutes} focused minutes`;
}

function computeStreak() {
  const uniqueDays = [...new Set(state.history.map((entry) => getDateKey(entry.completedAt)))].sort().reverse();
  if (!uniqueDays.length) return 0;

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 366; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (uniqueDays.includes(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (i === 0) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }

  return streak;
}

function computeTopTag() {
  const counts = new Map();
  state.history.forEach((entry) => {
    const tag = entry.tag || "Untitled";
    counts.set(tag, (counts.get(tag) || 0) + entry.minutes);
  });

  let winner = "None yet";
  let winnerMinutes = 0;
  counts.forEach((minutes, tag) => {
    if (minutes > winnerMinutes) {
      winner = tag;
      winnerMinutes = minutes;
    }
  });
  return winner;
}

function renderWeeklyChart() {
  const dayLabels = [];
  const dailyMinutes = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const minutes = state.history
      .filter((entry) => getDateKey(entry.completedAt) === key)
      .reduce((sum, entry) => sum + entry.minutes, 0);

    dayLabels.push(
      date.toLocaleDateString(undefined, {
        weekday: "short",
      }),
    );
    dailyMinutes.push(minutes);
  }

  const maxMinutes = Math.max(30, ...dailyMinutes);
  els.weeklyChart.innerHTML = dailyMinutes
    .map((minutes, index) => {
      const height = Math.max(12, (minutes / maxMinutes) * 120);
      return `
        <div class="chart-bar-wrap" title="${minutes} min">
          <div class="chart-bar" style="height:${height}px"></div>
          <div class="chart-day">${dayLabels[index].slice(0, 2)}</div>
        </div>
      `;
    })
    .join("");

  const average = Math.round(dailyMinutes.reduce((sum, value) => sum + value, 0) / 7);
  els.weeklyAverageLabel.textContent = `${average} min/day average`;
}

function renderHistory() {
  if (!state.history.length) {
    els.historyList.innerHTML =
      '<p class="empty-state">No sessions yet. Your grove starts with one block.</p>';
    return;
  }

  els.historyList.innerHTML = state.history
    .slice()
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 8)
    .map((entry) => {
      const timeLabel = new Date(entry.completedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `
        <article class="history-item">
          <div>
            <strong>${entry.tag || "Untitled focus block"}</strong>
            <span>${timeLabel}</span>
          </div>
          <div class="history-minutes">${entry.minutes} min</div>
        </article>
      `;
    })
    .join("");
}

function renderStats() {
  const totalMinutes = state.history.reduce((sum, entry) => sum + entry.minutes, 0);
  els.totalSessionsStat.textContent = String(state.history.length);
  els.totalMinutesStat.textContent = String(totalMinutes);
  els.streakStat.textContent = `${computeStreak()} day${computeStreak() === 1 ? "" : "s"}`;
  els.topTagStat.textContent = computeTopTag();
  summarizeToday();
  renderWeeklyChart();
  renderHistory();
}

function buildPlan() {
  const [startHour, startMinute] = state.settings.dayStart.split(":").map(Number);
  const [endHour, endMinute] = state.settings.dayEnd.split(":").map(Number);
  const blocks = Number(state.settings.blocks);

  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  const dayLength = Math.max(60, endTotal - startTotal);
  const blockMinutes = Math.max(25, Math.min(90, Math.round(dayLength / (blocks * 2))));
  const gapMinutes = Math.max(15, Math.round((dayLength - blockMinutes * blocks) / Math.max(1, blocks)));

  const tagBias = computeTopTag();
  let cursor = startTotal + 30;
  const lines = [
    `Suggested plan for today`,
    ``,
  ];

  for (let index = 0; index < blocks; index += 1) {
    const blockStart = cursor;
    const blockEnd = Math.min(endTotal, blockStart + blockMinutes);
    lines.push(
      `${index + 1}. ${formatMinutesOfDay(blockStart)}-${formatMinutesOfDay(blockEnd)} • ${
        index === 0 ? "Warm-up focus" : index === blocks - 1 ? "Finish strong block" : "Core deep work"
      }${tagBias !== "None yet" ? ` (${tagBias})` : ""}`,
    );
    cursor = blockEnd + gapMinutes;
  }

  lines.push("");
  lines.push(
    `Best default: ${blocks} blocks of about ${blockMinutes} minutes, with ${gapMinutes}-minute recovery gaps.`,
  );

  els.planOutput.textContent = lines.join("\n");
}

function formatMinutesOfDay(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function completeSession(manual = false) {
  const minutesCompleted = manual
    ? Math.max(1, Math.round((state.durationMinutes * 60 - state.remainingSeconds) / 60))
    : state.durationMinutes;

  if (minutesCompleted < 1) {
    els.sessionStatus.textContent = "Session discarded because it never really started.";
    resetTimer();
    return;
  }

  state.history.push({
    minutes: minutesCompleted,
    tag: state.activeTag.trim(),
    completedAt: new Date().toISOString(),
  });

  els.sessionStatus.textContent = manual
    ? `Saved an early finish for ${minutesCompleted} minutes.`
    : `Tree grown. Logged ${state.durationMinutes} focused minutes.`;

  resetTimer(false);
  renderStats();
  buildPlan();
  saveState();
}

function tick() {
  if (!state.isRunning) return;
  state.remainingSeconds -= 1;

  if (state.remainingSeconds <= 0) {
    completeSession(false);
    return;
  }

  updateTimerUI();
  saveState();
}

function startTimer() {
  const requestedMinutes = Math.max(5, Math.min(180, Number(els.minutesInput.value) || 25));
  if (!state.isRunning && state.remainingSeconds === state.durationMinutes * 60) {
    state.durationMinutes = requestedMinutes;
    state.remainingSeconds = requestedMinutes * 60;
  }

  state.activeTag = els.tagInput.value.trim();
  state.isRunning = true;
  els.sessionStatus.textContent = state.activeTag
    ? `Focusing on ${state.activeTag}. Stay with it.`
    : "Focus session running. Keep your attention on one thing.";

  if (timerId) clearInterval(timerId);
  timerId = setInterval(tick, 1000);
  updateTimerUI();
  saveState();
}

function pauseTimer() {
  state.isRunning = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  els.sessionStatus.textContent = "Paused. You can resume when you are ready.";
  updateTimerUI();
  saveState();
}

function resetTimer(announce = true) {
  state.isRunning = false;
  state.durationMinutes = Math.max(5, Math.min(180, Number(els.minutesInput.value) || 25));
  state.remainingSeconds = state.durationMinutes * 60;
  if (timerId) clearInterval(timerId);
  timerId = null;
  if (announce) {
    els.sessionStatus.textContent = "Timer reset. Set your next block and plant again.";
  }
  updateTimerUI();
  saveState();
}

function syncInputs() {
  els.minutesInput.value = String(state.durationMinutes);
  els.dayStartInput.value = state.settings.dayStart;
  els.dayEndInput.value = state.settings.dayEnd;
  els.blocksInput.value = String(state.settings.blocks);
}

function attachEvents() {
  els.startPauseBtn.addEventListener("click", () => {
    if (state.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  els.completeBtn.addEventListener("click", () => completeSession(true));
  els.resetTimerBtn.addEventListener("click", () => resetTimer(true));

  els.minutesInput.addEventListener("change", () => {
    if (!state.isRunning) resetTimer(false);
  });

  els.planBtn.addEventListener("click", () => {
    state.settings.dayStart = els.dayStartInput.value;
    state.settings.dayEnd = els.dayEndInput.value;
    state.settings.blocks = Math.max(1, Math.min(8, Number(els.blocksInput.value) || 3));
    buildPlan();
    saveState();
  });

  els.clearHistoryBtn.addEventListener("click", () => {
    state.history = [];
    renderStats();
    buildPlan();
    saveState();
  });
}

function init() {
  loadState();
  syncInputs();
  updateTimerUI();
  renderStats();
  buildPlan();
  attachEvents();
}

init();
