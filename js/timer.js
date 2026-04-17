// 计时器核心功能
export class Timer {
  constructor(supabase, auth) {
    this.supabase = supabase;
    this.auth = auth;
    this.timer = null;
    this.remaining = 7200;
    this.selectedDuration = 7200;
    this.startedAt = null;
    this.timerMode = "countdown"; // "countdown" 或 "countup"
    this.isFreeMode = false; // 专注计时模式（无限制）
    this.elapsedInFreeMode = 0; // 专注计时模式下的累计时间
    this.activeSessionId = null; // 当前活动的计时会话ID
  }

  // 保存计时状态到数据库
  async saveTimerState() {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    const state = {
      user_id: user.id,
      started_at: new Date(this.startedAt).toISOString(),
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
    return this.timer !== null;
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

  // 开始计时
  async start(onTick, onComplete) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser || this.timer) return false;

    this.startedAt = Date.now();

    // 保存计时状态到数据库
    await this.saveTimerState();

    this.timer = setInterval(async () => {
      if (this.isFreeMode) {
        this.elapsedInFreeMode += 1;
        if (onTick) onTick();
      } else {
        this.remaining -= 1;
        if (onTick) onTick();

        if (this.remaining <= 0) {
          this.stop();
          const minutes = Math.floor(this.selectedDuration / 60);
          if (onComplete) await onComplete(minutes);
          await this.clearTimerState();
          this.reset(false);
        }
      }

      // 每10秒更新一次数据库状态
      if ((this.isFreeMode ? this.elapsedInFreeMode : this.selectedDuration - this.remaining) % 10 === 0) {
        await this.saveTimerState();
      }
    }, 1000);

    return true;
  }

  // 暂停计时
  async pause() {
    if (this.timer) {
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
    if (this.timer) {
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
    this.timerMode = "countdown";
    this.isFreeMode = false;
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

    try {
      const payload = {
        user_id: currentUser.id,
        duration_minutes: minutes,
        subject: subject,
        started_at: this.startedAt ? new Date(this.startedAt).toISOString() : null,
        ended_at: new Date().toISOString()
      };

      const { error } = await this.supabase.from("study_sessions").insert(payload);
      if (error) throw error;

      const message = `已记录 ${minutes} 分钟学习时间${
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
      const { data, error } = await this.supabase
        .from("study_sessions")
        .select("duration_minutes, created_at")
        .eq("user_id", currentUser.id);

      if (error) throw error;

      const total = data.reduce((s, x) => s + Number(x.duration_minutes || 0), 0);
      const todayISO = getLocalDateISO();
      const today = data
        .filter(x => x.created_at && getLocalDateISO(new Date(x.created_at)) === todayISO)
        .reduce((s, x) => s + Number(x.duration_minutes || 0), 0);

      return {
        success: true,
        today,
        total,
        sessionCount: data.length
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
