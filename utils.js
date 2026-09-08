function uid() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function genQuizCode(subjectHint) {
  const letters = (subjectHint || "QZ").replace(/[^A-Za-z\u0621-\u064A]/g, "");
  const prefix = (letters.slice(0, 3) || "QZ").toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${rand}`;
}

function genResultCode() {
  const a = Math.random().toString(36).slice(2, 6).toUpperCase();
  const b = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `RES-${a}-${b}`;
}

function toast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function exportCSV(rows, filename) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtDate(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString("ar-EG");
  } catch (e) {
    return new Date(ts).toString();
  }
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function confirmModal(message, danger) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal small">
        <p class="confirm-text">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-outline" data-act="cancel">إلغاء</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">تأكيد</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.dataset.act === "cancel") {
        overlay.remove();
        resolve(false);
      } else if (e.target.dataset.act === "ok") {
        overlay.remove();
        resolve(true);
      }
    });
  });
}
