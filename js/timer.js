// 计时器核心功能
export class Timer {
  constructor(supabase, auth) {
    this.supabase = supabase;
    this.auth = auth;
    this.timer = null;
    this.remaining = 7200;
    this.selectedDuration = 7200;
    this.startedAt = null;
    this.runStartedAt = null;
    this.remainingAtRunStart = 7200;
    this.elapsedAtRunStart = 0;
    this.timerMode = "countdown"; // "countdown" 或 "countup"
    this.isFreeMode = false; // 专注计时模式（无限制）
    this.elapsedInFreeMode = 0; // 专注计时模式下的累计时间
    this.activeSessionId = null; // 当前活动的计时会话ID
    this.starting = false;
    this.startCancelled = false;
    this._lastStateSave = 0;
  }

  getBeijingDayBounds(date = new Date()) {
    const offsetMs = 8 * 60 * 60 * 1000;
    const bj = new Date(date.getTime() + offsetMs);
    const year = bj.getUTCFullYear();
    const month = bj.getUTCMonth();
    const day = bj.getUTCDate();
    const startUtcMs = Date.UTC(year, month, day, 0, 0, 0) - offsetMs;
    const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

    return {
      startISO: new Date(startUtcMs).toISOString(),
      endISO: new Date(endUtcMs).toISOString()
    };
  }

  getBeijingRollingStartISO(days) {
    const offsetMs = 8 * 60 * 60 * 1000;
    const bj = new Date(Date.now() + offsetMs);
    const startUtcMs = Date.UTC(
      bj.getUTCFullYear(),
      bj.getUTCMonth(),
      bj.getUTCDate() - Math.max(0, days - 1),
      0,
      0,
      0
    ) - offsetMs;

    return new Date(startUtcMs).toISOString();
  }

