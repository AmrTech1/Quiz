/**
 * Quiz System - Sync Worker
 * ---------------------------------------------------------
 * دور هذا الملف الوحيد: حماية BOT_TOKEN وتنفيذ عمليات Telegram API
 * نيابة عن الموقع (الذي لا يعرف التوكن أبدًا).
 *
 * فكرة التخزين:
 *  - عند "الرفع" (push): نرسل بيانات النظام كملف JSON إلى المحادثة
 *    عبر sendDocument، ثم نقوم بتثبيته (pinChatMessage).
 *  - عند "الجلب" (pull): نقرأ getChat -> pinned_message -> نحمّل
 *    الملف المرفق بها (وهو دائمًا آخر نسخة تم رفعها).
 *
 * ميزة إضافية: كل نسخة سابقة تبقى موجودة كرسالة عادية في المحادثة،
 * فتحصل تلقائيًا على أرشيف/نسخ احتياطية سابقة بدون أي جهد إضافي.
 *
 * الإعداد:
 *   1) أنشئ Bot عبر @BotFather واحصل على BOT_TOKEN.
 *   2) أنشئ محادثة (قناة خاصة أو مجموعة) وأضف البوت إليها كمشرف
 *      (يحتاج صلاحية Pin Messages)، واحصل على CHAT_ID.
 *   3) اضبط المتغيرين كأسرار (Secrets) في Cloudflare، وليس في الكود:
 *        wrangler secret put BOT_TOKEN
 *        wrangler secret put CHAT_ID
 *   4) انشر الـ Worker: wrangler deploy
 *   5) ضع رابط الـ Worker في إعدادات الموقع (صفحة الإعدادات).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const BOT_TOKEN = env.BOT_TOKEN || "YOUR_BOT_TOKEN";
    const CHAT_ID = env.CHAT_ID || "YOUR_CHAT_ID";

    if (BOT_TOKEN === "YOUR_BOT_TOKEN" || CHAT_ID === "YOUR_CHAT_ID") {
      return json(
        { ok: false, error: "لم يتم ضبط BOT_TOKEN أو CHAT_ID على الخادم بعد." },
        500,
        cors
      );
    }

    const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
    const FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

    try {
      if (url.pathname === "/api/pull" && request.method === "GET") {
        const chatRes = await fetch(
          `${API}/getChat?chat_id=${encodeURIComponent(CHAT_ID)}`
        );
        const chatJson = await chatRes.json();
        if (!chatJson.ok) {
          return json(
            { ok: false, error: chatJson.description || "تعذر الاتصال بـ Telegram" },
            502,
            cors
          );
        }

        const pinned = chatJson.result.pinned_message;
        if (!pinned || !pinned.document) {
          // لا توجد بيانات مرفوعة بعد
          return json({ ok: true, data: emptyData() }, 200, cors);
        }

        const fileId = pinned.document.file_id;
        const fileRes = await fetch(`${API}/getFile?file_id=${fileId}`);
        const fileJson = await fileRes.json();
        if (!fileJson.ok) {
          return json({ ok: false, error: "تعذر جلب الملف من Telegram" }, 502, cors);
        }

        const filePath = fileJson.result.file_path;
        const dataRes = await fetch(`${FILE_API}/${filePath}`);
        const text = await dataRes.text();

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          return json({ ok: false, error: "بيانات Telegram تالفة" }, 502, cors);
        }

        return json({ ok: true, data }, 200, cors);
      }

      if (url.pathname === "/api/push" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ ok: false, error: "جسم الطلب غير صالح" }, 400, cors);
        }

        const dataObj = body && body.data ? body.data : emptyData();
        const dataStr = JSON.stringify(dataObj);

        const form = new FormData();
        form.append("chat_id", CHAT_ID);
        form.append(
          "caption",
          `Quiz System Backup - ${new Date().toISOString()}`
        );
        form.append(
          "document",
          new Blob([dataStr], { type: "application/json" }),
          "quiz-system-data.json"
        );

        const sendRes = await fetch(`${API}/sendDocument`, {
          method: "POST",
          body: form,
        });
        const sendJson = await sendRes.json();
        if (!sendJson.ok) {
          return json(
            { ok: false, error: sendJson.description || "فشل رفع البيانات" },
            502,
            cors
          );
        }

        const messageId = sendJson.result.message_id;
        const pinRes = await fetch(`${API}/pinChatMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            message_id: messageId,
            disable_notification: true,
          }),
        });
        const pinJson = await pinRes.json();
        if (!pinJson.ok) {
          return json(
            { ok: false, error: pinJson.description || "فشل تثبيت النسخة الجديدة" },
            502,
            cors
          );
        }

        return json({ ok: true, updatedAt: Date.now(), messageId }, 200, cors);
      }

      return json({ ok: false, error: "مسار غير موجود" }, 404, cors);
    } catch (err) {
      return json({ ok: false, error: err.message || "خطأ غير متوقع" }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function emptyData() {
  return {
    version: 1,
    updatedAt: 0,
    quizzes: [],
    attempts: [],
    settings: { theme: "dark" },
  };
}
