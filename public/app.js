const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const KEY = "offerpilot-state-v2";
const CLIENT_STATE_VERSION = "adaptive-interview-v1";
// Cloudflare Tunnel via HTTP → upstream expects HTTP/1.1 to avoid h2 downgrade issues.
const rawFetch = window.fetch.bind(window);

/** Default 5-minute timeout for all fetch calls (prevents hang on tunnel drop). */
const FETCH_TIMEOUT_MS = 5 * 60 * 1000; // OfferPilot v2.1

window.fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const accessCode = localStorage.getItem("offerpilot-public-access-code");
    const isApi = String(input).startsWith("/api/");
    const headers = new Headers(init.headers || {});
    if (accessCode && isApi) headers.set("x-public-access-code", accessCode);
    // Force connection reuse: add Pragma: no-cache for Cloudflare tunnel compatibility.
    headers.set("Pragma", "no-cache");
    const response = await rawFetch(input, accessCode && isApi ? { ...init, headers, signal: controller.signal } : { ...init, signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    if (isApi && !contentType.includes("application/json")) {
      throw new Error("公网服务暂时未连通：请确认本机的 npm run public:demo 终端仍在运行，然后刷新页面重试");
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
};

// ---- Auth state ----
let isAuthenticated = false;
let currentUser = null;

async function checkAuth() {
  try {
    const resp = await fetch("/api/auth/me");
    if (resp.ok) {
      const user = await resp.json();
      isAuthenticated = true;
      currentUser = user;
      return true;
    }
  } catch { /* offline or server unavailable */ }
  isAuthenticated = false;
  currentUser = null;
  return false;
}

async function logout() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
  window.location.href = "/";
}

let persisted = {};
try { persisted = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { localStorage.removeItem(KEY); }
const state = Object.assign({ profile: null, versions: [], records: [], current: null, view: "dashboard", role: "candidate", recruiter: { jobs: [], currentJob: null, resumes: [], matches: [], selected: [] } }, persisted);
const migratedInterviewId = state.clientStateVersion === CLIENT_STATE_VERSION ? null : state.current?.id;
if (state.clientStateVersion !== CLIENT_STATE_VERSION) {
  state.clientStateVersion = CLIENT_STATE_VERSION;
  state.current = null;
  if (migratedInterviewId) state.view = "interview";
  localStorage.setItem(KEY, JSON.stringify(state));
}
const $ = (selector) => document.querySelector(selector);
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const toast = (message) => { const node = $("#toast"); node.textContent = message; node.classList.remove("hidden"); clearTimeout(window.__toast); window.__toast = setTimeout(() => node.classList.add("hidden"), 2600); };
window.addEventListener("error", (event) => { console.error(event.error || event.message); toast("页面脚本出错，请刷新后重试"); });
const go = (view) => { state.view = view; save(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
const scoreClass = (score) => score >= 8 ? "good" : score >= 6 ? "warn" : "bad";
const dateText = (value) => value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const recommendationText = (value) => ({ strong_interview: "强烈建议进入技术面", interview: "建议进入一面", manual_review: "建议人工复核", hold: "暂缓推进" }[value] || value || "待判断");

const interviewActive = () => state.role === "candidate" && state.view === "interview" && !!state.current;

function shell(content) {
  const nav = [["dashboard","工作台"],["diagnosis","简历诊断"],["interview","模拟面试"],["growth","成长报告"]];
  const mode = interviewActive() ? " interview-mode" : "";
  return `<div class="app-shell${mode}"><aside class="app-sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">O</span><span>OfferPilot</span></a><p class="sidebar-caption">AI CAREER COACH</p><nav>${nav.map(([id,label]) => `<button class="nav-link ${state.view === id ? "active" : ""}" data-view="${id}"><span class="nav-icon">${({dashboard:"⌂",diagnosis:"▤",interview:"◉",growth:"↗"})[id]}</span>${label}</button>`).join("")}</nav><div class="privacy-card"><span class="status-dot"></span><div><b>隐私保护模式</b><small>原文件本地保存，脱敏文本用于模型分析</small></div></div></aside><main class="main-area"><header class="topbar"><div><span class="eyebrow">${({dashboard:"WORKSPACE",diagnosis:"RESUME DIAGNOSIS",interview:"MOCK INTERVIEW",growth:"GROWTH REPORT"})[state.view]}</span><h1>${({dashboard:"你的面试训练工作台",diagnosis:"把简历变成面试优势",interview:"一次真正连续的技术压力面",growth:"看见每一次训练带来的变化"})[state.view]}</h1></div><div class="top-actions"><span class="model-pill"><i></i> 百炼 · OmniMemory</span>${currentUser ? `<span class="avatar" title="${esc(currentUser.displayName)}">${esc(currentUser.displayName.slice(0,2))}</span><button onclick="logout()" style="margin-left:8px;padding:4px 12px;border-radius:6px;border:1px solid #ccc;background:white;cursor:pointer;font-size:13px">退出</button>` : ""}${state.profile ? `<span class="avatar">${esc(state.profile.name?.slice(0,2) || "候选人")}</span>` : ""}</div></header><div class="content">${content}</div></main></div>`;
}

async function clearCurrentInterview({ abandon = false, message } = {}) {
  const id = state.current?.id;
  if (abandon && id) {
    try { await fetch(`/api/interview/${id}/abandon`, { method: "POST" }); } catch { /* ignore */ }
  }
  state.current = null;
  save();
  if (message) toast(message);
}

async function syncCurrentInterview() {
  if (!state.current?.id) return true;
  try {
    const response = await fetch(`/api/interview/${state.current.id}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.expired) {
      await clearCurrentInterview({ message: "上一场面试已失效，请重新开始" });
      return false;
    }
    state.current = {
      ...state.current,
      id: data.sessionId,
      targetRole: data.targetRole || state.current.targetRole,
      pressure: data.pressure ?? state.current.pressure,
      interviewType: data.interviewType || state.current.interviewType,
      phase: data.phase,
      topic: data.topic,
      question: data.question,
      progress: data.progress ?? 0,
      transcript: Array.isArray(data.transcript) ? data.transcript : (state.current.transcript || [])
    };
    save();
    return true;
  } catch {
    toast("无法校验面试会话，请确认本地服务仍在运行");
    return false;
  }
}

function handleExpiredInterview(error) {
  const message = error?.message || String(error || "");
  if (/不存在|过期|expired/i.test(message)) {
    clearCurrentInterview({ message: "面试会话已失效，已返回配置页" }).then(() => {
      state.view = "interview";
      save();
      render();
    });
    return true;
  }
  return false;
}

function renderAuthGate() {
  const html = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f9fb">
    <div style="background:white;border-radius:16px;padding:40px;width:380px;max-width:90vw;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <h2 style="text-align:center;margin:0 0 24px;font-size:24px;color:#1a1a2e">OfferPilot 登录</h2>
      <div style="display:flex;border-bottom:2px solid #eee;margin-bottom:24px">
        <button class="auth-tab active" data-auth-tab="login" style="flex:1;padding:10px;text-align:center;border:none;background:none;font-size:15px;cursor:pointer;border-bottom:2px solid #4f46e5;color:#4f46e5;font-weight:600;margin-bottom:-2px">登录</button>
        <button class="auth-tab" data-auth-tab="register" style="flex:1;padding:10px;text-align:center;border:none;background:none;font-size:15px;cursor:pointer;color:#888;margin-bottom:-2px">注册</button>
      </div>
      <form id="loginForm" style="display:block">
        <label style="display:block;margin-bottom:6px;font-size:14px;font-weight:500">用户名<span style="color:red">*</span></label>
        <input type="text" id="loginUsername" required placeholder="输入用户名" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:16px">
        <label style="display:block;margin-bottom:6px;font-size:14px;font-weight:500">密码<span style="color:red">*</span></label>
        <input type="password" id="loginPassword" required placeholder="输入密码" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:16px">
        <button type="submit" style="width:100%;padding:12px;background:#4f46e5;color:white;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600">登录</button>
        <p id="loginError" style="color:red;font-size:13px;margin:12px 0 0;display:none"></p>
      </form>
      <form id="registerForm" style="display:none">
        <label style="display:block;margin-bottom:6px;font-size:14px;font-weight:500">用户名<span style="color:red">*</span><small style="color:#888">（仅字母、数字、下划线，3-30位）</small></label>
        <input type="text" id="regUsername" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9_]+" placeholder="例如：zhangsan" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:16px">
        <label style="display:block;margin-bottom:6px;font-size:14px;font-weight:500">显示名称<span style="color:red">*</span></label>
        <input type="text" id="regDisplayName" required maxlength="64" placeholder="你在应用中看到自己的名字" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:16px">
        <label style="display:block;margin-bottom:6px;font-size:14px;font-weight:500">密码<span style="color:red">*</span><small style="color:#888">（至少8位）</small></label>
        <input type="password" id="regPassword" required minlength="8" maxlength="128" placeholder="请输入密码" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:16px">
        <button type="submit" style="width:100%;padding:12px;background:#4f46e5;color:white;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600">注册</button>
        <p id="regError" style="color:red;font-size:13px;margin:12px 0 0;display:none"></p>
      </form>
    </div></div>`;
  $("#app").innerHTML = html;
  // Tab switching
  document.querySelectorAll(".auth-tab").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".auth-tab").forEach((t) => { t.style.color = "#888"; t.style.borderBottomColor = "transparent"; });
      btn.style.color = "#4f46e5";
      btn.style.borderBottomColor = "#4f46e5";
      const tab = btn.dataset.authTab;
      document.getElementById("loginForm").style.display = tab === "login" ? "block" : "none";
      document.getElementById("registerForm").style.display = tab === "register" ? "block" : "none";
    };
  });
  // Login submit
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("loginError");
    errEl.style.display = "none";
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: document.getElementById("loginUsername").value.trim(), password: document.getElementById("loginPassword").value }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "登录失败");
      toast("登录成功！");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      errEl.textContent = err.message || "登录失败";
      errEl.style.display = "block";
    }
  };
  // Register submit
  document.getElementById("registerForm").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("regError");
    errEl.style.display = "none";
    try {
      const resp = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: document.getElementById("regUsername").value.trim(), displayName: document.getElementById("regDisplayName").value.trim(), password: document.getElementById("regPassword").value }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "注册失败");
      toast("注册成功！已自动登录");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      errEl.textContent = err.message || "注册失败";
      errEl.style.display = "block";
    }
  };
}

