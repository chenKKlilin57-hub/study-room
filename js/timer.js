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
  }

  // 保存计时状态到数据库
  async saveTimerState() {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    const state = {
      user_id: user.id,
      started_at: new Date().toISOString(),
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
      .single();

    if (error || !data) return null;

    // 检查会话是否在最近24小时内
    const updatedAt = new Date(data.updated_at).getTime();
    const now = Date.now();
    if (now - updatedAt > 24 * 60 * 60 * 1000) {
      // 超过24小时，清除旧会话
      await this.clearTimerState();
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

    this.timer = setInterval(async () => {
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
        }
      }

      // 每10秒更新一次数据库状态
      if ((this.isFreeMode ? this.elapsedInFreeMode : this.selectedDuration - this.remaining) % 10 === 0) {
        await this.saveTimerState();
      }
    }, 1000);

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
      clearInterval(this.timer);
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
      clearInterval(this.timer);
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
      const todayISO = getLocalDateISO();
      const todayLocalStart = new Date(todayISO + "T00:00:00").toISOString();

      const [todayRes, totalRes] = await Promise.all([
        this.supabase
          .from("study_sessions")
          .select("duration_minutes")
          .eq("user_id", currentUser.id)
          .gte("created_at", todayLocalStart),
        this.supabase
          .from("study_sessions")
          .select("duration_minutes, created_at", { count: "exact" })
          .eq("user_id", currentUser.id)
      ]);

      if (todayRes.error) throw todayRes.error;
      if (totalRes.error) throw totalRes.error;

      const today = (todayRes.data || []).reduce((s, x) => s + Number(x.duration_minutes || 0), 0);
      const total = (totalRes.data || []).reduce((s, x) => s + Number(x.duration_minutes || 0), 0);

      return {
        success: true,
        today,
        total,
        sessionCount: totalRes.count || 0
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
      const now = new Date();
      let startDate = null;

      if (range === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (range === "week") {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
      } else if (range === "month") {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
      }

      let query = this.supabase
        .from("study_sessions")
        .select("duration_minutes, subject")
        .eq("user_id", currentUser.id);

      if (startDate) {
        query = query.gte("created_at", startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const subjectMap = new Map();
      let totalMinutes = 0;

      (data || []).forEach(session => {
        const subject = session.subject || "未分类";
        const mins = Number(session.duration_minutes || 0);
        subjectMap.set(subject, (subjectMap.get(subject) || 0) + mins);
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
      let query = this.supabase
        .from("study_sessions")
        .select("duration_minutes, subject, created_at")
        .eq("user_id", userId);

      if (rankType === "daily") {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte("created_at", startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const subjectMap = new Map();
      let totalMinutes = 0;

      (data || []).forEach(session => {
        const subject = session.subject || "未分类";
        const mins = Number(session.duration_minutes || 0);
        subjectMap.set(subject, (subjectMap.get(subject) || 0) + mins);
        totalMinutes += mins;
      });

      const subjects = Array.from(subjectMap.entries())
        .map(([name, minutes]) => ({
          name,
          minutes,
          percent: totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0
        }))
        .sort((a, b) => b.minutes - a.minutes);

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
      const { data, error } = await this.supabase
        .from("study_sessions")
        .select("duration_minutes, created_at, subject")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (err) {
      console.error("loadHistory error:", err);
      return { success: false, data: [] };
    }
  }
}
