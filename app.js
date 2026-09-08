/* ============================================================
   نظام الاختبارات الإلكترونية — التطبيق الرئيسي
   ============================================================ */

const ADMIN_PASSWORD = "@Amr0109";
const QUESTION_TYPES = {
  single: "اختيار من متعدد (إجابة واحدة)",
  multi: "اختيار متعدد (أكثر من إجابة)",
  boolean: "صح وخطأ",
  fill: "أكمل الفراغ",
  essay: "سؤال مقالي",
};

let STATE = {
  data: null,
  timerInterval: null,
};

const root = () => document.getElementById("app");

/* ---------------- تهيئة ---------------- */
async function boot() {
  STATE.data = await DataStore.getData();
  applyTheme(STATE.data.settings.theme || "dark");

  SyncManager.onStatus(renderSyncBadge);
  window.addEventListener("hashchange", route);
  window.addEventListener("online", renderSyncBadge);
  window.addEventListener("offline", renderSyncBadge);

  if (!location.hash) location.hash = "#/";
  route();

  // مزامنة تلقائية عند فتح الموقع إن كان هناك رابط Worker مضبوط
  if (SyncManager.getWorkerUrl() && navigator.onLine) {
    try {
      STATE.data = await SyncManager.syncNow();
      if (location.hash === "#/" ) route();
    } catch (e) {
      /* صامت عند الفشل الأول */
    }
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

async function persist() {
  STATE.data = await SyncManager.saveAndPush(STATE.data);
}

/* ---------------- التوجيه (Router) ---------------- */
function route() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);

  if (parts.length === 0) return renderHome();
  if (parts[0] === "result") return renderResultLookup();
  if (parts[0] === "take" && parts[1]) return renderTakeIntro(parts[1]);
  if (parts[0] === "exam" && parts[1]) return renderExam(parts[1]);
  if (parts[0] === "submitted" && parts[1]) return renderSubmitted(parts[1]);
  if (parts[0] === "admin") {
    if (sessionStorage.getItem("is_admin") !== "1") return renderHome();
    return renderAdmin(parts.slice(1));
  }
  renderHome();
}

/* ============================================================
   الصفحة الرئيسية
   ============================================================ */
function renderHome() {
  root().innerHTML = `
    <div class="center-page">
      <div class="brand">
        <div class="brand-badge">📘</div>
        <h1>نظام الاختبارات الإلكترونية</h1>
        <p class="muted">أدخل كود الاختبار للبدء</p>
      </div>
      <div class="card auth-card">
        <input id="code-input" class="input" placeholder="كود الاختبار" autocomplete="off" />
        <button id="enter-btn" class="btn btn-primary block">دخول</button>
        <a href="#/result" class="link-btn">عرض النتيجة بكود النتيجة</a>
      </div>
    </div>`;

  const input = document.getElementById("code-input");
  const go = async () => {
    const val = input.value.trim();
    if (!val) return;
    if (val === ADMIN_PASSWORD) {
      sessionStorage.setItem("is_admin", "1");
      location.hash = "#/admin";
      return;
    }
    const quiz = STATE.data.quizzes.find(
      (q) => q.code.toLowerCase() === val.toLowerCase()
    );
    if (!quiz) return toast("كود الاختبار غير صحيح", "error");
    if (quiz.status !== "open") return toast("هذا الاختبار مغلق حاليًا", "error");
    location.hash = "#/take/" + quiz.code;
  };
  document.getElementById("enter-btn").addEventListener("click", go);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
  input.focus();
}

/* ============================================================
   بحث عن النتيجة (بالكود فقط)
   ============================================================ */
function renderResultLookup() {
  root().innerHTML = `
    <div class="center-page">
      <div class="brand">
        <div class="brand-badge">🏁</div>
        <h1>عرض النتيجة</h1>
        <p class="muted">أدخل كود النتيجة الذي حصلت عليه بعد تسليم الاختبار</p>
      </div>
      <div class="card auth-card">
        <input id="rc-input" class="input" placeholder="مثال: RES-8K4P-29XM" autocomplete="off" />
        <button id="rc-btn" class="btn btn-primary block">عرض النتيجة</button>
        <a href="#/" class="link-btn">رجوع للصفحة الرئيسية</a>
      </div>
      <div id="rc-result"></div>
    </div>`;

  const show = () => {
    const code = document.getElementById("rc-input").value.trim();
    if (!code) return;
    const attempt = STATE.data.attempts.find(
      (a) => a.resultCode.toLowerCase() === code.toLowerCase()
    );
    const box = document.getElementById("rc-result");
    if (!attempt) {
      box.innerHTML = `<div class="card error-box">كود النتيجة غير صحيح</div>`;
      return;
    }
    box.innerHTML = renderResultCard(attempt);
  };
  document.getElementById("rc-btn").addEventListener("click", show);
  document.getElementById("rc-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") show();
  });
}

function renderResultCard(attempt) {
  const quiz = STATE.data.quizzes.find((q) => q.id === attempt.quizId);
  if (attempt.status === "pending_review") {
    return `
      <div class="card result-card">
        <div class="badge badge-warning">قيد التصحيح</div>
        <h2>${esc(attempt.quizTitle)}</h2>
        <p class="muted">لا تزال هناك أسئلة مقالية بانتظار تصحيح المدرّس. استخدم نفس الكود لاحقًا لرؤية النتيجة النهائية.</p>
      </div>`;
  }
  const percentage = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
  const passMark = quiz ? quiz.passMark : 50;
  const passed = percentage >= passMark;
  let detailsHtml = "";
  if (!quiz || quiz.showCorrectAnswers) {
    detailsHtml = attempt.questionsSnapshot
      .map((q, i) => {
        const ans = attempt.answers[q.id];
        const grade = attempt.grading[q.id];
        return `<div class="qa-review">
          <div class="qa-review-head">
            <span>سؤال ${i + 1}</span>
            <span class="badge ${grade ? (grade.score >= q.points ? "badge-success" : "badge-danger") : ""}">${q.points} نقطة</span>
          </div>
          <div>${esc(q.text)}</div>
          <div class="muted small">إجابتك: ${esc(formatAnswer(q, ans))}</div>
          ${q.type === "essay" && grade ? `<div class="muted small">الدرجة: ${grade.score} / ${q.points} ${grade.comment ? "— " + esc(grade.comment) : ""}</div>` : ""}
        </div>`;
      })
      .join("");
  }
  return `
    <div class="card result-card">
      <div class="badge ${passed ? "badge-success" : "badge-danger"}">${passed ? "ناجح" : "راسب"}</div>
      <h2>${esc(attempt.quizTitle)}</h2>
      <p class="muted">${esc(attempt.studentName)}</p>
      <div class="score-big">${attempt.score} / ${attempt.maxScore}</div>
      <div class="progress"><div class="progress-fill" style="width:${percentage}%"></div></div>
      <p>${percentage}% — الحد الأدنى للنجاح ${passMark}%</p>
      <p class="muted small">وقت التسليم: ${fmtDate(attempt.submittedAt)}</p>
      ${detailsHtml ? `<hr/><div class="qa-list">${detailsHtml}</div>` : ""}
    </div>`;
}