function render() {
  if (!isAuthenticated && configRequireAuth()) { renderAuthGate(); return; }
  const content = state.role === "recruiter" ? recruiterView() : state.view === "diagnosis" ? diagnosisView() : state.view === "interview" ? interviewView() : state.view === "growth" ? growthView() : dashboardView();
  $("#app").innerHTML = shell(content);
  document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => go(button.dataset.view));
  bindView();
  bindRoleSwitch();
  if (state.role === "recruiter") bindRecruiterView();
}

/** Check if auth is enforced — reads from global scope since app.js runs in browser */
function configRequireAuth() {
  const marker = document.querySelector('meta[name="offerpilot-require-auth"]');
  return marker?.content === "true";
}

function dashboardView() {
  const latest = state.records[0];
  const avg = state.records.length ? (state.records.reduce((n, r) => n + Number(r.report?.average || 0), 0) / state.records.length).toFixed(1) : "—";
  return `<section class="hero-card"><div><span class="section-kicker">YOUR NEXT OFFER STARTS HERE</span><h2>${state.profile ? `继续打磨你的${esc(state.profile.targetRole || "目标岗位")}竞争力` : "先上传简历，建立你的面试训练档案"}</h2><p>${state.profile ? "简历诊断、动态压力面和成长报告已经串成一条训练路径。" : "系统会从完整经历出发，帮你找到最适合的岗位和最值得准备的技术问题。"}</p><button class="primary-button" data-action="${state.profile ? "interview" : "diagnosis"}">${state.profile ? "继续训练 →" : "上传我的简历 →"}</button></div><div class="hero-orbit"><span>01</span><b>诊断</b><i></i><span>02</span><b>面试</b><i></i><span>03</span><b>成长</b></div></section><section class="metric-grid"><article class="metric-card"><small>累计面试</small><strong>${state.records.length}</strong><span>场模拟记录</span></article><article class="metric-card"><small>平均表现</small><strong>${avg}<em>${avg === "—" ? "" : "/10"}</em></strong><span>基于已完成面试</span></article><article class="metric-card"><small>当前简历</small><strong>${state.profile ? "已就绪" : "待上传"}</strong><span>${state.profile ? dateText(state.versions[0]?.createdAt) : "上传后开始分析"}</span></article><article class="metric-card"><small>训练重点</small><strong>${state.profile ? esc(state.profile.recommendedRoles?.[0]?.role || "技术深度") : "—"}</strong><span>${state.profile ? "来自完整经历分析" : "等待简历数据"}</span></article></section><div class="dashboard-grid"><section class="surface-card"><div class="section-title"><div><span class="section-kicker">TRAINING PATH</span><h3>你的训练路径</h3></div><button class="text-button" data-action="growth">查看成长报告 →</button></div><div class="path-list"><div class="path-item done"><span>✓</span><div><b>简历诊断</b><small>${state.profile ? "已完成一次结构化分析" : "上传简历，识别你的优势与风险"}</small></div><button data-action="diagnosis">${state.profile ? "查看" : "开始"}</button></div><div class="path-item ${state.records.length ? "done" : "current"}"><span>${state.records.length ? "✓" : "2"}</span><div><b>模拟面试</b><small>${state.records.length ? `已完成 ${state.records.length} 场，继续复测薄弱点` : "让面试官围绕你的回答连续追问"}</small></div><button data-action="interview">${state.profile ? "进入" : "锁定"}</button></div><div class="path-item"><span>3</span><div><b>成长报告</b><small>聚合多次面试，生成下一步训练计划</small></div><button data-action="growth">查看</button></div></div></section><section class="surface-card"><div class="section-title"><div><span class="section-kicker">RECENT SESSIONS</span><h3>最近训练</h3></div><button class="text-button" data-action="growth">全部记录</button></div>${latest ? `<div class="recent-row"><div class="result-dot ${latest.report?.result === "PASS" ? "green" : "amber"}">${esc(latest.report?.average || "—")}</div><div><b>${esc(latest.targetRole)}</b><small>${dateText(latest.createdAt)} · ${latest.report?.result || "已完成"}</small></div><button data-report="${esc(latest.id)}">查看报告</button></div>` : `<div class="empty-block"><span>◌</span><b>还没有面试记录</b><small>完成第一场模拟面试后，这里会出现你的训练轨迹。</small></div>`}</section></div>`;
}

