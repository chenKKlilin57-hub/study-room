-- 为 tasks 表添加 parent_id 字段支持子任务
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE;

-- 添加索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

-- 添加 subtask_count 和 completed_subtask_count 字段用于缓存进度
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtask_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_subtask_count INTEGER DEFAULT 0;