  getDateFromISO(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    const offsetMs = 8 * 60 * 60 * 1000;
    const bj = new Date(date.getTime() + offsetMs);
    const year = bj.getUTCFullYear();
    const month = String(bj.getUTCMonth() + 1).padStart(2, "0");
    const day = String(bj.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 保存计时状态到数据库
  async saveTimerState() {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    const startedAtISO = this.startedAt
      ? new Date(this.startedAt).toISOString()
      : new Date().toISOString();

    const state = {
      user_id: user.id,
      started_at: startedAtISO,
      duration: this.selectedDuration,
      remaining: this.remaining,
      timer_mode: this.timerMode,
      is_free_mode: this.isFreeMode,
      elapsed_in_free_mode: this.elapsedInFreeMode,
      updated_at: new Date().toISOString()
    };

    if (this.activeSessionId) {
      // 更新现有会话
      await this.supabase
        .from("timer_sessions")
        .update(state)
        .eq("id", this.activeSessionId);
    } else {
      // 创建新会话
      const { data, error } = await this.supabase
        .from("timer_sessions")
        .insert(state)
        .select()
        .single();

      if (data) {
        this.activeSessionId = data.id;
      }
    }
  }

  // 从数据库恢复计时状态
  async restoreTimerState() {
    const user = this.auth.getCurrentUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from("timer_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // 检查会话是否在最近24小时内
    const updatedAt = new Date(data.updated_at).getTime();
    const now = Date.now();
    if (now - updatedAt > 24 * 60 * 60 * 1000) {
      // 超过24小时，清除旧会话
      await this.supabase
        .from("timer_sessions")
        .delete()
        .eq("id", data.id)
        .eq("user_id", user.id);
      return null;
    }

    return data;
  }

  // 清除数据库中的计时状态
  async clearTimerState() {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    if (this.activeSessionId) {
      await this.supabase
        .from("timer_sessions")
        .delete()
        .eq("id", this.activeSessionId);

      this.activeSessionId = null;
    }
  }

  isRunning() {
    return this.timer !== null || this.starting;
  }

  getRemaining() {
    return this.remaining;
  }

  getSelectedDuration() {
    return this.selectedDuration;
  }

  getElapsedSeconds() {
    if (this.isFreeMode) {
      // 专注计时模式：返回已用时间
      return this.elapsedInFreeMode;
    } else {
      // 倒计时模式：已用时间 = 总时长 - 剩余时间
      return this.selectedDuration - this.remaining;
    }
  }

  getTimerMode() {
    return this.timerMode;
  }

  toggleMode() {
    if (!this.isRunning()) return false;
    this.timerMode = this.timerMode === "countdown" ? "countup" : "countdown";
    return true;
  }

  setDuration(seconds) {
    if (this.isRunning()) return false;
    this.selectedDuration = seconds;
    this.remaining = seconds;
    if (seconds === 0) {
      this.isFreeMode = true;
      this.elapsedInFreeMode = 0;
    } else {
      this.isFreeMode = false;
    }
    return true;
  }

  // 格式化时间
  formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
  }

  // 获取显示时间
  getDisplayTime() {
    if (this.isFreeMode) {
      return this.formatTime(this.elapsedInFreeMode);
    } else if (this.timerMode === "countdown") {
      return this.formatTime(this.remaining);
    } else {
      const elapsed = this.selectedDuration - this.remaining;
      return this.formatTime(elapsed);
    }
  }

  syncWithClock() {
    if (!this.timer && !this.starting) return false;
    if (!this.runStartedAt) return false;

    const elapsedSinceRunStart = Math.max(0, Math.floor((Date.now() - this.runStartedAt) / 1000));

    if (this.isFreeMode) {
      this.elapsedInFreeMode = this.elapsedAtRunStart + elapsedSinceRunStart;
    } else {
      this.remaining = Math.max(0, this.remainingAtRunStart - elapsedSinceRunStart);
    }

    return true;
  }

  // 开始计时
  async start(onTick, onComplete) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser || this.isRunning()) return false;

    this.starting = true;
    this.startCancelled = false;
    if (!this.startedAt) this.startedAt = Date.now();
    this.runStartedAt = Date.now();
    this.remainingAtRunStart = this.remaining;
    this.elapsedAtRunStart = this.elapsedInFreeMode;

    try {
      // 保存计时状态到数据库
      await this.saveTimerState();
    } catch (err) {
      console.error("saveTimerState error:", err);
      this.starting = false;
      return false;
    }

    if (this.startCancelled) {
      this.starting = false;
      this.startCancelled = false;
      await this.clearTimerState();
      return false;
    }

    this._lastStateSave = Date.now();

    const tick = async () => {
      if (!this.timer) return;

      this.syncWithClock();

      if (this.isFreeMode) {
        if (onTick) onTick();
      } else {
        if (onTick) onTick();

        if (this.remaining <= 0) {
          this.stop();
          const minutes = Math.floor(this.selectedDuration / 60);
          if (onComplete) await onComplete(minutes);
          await this.clearTimerState();
          await this.reset(true);
          return;
        }
      }

      // 每10秒更新一次数据库状态
      const now = Date.now();
      if (now - this._lastStateSave >= 10000) {
        this._lastStateSave = now;
        await this.saveTimerState();
      }

      if (this.timer) {
        this.timer = setTimeout(tick, 1000);
      }
    };

    this.timer = setTimeout(tick, 1000);

    this.starting = false;
    return true;
  }

  // 暂停计时
  async pause() {
    if (this.starting && !this.timer) {
      this.startCancelled = true;
      this.starting = false;
      await this.clearTimerState();
      return true;
    }

    if (this.timer) {
      this.syncWithClock();
      clearTimeout(this.timer);
      this.timer = null;
      // 暂停时清除数据库状态
      await this.clearTimerState();
      return true;
    }
    return false;
  }

