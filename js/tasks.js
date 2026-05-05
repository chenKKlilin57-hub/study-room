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
  async addTask(text, dateStr, durationMinutes, priority = "medium", parentId = null) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "请先登录。" };
    }
    if (!durationMinutes || durationMinutes <= 0) {
      return { success: false, message: "请输入任务时长（分钟）。" };
    }

    try {
      const { data, error } = await this.supabase.from("tasks").insert({
        user_id: currentUser.id,
        task_date: dateStr,
        text: text,
        done: false,
        duration_minutes: durationMinutes,
        priority: priority || "medium",
        parent_id: parentId
      }).select();

      if (error) throw error;

      // 如果是子任务，更新父任务进度
      if (parentId) {
        await this.updateParentProgress(parentId);
      }

      await this.loadTasksByDate(dateStr);
      return { success: true, data: data[0] };
    } catch (err) {
      console.error("addTask error:", err);
      return { success: false, message: "添加任务失败，请稍后重试。" };
    }
  }

  async syncTaskTimeEntry(task, done) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser || !task) return;

    const minutes = Number(task.duration_minutes || 0);
    const { error: deleteError } = await this.supabase
      .from("task_time_entries")
      .delete()
      .eq("task_id", task.id)
      .eq("user_id", currentUser.id);

    if (deleteError) throw deleteError;

    if (!done || minutes <= 0) {
      return;
    }

    const payload = {
      user_id: currentUser.id,
      task_id: task.id,
      task_date: task.task_date,
      duration_minutes: minutes
    };

    const { error: insertError } = await this.supabase
      .from("task_time_entries")
      .insert(payload);

    if (insertError) throw insertError;
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
    const tasks = (this.currentTasks || []).filter(t => !t.parent_id);
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

  // 获取任务的子任务
  async getSubtasks(parentId) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return [];

    try {
      const { data, error } = await this.supabase
        .from("tasks")
        .select("*")
        .eq("user_id", currentUser.id)
        .eq("parent_id", parentId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("getSubtasks error:", err);
      return [];
    }
  }

  // 更新父任务进度
  async updateParentProgress(parentId) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return;

    try {
      const subtasks = await this.getSubtasks(parentId);
      const subtaskCount = subtasks.length;
      const completedSubtaskCount = subtasks.filter(t => t.done).length;

      await this.supabase
        .from("tasks")
        .update({
          subtask_count: subtaskCount,
          completed_subtask_count: completedSubtaskCount
        })
        .eq("id", parentId)
        .eq("user_id", currentUser.id);
    } catch (err) {
      console.error("updateParentProgress error:", err);
    }
  }

  // 切换任务完成状态（更新版本，支持子任务）
  async toggleTaskDone(taskId, done) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "请先登录。" };
    }

    try {
      const { data: task, error: taskError } = await this.supabase
        .from("tasks")
        .select("parent_id, task_date, duration_minutes, done, user_id")
        .eq("id", taskId)
        .single();
      if (taskError) throw taskError;

      const { error } = await this.supabase
        .from("tasks")
        .update({ done })
        .eq("id", taskId)
        .eq("user_id", currentUser.id);

      if (error) throw error;

      try {
        await this.syncTaskTimeEntry({ ...task, id: taskId }, done);
      } catch (syncErr) {
        await this.supabase
          .from("tasks")
          .update({ done: task.done })
          .eq("id", taskId)
          .eq("user_id", currentUser.id);
        throw syncErr;
      }

      if (task && task.parent_id) {
        await this.updateParentProgress(task.parent_id);
      }

      await this.loadTasksByDate(this.selectedTaskDate);
      return { success: true };
    } catch (err) {
      console.error("toggleTaskDone error:", err);
      return { success: false, message: "更新任务失败，请稍后重试。" };
    }
  }

  // 编辑任务
  async editTask(taskId, text, durationMinutes, priority) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { success: false, message: "请先登录。" };
    if (!durationMinutes || durationMinutes <= 0) {
      return { success: false, message: "请输入有效时长。" };
    }

    try {
      const { data: updatedTask, error } = await this.supabase
        .from("tasks")
        .update({ text, duration_minutes: durationMinutes, priority })
        .eq("id", taskId)
        .eq("user_id", currentUser.id)
        .select("id, task_date, duration_minutes, done")
        .single();

      if (error) throw error;

      if (updatedTask && updatedTask.done) {
        await this.syncTaskTimeEntry(updatedTask, true);
      }

      await this.loadTasksByDate(this.selectedTaskDate);
      return { success: true };
    } catch (err) {
      console.error("editTask error:", err);
      return { success: false, message: "编辑任务失败，请稍后重试。" };
    }
  }

  // 临时移除任务（乐观UI，用于undo）
  removeTaskLocally(taskId) {
    this.currentTasks = this.currentTasks.filter(t => t.id !== taskId);
  }
}