function diagnosisView() {
  if (!state.profile) return `<section class="page-intro"><div><span class="section-kicker">STEP 01 · RESUME</span><h2>先让系统读懂你的经历</h2><p>支持 PDF、TXT、Markdown。解析后你可以逐项核对，并获得有证据支撑的岗位诊断。</p></div><div class="mini-stepper"><b class="active">1 上传</b><i></i><b>2 核对</b><i></i><b>3 诊断</b></div></section><div class="upload-layout-new"><section class="surface-card upload-card-new"><form id="resumeForm"><label class="dropzone-new" for="resumeFile"><span class="upload-icon">↑</span><strong>点击选择简历文件</strong><span>或将文件拖放到这里</span><small>支持 PDF、TXT、Markdown · 最大 8MB</small><input id="resumeFile" name="resume" type="file" accept=".pdf,.txt,.md" required></label><div id="selectedFile" class="selected-file hidden"></div><button class="primary-button full" type="submit">开始智能分析 <span>→</span></button></form></section><aside class="surface-card checklist-card"><span class="illustration-icon">✦</span><h3>你会得到什么</h3><div class="check-row"><b>01</b><div><strong>完整简历画像</strong><small>先读懂整条经历主线，再给岗位建议</small></div></div><div class="check-row"><b>02</b><div><strong>逐段亮点与风险</strong><small>每个结论都能回到具体简历证据</small></div></div><div class="check-row"><b>03</b><div><strong>可执行改进清单</strong><small>告诉你该补什么，而不是只给一个分数</small></div></div></aside></div>`;
  const p = state.profile;
  const roleCards = (p.recommendedRoles || []).slice(0, 5).map((r, i) => `<button class="role-card ${i === 0 ? "selected" : ""}" data-role="${esc(r.role)}"><div><b>${esc(r.role)}</b><p>${r.reasons.map(esc).join("；")}</p></div><strong>${r.score}%</strong><div class="score-track"><i style="width:${r.score}%"></i></div></button>`).join("");
  const experienceCards = (p.experiences || []).map((e, i) => `<article class="experience-card"><div class="experience-heading"><div><span class="experience-index">0${i+1}</span><div><h4>${esc(e.title)}</h4><p>${esc([e.organization,e.role,e.period,e.location].filter(Boolean).join(" · "))}</p></div></div><span class="type-chip">${esc(e.section || e.type)}</span></div><p class="experience-summary">${esc(e.summary || "暂未提取到完整描述")}</p><div class="bullet-list">${e.bullets.map((b) => `<div>• ${esc(b)}</div>`).join("")}</div>${e.highlights.length || e.risks.length ? `<div class="insight-grid">${e.highlights.length ? `<div class="insight positive"><b>亮点</b><ul>${e.highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${e.risks.length ? `<div class="insight negative"><b>面试风险</b><ul>${e.risks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>` : `<div class="quiet-note">这段经历暂未发现需要特别强调的问题，面试时仍要准备个人贡献证据。</div>`}</article>`).join("");
  return `<section class="page-intro"><div><span class="section-kicker">RESUME DIAGNOSIS · ${esc(p.name || "CURRENT VERSION")}</span><h2>这份简历讲了什么</h2><p>先完整理解你的教育与经历，再决定你适合什么岗位。</p></div><div class="intro-actions"><button class="secondary-button" data-action="upload">重新上传</button><button class="primary-button" data-action="interview">开始面试 →</button></div></section><section class="surface-card summary-card"><div class="section-title"><div><span class="section-kicker">CANDIDATE STORY</span><h3>候选人画像</h3></div><span class="confidence-chip">已完成结构化分析</span></div><p>${esc(p.summary)}</p>${p.contact?.email || p.contact?.phone || p.contact?.links?.length ? `<div class="contact-line">${p.contact.email ? `<span>✉ ${esc(p.contact.email)}</span>` : ""}${p.contact.phone ? `<span>☎ ${esc(p.contact.phone)}</span>` : ""}${(p.contact.links || []).map((x) => `<span>↗ ${esc(x)}</span>`).join("")}</div>` : ""}<details class="raw-resume"><summary>查看清洗后的文本，核对识别结果</summary><pre>${esc(p.normalizedText || p.rawText)}</pre></details></section><div class="two-column"><section class="surface-card"><div class="section-title"><div><span class="section-kicker">EVIDENCE REVIEW</span><h3>经历逐段解析</h3></div><small>有证据才标注</small></div><div class="experience-list">${experienceCards || `<div class="empty-block">未识别到结构化经历，请检查简历文本层。</div>`}</div></section><aside class="surface-card"><div class="section-title"><div><span class="section-kicker">ROLE FIT</span><h3>岗位建议</h3></div><small>基于完整经历</small></div><div class="role-list">${roleCards}</div><div class="section-title compact"><h3>技术能力索引</h3><small>辅助信息</small></div><div class="tag-wrap">${(p.skills || []).map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("") || "<span class='muted'>暂未识别</span>"}</div></aside></div><section class="surface-card"><div class="section-title"><div><span class="section-kicker">DIAGNOSTIC MAP</span><h3>招聘视角诊断</h3></div><small>面试前优先处理风险项</small></div><div class="diagnostic-columns"><div class="diagnostic-box good"><h4>✓ 值得保留的亮点</h4><ul>${(p.strengths || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li>暂未发现明显亮点</li>"}</ul></div><div class="diagnostic-box risk"><h4>! 可能被深挖的风险</h4><ul>${(p.risks || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li>暂未发现明显共性风险</li>"}</ul></div></div></section><section class="surface-card"><div class="section-title"><div><span class="section-kicker">ACTION LIST</span><h3>简历改进清单</h3></div><small>完成后再诊断一次</small></div><div class="task-list">${(p.risks || []).slice(0, 6).map((x, i) => `<label><input type="checkbox" data-task="resume-${i}"><span>${esc(x.replace(/^[^：]+：/, ""))}</span></label>`).join("") || `<label><input type="checkbox"><span>为核心项目补充个人贡献、基线和结果证据</span></label>`}</div></section>`;
}

function renderTranscriptHtml(transcript = []) {
  if (!transcript.length) return "";
  return transcript.map((item) => {
    const isUser = item.role === "candidate";
    const score = Number.isFinite(Number(item.score)) ? `<span class="gpt-score">本题 ${esc(item.score)}/10</span>` : "";
    return `<article class="gpt-msg ${isUser ? "user" : "assistant"}"><div class="gpt-avatar">${isUser ? "你" : "AI"}</div><div class="gpt-bubble-wrap"><b>${isUser ? "你" : "面试官"}</b><div class="gpt-bubble">${esc(item.text)}</div>${isUser ? score : ""}</div></article>`;
  }).join("");
}

function interviewView() {
  if (!state.current) return `<section class="page-intro"><div><span class="section-kicker">STEP 02 · MOCK INTERVIEW</span><h2>配置一场针对你的面试</h2><p>面试官会根据目标岗位、简历证据和你的实时回答连续追问。</p></div><div class="mini-stepper"><b class="active">1 配置</b><i></i><b>2 对话</b><i></i><b>3 报告</b></div></section><section class="surface-card setup-panel"><div class="section-title"><div><span class="section-kicker">INTERVIEW SETUP</span><h3>开始前先确定训练目标</h3></div></div><div class="form-grid"><label><span>使用简历</span><select id="interviewResume"><option>${esc(state.profile?.name || "当前简历版本")}</option></select></label><label><span>目标岗位</span><input id="targetRole" value="${esc(state.profile?.recommendedRoles?.[0]?.role || state.profile?.targetRole || "")}" placeholder="例如：后端开发工程师"></label><label><span>面试类型</span><select id="interviewType"><option value="comprehensive">综合技术面</option><option value="project_deep_dive">项目深挖</option><option value="technical_fundamentals">技术原理专项</option><option value="system_design">系统设计</option></select></label><label><span>压力等级</span><select id="pressure"><option value="2">适中 · 连续追问</option><option value="3" selected>进阶 · 质疑反例</option><option value="4">高压 · 交叉审问</option><option value="5">极限 · 强势深挖</option></select></label></div><div class="focus-box"><b>本场建议重点</b><span>${esc(state.profile?.risks?.slice(0, 3).join("；") || "完成简历分析后自动生成")}</span></div><button id="startInterview" class="primary-button">开始模拟面试 →</button></section>`;
  const s = state.current;
  const transcript = Array.isArray(s.transcript) && s.transcript.length
    ? s.transcript
    : (s.question ? [{ role: "interviewer", text: s.question }] : []);
  return `<div class="gpt-interview">
    <aside class="gpt-side">
      <button class="back-link" data-action="dashboard">← 返回工作台</button>
      <div class="gpt-side-card"><label>候选人</label><strong>${esc(state.profile?.name || "模拟用户")}</strong></div>
      <div class="gpt-side-card"><label>应聘岗位</label><strong>${esc(s.targetRole)}</strong></div>
      <div class="gpt-side-card"><label>当前阶段</label><strong id="roomPhase">${esc(s.phase || "项目深挖")}</strong></div>
      <div class="gpt-side-card"><label>考查能力</label><strong id="roomSkill">${esc(s.mappedSkill || s.topic || "岗位核心能力")}</strong></div>
      <div class="gpt-side-card"><label>已回答</label><strong id="roomProgress">${s.progress || 0} 道</strong><div class="gpt-progress"><i id="roomProgressBar" style="width:${Math.min(100, (s.progress || 0) * 10)}%"></i></div></div>
      <button id="finishInterview" class="gpt-finish">结束并生成报告</button>
      <button id="abandonInterview" class="gpt-abandon" type="button">放弃本场，重新开始</button>
    </aside>
    <section class="gpt-main">
      <div class="gpt-mobile-bar"><button type="button" data-action="dashboard">← 返回</button><button type="button" id="finishInterviewMobile">结束面试</button></div>
      <header class="gpt-topbar"><div class="gpt-topbar-title"><span class="online-dot"></span><div><b>AI 技术面试官</b><small id="roomTopic">${esc(s.topic || "正在分析简历")}</small></div></div><span class="model-pill">百炼 · 动态追问</span></header>
      <div id="chat" class="gpt-scroll"><div class="gpt-thread" id="thread"><div class="gpt-intro"><h2>模拟面试进行中</h2><p>说清楚职责、机制、权衡和结果。面试官会根据你的回答连续追问。</p></div>${renderTranscriptHtml(transcript)}</div></div>
      <div class="gpt-dock"><div class="gpt-dock-inner"><div id="feedback" class="gpt-feedback hidden"></div><div class="gpt-hints"><button type="button" data-hint="请补充你的个人职责、实现细节和结果指标">补充实现细节</button><button type="button" data-hint="请说明你为什么选择这个方案，以及替代方案">补充方案权衡</button></div><form id="answerForm" class="gpt-composer"><textarea id="answer" rows="1" placeholder="输入你的回答，Enter 发送，Shift + Enter 换行"></textarea><button type="submit" aria-label="发送">↑</button></form><div class="gpt-composer-meta"><span>回答会同步到本场面试记录</span><span><b id="answerCount">0</b>/4000</span></div></div></div>
    </section>
  </div>`;
}

function collectWeakPoints(records) {
  const map = new Map();
  for (const record of records) {
    for (const wp of record.report?.weakPoints || []) {
      const key = wp.skill || wp.title;
      const prev = map.get(key) || { skill: key, title: wp.title, count: 0, severity: wp.severity, evidenceQuote: wp.evidenceQuote, howToFix: wp.howToFix, drillQuestion: wp.drillQuestion, whyItMatters: wp.whyItMatters };
      prev.count += 1;
      if (({ high: 3, medium: 2, low: 1 }[wp.severity] || 0) > ({ high: 3, medium: 2, low: 1 }[prev.severity] || 0)) prev.severity = wp.severity;
      map.set(key, prev);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || String(b.severity).localeCompare(String(a.severity)));
}

function averageDimensions(records) {
  const keys = ["projectOwnership", "technicalDepth", "metricsLiteracy", "tradeoffJudgment", "systemThinking", "communication"];
  const labels = { projectOwnership: "项目职责", technicalDepth: "技术深度", metricsLiteracy: "指标口径", tradeoffJudgment: "方案权衡", systemThinking: "系统思维", communication: "表达结构" };
  const withDims = records.filter((r) => r.report?.dimensionScores);
  return keys.map((key) => {
    if (!withDims.length) return { key, label: labels[key], value: 0 };
    const value = Math.round(withDims.reduce((n, r) => n + Number(r.report.dimensionScores[key] || 0), 0) / withDims.length);
    return { key, label: labels[key], value };
  });
}

function growthView() {
  const records = state.records;
  const avg = records.length ? records.reduce((n, r) => n + Number(r.report?.average || 0), 0) / records.length : 0;
  const scores = records.slice(0, 8).reverse().map((r) => Number(r.report?.average || 0));
  const weakClusters = collectWeakPoints(records);
  const dims = averageDimensions(records);
  const topWeak = weakClusters[0];
  const latestPlan = records[0]?.report?.next7DaysPlan || [];
  return `<section class="page-intro"><div><span class="section-kicker">LONGITUDINAL COACHING</span><h2>成长不是一个分数，而是一条趋势</h2><p>系统按岗位能力聚合每次面试的诊断，告诉你下一步该练什么。</p></div><button class="secondary-button" data-action="interview">开始针对性训练 →</button></section>
  <section class="metric-grid growth-metrics">
    <article class="metric-card"><small>累计面试</small><strong>${records.length}</strong><span>已完成训练</span></article>
    <article class="metric-card"><small>平均表现</small><strong>${records.length ? avg.toFixed(1) : "—"}<em>${records.length ? "/10" : ""}</em></strong><span>跨场次聚合</span></article>
    <article class="metric-card"><small>最佳表现</small><strong>${records.length ? Math.max(...records.map((r) => Number(r.report?.average || 0))).toFixed(1) : "—"}</strong><span>历史最高分</span></article>
    <article class="metric-card"><small>最需提升</small><strong>${topWeak ? esc(topWeak.skill) : "待训练"}</strong><span>${topWeak ? `出现 ${topWeak.count} 次` : "完成一次面试后生成"}</span></article>
  </section>
  <div class="growth-grid">
    <section class="surface-card"><div class="section-title"><div><span class="section-kicker">PERFORMANCE TREND</span><h3>面试表现趋势</h3></div><small>最近 ${scores.length || 0} 场</small></div>${scores.length ? `<div class="trend-chart"><div class="chart-grid"><i></i><i></i><i></i></div><div class="bars">${scores.map((score, i) => `<div class="bar-column"><span>${score.toFixed(1)}</span><i style="height:${Math.max(8, score * 10)}%"></i><small>第${i + 1}场</small></div>`).join("")}</div></div>` : `<div class="empty-block tall"><span>↗</span><b>完成第一场面试后生成趋势</b><small>你会看到岗位相关能力的变化。</small></div>`}</section>
    <section class="surface-card"><div class="section-title"><div><span class="section-kicker">CAPABILITY MAP</span><h3>能力雷达</h3></div><small>来自真实诊断</small></div><div class="capability-list">${dims.map((d) => `<div><span>${d.label}</span><div class="score-track"><i style="width:${d.value}%"></i></div><b>${records.length ? d.value : "—"}</b></div>`).join("")}</div></section>
  </div>
  <div class="growth-grid">
    <section class="surface-card"><div class="section-title"><div><span class="section-kicker">WEAKNESS REVIEW</span><h3>高频薄弱点</h3></div><small>按岗位能力聚类</small></div>${weakClusters.length ? `<div class="weak-list">${weakClusters.slice(0, 6).map((x) => `<article><span class="score-badge ${x.severity === "high" ? "bad" : x.severity === "medium" ? "warn" : "good"}">${esc(x.severity)}</span><div><b>${esc(x.title)}</b><small>能力：${esc(x.skill)} · 出现 ${x.count} 次</small><p class="weak-quote">“${esc(x.evidenceQuote || "")}”</p><small>${esc(x.howToFix || x.whyItMatters || "")}</small></div></article>`).join("")}</div>` : `<div class="empty-block"><span>✓</span><b>暂时没有高频薄弱点</b><small>完成一次面试后，系统会把需要复习的问题集中到这里。</small></div>`}</section>
    <section class="surface-card"><div class="section-title"><div><span class="section-kicker">NEXT 7 DAYS</span><h3>下一步训练计划</h3></div></div>${latestPlan.length ? `<div class="plan-list">${latestPlan.map((item) => `<label><input type="checkbox"><span><b>${esc(item.dayRange)} · ${esc(item.linkedWeakPoint || "训练项")}</b><small>${esc(item.task)}</small><small>成功标准：${esc(item.successCriteria || "")}</small></span></label>`).join("")}</div>` : `<div class="plan-list"><label><input type="checkbox"><span><b>先完成一场模拟面试</b><small>系统会基于你的真实薄弱点生成 7 日计划</small></span></label></div>`}<button class="primary-button full" data-action="interview">开始下一轮训练 →</button></section>
  </div>
  <section class="surface-card"><div class="section-title"><div><span class="section-kicker">SESSION HISTORY</span><h3>历史面试</h3></div><small>${records.length} 条记录</small></div>${records.length ? `<div class="history-table"><div class="history-head"><span>岗位</span><span>结果</span><span>得分</span><span>时间</span><span></span></div>${records.map((r) => `<div class="history-row"><b>${esc(r.targetRole)}</b><span class="result-text ${r.report?.result === "PASS" ? "pass" : ""}">${esc(r.report?.result || "—")}</span><strong>${esc(r.report?.average || "—")}/10</strong><span>${dateText(r.createdAt)}</span><button data-report="${esc(r.id)}">查看报告</button></div>`).join("")}</div>` : `<div class="empty-block">还没有历史面试记录。</div>`}</section>`;
}

function recruiterView() {
  const r = state.recruiter || (state.recruiter = { jobs: [], currentJob: null, resumes: [], matches: [], selected: [] });
  const job = r.currentJob;
  const top = (r.matches || []).slice(0, 5);
  const jobOptions = (r.jobs || []).map((x) => `<option value="${esc(x.id)}" ${job?.id === x.id ? "selected" : ""}>${esc(x.title)}</option>`).join("");
  const cards = top.length ? top.map((m) => `<article class="candidate-result-card"><div class="candidate-result-head"><div class="rank-badge rank-${m.rank}">#${m.rank}</div><div><h4>${esc(m.profile.name || m.fileName)}</h4><small>${esc(m.fileName)} · ${esc(recommendationText(m.analysis.recommendation))}</small></div><strong>${m.analysis.overallScore}<small>/100</small></strong></div><div class="match-progress"><i style="width:${m.analysis.overallScore}%"></i></div><div class="candidate-score-grid"><span>技术匹配 <b>${m.analysis.dimensionScores.technicalMatch}</b></span><span>经历相关 <b>${Math.round(m.analysis.dimensionScores.experienceRelevance)}</b></span><span>技术深度 <b>${m.analysis.dimensionScores.technicalDepth}</b></span><span>证据质量 <b>${m.analysis.dimensionScores.evidenceQuality}</b></span></div><div class="candidate-insights"><div><b>优势</b><p>${esc(m.analysis.strengths.slice(0, 2).join("；") || "暂未形成明确优势证据")}</p></div><div><b>需要核验</b><p>${esc(m.analysis.risks.slice(0, 2).join("；") || "暂无明显风险")}</p></div></div><details class="candidate-details"><summary>查看岗位匹配证据与面试重点</summary><div class="detail-columns"><div><b>匹配要求</b><ul>${m.analysis.matchedRequirements.filter((x) => x.strength !== "weak").slice(0, 5).map((x) => `<li>${esc(x.requirement)} · ${esc(x.strength)}</li>`).join("") || "<li>暂无明确匹配证据</li>"}</ul></div><div><b>建议追问</b><ul>${m.analysis.interviewFocus.slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div></details></article>`).join("") : `<div class="recruiter-empty"><span>◎</span><b>还没有匹配结果</b><small>创建岗位并上传多份简历后，系统会按统一 Rubric 生成 Top 5。</small></div>`;
  return `<section class="recruiter-hero"><div><span class="section-kicker">RECRUITER WORKSPACE</span><h2>用证据筛选值得面试的人</h2><p>先拆解岗位，再批量分析简历，最后比较候选人与岗位要求的真实匹配度。</p></div><div class="recruiter-stats"><span><b>${r.jobs.length}</b>岗位</span><span><b>${r.resumes.length}</b>简历</span><span><b>${top.length}</b>推荐</span></div></section><div class="recruiter-layout"><aside class="recruiter-control"><section class="surface-card"><div class="section-title"><div><span class="section-kicker">01 · JOB</span><h3>创建岗位</h3></div></div><form id="jobForm"><label><span>岗位名称</span><input id="jobTitle" placeholder="例如：大模型应用工程师" required></label><label><span>岗位 JD</span><textarea id="jobJd" rows="8" placeholder="粘贴岗位职责、技术要求、学历和加分项" required></textarea></label><button class="primary-button full" type="submit">解析岗位要求 →</button></form></section>${r.jobs.length ? `<section class="surface-card job-picker"><div class="section-title"><h3>当前岗位</h3><small>${r.jobs.length} 个岗位</small></div><select id="jobPicker">${jobOptions}</select><div class="job-rubric">${job ? `<b>${esc(job.title)}</b><small>${job.mustHave.length} 项核心技术要求 · ${job.competencies.length} 项综合能力</small>` : "请选择岗位"}</div></section>` : ""}</aside><main class="recruiter-main">${job ? `<section class="surface-card upload-resumes-card"><div class="section-title"><div><span class="section-kicker">02 · RESUME POOL</span><h3>批量上传候选人简历</h3><small>支持多选 PDF、TXT、Markdown，单个文件最大 8MB</small></div><span class="status-chip">${r.resumes.length} 份已加入</span></div><form id="recruiterResumeForm"><label class="batch-dropzone" for="recruiterFiles"><span>＋</span><b>点击或拖入多份简历</b><small>系统会逐份提取经历、技术动作、结果证据和风险</small><input id="recruiterFiles" name="resumes" type="file" accept=".pdf,.txt,.md" multiple></label><div id="batchFileList" class="batch-file-list"></div><button class="primary-button" type="submit">上传并加入简历池 →</button></form></section><section class="surface-card matching-card"><div class="section-title"><div><span class="section-kicker">03 · MATCHING AGENT</span><h3>岗位匹配与 Top 5</h3><small>基于岗位 Rubric、经历证据和横向校准</small></div><div class="matching-actions"><button id="matchButton" class="primary-button" ${r.resumes.length ? "" : "disabled"}>开始匹配</button>${top.length > 1 ? `<button id="compareButton" class="secondary-button">对比 Top ${Math.min(5, top.length)} →</button>` : ""}</div></div>${cards}</section>` : `<div class="recruiter-empty recruiter-start"><span>⌁</span><b>先创建一个岗位</b><small>把真实 JD 粘贴进来，系统才能用岗位能力而不是泛泛关键词评价候选人。</small></div>`}</main></div>`;
}

function bindRoleSwitch() {
  const actions = $(".top-actions"); if (!actions || actions.querySelector("#roleSwitch")) return;
  const switcher = document.createElement("select"); switcher.id = "roleSwitch"; switcher.className = "role-switch"; switcher.innerHTML = `<option value="candidate">候选人端</option><option value="recruiter">招聘者端</option>`; switcher.value = state.role; actions.insertBefore(switcher, actions.firstChild); switcher.onchange = () => { state.role = switcher.value; state.view = "dashboard"; save(); render(); };
  if (state.role === "recruiter") { const nav = document.querySelector(".app-sidebar nav"); if (nav) nav.innerHTML = `<button class="nav-link active"><span class="nav-icon">⌂</span>招聘者工作台</button><button class="nav-link" data-recruiter-action="job">岗位与 JD</button><button class="nav-link" data-recruiter-action="pool">简历池与匹配</button>`; const eyebrow = document.querySelector(".topbar .eyebrow"); const heading = document.querySelector(".topbar h1"); if (eyebrow) eyebrow.textContent = "RECRUITER WORKSPACE"; if (heading) heading.textContent = "招聘者人才筛选工作台"; document.querySelectorAll("[data-recruiter-action]").forEach((button) => button.onclick = () => document.querySelector(".recruiter-control")?.scrollIntoView({ behavior: "smooth" })); }
}

function bindRecruiterView() {
  const r = state.recruiter; const jobForm = $("#jobForm"); const jobPicker = $("#jobPicker");
  if (jobForm) jobForm.onsubmit = async (event) => { event.preventDefault(); const button = jobForm.querySelector("button"); button.disabled = true; button.textContent = "正在拆解 JD…"; try { const response = await fetch("/api/recruiter/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: $("#jobTitle").value, jd: $("#jobJd").value }) }); const data = await response.json(); if (data.error) throw new Error(data.error); r.jobs.unshift(data.job); r.currentJob = data.job; r.resumes = []; r.matches = []; save(); toast("岗位 Rubric 已生成"); render(); } catch (error) { toast(error.message || "岗位创建失败"); button.disabled = false; button.textContent = "解析岗位要求 →"; } };
  if (jobPicker) jobPicker.onchange = () => { r.currentJob = r.jobs.find((x) => x.id === jobPicker.value) || r.currentJob; r.resumes = []; r.matches = []; save(); render(); };
  const form = $("#recruiterResumeForm"); const input = $("#recruiterFiles"); const list = $("#batchFileList");
  if (form && input) { input.onchange = () => { list.innerHTML = Array.from(input.files || []).map((file) => `<span>${esc(file.name)} <small>${(file.size / 1024).toFixed(0)} KB</small></span>`).join(""); }; form.onsubmit = async (event) => { event.preventDefault(); if (!input.files?.length) return toast("请先选择至少一份简历"); const button = form.querySelector("button"); button.disabled = true; button.textContent = "正在解析简历…"; try { const response = await fetch(`/api/recruiter/jobs/${r.currentJob.id}/resumes`, { method: "POST", body: new FormData(form) }); const data = await response.json(); if (data.error) throw new Error(data.error); r.resumes = [...r.resumes, ...data.resumes]; save(); toast(`已加入 ${data.count} 份简历`); render(); } catch (error) { toast(error.message || "批量解析失败"); button.disabled = false; button.textContent = "上传并加入简历池 →"; } }; }
  const matchButton = $("#matchButton"); if (matchButton) matchButton.onclick = async () => {
    if (r.currentJob.rubricStatus !== "confirmed") {
      if (!window.confirm("请确认当前岗位要求与评分 Rubric 已检查无误。确认后将用于所有候选人的统一匹配，是否继续？")) return;
      const confirmed = await (await fetch(`/api/recruiter/jobs/${r.currentJob.id}/confirm-rubric`, { method: "POST" })).json();
      if (confirmed.error) return toast(confirmed.error);
      r.currentJob = confirmed.job; save();
    }
    matchButton.disabled = true; matchButton.textContent = "正在启动 Agent…";
    try {
      const response = await fetch(`/api/recruiter/jobs/${r.currentJob.id}/match`, { method: "POST" }); const data = await response.json();
      if (data.error) throw new Error(data.error); if (!data.taskId) throw new Error("分析任务未创建");
      const poll = async () => { const result = await (await fetch(`/api/recruiter/tasks/${data.taskId}`)).json(); if (result.error) throw new Error(result.error); const task = result.task; matchButton.textContent = task.status === "analyzing" ? `逐份取证 ${task.completed}/${task.total}…` : task.status === "matching" ? "横向校准中…" : "处理中…"; if (task.status === "completed") { r.matches = result.matches || []; r.resumes = r.resumes.map((resume) => r.matches.find((match) => match.id === resume.id) || resume); save(); toast(`Top ${Math.min(5, r.matches.length)} 匹配完成 · ${task.mode === "model" ? "百炼 Agent" : task.mode === "mixed" ? "混合模式" : "本地降级"}`); render(); return; } if (task.status === "failed") throw new Error(task.error || "Agent 分析失败"); setTimeout(poll, 700); };
      await poll();
    } catch (error) { toast(error.message || "匹配失败"); matchButton.disabled = false; matchButton.textContent = "开始匹配"; }
  };
  const compareButton = $("#compareButton"); if (compareButton) compareButton.onclick = () => { const rows = r.matches.slice(0, 5).map((m) => `<tr><th>${esc(m.profile.name || m.fileName)}</th><td>${m.analysis.dimensionScores.technicalMatch}</td><td>${Math.round(m.analysis.dimensionScores.experienceRelevance)}</td><td>${m.analysis.dimensionScores.technicalDepth}</td><td>${m.analysis.dimensionScores.evidenceQuality}</td><td>${m.analysis.overallScore}</td></tr>`).join(""); const modal = document.createElement("div"); modal.className = "modal-backdrop"; modal.innerHTML = `<section class="report-modal compare-modal"><div class="section-title"><div><span class="section-kicker">CANDIDATE COMPARISON</span><h2>Top ${Math.min(5, r.matches.length)} 候选人对比</h2></div><button class="secondary-button" data-close>关闭</button></div><div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>候选人</th><th>技术匹配</th><th>经历相关</th><th>技术深度</th><th>证据质量</th><th>总分</th></tr></thead><tbody>${rows}</tbody></table></div><div class="comparison-note">分数只基于岗位相关证据和统一 Rubric，最终是否进入面试仍由招聘者决定。</div></section>`; document.body.appendChild(modal); modal.querySelector("[data-close]").onclick = () => modal.remove(); };
}

function bindView() {
  document.querySelectorAll("[data-action]").forEach((node) => node.onclick = () => { const action = node.dataset.action; if (action === "upload") { state.profile = null; go("diagnosis"); } else if (action === "interview") go("interview"); else if (action === "growth") go("growth"); else go(action); });
  document.querySelectorAll("[data-report]").forEach((node) => node.onclick = () => showReport(state.records.find((r) => r.id === node.dataset.report)));
  if (state.view === "diagnosis" && !state.profile) bindUpload();
  if (state.view === "interview" && !state.current) bindInterviewSetup();
  if (state.view === "interview" && state.current) bindInterviewRoom();
  document.querySelectorAll(".role-card").forEach((card) => card.onclick = () => { document.querySelectorAll(".role-card").forEach((x) => x.classList.remove("selected")); card.classList.add("selected"); const input = $("#targetRole"); if (input) input.value = card.dataset.role; });
}

function bindUpload() {
  const form = $("#resumeForm"); const input = $("#resumeFile"); const drop = $(".dropzone-new");
  input.onchange = () => input.files[0] && ($("#selectedFile").textContent = `${input.files[0].name} · ${(input.files[0].size / 1024).toFixed(1)} KB`, $("#selectedFile").classList.remove("hidden"));
  ["dragenter", "dragover"].forEach((e) => drop.addEventListener(e, (event) => { event.preventDefault(); drop.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (event) => { event.preventDefault(); drop.classList.remove("dragging"); }));
  drop.addEventListener("drop", (event) => { if (!event.dataTransfer.files.length) return; const transfer = new DataTransfer(); transfer.items.add(event.dataTransfer.files[0]); input.files = transfer.files; input.onchange(); });
  form.onsubmit = async (event) => { event.preventDefault(); const button = form.querySelector("button"); button.disabled = true; button.innerHTML = `<span class="loading-spinner"></span> 正在解析简历…`; try {
      const response = await fetch("/api/resume/analyze", { method: "POST", body: new FormData(form) });
      const data = await response.json();
      if (!data || data.analysisError) throw new Error(data?.analysisError || "分析失败");
      state.profile = data.profile; state.profile.analyzedAt = new Date().toISOString();
      const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
      state.versions.unshift({ id: uid(), name: input.files[0]?.name || "当前简历", createdAt: state.profile.analyzedAt });
      state.versions = state.versions.slice(0, 10); save();
      toast("简历解析完成！");
      render(); go("diagnosis");
      button.disabled = false;
      button.innerHTML = "开始智能分析 <span>→</span>";
    } catch (error) {
      const msg = error.name === "AbortError" ? "上传超时：网络连接不稳定，请检查网络后重新上传。" : error.message || "简历分析失败，请重试";
      toast(msg);
      button.disabled = false;
      button.innerHTML = "开始智能分析 <span>→</span>";
    } };
}

function bindInterviewSetup() {
  if (!state.profile) { toast("请先上传并分析简历"); go("diagnosis"); return; }
  $("#startInterview").onclick = async () => { const button = $("#startInterview"); const targetRole = $("#targetRole").value.trim(); const interviewType = $("#interviewType").value; if (!targetRole) return toast("请输入目标岗位"); button.disabled = true; button.textContent = "AI 正在阅读简历…"; try { const response = await fetch("/api/interview/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: state.profile, targetRole, interviewType, pressure: Number($("#pressure").value) }) }); const data = await response.json(); if (data.error) throw new Error(data.error); state.current = { id: data.sessionId, targetRole, interviewType: data.interviewType || interviewType, pressure: Number($("#pressure").value), phase: data.phase, question: data.question, topic: data.topic, mappedSkill: data.mappedSkill || data.topic, progress: 0, transcript: Array.isArray(data.transcript) ? data.transcript : [{ role: "interviewer", text: data.question }], startedAt: new Date().toISOString(), roleRubric: data.roleRubric }; save(); render(); } catch (error) { toast(error.message || "创建面试失败"); button.disabled = false; button.textContent = "开始模拟面试 →"; } };
}

function scrollChatToBottom() {
  const chat = $("#chat");
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function addChat(role, text, score) {
  const thread = $("#thread");
  if (!thread) return;
  const isUser = role === "candidate";
  const row = document.createElement("article");
  row.className = `gpt-msg ${isUser ? "user" : "assistant"}`;
  const scoreHtml = isUser && Number.isFinite(Number(score)) ? `<span class="gpt-score">本题 ${esc(score)}/10</span>` : "";
  row.innerHTML = `<div class="gpt-avatar">${isUser ? "你" : "AI"}</div><div class="gpt-bubble-wrap"><b>${isUser ? "你" : "面试官"}</b><div class="gpt-bubble">${esc(text)}</div>${scoreHtml}</div>`;
  thread.appendChild(row);
  scrollChatToBottom();
}

function setTyping(on) {
  const thread = $("#thread");
  if (!thread) return;
  const existing = $("#typingRow");
  if (!on) { existing?.remove(); return; }
  if (existing) return;
  const row = document.createElement("article");
  row.id = "typingRow";
  row.className = "gpt-msg assistant";
  row.innerHTML = `<div class="gpt-avatar">AI</div><div class="gpt-bubble-wrap"><b>面试官</b><div class="gpt-typing"><i></i><i></i><i></i></div></div>`;
  thread.appendChild(row);
  scrollChatToBottom();
}

function bindInterviewRoom() {
  const form = $("#answerForm");
  const answer = $("#answer");
  if (!form || !answer) return;
  document.querySelectorAll("[data-hint]").forEach((button) => {
    button.onclick = () => {
      answer.value = answer.value ? `${answer.value}\n${button.dataset.hint}：` : `${button.dataset.hint}：`;
      resizeAnswer();
      answer.focus();
    };
  });
  const resizeAnswer = () => {
    answer.style.height = "auto";
    answer.style.height = `${Math.min(Math.max(answer.scrollHeight, 24), 160)}px`;
    const count = $("#answerCount");
    if (count) count.textContent = String(answer.value.length);
  };
  answer.addEventListener("input", resizeAnswer);
  resizeAnswer();
  scrollChatToBottom();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const text = answer.value.trim();
    if (!text || !state.current?.id) return;
    addChat("candidate", text);
    answer.value = "";
    resizeAnswer();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    setTyping(true);
    try {
      const response = await fetch(`/api/interview/${state.current.id}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: text }) });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      state.current.progress = data.progress;
      state.current.phase = data.phase;
      state.current.topic = data.topic;
      state.current.mappedSkill = data.mappedSkill || data.topic;
      state.current.question = data.question;
      state.current.transcript = Array.isArray(data.transcript) ? data.transcript : [
        ...(state.current.transcript || []),
        { role: "candidate", text, score: data.score },
        { role: "interviewer", text: data.question }
      ];
      save();
      const progress = $("#roomProgress");
      const bar = $("#roomProgressBar");
      const phase = $("#roomPhase");
      const topic = $("#roomTopic");
      const skill = $("#roomSkill");
      const feedback = $("#feedback");
      if (progress) progress.textContent = `${data.progress} 道`;
      if (bar) bar.style.width = `${Math.min(100, data.progress * 10)}%`;
      if (phase) phase.textContent = data.phase;
      if (topic) topic.textContent = data.topic || data.phase;
      if (skill) skill.textContent = data.mappedSkill || data.topic || "岗位核心能力";
      if (feedback) {
        const actionLabel = data.action === "pivot" ? "已拉回岗位核心" : data.action === "clarify" ? "继续澄清证据" : "推进下一能力点";
        feedback.textContent = `本题 ${data.score}/10 · ${actionLabel} · ${data.feedback}`;
        feedback.classList.remove("hidden");
      }
      setTyping(false);
      const last = threadLastCandidate();
      if (last) {
        const wrap = last.querySelector(".gpt-bubble-wrap");
        if (wrap && !wrap.querySelector(".gpt-score")) {
          const score = document.createElement("span");
          score.className = "gpt-score";
          score.textContent = `本题 ${data.score}/10`;
          wrap.appendChild(score);
        }
      }
      if (data.shouldFinish) {
        toast("已达到本场题量，正在生成报告");
        await finishInterview();
        return;
      }
      addChat("interviewer", data.question);
    } catch (error) {
      setTyping(false);
      if (!handleExpiredInterview(error)) toast(error.message || "提交失败，请重试");
    } finally {
      button.disabled = false;
      answer.focus();
    }
  };
  answer.onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  };
  const finish = () => finishInterview();
  $("#finishInterview")?.addEventListener("click", finish);
  $("#finishInterviewMobile")?.addEventListener("click", finish);
  $("#abandonInterview")?.addEventListener("click", async () => {
    await clearCurrentInterview({ abandon: true, message: "已放弃本场面试" });
    state.view = "interview";
    save();
    render();
  });
  answer.focus();
}

function threadLastCandidate() {
  return [...document.querySelectorAll("#thread .gpt-msg.user")].at(-1);
}

async function finishInterview() {
  if (!state.current) return;
  const button = $("#finishInterview");
  const mobile = $("#finishInterviewMobile");
  if (button) { button.disabled = true; button.textContent = "正在生成报告…"; }
  if (mobile) mobile.disabled = true;
  try {
    const response = await fetch(`/api/interview/${state.current.id}/finish`, { method: "POST" });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    const record = { id: state.current.id, targetRole: state.current.targetRole, createdAt: state.current.startedAt, report: data.report, transcript: data.transcript, profile: data.profile, diagnoses: data.diagnoses || [], memorySynced: data.memorySynced };
    state.records.unshift(record);
    state.records = state.records.slice(0, 50);
    state.current = null;
    save();
    showReport(record);
    render();
  } catch (error) {
    if (!handleExpiredInterview(error)) {
      toast(error.message || "报告生成失败");
      if (button) { button.disabled = false; button.textContent = "结束并生成报告"; }
      if (mobile) mobile.disabled = false;
    }
  }
}

function showReport(record) {
  if (!record) return;
  const report = record.report || {};
  const dims = report.dimensionScores || {};
  const dimRows = [
    ["项目职责", dims.projectOwnership],
    ["技术深度", dims.technicalDepth],
    ["指标口径", dims.metricsLiteracy],
    ["方案权衡", dims.tradeoffJudgment],
    ["系统思维", dims.systemThinking],
    ["表达结构", dims.communication]
  ].map(([label, value]) => `<div><span>${label}</span><div class="score-track"><i style="width:${Number(value || 0)}%"></i></div><b>${value ?? "—"}</b></div>`).join("");
  const weakHtml = (report.weakPoints || []).length
    ? report.weakPoints.map((wp) => `<article class="report-weak-card"><div class="report-weak-head"><b>${esc(wp.title)}</b><span class="severity-${esc(wp.severity || "medium")}">${esc(wp.severity || "medium")}</span></div><small>能力点：${esc(wp.skill)}</small><p class="weak-quote">“${esc(wp.evidenceQuote || "")}”</p><p><b>为何重要：</b>${esc(wp.whyItMatters || "")}</p><p><b>怎么补：</b>${esc(wp.howToFix || "")}</p><p><b>练习题：</b>${esc(wp.drillQuestion || "")}</p></article>`).join("")
    : `<div class="empty-block">本场尚未形成结构化薄弱点。</div>`;
  const planHtml = (report.next7DaysPlan || []).length
    ? `<ul class="report-list">${report.next7DaysPlan.map((item) => `<li><b>${esc(item.dayRange)}</b> ${esc(item.task)}<br><small>成功标准：${esc(item.successCriteria || "")}</small></li>`).join("")}</ul>`
    : `<ul class="report-list"><li>完成更多轮次后将生成个性化 7 日计划。</li></ul>`;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<section class="report-modal report-modal-wide"><div class="section-title"><div><span class="section-kicker">SESSION REPORT</span><h2>本次模拟面试报告</h2></div><button class="secondary-button" data-close>关闭</button></div>
    <div class="report-result"><div class="result-badge">${esc(report.average || "—")}<small>/10</small></div><div><small>综合结果</small><div class="result-label ${report.result === "PASS" ? "pass" : report.result === "FAIL" ? "fail" : ""}">${esc(report.result || "—")}</div><p>目标岗位：${esc(record.targetRole)}</p></div></div>
    <p class="report-summary">${esc(report.roleFitSummary || "本场报告已生成。")}</p>
    <div class="diagnostic-columns"><div class="diagnostic-box good"><h4>高分回答</h4><p><b>${esc(report.strengths || 0)}</b> 道</p></div><div class="diagnostic-box risk"><h4>需要加强</h4><p><b>${esc(report.weaknesses || 0)}</b> 道</p></div></div>
    <h3>能力诊断</h3><div class="capability-list report-dims">${dimRows}</div>
    <h3>个性化薄弱点</h3><div class="report-weak-list">${weakHtml}</div>
    <h3>下一步训练计划</h3>${planHtml}
    <div class="report-footer"><span class="sync-chip">${record.memorySynced ? "✓ 已提交 OmniMemory" : "本地报告已保存"}${report.coachMode ? ` · ${report.coachMode === "model" ? "百炼 Coach" : "本地诊断"}` : ""}</span><button class="primary-button" data-go-growth>查看成长报告 →</button></div></section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close]").onclick = () => modal.remove();
  modal.querySelector("[data-go-growth]").onclick = () => { modal.remove(); go("growth"); };
}

window.addEventListener("hashchange", () => { const view = location.hash.slice(1); if (["dashboard", "diagnosis", "interview", "growth"].includes(view)) { state.view = view; render(); } });
if (location.hash.slice(1)) state.view = ["dashboard", "diagnosis", "interview", "growth"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";

(async () => {
  await checkAuth(); // verify session cookie on every page load
  if (migratedInterviewId) {
    try { await fetch(`/api/interview/${migratedInterviewId}/abandon`, { method: "POST" }); } catch { /* old session remains historical only */ }
  }
  if (state.current?.id) {
    const ok = await syncCurrentInterview();
    if (!ok && state.view === "interview") state.view = "interview";
  }
  render();
  if (migratedInterviewId) toast("已切换到新版自适应面试，旧对话已结束；简历分析结果已保留");
})();
