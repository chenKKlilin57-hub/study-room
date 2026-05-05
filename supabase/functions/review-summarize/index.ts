import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReviewDraft = {
  title: string;
  summary: string;
  highlights: string[];
  issues: string[];
  nextSteps: string[];
  mood: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanJsonText(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseDraft(text: string): ReviewDraft {
  const cleaned = cleanJsonText(text);
  const fallback: ReviewDraft = {
    title: "今日复盘",
    summary: cleaned.slice(0, 240),
    highlights: [],
    issues: [],
    nextSteps: [],
    mood: "",
  };

  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || fallback.title).trim().slice(0, 24) || fallback.title,
      summary: String(parsed.summary || fallback.summary).trim(),
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : [],
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : [],
      nextSteps: Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : Array.isArray(parsed.next_steps)
          ? parsed.next_steps.map((item: unknown) => String(item || "").trim()).filter(Boolean)
          : [],
      mood: String(parsed.mood || "").trim(),
    };
  } catch {
    return fallback;
  }
}

function extractResponsesText(data: any): string {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  if (Array.isArray(data.output)) {
    const pieces: string[] = [];
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (content && typeof content.text === "string") {
          pieces.push(content.text);
        }
      }
    }
    return pieces.join("\n").trim();
  }
  return "";
}

function buildPrompt(payload: any) {
  const reviewText = String(payload?.reviewText || "").trim();
  const date = String(payload?.date || "").trim();
  const displayName = String(payload?.displayName || "学习者").trim();
  const todayMinutes = Number(payload?.todayMinutes || 0);
  const dailyGoal = Number(payload?.dailyGoal || 240);
  const taskStats = payload?.taskStats || {};
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks.slice(0, 12) : [];

  return [
    "你是一个学习复盘助手，服务于自习室应用。",
    "请把用户的原始笔记整理成简洁、结构化的中文复盘。",
    "只输出合法 JSON，不要输出 markdown、不要输出代码块、不要加解释文字。",
    "JSON 必须包含这些字段：title, summary, highlights, issues, nextSteps, mood。",
    "字段要求：",
    "- title: 16 个汉字以内",
    "- summary: 1 到 3 句，尽量简洁",
    "- highlights: 1 到 3 条，写做得不错的地方",
    "- issues: 1 到 3 条，写卡点或拖延点",
    "- nextSteps: 1 到 3 条，写明天可以立刻执行的动作",
    "- mood: 一句话描述今天状态",
    "不要编造用户没有提到的具体学习内容；如果信息很少，就基于现有上下文做温和整理，并明确保持克制。",
    "",
    `日期：${date || "未知"}`,
    `用户：${displayName}`,
    `今日专注：${todayMinutes} 分钟`,
    `今日目标：${dailyGoal} 分钟`,
    `任务统计：${JSON.stringify(taskStats)}`,
    `当前任务：${JSON.stringify(tasks)}`,
    "",
    "原始笔记：",
    reviewText || "（空）",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, message: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const aiApiKey = Deno.env.get("XAI_API_KEY") || Deno.env.get("OPENAI_API_KEY");
    const baseUrl = Deno.env.get("XAI_BASE_URL") || "https://api-xai.ainaibahub.com";
    const model = Deno.env.get("OPENAI_MODEL") || Deno.env.get("XAI_MODEL") || "gpt-5.5";

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment variables are missing.");
    }
    if (!aiApiKey) {
      throw new Error("XAI_API_KEY is missing.");
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ success: false, message: "未登录或登录已过期。" }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const prompt = buildPrompt(payload);

    const aiResponse = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.2,
        max_output_tokens: 900,
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      throw new Error(`AI request failed: ${aiResponse.status} ${detail}`);
    }

    const aiData = await aiResponse.json();
    const outputText = extractResponsesText(aiData);
    if (!outputText) {
      throw new Error("AI did not return any text.");
    }

    const draft = parseDraft(outputText);
    return jsonResponse({
      success: true,
      data: draft,
    });
  } catch (error) {
    console.error("review-summarize error:", error);
    return jsonResponse(
      {
        success: false,
        message: error instanceof Error ? error.message : "AI service failed.",
      },
      500
    );
  }
});
