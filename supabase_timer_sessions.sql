-- 创建 timer_sessions 表用于存储计时状态
CREATE TABLE IF NOT EXISTS timer_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  timer_mode TEXT NOT NULL,
  is_free_mode BOOLEAN DEFAULT false,
  elapsed_in_free_mode INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_timer_sessions_user_id ON timer_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_timer_sessions_updated_at ON timer_sessions(updated_at);

-- 启用行级安全策略
ALTER TABLE timer_sessions ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的计时会话
CREATE POLICY "Users can view own timer sessions"
  ON timer_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own timer sessions"
  ON timer_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own timer sessions"
  ON timer_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own timer sessions"
  ON timer_sessions FOR DELETE
  USING (auth.uid() = user_id);
