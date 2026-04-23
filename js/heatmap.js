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

      let query = this.supabase
        .from("study_sessions")
        .select("duration_minutes, ended_at, subject")
        .eq("user_id", currentUser.id)
        .gte("ended_at", startISO);

      if (this.currentSubjectFilter !== "全部") {
        query = query.eq("subject", this.currentSubjectFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      this.heatmapDataMap.clear();

      (data || []).forEach(session => {
        if (!session.ended_at) return;
        const dateStr = getLocalDateISO(new Date(session.ended_at));
        const mins = Number(session.duration_minutes || 0);
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
      const { data, error } = await this.supabase
        .from("study_sessions")
        .select("subject")
        .eq("user_id", currentUser.id)
        .not("subject", "is", null);

      if (error) throw error;

      const subjects = [
        ...new Set(
          (data || [])
            .map(s => s.subject)
            .filter(s => s && s !== "未分类")
        )
      ];

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
