/* SyncManager — يتعامل مع Worker (وليس Telegram مباشرة) لحماية BOT_TOKEN */
const SyncManager = (() => {
  let apiBase = localStorage.getItem("worker_url") || "";
  let syncing = false;
  const listeners = [];

  function setWorkerUrl(url) {
    apiBase = (url || "").trim().replace(/\/$/, "");
    localStorage.setItem("worker_url", apiBase);
  }
  function getWorkerUrl() {
    return apiBase;
  }
  function onStatus(cb) {
    listeners.push(cb);
  }
  function emit(status, extra) {
    listeners.forEach((cb) => {
      try {
        cb(status, extra);
      } catch (e) {}
    });
  }

  async function pullRaw() {
    if (!apiBase) throw new Error("لم يتم ضبط رابط الخادم الوسيط (Worker) في الإعدادات");
    const res = await fetch(apiBase + "/api/pull");
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "فشل الجلب من Telegram");
    return j.data;
  }

  async function pushRaw(data) {
    if (!apiBase) throw new Error("لم يتم ضبط رابط الخادم الوسيط (Worker) في الإعدادات");
    const res = await fetch(apiBase + "/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "فشل الرفع إلى Telegram");
    return j;
  }

  // مزامنة كاملة: يجلب من Telegram، يقارن بالنسخة المحلية، يعتمد الأحدث (updatedAt) ويرفع إذا احتجنا
  async function syncNow() {
    if (syncing) return DataStore.getData();
    syncing = true;
    emit("syncing");
    try {
      const local = await DataStore.getData();
      const remote = await pullRaw();

      let merged;
      if (!remote || (remote.updatedAt || 0) <= (local.updatedAt || 0)) {
        // المحلي مساوٍ أو أحدث — اعتمده وارفعه إذا كان لدينا تغييرات لم تُرفع
        merged = local;
        const meta = await DataStore.getMeta();
        if (meta.dirty || (local.updatedAt || 0) > (remote ? remote.updatedAt || 0 : 0)) {
          if (local.quizzes.length || local.attempts.length) {
            await pushRaw(local);
          }
        }
      } else {
        // النسخة البعيدة أحدث (تم التعديل من جهاز آخر) — اعتمدها
        merged = remote;
      }

      await DataStore.setData(merged);
      await DataStore.setMeta({ lastSync: Date.now(), dirty: false });
      emit("success", merged);
      return merged;
    } catch (err) {
      emit("error", err.message);
      throw err;
    } finally {
      syncing = false;
    }
  }

  // يُستخدم بعد أي تعديل محلي (إنشاء/تعديل اختبار، تسليم محاولة...الخ)
  async function saveAndPush(data) {
    data.updatedAt = Date.now();
    data.version = (data.version || 1) + 1;
    await DataStore.setData(data);

    if (navigator.onLine && apiBase) {
      try {
        emit("syncing");
        await pushRaw(data);
        await DataStore.setMeta({ lastSync: Date.now(), dirty: false });
        emit("success", data);
      } catch (err) {
        const meta = await DataStore.getMeta();
        await DataStore.setMeta({ lastSync: meta.lastSync, dirty: true });
        emit("error", err.message);
      }
    } else {
      const meta = await DataStore.getMeta();
      await DataStore.setMeta({ lastSync: meta.lastSync, dirty: true });
      emit("offline");
    }
    return data;
  }

  window.addEventListener("online", async () => {
    emit("online");
    const meta = await DataStore.getMeta();
    if (meta.dirty && apiBase) {
      try {
        const data = await DataStore.getData();
        await pushRaw(data);
        await DataStore.setMeta({ lastSync: Date.now(), dirty: false });
        emit("success", data);
      } catch (e) {
        emit("error", e.message);
      }
    }
  });
  window.addEventListener("offline", () => emit("offline"));

  return { setWorkerUrl, getWorkerUrl, pullRaw, pushRaw, syncNow, saveAndPush, onStatus };
})();
