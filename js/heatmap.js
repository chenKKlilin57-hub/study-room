// 热力图功能
export class Heatmap {
  constructor(supabase, auth) {
    this.supabase = supabase;
    this.auth = auth;
    this.heatmapDataMap = new Map();
    this.currentRange = 30;
    this.currentSubjectFilter = "全部";
  }

  setRange(range) {
    this.currentRange = range;
  }

  getRange() {
    return this.currentRange;
  }

  setSubjectFilter(subject) {
    this.currentSubjectFilter = subject;
  }

  getSubjectFilter() {
    return this.currentSubjectFilter;
  }

  // 获取热力图等级
  getHeatClass(minutes) {
    if (minutes === 0) return "heatmap-0";
    if (minutes <= 30) return "heatmap-1";
    if (minutes <= 60) return "heatmap-2";
    if (minutes <= 120) return "heatmap-3";
    if (minutes <= 180) return "heatmap-4";
    if (minutes <= 240) return "heatmap-5";
    if (minutes <= 360) return "heatmap-6";
    return "heatmap-7";
  }

  // 加载热力图数据
  async loadData(getLocalDateISO) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      this.heatmapDataMap.clear();
      return { success: false };
    }

    try {
      const offsetMs = 8 * 60 * 60 * 1000;
      const lookbackDays = Math.max(this.currentRange + 14, 45);
      const bj = new Date(Date.now() + offsetMs);
      const startUtcMs = Date.UTC(
        bj.getUTCFullYear(),
        bj.getUTCMonth(),
        bj.getUTCDate() - (lookbackDays - 1),
        0,
        0,
        0
      ) - offsetMs;
      const startISO = new Date(startUtcMs).toISOString();
      const startDate = getLocalDateISO(new Date(startUtcMs));

      const [sessionsRes, tasksRes] = await Promise.all([
        (() => {
          let query = this.supabase
            .from("study_sessions")
            .select("duration_minutes, ended_at, subject")
            .eq("user_id", currentUser.id)
            .gte("ended_at", startISO);
          if (this.currentSubjectFilter !== "全部" && this.currentSubjectFilter !== "任务补记") {
            query = query.eq("subject", this.currentSubjectFilter);
          }
          return query;
        })(),
        (() => {
          let query = this.supabase
            .from("tasks")
            .select("duration_minutes, task_date")
            .eq("user_id", currentUser.id)
            .eq("done", true)
            .gte("task_date", startDate);
          if (this.currentSubjectFilter !== "全部" && this.currentSubjectFilter !== "任务补记") {
            query = query.eq("id", -1);
          }
          return query;
        })()
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (tasksRes.error) throw tasksRes.error;

      this.heatmapDataMap.clear();

      (sessionsRes.data || []).forEach(session => {
        if (!session.ended_at) return;
        const dateStr = getLocalDateISO(new Date(session.ended_at));
        const mins = Number(session.duration_minutes || 0);
        this.heatmapDataMap.set(dateStr, (this.heatmapDataMap.get(dateStr) || 0) + mins);
      });

      (tasksRes.data || []).forEach(task => {
        const mins = Number(task.duration_minutes || 0);
        const dateStr = task.task_date;
        this.heatmapDataMap.set(dateStr, (this.heatmapDataMap.get(dateStr) || 0) + mins);
      });

      return { success: true };
    } catch (err) {
      console.error("loadHeatmapData error:", err);
      return { success: false };
    }
  }

  // 生成热力图数据
  generateHeatmapData(getLocalDateISO) {
    const today = new Date();
    const endDate = new Date(today);
    const startDate = new Date(today);

    startDate.setDate(startDate.getDate() - (this.currentRange - 1));

    const alignedStart = new Date(startDate);
    alignedStart.setDate(alignedStart.getDate() - alignedStart.getDay());

    const alignedEnd = new Date(endDate);
    alignedEnd.setDate(alignedEnd.getDate() + (6 - alignedEnd.getDay()));

    const days = [];
    const months = [];
    let totalMinutes = 0;
    let current = new Date(alignedStart);
    let lastMonth = -1;

    while (current <= alignedEnd) {
      const weekStart = new Date(current);

      if (weekStart <= endDate) {
        const month = weekStart.getMonth();
        months.push({
          text: month !== lastMonth ? `${month + 1}月` : "",
          show: month !== lastMonth
        });
        lastMonth = month;
      }

      for (let day = 0; day < 7; day++) {
        const cellDate = new Date(weekStart);
        cellDate.setDate(weekStart.getDate() + day);

        const dateStr = getLocalDateISO(cellDate);
        const minutes = this.heatmapDataMap.get(dateStr) || 0;

        if (cellDate >= startDate && cellDate <= endDate) {
          totalMinutes += minutes;
        }

        const isToday = dateStr === getLocalDateISO(today);
        const isInRange = cellDate >= startDate && cellDate <= endDate;

        days.push({
          date: dateStr,
          minutes,
          heatClass: this.getHeatClass(minutes),
          isToday,
          isInRange,
          opacity: isInRange ? 1 : 0.18
        });
      }

      current.setDate(current.getDate() + 7);
    }

    return { days, months, totalMinutes };
  }

  // 加载科目列表
  async loadSubjectList() {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { success: false, subjects: [] };

    try {
      const [sessionsRes, tasksRes] = await Promise.all([
        this.supabase
          .from("study_sessions")
          .select("subject")
          .eq("user_id", currentUser.id)
          .not("subject", "is", null),
        this.supabase
          .from("tasks")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("done", true)
          .limit(1)
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const subjects = [
        ...new Set(
          (sessionsRes.data || [])
            .map(s => s.subject)
            .filter(s => s && s !== "未分类")
        )
      ];

      if ((tasksRes.data || []).length > 0) {
        subjects.push("任务补记");
      }

      return { success: true, subjects };
    } catch (err) {
      console.error("loadSubjectList error:", err);
      return { success: false, subjects: [] };
    }
  }

  // 清空数据
  clear() {
    this.heatmapDataMap.clear();
  }
}
