// 认证相关功能
export class Auth {
  constructor(supabase) {
    this.supabase = supabase;
    this.currentUser = null;
    this.authLoading = false;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  isLoading() {
    return this.authLoading;
  }

  // 注册
  async signup(username, email, password) {
    if (this.authLoading) return { success: false, message: "请稍候..." };
    if (!username || !email || !password) {
      return { success: false, message: "请填完整信息。" };
    }

    this.authLoading = true;
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });

      if (error) throw error;

      if (data.user) {
        await this.supabase.from("profiles").upsert({
          id: data.user.id,
          username
        });
      }

      return { success: true, message: "注册成功。请去邮箱确认。" };
    } catch (err) {
      return { success: false, message: "注册失败：" + err.message };
    } finally {
      this.authLoading = false;
    }
  }

  // 登录
  async login(email, password) {
    if (this.authLoading) return { success: false, message: "请稍候..." };
    if (!email || !password) {
      return { success: false, message: "请填写邮箱和密码。" };
    }

    this.authLoading = true;
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      this.currentUser = data.user || null;
      return { success: true, user: this.currentUser };
    } catch (err) {
      console.error("login error:", err);
      return { success: false, message: "登录失败：" + err.message };
    } finally {
      this.authLoading = false;
    }
  }

  // 登出
  async logout() {
    await this.supabase.auth.signOut();
    this.currentUser = null;
  }

  // 确保用户资料存在
  async ensureProfile() {
    if (!this.currentUser) return;
    try {
      const fallbackUsername = (
        this.currentUser.user_metadata?.username ||
        this.currentUser.email?.split("@")[0] ||
        "学习者"
      ).slice(0, 30);

      const { data, error } = await this.supabase
        .from("profiles")
        .select("id, username")
        .eq("id", this.currentUser.id)
        .maybeSingle();

      if (!data) {
        await this.supabase.from("profiles").upsert({
          id: this.currentUser.id,
          username: fallbackUsername
        });
      } else if (!data.username) {
        await this.supabase.from("profiles").upsert({
          id: this.currentUser.id,
          username: fallbackUsername
        });
      }
    } catch (err) {
      console.error("ensureProfile error:", err);
    }
  }

  // 获取当前会话
  async getSession() {
    try {
      const { data, error } = await this.supabase.auth.getUser();
      if (error) throw error;
      this.currentUser = data.user || null;
      return { success: true, user: this.currentUser };
    } catch (err) {
      console.error("getSession error:", err);
      return { success: false, message: err.message };
    }
  }

  // 签到相关
  async loadCheckinInfo() {
    if (!this.currentUser) return null;
    try {
      const { data, error } = await this.supabase
        .from("profiles")
        .select("last_checkin_date, consecutive_days")
        .eq("id", this.currentUser.id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("加载签到信息失败:", err);
      return null;
    }
  }

  async checkin(todayMinutes, getLocalDateISO) {
    if (!this.currentUser || this.authLoading) {
      return { success: false, message: "请先登录" };
    }

    if (todayMinutes < 30) {
      return {
        success: false,
        message: `今日专注（${todayMinutes}m）未达 30 分钟门槛，无法签到。先去完成一个番茄钟吧！`
      };
    }

    this.authLoading = true;
    try {
      const todayISO = getLocalDateISO();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayISO = getLocalDateISO(yesterday);

      const { data: profile } = await this.supabase
        .from("profiles")
        .select("last_checkin_date, consecutive_days")
        .eq("id", this.currentUser.id)
        .single();

      let newStreak = 1;
      let message = "";

      if (profile.last_checkin_date === yesterdayISO) {
        newStreak = (profile.consecutive_days || 0) + 1;
      } else if (profile.last_checkin_date === todayISO) {
        return { success: false, message: "今天已经签到过啦！" };
      } else {
        if (profile.consecutive_days > 1) {
          message = "很遗憾，昨天断签了。今天的专注是从头再来的第 1 天 🔁";
        }
      }

      const { error } = await this.supabase
        .from("profiles")
        .update({
          last_checkin_date: todayISO,
          consecutive_days: newStreak
        })
        .eq("id", this.currentUser.id);

      if (error) throw error;

      if (!message) {
        message =
          newStreak > 1
            ? `签到成功！稳扎稳打，已连续专注 ${newStreak} 天 🔥`
            : "签到成功！今天是新的开始 ✅";
      }

      return { success: true, message, streak: newStreak };
    } catch (err) {
      console.error("签到失败:", err);
      return { success: false, message: "签到失败，请稍后重试。" };
    } finally {
      this.authLoading = false;
    }
  }
}
