// Supabase 配置文件
// 请将此文件复制为 config.js 并填入你的 Supabase 项目信息

export const SUPABASE_CONFIG = {
  // Supabase 项目 URL
  // 格式：https://your-project-id.supabase.co
  url: "https://smrhzgabbeqgamdafsrn.supabase.co",

  // Supabase 匿名公钥（Anon Key）
  // 这是公开的密钥，可以安全地在前端使用
  anonKey: "sb_publishable_iBTzbd8FJRXhA_if49EB4g_URc3HoYF"
};

// 应用配置
export const APP_CONFIG = {
  // 主题存储键
  THEME_KEY: "study_room_theme_final_v2",

  // 每日目标存储键
  GOAL_KEY: "study_room_daily_goal_v1",

  // 默认每日目标（分钟）
  DEFAULT_DAILY_GOAL: 240,

  // 默认专注时长（秒）
  DEFAULT_DURATION: 7200
};

export const AI_CONFIG = {
  // Supabase Edge Function 名称
  REVIEW_SUMMARY_FUNCTION: "review-summarize",

  // 默认模型，可在函数端覆盖
  REVIEW_SUMMARY_MODEL: "gpt-5.4-mini"
};