  // 停止计时
  stop() {
    if (this.starting) {
      this.startCancelled = true;
      this.starting = false;
    }

    if (this.timer) {
      this.syncWithClock();
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // 重置计时器
  async reset(clearStartTime = true) {
    this.stop();
    this.remaining = this.selectedDuration;
    if (clearStartTime) {
      this.startedAt = null;
    }
    this.runStartedAt = null;
    this.remainingAtRunStart = this.selectedDuration;
    this.elapsedAtRunStart = 0;
    this.timerMode = "countdown";
    this.isFreeMode = this.selectedDuration === 0;
    this.elapsedInFreeMode = 0;
    // 重置时清除数据库状态
    await this.clearTimerState();
  }

  // 保存学习记录
  async saveSession(minutes, subject = "未分类") {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "请先登录" };
    }

    // 确保至少保存 1 分钟
    const validMinutes = Math.max(1, Math.floor(minutes));

    try {
      const payload = {
        user_id: currentUser.id,
        duration_minutes: validMinutes,
        subject: subject,
        started_at: this.startedAt ? new Date(this.startedAt).toISOString() : null,
        ended_at: new Date().toISOString()
      };

      console.log("[saveSession] payload:", JSON.stringify(payload));
      const { data: insertData, error } = await this.supabase.from("study_sessions").insert(payload).select();
      console.log("[saveSession] result:", JSON.stringify(insertData), error ? "ERROR:" + error.message : "OK");
      if (error) throw error;

      const message = `已记录 ${validMinutes} 分钟学习时间${
        subject !== "未分类" ? `（${subject}）` : ""
      }。`;

      return { success: true, message };
    } catch (err) {
      console.error("saveSession error:", err);
      return { success: false, message: "记录失败：" + err.message };
    }
  }