function formatAnswer(q, ans) {
  if (ans === undefined || ans === null || ans === "") return "لم تتم الإجابة";
  if (q.type === "single" || q.type === "boolean") {
    const opt = (q.options || []).find((o) => o.id === ans);
    return opt ? opt.text : String(ans);
  }
  if (q.type === "multi") {
    const ids = Array.isArray(ans) ? ans : [];
    return (q.options || [])
      .filter((o) => ids.includes(o.id))
      .map((o) => o.text)
      .join("، ") || "لم تتم الإجابة";
  }
  return String(ans);
}

/* ============================================================
   دخول الطالب للاختبار
   ============================================================ */
function renderTakeIntro(code) {
  const quiz = STATE.data.quizzes.find((q) => q.code.toLowerCase() === code.toLowerCase());
  if (!quiz || quiz.status !== "open") {
    root().innerHTML = `<div class="center-page"><div class="card error-box">الاختبار غير متاح</div><a href="#/" class="link-btn">رجوع</a></div>`;
    return;
  }
  root().innerHTML = `
    <div class="center-page">
      <div class="card quiz-intro">
        <h2>${esc(quiz.title)}</h2>
        <p class="muted">${esc(quiz.description || "")}</p>
        <div class="meta-row">
          <span class="badge">المادة: ${esc(quiz.subject || "-")}</span>
          <span class="badge">الصف: ${esc(quiz.grade || "-")}</span>
          <span class="badge">${quiz.questions.length} سؤال</span>
          ${quiz.duration ? `<span class="badge">${quiz.duration} دقيقة</span>` : `<span class="badge">بدون وقت محدد</span>`}
        </div>
        <label class="field-label">اكتب اسمك</label>
        <input id="student-name" class="input" placeholder="الاسم الكامل" />
        <button id="start-btn" class="btn btn-primary block">ابدأ الاختبار</button>
      </div>
    </div>`;

  document.getElementById("start-btn").addEventListener("click", async () => {
    const name = document.getElementById("student-name").value.trim();
    if (!name) return toast("الاسم مطلوب", "error");

    if (!quiz.allowRetake) {
      const already = STATE.data.attempts.find(
        (a) => a.quizId === quiz.id && a.studentName.trim().toLowerCase() === name.toLowerCase()
      );
      if (already) return toast("لقد قمت بحل هذا الاختبار مسبقًا ولا يُسمح بالإعادة", "error");
    }

    const attempt = {
      id: uid(),
      quizId: quiz.id,
      quizTitle: quiz.title,
      resultCode: genResultCode(),
      studentName: name,
      questionsSnapshot: JSON.parse(JSON.stringify(quiz.questions)),
      answers: {},
      score: 0,
      maxScore: quiz.questions.reduce((s, q) => s + (q.points || 0), 0),
      status: "in_progress",
      grading: {},
      startedAt: Date.now(),
      submittedAt: null,
      durationMinutes: quiz.duration || 0,
    };
    await DataStore.setInProgress(attempt.id, attempt);
    location.hash = "#/exam/" + attempt.id;
  });
}

/* ============================================================
   شاشة الاختبار
   ============================================================ */
let EXAM = { attempt: null, quiz: null, currentIndex: 0 };

async function renderExam(attemptId) {
  const attempt = await DataStore.getInProgress(attemptId);
  if (!attempt) {
    root().innerHTML = `<div class="center-page"><div class="card error-box">لا يمكن العثور على هذه المحاولة (ربما انتهت أو تم تسليمها)</div><a href="#/" class="link-btn">رجوع</a></div>`;
    return;
  }
  const quiz = STATE.data.quizzes.find((q) => q.id === attempt.quizId);
  EXAM = { attempt, quiz, currentIndex: 0 };
  drawExam();
  startTimer();
}

function drawExam() {
  const { attempt, currentIndex } = EXAM;
  const questions = attempt.questionsSnapshot;
  const q = questions[currentIndex];
  const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);

  root().innerHTML = `
    <div class="exam-page">
      <div class="exam-header card">
        <div>
          <strong>${esc(attempt.quizTitle)}</strong>
          <div class="muted small">${esc(attempt.studentName)}</div>
        </div>
        <div id="timer-box" class="timer-box"></div>
      </div>
      <div class="progress"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <div class="muted small center-text">سؤال ${currentIndex + 1} من ${questions.length}</div>
      <div class="card question-card" id="question-card"></div>
      <div class="exam-nav">
        <button id="prev-btn" class="btn btn-outline" ${currentIndex === 0 ? "disabled" : ""}>السابق</button>
        ${
          currentIndex === questions.length - 1
            ? `<button id="submit-btn" class="btn btn-success">تسليم الاختبار</button>`
            : `<button id="next-btn" class="btn btn-primary">التالي</button>`
        }
      </div>
    </div>`;

  drawQuestion(q);

  document.getElementById("prev-btn").addEventListener("click", () => {
    EXAM.currentIndex = Math.max(0, EXAM.currentIndex - 1);
    drawExam();
  });
  const nextBtn = document.getElementById("next-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      EXAM.currentIndex = Math.min(questions.length - 1, EXAM.currentIndex + 1);
      drawExam();
    });
  }
  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitExam);
  }
}

