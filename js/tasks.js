// 任务管理功能
export class TaskManager {
  constructor(supabase, auth) {
    this.supabase = supabase;
    this.auth = auth;
    this.currentTasks = [];
    this.selectedTaskDate = null;
  }

  setSelectedDate(date) {
    this.selectedTaskDate = date;
  }

  getSelectedDate() {
    return this.selectedTaskDate;
  }

  getCurrentTasks() {
    return this.currentTasks;
  }

  // 加载指定日期的任务
  async loadTasksByDate(dateStr) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      this.currentTasks = [];
      return { success: true, tasks: [] };
    }

    try {
      const { data, error } = await this.supabase
        .from("tasks")
        .select("id, text, done, task_date, created_at, duration_minutes, priority")
        .eq("user_id", currentUser.id)
        .eq("task_date", dateStr)
        .order("created_at", { ascending: false });

      if (error) throw error;
      this.currentTasks = data || [];
      return { success: true, tasks: this.currentTasks };
    } catch (err) {
      console.error("loadTasksByDate error:", err);
      this.currentTasks = [];
      return { success: false, message: "任务加载失败，请稍后重试。" };
    }
  }

  // 添加任务
  async addTask(text, dateStr, durationMinutes, priority = "medium") {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "请先登录。" };
    }
    if (!durationMinutes || durationMinutes <= 0) {
      return { success: false, message: "请输入任务时长（分钟）。" };
    }

    try {
      const { error } = await this.supabase.from("tasks").insert({
        user_id: currentUser.id,
        task_date: dateStr,
        text: text,
        done: false,
        duration_minutes: durationMinutes,
        priority: priority || "medium"
      });

      if (error) throw error;
      await this.loadTasksByDate(dateStr);
      return { success: true };
    } catch (err) {
      console.error("addTask error:", err);
      return { success: false, message: "添加任务失败，请稍后重试。" };
    }
  }

  // 切换任务完成状态
  async toggleTaskDone(taskId, done) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "请先登录。" };
    }

    try {
      const { error } = await this.supabase
        .from("tasks")
        .update({ done })
        .eq("id", taskId)
        .eq("user_id", currentUser.id);

      if (error) throw error;
      await this.loadTasksByDate(this.selectedTaskDate);
      return { success: true };
    } catch (err) {
      console.error("toggleTaskDone error:", err);
      return { success: false, message: "更新任务失败，请稍后重试。" };
    }
  }

  // 删除任务
  async deleteTask(taskId) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "请先登录。" };
    }

    try {
      const { error } = await this.supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("user_id", currentUser.id);

      if (error) throw error;
      await this.loadTasksByDate(this.selectedTaskDate);
      return { success: true };
    } catch (err) {
      console.error("deleteTask error:", err);
      return { success: false, message: "删除任务失败，请稍后重试。" };
    }
  }

  // 计算任务统计
  getTaskStats() {
    const tasks = this.currentTasks || [];
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    const totalMinutes = tasks.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);

    return {
      total,
      done,
      percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      totalMinutes,
      isOverload: totalMinutes > 360
    };
  }

  // 排序任务
  getSortedTasks() {
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    return [...this.currentTasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aPriority = priorityOrder[a.priority || "medium"];
      const bPriority = priorityOrder[b.priority || "medium"];
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
}