  // 加载统计数据
  async loadStats(getLocalDateISO) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, today: 0, total: 0, sessionCount: 0 };
    }

    try {
      const todayISO = getLocalDateISO ? getLocalDateISO() : this.getDateFromISO(new Date().toISOString());
      const { startISO, endISO } = this.getBeijingDayBounds();

      const [todaySessionsRes, totalSessionsRes, todayTasksRes, totalTasksRes] = await Promise.all([
        this.supabase
          .from("study_sessions")
          .select("duration_minutes")
          .eq("user_id", currentUser.id)
          .gte("ended_at", startISO)
          .lt("ended_at", endISO),
        this.supabase
          .from("study_sessions")
          .select("duration_minutes", { count: "exact" })
          .eq("user_id", currentUser.id),
        this.supabase
          .from("tasks")
          .select("duration_minutes")
          .eq("user_id", currentUser.id)
          .eq("done", true)
          .eq("task_date", todayISO),
        this.supabase
          .from("tasks")
          .select("duration_minutes", { count: "exact" })
          .eq("user_id", currentUser.id)
          .eq("done", true)
      ]);

      if (todaySessionsRes.error) throw todaySessionsRes.error;
      if (totalSessionsRes.error) throw totalSessionsRes.error;
      if (todayTasksRes.error) throw todayTasksRes.error;
      if (totalTasksRes.error) throw totalTasksRes.error;

      const todaySessionMinutes = (todaySessionsRes.data || []).reduce((s, x) => s + Number(x.duration_minutes || 0), 0);
      const totalSessionMinutes = (totalSessionsRes.data || []).reduce((s, x) => s + Number(x.duration_minutes || 0), 0);
      const todayTaskMinutes = (todayTasksRes.data || []).reduce((s, x) => s + Number(x.duration_minutes || 0), 0);
      const totalTaskMinutes = (totalTasksRes.data || []).reduce((s, x) => s + Number(x.duration_minutes || 0), 0);

      return {
        success: true,
        today: todaySessionMinutes + todayTaskMinutes,
        total: totalSessionMinutes + totalTaskMinutes,
        sessionCount: (totalSessionsRes.count || 0) + (totalTasksRes.count || 0)
      };
    } catch (err) {
      console.error("loadStats error:", err);
      return { success: false, today: 0, total: 0, sessionCount: 0 };
    }
  }

  // 加载科目统计
  async loadSubjectStats(range = "today") {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, subjects: [] };
    }

    try {
      let startDate = null;
      let startISO = null;

      if (range === "today") {
        startISO = this.getBeijingRollingStartISO(1);
      } else if (range === "week") {
        startISO = this.getBeijingRollingStartISO(7);
      } else if (range === "month") {
        startISO = this.getBeijingRollingStartISO(30);
      } else if (range === "all") {
        startISO = this.getBeijingRollingStartISO(90);
      }

      if (startISO) {
        startDate = this.getDateFromISO(startISO);
      }

      const [sessionsRes, tasksRes] = await Promise.all([
        (() => {
          let query = this.supabase
            .from("study_sessions")
            .select("duration_minutes, subject, ended_at")
            .eq("user_id", currentUser.id);
          if (startISO) query = query.gte("ended_at", startISO);
          return query;
        })(),
        (() => {
          let query = this.supabase
            .from("tasks")
            .select("duration_minutes, task_date, text")
            .eq("user_id", currentUser.id)
            .eq("done", true);
          if (startDate) query = query.gte("task_date", startDate);
          return query;
        })()
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const subjectMap = new Map();
      let totalMinutes = 0;

      (sessionsRes.data || []).forEach(session => {
        const subject = session.subject || "未分类";
        const mins = Number(session.duration_minutes || 0);
        subjectMap.set(subject, (subjectMap.get(subject) || 0) + mins);
        totalMinutes += mins;
      });

      (tasksRes.data || []).forEach(task => {
        const label = (task.text || "").trim() || "已完成任务";
        const mins = Number(task.duration_minutes || 0);
        subjectMap.set(label, (subjectMap.get(label) || 0) + mins);
        totalMinutes += mins;
      });

      const subjects = Array.from(subjectMap.entries())
        .map(([name, minutes]) => ({
          name,
          minutes,
          percent: totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0
        }))
        .sort((a, b) => b.minutes - a.minutes);

      return { success: true, subjects };
    } catch (err) {
      console.error("loadSubjectStats error:", err);
      return { success: false, subjects: [] };
    }
  }

  async loadUserSubjectBreakdown(userId, rankType = "daily") {
    if (!userId) {
      return { success: false, subjects: [], totalMinutes: 0 };
    }

    try {
      const viewName = rankType === "daily" ? "daily_subject_breakdown" : "subject_breakdown";
      const { data, error } = await this.supabase
        .from(viewName)
        .select("subject, minutes, percent")
        .eq("user_id", userId)
        .order("minutes", { ascending: false });
      if (error) throw error;

      const subjects = (data || []).map(row => ({
        name: row.subject || "未分类",
        minutes: Number(row.minutes || 0),
        percent: Number(row.percent || 0)
      }));
      const totalMinutes = subjects.reduce((sum, subject) => sum + subject.minutes, 0);

      return { success: true, subjects, totalMinutes };
    } catch (err) {
      console.error("loadUserSubjectBreakdown error:", err);
      return { success: false, subjects: [], totalMinutes: 0 };
    }
  }

  // 加载排行榜
  async loadLeaderboard(rankType = "daily") {
    try {
      const tableName = rankType === "daily" ? "daily_leaderboard" : "leaderboard";
      const { data, error } = await this.supabase.from(tableName).select("*").limit(100);

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (err) {
      console.error("loadLeaderboard error:", err);
      return { success: false, data: [] };
    }
  }

  // 加载历史记录
  async loadHistory() {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, data: [] };
    }

    try {
      const [sessionsRes, tasksRes] = await Promise.all([
        this.supabase
          .from("study_sessions")
          .select("duration_minutes, ended_at, subject")
          .eq("user_id", currentUser.id)
          .order("ended_at", { ascending: false })
          .limit(50),
        this.supabase
          .from("tasks")
          .select("duration_minutes, task_date, text, created_at")
          .eq("user_id", currentUser.id)
          .eq("done", true)
          .order("task_date", { ascending: false })
          .limit(50)
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const sessionRows = (sessionsRes.data || []).map(row => ({
        duration_minutes: row.duration_minutes,
        activity_at: row.ended_at,
        activity_date: null,
        subject: row.subject,
        activity_type: "session"
      }));

      const taskRows = (tasksRes.data || []).map(row => ({
        duration_minutes: row.duration_minutes,
        activity_at: row.created_at || `${row.task_date}T00:00:00+08:00`,
        activity_date: row.task_date,
        subject: (row.text || "").trim() || "已完成任务",
        activity_type: "task"
      }));

      const data = [...sessionRows, ...taskRows]
        .sort((a, b) => new Date(b.activity_at).getTime() - new Date(a.activity_at).getTime())
        .slice(0, 50);

      return { success: true, data };
    } catch (err) {
      console.error("loadHistory error:", err);
      return { success: false, data: [] };
    }
  }
}