function drawQuestion(q) {
  const card = document.getElementById("question-card");
  const currentAnswer = EXAM.attempt.answers[q.id];
  let html = `<div class="q-text">${esc(q.text)}</div><div class="q-options">`;

  if (q.type === "single" || q.type === "boolean") {
    html += q.options
      .map(
        (o) => `
      <label class="option-row">
        <input type="radio" name="opt" value="${o.id}" ${currentAnswer === o.id ? "checked" : ""}/>
        <span>${esc(o.text)}</span>
      </label>`
      )
      .join("");
  } else if (q.type === "multi") {
    const ids = Array.isArray(currentAnswer) ? currentAnswer : [];
    html += q.options
      .map(
        (o) => `
      <label class="option-row">
        <input type="checkbox" name="opt" value="${o.id}" ${ids.includes(o.id) ? "checked" : ""}/>
        <span>${esc(o.text)}</span>
      </label>`
      )
      .join("");
  } else if (q.type === "fill") {
    html += `<input class="input" id="fill-input" placeholder="اكتب إجابتك" value="${esc(currentAnswer || "")}"/>`;
  } else if (q.type === "essay") {
    html += `<textarea class="input textarea" id="essay-input" rows="6" placeholder="اكتب إجابتك هنا">${esc(currentAnswer || "")}</textarea>`;
  }
  html += `</div>`;
  card.innerHTML = html;

  const save = async () => {
    let val;
    if (q.type === "single" || q.type === "boolean") {
      const checked = card.querySelector('input[name="opt"]:checked');
      val = checked ? checked.value : null;
    } else if (q.type === "multi") {
      val = Array.from(card.querySelectorAll('input[name="opt"]:checked')).map((i) => i.value);
    } else if (q.type === "fill") {
      val = document.getElementById("fill-input").value;
    } else if (q.type === "essay") {
      val = document.getElementById("essay-input").value;
    }
    EXAM.attempt.answers[q.id] = val;
    await DataStore.setInProgress(EXAM.attempt.id, EXAM.attempt);
  };

  card.querySelectorAll("input").forEach((el) => el.addEventListener("change", save));
  const fillEl = document.getElementById("fill-input");
  if (fillEl) fillEl.addEventListener("input", debounce(save, 300));
  const essayEl = document.getElementById("essay-input");
  if (essayEl) essayEl.addEventListener("input", debounce(save, 300));
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function startTimer() {
  clearInterval(STATE.timerInterval);
  const { attempt } = EXAM;
  const box = () => document.getElementById("timer-box");
  if (!attempt.durationMinutes) {
    if (box()) box().textContent = "";
    return;
  }
  const endTime = attempt.startedAt + attempt.durationMinutes * 60 * 1000;
  const tick = () => {
    const remaining = endTime - Date.now();
    const b = box();
    if (!b) return; // انتقل المستخدم لصفحة أخرى
    if (remaining <= 0) {
      b.textContent = "00:00";
      clearInterval(STATE.timerInterval);
      submitExam(true);
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    b.textContent = `⏱ ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    b.classList.toggle("timer-danger", remaining < 60000);
  };
  tick();
  STATE.timerInterval = setInterval(tick, 1000);
}

async function submitExam(auto) {
  clearInterval(STATE.timerInterval);
  const { attempt, quiz } = EXAM;
  if (!auto) {
    const ok = await confirmModal("هل أنت متأكد من تسليم الاختبار؟ لا يمكن التراجع بعد التسليم.");
    if (!ok) return;
  }

  let score = 0;
  let hasEssay = false;
  for (const q of attempt.questionsSnapshot) {
    const ans = attempt.answers[q.id];
    if (q.type === "essay") {
      hasEssay = true;
      continue;
    }
    if (isCorrect(q, ans)) score += q.points || 0;
  }

  attempt.score = score;
  attempt.status = hasEssay ? "pending_review" : "completed";
  attempt.submittedAt = Date.now();

  STATE.data.attempts.push(attempt);
  await persist();
  await DataStore.clearInProgress(attempt.id);

  location.hash = "#/submitted/" + attempt.id;
}

function isCorrect(q, ans) {
  if (ans === undefined || ans === null) return false;
  if (q.type === "single" || q.type === "boolean") {
    return ans === q.correctAnswer;
  }
  if (q.type === "multi") {
    const a = Array.isArray(ans) ? [...ans].sort() : [];
    const b = [...(q.correctAnswer || [])].sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  if (q.type === "fill") {
    const accepted = (q.acceptedAnswers || []).map((s) => s.trim().toLowerCase());
    return accepted.includes(String(ans).trim().toLowerCase());
  }
  return false;
}

function renderSubmitted(attemptId) {
  const attempt = STATE.data.attempts.find((a) => a.id === attemptId);
  if (!attempt) return renderHome();
  root().innerHTML = `
    <div class="center-page">
      <div class="card result-card">
        <div class="brand-badge">✅</div>
        <h2>تم تسليم الاختبار بنجاح</h2>
        <p class="muted">احتفظ بهذا الكود للوصول إلى نتيجتك لاحقًا</p>
        <div class="code-box" id="code-box">${esc(attempt.resultCode)}</div>
        <button id="copy-btn" class="btn btn-outline block">نسخ الكود</button>
        <a href="#/" class="link-btn">رجوع للصفحة الرئيسية</a>
      </div>
    </div>`;
  document.getElementById("copy-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(attempt.resultCode);
    toast("تم نسخ الكود", "success");
  });
}

/* ============================================================
   لوحة المدير
   ============================================================ */
function renderAdmin(parts) {
  const tab = parts[0] || "dashboard";
  root().innerHTML = `
    <div class="admin-layout">
      <aside class="sidebar">
        <div class="brand-mini">لوحة المدير</div>
        ${adminNavLink("dashboard", "لوحة التحكم", tab)}
        ${adminNavLink("quizzes", "الاختبارات", tab)}
        ${adminNavLink("results", "النتائج", tab)}
        ${adminNavLink("stats", "الإحصائيات", tab)}
        ${adminNavLink("settings", "الإعدادات", tab)}
        <button id="logout-btn" class="btn btn-outline block logout-btn">تسجيل الخروج</button>
      </aside>
      <main class="admin-main" id="admin-main"></main>
    </div>`;

  document.getElementById("logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem("is_admin");
    location.hash = "#/";
  });

  if (tab === "dashboard") return renderDashboard();
  if (tab === "quizzes") return renderQuizzesList();
  if (tab === "quiz" && parts[1]) return renderQuizQuestions(parts[1]);
  if (tab === "results") return renderResultsAdmin();
  if (tab === "stats") return renderStats();
  if (tab === "settings") return renderSettings();
  renderDashboard();
}

function adminNavLink(key, label, current) {
  return `<a href="#/admin/${key}" class="nav-link ${current === key ? "active" : ""}">${label}</a>`;
}

function renderSyncBadge() {
  const el = document.getElementById("sync-status");
  if (!el) return;
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const data = STATE.data;
  const totalQuizzes = data.quizzes.length;
  const totalAttempts = data.attempts.length;
  const totalResults = data.attempts.filter((a) => a.status === "completed").length;
  const pending = data.attempts.filter((a) => a.status === "pending_review").length;
  const avgScore =
    totalAttempts > 0
      ? Math.round(
          data.attempts.reduce((s, a) => s + (a.maxScore ? (a.score / a.maxScore) * 100 : 0), 0) /
            totalAttempts
        )
      : 0;
  const passCount = data.attempts.filter((a) => {
    const quiz = data.quizzes.find((q) => q.id === a.quizId);
    const pct = a.maxScore ? (a.score / a.maxScore) * 100 : 0;
    return pct >= (quiz ? quiz.passMark : 50);
  }).length;
  const passRate = totalAttempts ? Math.round((passCount / totalAttempts) * 100) : 0;

  document.getElementById("admin-main").innerHTML = `
    <h1>لوحة التحكم</h1>
    <div class="stats-grid">
      ${statCard("عدد الاختبارات", totalQuizzes)}
      ${statCard("عدد المحاولات", totalAttempts)}
      ${statCard("عدد النتائج", totalResults)}
      ${statCard("قيد التصحيح", pending)}
      ${statCard("متوسط الدرجات", avgScore + "%")}
      ${statCard("نسبة النجاح", passRate + "%")}
    </div>`;
}
function statCard(label, value) {
  return `<div class="card stat-card"><div class="stat-value">${value}</div><div class="muted">${label}</div></div>`;
}

/* ---------- Quizzes ---------- */
function renderQuizzesList() {
  const data = STATE.data;
  document.getElementById("admin-main").innerHTML = `
    <div class="admin-head">
      <h1>الاختبارات</h1>
      <button id="new-quiz-btn" class="btn btn-primary">+ إنشاء اختبار</button>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الاسم</th><th>الكود</th><th>المادة</th><th>الصف</th><th>الأسئلة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${data.quizzes
            .map(
              (q) => `
            <tr>
              <td>${esc(q.title)}</td>
              <td><code>${esc(q.code)}</code></td>
              <td>${esc(q.subject || "-")}</td>
              <td>${esc(q.grade || "-")}</td>
              <td>${q.questions.length}</td>
              <td><span class="badge ${q.status === "open" ? "badge-success" : "badge-danger"}">${q.status === "open" ? "مفتوح" : "مغلق"}</span></td>
              <td class="actions-cell">
                <button class="btn-icon" data-act="questions" data-id="${q.id}" title="الأسئلة">📝</button>
                <button class="btn-icon" data-act="edit" data-id="${q.id}" title="تعديل">✏️</button>
                <button class="btn-icon" data-act="toggle" data-id="${q.id}" title="فتح/غلق">${q.status === "open" ? "🔒" : "🔓"}</button>
                <button class="btn-icon" data-act="copy" data-id="${q.id}" title="نسخ الكود">📋</button>
                <button class="btn-icon" data-act="delete" data-id="${q.id}" title="حذف">🗑️</button>
              </td>
            </tr>`
            )
            .join("") || `<tr><td colspan="7" class="muted center-text">لا توجد اختبارات بعد</td></tr>`}
        </tbody>
      </table>
    </div>`;

  document.getElementById("new-quiz-btn").addEventListener("click", () => openQuizModal(null));
  document.getElementById("admin-main").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    const quiz = data.quizzes.find((q) => q.id === id);
    if (btn.dataset.act === "questions") location.hash = "#/admin/quiz/" + id;
    if (btn.dataset.act === "edit") openQuizModal(quiz);
    if (btn.dataset.act === "copy") {
      navigator.clipboard?.writeText(quiz.code);
      toast("تم نسخ كود الاختبار", "success");
    }
    if (btn.dataset.act === "toggle") {
      quiz.status = quiz.status === "open" ? "closed" : "open";
      quiz.updatedAt = Date.now();
      await persist();
      renderQuizzesList();
    }
    if (btn.dataset.act === "delete") {
      const keep = await confirmModal(
        "سيتم حذف الاختبار. هل تريد الاحتفاظ بمحاولات الطلاب كأرشيف؟ (إلغاء = حذف كل شيء)"
      );
      const reallyDelete = await confirmModal("تأكيد نهائي لحذف الاختبار؟", true);
      if (!reallyDelete) return;
      data.quizzes = data.quizzes.filter((q) => q.id !== id);
      if (!keep) {
        data.attempts = data.attempts.filter((a) => a.quizId !== id);
      }
      await persist();
      renderQuizzesList();
      toast("تم حذف الاختبار", "success");
    }
  });
}

function openQuizModal(quiz) {
  const isNew = !quiz;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>${isNew ? "إنشاء اختبار" : "تعديل الاختبار"}</h2>
      <div class="form-grid">
        <div><label>اسم الاختبار</label><input class="input" id="f-title" value="${esc(quiz?.title || "")}"/></div>
        <div><label>المادة</label><input class="input" id="f-subject" value="${esc(quiz?.subject || "")}"/></div>
        <div><label>الصف</label><input class="input" id="f-grade" value="${esc(quiz?.grade || "")}"/></div>
        <div><label>مدة الاختبار (دقيقة، 0 = بدون وقت)</label><input class="input" type="number" id="f-duration" value="${quiz?.duration ?? 0}"/></div>
        <div><label>درجة النجاح (%)</label><input class="input" type="number" id="f-passmark" value="${quiz?.passMark ?? 50}"/></div>
        <div><label>عدد المحاولات المسموحة</label><input class="input" type="number" id="f-attempts" value="${quiz?.attemptsAllowed ?? 1}"/></div>
        <div class="full"><label>الوصف</label><textarea class="input textarea" id="f-desc">${esc(quiz?.description || "")}</textarea></div>
        <div class="full checkbox-row">
          <label><input type="checkbox" id="f-showresult" ${quiz?.showResultAfterSubmit !== false ? "checked" : ""}/> إظهار النتيجة بعد التسليم</label>
          <label><input type="checkbox" id="f-showanswers" ${quiz?.showCorrectAnswers ? "checked" : ""}/> إظهار الإجابات الصحيحة</label>
          <label><input type="checkbox" id="f-retake" ${quiz?.allowRetake ? "checked" : ""}/> السماح بإعادة الاختبار</label>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" data-act="cancel">إلغاء</button>
        <button class="btn btn-primary" data-act="save">حفظ</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", async (e) => {
    if (e.target === overlay || e.target.dataset.act === "cancel") return overlay.remove();
    if (e.target.dataset.act !== "save") return;
    const title = document.getElementById("f-title").value.trim();
    if (!title) return toast("اسم الاختبار مطلوب", "error");
    const subject = document.getElementById("f-subject").value.trim();

    if (isNew) {
      let code;
      do {
        code = genQuizCode(subject);
      } while (STATE.data.quizzes.some((q) => q.code === code));
      const newQuiz = {
        id: uid(),
        code,
        title,
        subject,
        grade: document.getElementById("f-grade").value.trim(),
        description: document.getElementById("f-desc").value.trim(),
        duration: Number(document.getElementById("f-duration").value) || 0,
        passMark: Number(document.getElementById("f-passmark").value) || 50,
        attemptsAllowed: Number(document.getElementById("f-attempts").value) || 1,
        showResultAfterSubmit: document.getElementById("f-showresult").checked,
        showCorrectAnswers: document.getElementById("f-showanswers").checked,
        allowRetake: document.getElementById("f-retake").checked,
        status: "closed",
        questions: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      STATE.data.quizzes.push(newQuiz);
      await persist();
      overlay.remove();
      toast("تم إنشاء الاختبار، كوده: " + code, "success");
      renderQuizzesList();
    } else {
      quiz.title = title;
      quiz.subject = subject;
      quiz.grade = document.getElementById("f-grade").value.trim();
      quiz.description = document.getElementById("f-desc").value.trim();
      quiz.duration = Number(document.getElementById("f-duration").value) || 0;
      quiz.passMark = Number(document.getElementById("f-passmark").value) || 50;
      quiz.attemptsAllowed = Number(document.getElementById("f-attempts").value) || 1;
      quiz.showResultAfterSubmit = document.getElementById("f-showresult").checked;
      quiz.showCorrectAnswers = document.getElementById("f-showanswers").checked;
      quiz.allowRetake = document.getElementById("f-retake").checked;
      quiz.updatedAt = Date.now();
      await persist();
      overlay.remove();
      toast("تم حفظ التعديلات", "success");
      renderQuizzesList();
    }
  });
}

/* ---------- Questions Editor ---------- */
function renderQuizQuestions(quizId) {
  const quiz = STATE.data.quizzes.find((q) => q.id === quizId);
  if (!quiz) return renderQuizzesList();
  document.getElementById("admin-main").innerHTML = `
    <div class="admin-head">
      <div>
        <a href="#/admin/quizzes" class="link-btn">→ رجوع للاختبارات</a>
        <h1>تعديل الأسئلة — ${esc(quiz.title)}</h1>
        <p class="muted">كود الاختبار: <code>${esc(quiz.code)}</code></p>
      </div>
      <button id="add-q-btn" class="btn btn-primary">+ إضافة سؤال</button>
    </div>
    <div id="q-list" class="q-editor-list"></div>`;

  drawQuestionsList(quiz);
  document.getElementById("add-q-btn").addEventListener("click", () => openQuestionModal(quiz, null));
}

function drawQuestionsList(quiz) {
  const list = document.getElementById("q-list");
  list.innerHTML =
    quiz.questions
      .map(
        (q, i) => `
    <div class="card q-editor-item">
      <div class="q-editor-head">
        <span class="badge">${i + 1}</span>
        <span class="badge">${QUESTION_TYPES[q.type]}</span>
        <span class="badge">${q.points} نقطة</span>
        <div class="spacer"></div>
        <button class="btn-icon" data-act="up" data-id="${q.id}" ${i === 0 ? "disabled" : ""}>⬆️</button>
        <button class="btn-icon" data-act="down" data-id="${q.id}" ${i === quiz.questions.length - 1 ? "disabled" : ""}>⬇️</button>
        <button class="btn-icon" data-act="edit" data-id="${q.id}">✏️</button>
        <button class="btn-icon" data-act="delete" data-id="${q.id}">🗑️</button>
      </div>
      <div>${esc(q.text)}</div>
    </div>`
      )
      .join("") || `<div class="muted center-text">لا توجد أسئلة بعد</div>`;

  list.onclick = async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const idx = quiz.questions.findIndex((q) => q.id === btn.dataset.id);
    if (idx === -1) return;
    if (btn.dataset.act === "edit") return openQuestionModal(quiz, quiz.questions[idx]);
    if (btn.dataset.act === "delete") {
      const ok = await confirmModal("حذف هذا السؤال؟ (لن يؤثر على محاولات الطلاب السابقة)", true);
      if (!ok) return;
      quiz.questions.splice(idx, 1);
      quiz.questions.forEach((q, i) => (q.order = i));
      quiz.updatedAt = Date.now();
      await persist();
      drawQuestionsList(quiz);
    }
    if (btn.dataset.act === "up" && idx > 0) {
      [quiz.questions[idx - 1], quiz.questions[idx]] = [quiz.questions[idx], quiz.questions[idx - 1]];
      quiz.questions.forEach((q, i) => (q.order = i));
      quiz.updatedAt = Date.now();
      await persist();
      drawQuestionsList(quiz);
    }
    if (btn.dataset.act === "down" && idx < quiz.questions.length - 1) {
      [quiz.questions[idx + 1], quiz.questions[idx]] = [quiz.questions[idx], quiz.questions[idx + 1]];
      quiz.questions.forEach((q, i) => (q.order = i));
      quiz.updatedAt = Date.now();
      await persist();
      drawQuestionsList(quiz);
    }
  };
}

function openQuestionModal(quiz, question) {
  const isNew = !question;
  const q = question || {
    id: uid(),
    type: "single",
    text: "",
    options: [
      { id: uid(), text: "" },
      { id: uid(), text: "" },
    ],
    correctAnswer: null,
    acceptedAnswers: [],
    modelAnswer: "",
    keyPoints: "",
    points: 1,
    order: quiz.questions.length,
  };

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>${isNew ? "إضافة سؤال" : "تعديل سؤال"}</h2>
      <label>نوع السؤال</label>
      <select id="q-type" class="input">
        ${Object.entries(QUESTION_TYPES)
          .map(([val, label]) => `<option value="${val}" ${q.type === val ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
      <label>نص السؤال</label>
      <textarea id="q-text" class="input textarea">${esc(q.text)}</textarea>
      <label>الدرجة</label>
      <input id="q-points" type="number" class="input" value="${q.points}"/>
      <div id="q-type-fields"></div>
      <div class="modal-actions">
        <button class="btn btn-outline" data-act="cancel">إلغاء</button>
        <button class="btn btn-primary" data-act="save">حفظ السؤال</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const fieldsBox = overlay.querySelector("#q-type-fields");
  const typeSelect = overlay.querySelector("#q-type");
  const drawFields = () => {
    const type = typeSelect.value;
    if (type === "single" || type === "multi") {
      fieldsBox.innerHTML = `
        <label>الاختيارات (حدد الإجابة الصحيحة)</label>
        <div id="opts-list"></div>
        <button type="button" class="btn btn-outline small" id="add-opt-btn">+ إضافة اختيار</button>`;
      const optsList = fieldsBox.querySelector("#opts-list");
      const opts = q.type === type && q.options ? q.options : [
        { id: uid(), text: "" },
        { id: uid(), text: "" },
      ];
      q._opts = opts;
      const drawOpts = () => {
        optsList.innerHTML = q._opts
          .map(
            (o) => `
          <div class="opt-row">
            <input type="${type === "single" ? "radio" : "checkbox"}" name="correct" value="${o.id}" ${
              type === "single"
                ? q.correctAnswer === o.id
                  ? "checked"
                  : ""
                : (q.correctAnswer || []).includes(o.id)
                ? "checked"
                : ""
            }/>
            <input class="input opt-text" data-id="${o.id}" value="${esc(o.text)}" placeholder="نص الاختيار"/>
            <button type="button" class="btn-icon" data-remove="${o.id}">✖</button>
          </div>`
          )
          .join("");
      };
      drawOpts();
      fieldsBox.querySelector("#add-opt-btn").addEventListener("click", () => {
        q._opts.push({ id: uid(), text: "" });
        drawOpts();
      });
      fieldsBox.addEventListener("click", (e) => {
        if (e.target.dataset.remove) {
          q._opts = q._opts.filter((o) => o.id !== e.target.dataset.remove);
          drawOpts();
        }
      });
    } else if (type === "boolean") {
      const trueId = "true_opt";
      const falseId = "false_opt";
      q._opts = [
        { id: trueId, text: "صح" },
        { id: falseId, text: "خطأ" },
      ];
      fieldsBox.innerHTML = `
        <label>الإجابة الصحيحة</label>
        <div class="opt-row"><input type="radio" name="correct" value="${trueId}" ${q.correctAnswer === trueId ? "checked" : ""}/> <span>صح</span></div>
        <div class="opt-row"><input type="radio" name="correct" value="${falseId}" ${q.correctAnswer === falseId ? "checked" : ""}/> <span>خطأ</span></div>`;
    } else if (type === "fill") {
      const accepted = q.type === "fill" ? q.acceptedAnswers || [] : [];
      fieldsBox.innerHTML = `
        <label>الإجابات المقبولة (كل إجابة في سطر)</label>
        <textarea id="q-accepted" class="input textarea">${esc(accepted.join("\n"))}</textarea>`;
    } else if (type === "essay") {
      fieldsBox.innerHTML = `
        <label>الإجابة النموذجية</label>
        <textarea id="q-model" class="input textarea">${esc(q.modelAnswer || "")}</textarea>
        <label>النقاط الأساسية (اختياري)</label>
        <textarea id="q-keypoints" class="input textarea">${esc(q.keyPoints || "")}</textarea>
        <p class="muted small">سيتم تصحيح هذا السؤال يدويًا من قِبل المدير.</p>`;
    }
  };
  drawFields();
  typeSelect.addEventListener("change", drawFields);

  overlay.addEventListener("click", async (e) => {
    if (e.target === overlay || e.target.dataset.act === "cancel") return overlay.remove();
    if (e.target.dataset.act !== "save") return;

    const type = typeSelect.value;
    const text = overlay.querySelector("#q-text").value.trim();
    const points = Number(overlay.querySelector("#q-points").value) || 1;
    if (!text) return toast("نص السؤال مطلوب", "error");

    const newQ = {
      id: q.id,
      type,
      text,
      points,
      order: q.order,
      options: [],
      correctAnswer: null,
      acceptedAnswers: [],
      modelAnswer: "",
      keyPoints: "",
    };

    if (type === "single" || type === "multi" || type === "boolean") {
      const optTexts = {};
      overlay.querySelectorAll(".opt-text").forEach((inp) => (optTexts[inp.dataset.id] = inp.value.trim()));
      newQ.options = (q._opts || []).map((o) => ({ id: o.id, text: optTexts[o.id] ?? o.text }));
      if (newQ.options.some((o) => !o.text)) return toast("جميع الاختيارات يجب أن تحتوي على نص", "error");

      if (type === "single") {
        const checked = overlay.querySelector('input[name="correct"]:checked');
        if (!checked) return toast("حدد الإجابة الصحيحة", "error");
        newQ.correctAnswer = checked.value;
      } else if (type === "multi") {
        const checked = Array.from(overlay.querySelectorAll('input[name="correct"]:checked')).map((i) => i.value);
        if (!checked.length) return toast("حدد إجابة صحيحة واحدة على الأقل", "error");
        newQ.correctAnswer = checked;
      } else if (type === "boolean") {
        const checked = overlay.querySelector('input[name="correct"]:checked');
        if (!checked) return toast("حدد الإجابة الصحيحة", "error");
        newQ.correctAnswer = checked.value;
      }
    } else if (type === "fill") {
      newQ.acceptedAnswers = overlay
        .querySelector("#q-accepted")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!newQ.acceptedAnswers.length) return toast("أضف إجابة مقبولة واحدة على الأقل", "error");
    } else if (type === "essay") {
      newQ.modelAnswer = overlay.querySelector("#q-model").value.trim();
      newQ.keyPoints = overlay.querySelector("#q-keypoints").value.trim();
    }

    if (isNew) {
      quiz.questions.push(newQ);
    } else {
      const idx = quiz.questions.findIndex((qq) => qq.id === q.id);
      quiz.questions[idx] = newQ;
    }
    quiz.updatedAt = Date.now();
    await persist();
    overlay.remove();
    drawQuestionsList(quiz);
    toast("تم حفظ السؤال", "success");
  });
}

/* ---------- Results / Grading ---------- */
function renderResultsAdmin() {
  const data = STATE.data;
  document.getElementById("admin-main").innerHTML = `
    <div class="admin-head">
      <h1>النتائج</h1>
      <button id="export-csv-btn" class="btn btn-outline">تصدير CSV</button>
    </div>
    <input id="results-search" class="input" placeholder="بحث بالاسم / الاختبار / كود النتيجة"/>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الطالب</th><th>الاختبار</th><th>كود النتيجة</th><th>الدرجة</th><th>النسبة</th><th>الحالة</th><th>وقت التسليم</th><th></th></tr></thead>
        <tbody id="results-tbody"></tbody>
      </table>
    </div>`;

  const renderRows = (filter) => {
    const f = (filter || "").trim().toLowerCase();
    const rows = data.attempts.filter(
      (a) =>
        !f ||
        a.studentName.toLowerCase().includes(f) ||
        a.quizTitle.toLowerCase().includes(f) ||
        a.resultCode.toLowerCase().includes(f)
    );
    document.getElementById("results-tbody").innerHTML =
      rows
        .map((a) => {
          const pct = a.maxScore ? Math.round((a.score / a.maxScore) * 100) : 0;
          return `<tr>
          <td>${esc(a.studentName)}</td>
          <td>${esc(a.quizTitle)}</td>
          <td><code>${esc(a.resultCode)}</code></td>
          <td>${a.score}/${a.maxScore}</td>
          <td>${pct}%</td>
          <td><span class="badge ${a.status === "completed" ? "badge-success" : "badge-warning"}">${
            a.status === "completed" ? "مكتملة" : "قيد التصحيح"
          }</span></td>
          <td>${fmtDate(a.submittedAt)}</td>
          <td><button class="btn-icon" data-id="${a.id}" data-act="view">👁️</button></td>
        </tr>`;
        })
        .join("") || `<tr><td colspan="8" class="muted center-text">لا توجد نتائج</td></tr>`;
  };
  renderRows("");

  document.getElementById("results-search").addEventListener("input", (e) => renderRows(e.target.value));
  document.getElementById("export-csv-btn").addEventListener("click", () => {
    const rows = [
      ["الطالب", "الاختبار", "كود النتيجة", "الدرجة", "النسبة", "الحالة", "وقت التسليم"],
      ...data.attempts.map((a) => [
        a.studentName,
        a.quizTitle,
        a.resultCode,
        `${a.score}/${a.maxScore}`,
        a.maxScore ? Math.round((a.score / a.maxScore) * 100) + "%" : "0%",
        a.status === "completed" ? "مكتملة" : "قيد التصحيح",
        fmtDate(a.submittedAt),
      ]),
    ];
    exportCSV(rows, "results.csv");
  });
  document.getElementById("admin-main").addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-act="view"]');
    if (!btn) return;
    openAttemptDetail(data.attempts.find((a) => a.id === btn.dataset.id));
  });
}

