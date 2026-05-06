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

function extractChatText(data: any): string {
  if (!data) return "";
  const choices = data.choices;
  if (!Array.isArray(choices) || !choices.length) return "";
  const msg = choices[0].message;
  if (msg && typeof msg.content === "string") return msg.content.trim();
  return "";
}

function buildMessages(payload: any, action: string) {
  const reviewText = String(payload?.reviewText || "").trim();
  const date = String(payload?.date || "").trim();
  const displayName = String(payload?.displayName || "学习者").trim();
  const todayMinutes = Number(payload?.todayMinutes || 0);
  const dailyGoal = Number(payload?.dailyGoal || 240);
  const taskStats = payload?.taskStats || {};
  const completedTasks = Array.isArray(payload?.completedTasks) ? payload.completedTasks : [];
  const pendingTasks = Array.isArray(payload?.pendingTasks) ? payload.pendingTasks : [];

  if (action === "refine") {
    const prevOutput = String(payload?.prevOutput || "").trim();
    const refineInstruction = String(payload?.refineInstruction || "请精简").trim();

    return {
      system: "你是一个学习复盘助手。请根据用户的补充要求，修改之前生成的结构化复盘。只输出合法 JSON，字段仍然是 title, summary, highlights, issues, nextSteps, mood。",
      user: `之前的复盘：\n${prevOutput}\n\n修改要求：${refineInstruction}`
    };
  }

  const system = [
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
  ].join("\n");

  const doneLines = completedTasks.length
    ? completedTasks.map((t: any) => `- ${t.text} (${t.durationMinutes}分钟)`).join("\n")
    : "（无）";
  const pendingLines = pendingTasks.length
    ? pendingTasks.map((t: any) => `- ${t.text} (${t.durationMinutes}分钟)`).join("\n")
    : "（无）";

  const user = [
    `日期：${date || "未知"}`,
    `用户：${displayName}`,
    `今日专注：${todayMinutes} 分钟 / 目标 ${dailyGoal} 分钟（达成 ${dailyGoal > 0 ? Math.round(todayMinutes / dailyGoal * 100) : 0}%）`,
    `任务统计：${JSON.stringify(taskStats)}`,
    "",
    "已完成任务：",
    doneLines,
    "",
    "未完成任务：",
    pendingLines,
    "",
    "原始笔记：",
    reviewText || "（空）",
  ].join("\n");

  return { system, user };
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
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    const baseUrl = Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
    const model = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat";

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment variables are missing.");
    }
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is missing. Set it in Supabase Edge Function environment variables.");
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
    const action = String(payload?.action || "generate").trim();
    const { system, user } = buildMessages(payload, action);

    const aiResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      throw new Error(`DeepSeek API error: ${aiResponse.status} ${detail}`);
    }

    const aiData = await aiResponse.json();
    const outputText = extractChatText(aiData);
    if (!outputText) {
      throw new Error("DeepSeek returned empty response.");
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