function openAttemptDetail(attempt) {
  const quiz = STATE.data.quizzes.find((q) => q.id === attempt.quizId);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal wide">
      <h2>${esc(attempt.studentName)} — ${esc(attempt.quizTitle)}</h2>
      <p class="muted small">بداية: ${fmtDate(attempt.startedAt)} — تسليم: ${fmtDate(attempt.submittedAt)}</p>
      <div id="attempt-qa"></div>
      <div class="modal-actions"><button class="btn btn-outline" data-act="close">إغلاق</button></div>
    </div>`;
  document.body.appendChild(overlay);

  const qaBox = overlay.querySelector("#attempt-qa");
  qaBox.innerHTML = attempt.questionsSnapshot
    .map((q, i) => {
      const ans = attempt.answers[q.id];
      if (q.type !== "essay") {
        const correct = isCorrect(q, ans);
        return `<div class="qa-review">
        <div class="qa-review-head"><span>سؤال ${i + 1}</span><span class="badge ${correct ? "badge-success" : "badge-danger"}">${correct ? q.points : 0} / ${q.points}</span></div>
        <div>${esc(q.text)}</div>
        <div class="muted small">إجابة الطالب: ${esc(formatAnswer(q, ans))}</div>
      </div>`;
      }
      const grade = attempt.grading[q.id];
      return `<div class="qa-review essay-review" data-qid="${q.id}">
        <div class="qa-review-head"><span>سؤال ${i + 1} (مقالي)</span><span class="badge">${q.points} نقطة كاملة</span></div>
        <div>${esc(q.text)}</div>
        <div class="muted small">إجابة الطالب:</div>
        <div class="answer-box">${esc(ans || "لم تتم الإجابة")}</div>
        ${q.modelAnswer ? `<div class="muted small">الإجابة النموذجية: ${esc(q.modelAnswer)}</div>` : ""}
        ${q.keyPoints ? `<div class="muted small">النقاط الأساسية: ${esc(q.keyPoints)}</div>` : ""}
        <div class="grade-form">
          <input type="number" class="input grade-score" min="0" max="${q.points}" placeholder="الدرجة" value="${grade ? grade.score : ""}"/>
          <input type="text" class="input grade-comment" placeholder="تعليق (اختياري)" value="${grade ? esc(grade.comment || "") : ""}"/>
          <button class="btn btn-primary small save-grade-btn">حفظ التصحيح</button>
        </div>
      </div>`;
    })
    .join("");

  qaBox.querySelectorAll(".save-grade-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const box = btn.closest(".essay-review");
      const qid = box.dataset.qid;
      const q = attempt.questionsSnapshot.find((qq) => qq.id === qid);
      const scoreVal = Number(box.querySelector(".grade-score").value);
      if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > q.points) {
        return toast(`الدرجة يجب أن تكون بين 0 و ${q.points}`, "error");
      }
      const comment = box.querySelector(".grade-comment").value.trim();
      attempt.grading[qid] = { score: scoreVal, comment, gradedAt: Date.now() };

      // إعادة حساب الدرجة الكلية
      let total = 0;
      let allEssaysGraded = true;
      for (const qq of attempt.questionsSnapshot) {
        if (qq.type === "essay") {
          const g = attempt.grading[qq.id];
          if (g) total += g.score;
          else allEssaysGraded = false;
        } else {
          if (isCorrect(qq, attempt.answers[qq.id])) total += qq.points;
        }
      }
      attempt.score = total;
      attempt.status = allEssaysGraded ? "completed" : "pending_review";
      await persist();
      toast("تم حفظ التصحيح", "success");
      overlay.remove();
      renderResultsAdmin();
    });
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.dataset.act === "close") overlay.remove();
  });
}

/* ---------- Stats ---------- */
function renderStats() {
  const data = STATE.data;
  document.getElementById("admin-main").innerHTML = `
    <h1>الإحصائيات</h1>
    <div class="stats-cards-list">
      ${
        data.quizzes
          .map((q) => {
            const attempts = data.attempts.filter((a) => a.quizId === q.id);
            if (!attempts.length) {
              return `<div class="card"><h3>${esc(q.title)}</h3><p class="muted">لا توجد محاولات بعد</p></div>`;
            }
            const scores = attempts.map((a) => (a.maxScore ? (a.score / a.maxScore) * 100 : 0));
            const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
            const max = Math.round(Math.max(...scores));
            const min = Math.round(Math.min(...scores));
            const passCount = scores.filter((s) => s >= q.passMark).length;
            const passRate = Math.round((passCount / scores.length) * 100);
            const pending = attempts.filter((a) => a.status === "pending_review").length;

            // أكثر الأسئلة خطأً
            const wrongCounts = {};
            attempts.forEach((a) => {
              a.questionsSnapshot.forEach((qq) => {
                if (qq.type === "essay") return;
                if (!isCorrect(qq, a.answers[qq.id])) {
                  wrongCounts[qq.text] = (wrongCounts[qq.text] || 0) + 1;
                }
              });
            });
            const topWrong = Object.entries(wrongCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3);

            return `<div class="card">
            <h3>${esc(q.title)}</h3>
            <div class="stats-grid">
              ${statCard("المحاولات", attempts.length)}
              ${statCard("المتوسط", avg + "%")}
              ${statCard("أعلى درجة", max + "%")}
              ${statCard("أقل درجة", min + "%")}
              ${statCard("نسبة النجاح", passRate + "%")}
              ${statCard("قيد التصحيح", pending)}
            </div>
            ${
              topWrong.length
                ? `<p class="muted small">أكثر الأسئلة خطأً:</p><ul>${topWrong
                    .map(([t, c]) => `<li>${esc(t)} (${c} خطأ)</li>`)
                    .join("")}</ul>`
                : ""
            }
          </div>`;
          })
          .join("") || `<div class="muted center-text">لا توجد اختبارات بعد</div>`
      }
    </div>`;
}

/* ---------- Settings ---------- */
function renderSettings() {
  const data = STATE.data;
  DataStore.getMeta().then((meta) => {
    document.getElementById("admin-main").innerHTML = `
    <h1>الإعدادات</h1>

    <div class="card">
      <h3>المظهر</h3>
      <div class="theme-toggle">
        <button class="btn ${data.settings.theme === "dark" ? "btn-primary" : "btn-outline"}" data-theme="dark">Dark Mode</button>
        <button class="btn ${data.settings.theme === "light" ? "btn-primary" : "btn-outline"}" data-theme="light">Light Mode</button>
      </div>
    </div>

    <div class="card">
      <h3>المزامنة</h3>
      <label>رابط الخادم الوسيط (Cloudflare Worker)</label>
      <input id="worker-url" class="input" placeholder="https://your-worker.workers.dev" value="${esc(SyncManager.getWorkerUrl())}"/>
      <button id="save-worker-url" class="btn btn-outline">حفظ الرابط</button>
      <p class="muted small">
        الحالة: ${navigator.onLine ? "🟢 متصل بالإنترنت" : "🔴 غير متصل"} —
        آخر مزامنة: ${meta.lastSync ? fmtDate(meta.lastSync) : "لم تتم بعد"}
        ${meta.dirty ? " — يوجد تغييرات لم تُرفع بعد" : ""}
      </p>
      <div class="btn-row">
        <button id="sync-now-btn" class="btn btn-primary">مزامنة الآن</button>
        <button id="push-btn" class="btn btn-outline">رفع البيانات إلى Telegram</button>
        <button id="pull-btn" class="btn btn-outline">جلب البيانات من Telegram</button>
      </div>
    </div>

    <div class="card">
      <h3>النسخ الاحتياطي</h3>
      <div class="btn-row">
        <button id="export-backup-btn" class="btn btn-outline">تصدير Backup</button>
        <button id="import-backup-btn" class="btn btn-outline">استيراد Backup</button>
        <input type="file" id="backup-file-input" accept="application/json" style="display:none"/>
      </div>
    </div>

    <div class="card">
      <h3>حذف البيانات</h3>
      <p class="muted small">حذف جميع الاختبارات والنتائج المخزنة محليًا (لا يحذف النسخ الموجودة في Telegram إلا إذا قمت بالمزامنة بعدها).</p>
      <button id="wipe-btn" class="btn btn-danger">حذف كل البيانات</button>
    </div>`;

    document.querySelectorAll("[data-theme]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        data.settings.theme = btn.dataset.theme;
        applyTheme(btn.dataset.theme);
        await persist();
        renderSettings();
      })
    );

    document.getElementById("save-worker-url").addEventListener("click", () => {
      SyncManager.setWorkerUrl(document.getElementById("worker-url").value);
      toast("تم حفظ رابط الخادم", "success");
    });

    document.getElementById("sync-now-btn").addEventListener("click", async () => {
      try {
        STATE.data = await SyncManager.syncNow();
        toast("تمت المزامنة بنجاح", "success");
        renderSettings();
      } catch (e) {
        toast(e.message, "error");
      }
    });
    document.getElementById("push-btn").addEventListener("click", async () => {
      try {
        await SyncManager.pushRaw(STATE.data);
        await DataStore.setMeta({ lastSync: Date.now(), dirty: false });
        toast("تم رفع البيانات إلى Telegram", "success");
        renderSettings();
      } catch (e) {
        toast(e.message, "error");
      }
    });
    document.getElementById("pull-btn").addEventListener("click", async () => {
      const ok = await confirmModal("سيتم استبدال بياناتك المحلية بالبيانات الموجودة في Telegram. متابعة؟", true);
      if (!ok) return;
      try {
        const remote = await SyncManager.pullRaw();
        STATE.data = remote;
        await DataStore.setData(remote);
        toast("تم جلب البيانات من Telegram", "success");
        renderSettings();
      } catch (e) {
        toast(e.message, "error");
      }
    });

    document.getElementById("export-backup-btn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `quiz-system-backup-${Date.now()}.json`;
      a.click();
    });

    const fileInput = document.getElementById("backup-file-input");
    document.getElementById("import-backup-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.quizzes) || !Array.isArray(parsed.attempts)) {
          throw new Error("ملف غير صالح");
        }
        const ok = await confirmModal("سيتم استبدال جميع بياناتك الحالية بمحتوى هذا الملف. متابعة؟", true);
        if (!ok) return;
        STATE.data = parsed;
        await persist();
        toast("تم استيراد النسخة الاحتياطية بنجاح", "success");
        renderSettings();
      } catch (e) {
        toast("ملف Backup غير صالح", "error");
      }
      fileInput.value = "";
    });

    document.getElementById("wipe-btn").addEventListener("click", async () => {
      const ok = await confirmModal("سيتم حذف جميع الاختبارات والنتائج المحلية نهائيًا. هل أنت متأكد؟", true);
      if (!ok) return;
      const ok2 = await confirmModal("تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه.", true);
      if (!ok2) return;
      await DataStore.wipeAll();
      STATE.data = emptyAppData();
      await DataStore.setData(STATE.data);
      toast("تم حذف جميع البيانات", "success");
      renderSettings();
    });
  });
}

boot();
