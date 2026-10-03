// session.js — Session results dashboard: poll status, render report, tabs, chat, interview, cover letter.
(function () {
  'use strict';

  const sessionId = location.pathname.split('/').pop();
  const app = document.getElementById('app');
  const $ = s => document.querySelector(s);

  let SESSION = null;
  let chatHistory = [];

  // ---------- Markdown ----------
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }
  function md(text) {
    if (!window.marked || !text) return '<div class="md">' + esc(text || '') + '</div>';
    try {
      // sanitize: strip raw html tags & event handlers before parse
      const clean = String(text).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*"[^"]*"/gi, '').replace(/on\w+\s*=\s*'[^']*'/gi, '').replace(/javascript:/gi, '');
      return '<div class="md">' + marked.parse(clean) + '</div>';
    } catch {
      return '<div class="md">' + esc(text) + '</div>';
    }
  }
  // Markdown → plain text (cho body Gmail compose — không render md, giữ bullet/newline)
  function mdToPlain(t) {
    return String(t)
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[-*+]\s+/gm, '• ');
  }

  // DOCX export helper
  async function exportDocx(title, markdown, filename) {
    try {
      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, markdown }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'hiremind.docx';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Đã tải file Word (.docx)');
    } catch {
      toast('Không xuất được file Word');
    }
  }

  // CV thiết kế (.docx có banner màu + ô dán ảnh 3×4 + heading màu + skill 2 cột)
  async function exportCvDocx(markdown, name) {
    try {
      const res = await fetch('/api/export/cv-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, name }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `CV-${(name || 'HireMind').replace(/\s+/g, '-')}.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Đã tải CV (.docx) — mở file, bấm vào ô bên phải để dán ảnh 3×4');
    } catch {
      toast('Không xuất được file CV Word');
    }
  }

  // ---------- Utils ----------
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const VERDICT = {
    excellent: { cls: 'verdict-excellent', label: 'Xuất sắc' },
    good: { cls: 'verdict-good', label: 'Khá tốt' },
    moderate: { cls: 'verdict-moderate', label: 'Trung bình' },
    weak: { cls: 'verdict-weak', label: 'Cần cải thiện nhiều' },
  };
  const PASS_VERDICT = {
    very_likely: { cls: 'pass-very-likely', label: 'Rất nhiều khả năng đậu', emoji: '🎯' },
    likely: { cls: 'pass-likely', label: 'Nhiều khả năng đậu', emoji: '👍' },
    uncertain: { cls: 'pass-uncertain', label: 'Chưa rõ ràng', emoji: '⚖️' },
    unlikely: { cls: 'pass-unlikely', label: 'Nhiều khả năng trượt', emoji: '⚠️' },
    very_unlikely: { cls: 'pass-very-unlikely', label: 'Gần như chắc chắn trượt', emoji: '❌' },
  };
  // Đánh giá đậu/rớt — fallback từ overallScore nếu session cũ không có hireAssessment
  function hireAssess() {
    const r = SESSION.result || {};
    if (r.hireAssessment && typeof r.hireAssessment.passProbability === 'number') return r.hireAssessment;
    const score = r.overallScore || 0;
    const p = Math.max(2, Math.min(95, Math.round(score * 0.9)));
    return {
      passProbability: p,
      verdict: score >= 75 ? 'likely' : score >= 50 ? 'uncertain' : score >= 30 ? 'unlikely' : 'very_unlikely',
      headline: '',
      reasons: [],
      whatWouldRaise: [],
    };
  }

  // ---------- Boot ----------
  async function boot() {
    let procMounted = false;
    for (;;) {
      let d;
      try {
        const res = await fetch(`/api/session/${sessionId}`);
        if (res.status === 404) { renderNotFound(); return; }
        d = await res.json();
      } catch { await sleep(2500); continue; }

      SESSION = d;
      if (d.status === 'ready') { HMProcessing.stop(); render(); return; }
      if (d.status === 'error') { HMProcessing.stop(); renderError(d); return; }
      // Mount panel xử lý ĐÚNG MỘT LẦN — các lần poll sau chỉ update stage.
      // (Remount mỗi poll làm reset bộ đếm thời gian về 00:00 liên tục.)
      if (!procMounted) { renderProcessing(d); procMounted = true; }
      else HMProcessing.update(d.stage || 'queued', d.stageLabel, location.href);
      await sleep(2500);
    }
  }

  // ---------- States ----------
  function renderProcessing(d) {
    const stages = [
      ['extracting', 'Đọc & trích xuất nội dung CV'],
      ['validating', 'AI đọc hiểu & hợp nhất CV'],
      ['jd', 'Tải & phân tích tin tuyển dụng'],
      ['analyzing', 'Phân tích sâu & đối chiếu'],
    ];
    const order = ['queued', 'extracting', 'validating', 'jd', 'analyzing', 'done'];
    const idx = order.indexOf(d.stage || 'queued');
    document.getElementById('hdTitle').textContent = 'AI đang xử lý phiên của bạn...';
    app.innerHTML = `
      <div class="session-loading">
        <div id="procMount"></div>
      </div>`;
    HMProcessing.mount(document.getElementById('procMount'), {
      stage: d.stage || 'queued',
      stageLabel: d.stageLabel || 'Đang xử lý...',
      sessionUrl: location.href,
    });
  }

  function renderNotFound() {
    document.getElementById('hdTitle').textContent = 'Không tìm thấy phiên';
    app.innerHTML = `
      <div class="error-panel">
        <div class="e-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg></div>
        <h2 style="margin-bottom: 10px;">Phiên không tồn tại</h2>
        <p class="muted mb-6">Link phiên không đúng hoặc đã bị xoá. Hãy tạo phiên mới.</p>
        <a class="btn btn-primary" href="/">Tạo phiên mới</a>
      </div>`;
  }

  function renderError(d) {
    document.getElementById('hdTitle').textContent = 'Phiên gặp lỗi';
    const isNotCv = d.notCv;
    app.innerHTML = `
      <div class="error-panel">
        <div class="e-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4m0 4h.01"/></svg></div>
        <h2 style="margin-bottom: 10px;">${isNotCv ? 'Tài liệu không phải là CV' : 'Xử lý thất bại'}</h2>
        <p class="muted mb-6" style="max-width: 460px; margin-inline: auto;">${esc(d.error || 'Đã có lỗi xảy ra khi xử lý phiên này.')}</p>
        ${d.warnings && d.warnings.length ? `<div style="text-align:left; font-size: 0.88rem; color: var(--muted); margin-bottom: 20px;">${d.warnings.map(w => '• ' + esc(w)).join('<br>')}</div>` : ''}
        <a class="btn btn-primary" href="/">Thử lại với phiên mới</a>
      </div>`;
  }

  // ---------- Main render ----------
  function render() {
    const s = SESSION;
    const r = s.result || {};
    const cv = s.cv || {};
    const jd = s.jd;

    document.getElementById('hdTitle').textContent = cv.candidateName || 'Phiên phân tích';
    document.getElementById('hdSub').textContent = `${cv.candidateTitle || s.meta?.targetRole || ''} · ${s.meta?.experienceLevel || ''} · ${jd ? 'JD: ' + (jd.title || '') : 'Không có JD'}`;

    const tabs = [
      ['overview', 'Tổng quan', true],
      ['match', 'Đối chiếu JD', !!jd],
      ['roadmap', 'Lộ trình', !!(r.roadmap && r.roadmap.length)],
      ['rewrite', 'Viết lại CV', false], // TODO(mốc 5:25): bật khi có POST /rewrite
      ['chat', 'Chat Coach', false],
      ['interview', 'Phỏng vấn giả lập', false],
      ['cover', 'Cover Letter', false],
      ['cv', 'CV gốc', false],
    ].filter(t => t[2]);

    app.innerHTML = `
      ${renderHero()}
      <div class="tabs mb-6" role="tablist">
        ${tabs.map(([id, label], i) => `
          <button class="tab ${i === 0 ? 'active' : ''}" data-tab="${id}" role="tab">${esc(label)}</button>`).join('')}
      </div>
      <div id="tabContent"></div>`;

    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        HMCenterTab(btn);
        renderTab(btn.dataset.tab);
      });
    });
    // Hero compact: bấm stat → nhảy đúng tab phân tích; nút mở tóm tắt + kỹ năng
    document.querySelectorAll('.hc-stat').forEach(btn => btn.addEventListener('click', () => {
      document.querySelector(`[data-tab="${btn.dataset.go}"]`)?.click();
    }));
    const hct = document.getElementById('hcToggle');
    if (hct) hct.addEventListener('click', () => {
      const ex = document.getElementById('hcExtra');
      const nowHidden = ex.classList.toggle('hidden');
      hct.classList.toggle('open', !nowHidden);
      hct.setAttribute('aria-expanded', String(!nowHidden));
    });
    renderTab('overview');
  }

  function renderHero() {
    // Hero COMPACT — chiếm ít diện tích (đặc biệt mobile): tên + 3 ô stat bấm được
    // nhảy đúng tab; tóm tắt dài + chip kỹ năng + disclaimer gói vào nút mở rộng.
    // Chi tiết đầy đủ (hire panel, ATS từng yêu cầu) nằm trong tab, không lặp ở đây.
    const r = SESSION.result, cv = SESSION.cv, jd = SESSION.jd;
    const v = VERDICT[r.match?.verdict] || null;
    const ha = hireAssess();
    const pv = PASS_VERDICT[ha.verdict] || PASS_VERDICT.uncertain;
    const stats = [
      { num: r.overallScore || 0, unit: '/100', lbl: 'Điểm CV', bar: true, tab: 'overview' },
      // Nhãn do AI tự viết (verdictLabel) — session cũ không có thì fallback mapping cố định
      ...(jd && r.match ? [{ num: r.match.matchScore, unit: '/100', lbl: 'Khớp ATS' + (r.match.verdictLabel ? ` · ${r.match.verdictLabel}` : v ? ` · ${v.label}` : ''), tab: 'match' }] : []),
      { num: ha.passProbability, unit: '%', lbl: ha.verdictLabel || pv.label, cls: 'pass-' + (ha.verdict || 'uncertain').replace('_', '-'), tab: 'overview', tip: `${pv.emoji} ${ha.headline || 'Khả năng đậu phỏng vấn — xem phân tích ở tab Tổng quan'}` },
    ];
    const hasExtra = !!r.summary || (cv.extractedSkills || []).length > 0;
    return `
      <div class="result-hero hero-compact grad-border">
        <div class="hc-main">
          <div class="hc-id">
            <div class="rh-name">${esc(cv.candidateName || 'Ứng viên')}</div>
            <div class="rh-title">${esc(cv.candidateTitle || SESSION.meta?.targetRole || '')}${cv.experienceYears ? ` · ${cv.experienceYears} năm KN` : ''}</div>
          </div>
          <div class="hc-stats">
            ${stats.map(st => `
              <button class="hc-stat ${st.cls || ''}" data-go="${st.tab}" ${st.tip ? `data-tip="${esc(st.tip)}"` : ''} aria-label="${esc(st.lbl)}">
                <span class="hs-num"><span data-count="${st.num}">0</span><span class="hs-unit">${st.unit}</span></span>
                <span class="hs-lbl">${esc(st.lbl)}</span>
                ${st.bar ? `<span class="hs-bar"><i data-target="${st.num}"></i></span>` : ''}
              </button>`).join('')}
          </div>
          ${hasExtra ? `
          <button class="hc-toggle" id="hcToggle" aria-expanded="false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            <span>Tóm tắt &amp; kỹ năng</span>
          </button>` : ''}
        </div>
        ${hasExtra ? `
        <div class="hc-extra hidden" id="hcExtra">
          ${r.summary ? `<p class="hc-sum-text">${esc(r.summary)}</p>` : ''}
          ${(cv.extractedSkills || []).length ? `<div class="rh-chips">${cv.extractedSkills.slice(0, 8).map(sk => `<span class="badge badge-indigo">${esc(sk)}</span>`).join('')}</div>` : ''}
          <div class="ai-disclaimer" style="margin-top: 12px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
            Đánh giá của AI — chỉ mang tính tham khảo, không đảm bảo kết quả tuyển dụng thực tế.
          </div>
        </div>` : ''}
      </div>`;
  }

  // ---------- Tabs ----------
  // Panes cached: switching tabs keeps the rendered panel + its polls alive in the
  // background, so Chat/Interview/Cover Letter never lose state when you come back.
  const tabPanes = {}; // id -> element
  let activeTab = null;
  const tabContent = () => document.getElementById('tabContent');

  function renderTab(id) {
    if (activeTab === id) return;
    if (activeTab && tabPanes[activeTab]) tabPanes[activeTab].classList.add('hidden');
    activeTab = id;
    let pane = tabPanes[id];
    if (!pane) {
      const renderers = {
        overview: renderOverview,
      };
      pane = document.createElement('div');
      pane.className = 'tab-pane no-anim';
      pane.innerHTML = (renderers[id] || renderOverview)();
      tabContent().appendChild(pane);
      tabPanes[id] = pane;
      // Init logic chỉ chạy 1 lần trong đời pane
      if (id === 'chat') initChat();
      if (id === 'interview') initInterview();
      if (id === 'cover') initCover();
      if (id === 'rewrite') initRewrite();
      if (id === 'cv') initCv();
    }
    pane.classList.remove('hidden');
    if (id === 'overview') {
      // Màu hire panel theo mức đậu
      const ha0 = hireAssess();
      const colorMap = { very_likely: 'var(--accent)', likely: 'var(--accent)', uncertain: 'var(--warn)', unlikely: '#e11d48', very_unlikely: 'var(--danger)' };
      app.style.setProperty('--hire-color', colorMap[ha0.verdict] || 'var(--danger)');
      animateScores();
    }
    const hqBtn = pane.querySelector('#btnPracticeHQ');
    if (hqBtn && !hqBtn.dataset.wired) {
      hqBtn.dataset.wired = '1';
      hqBtn.addEventListener('click', () => {
        // tab interview có thể đang tắt (chưa tới mốc) — không được ném lỗi
        const ivTab = document.querySelector('[data-tab="interview"]');
        if (!ivTab) { toast('Phỏng vấn giả lập sẽ ra mắt ở bản kế tiếp.'); return; }
        window.__ivPrepMode = true;
        ivTab.click();
      });
    }
  }

  function animateScores() {
    // pill bars + hero mini bars
    document.querySelectorAll('.sp-bar .fill[data-target], .hs-bar i[data-target]').forEach(bar => {
      if (bar.dataset.animated) { bar.style.width = (+bar.dataset.target) + '%'; return; }
      bar.dataset.animated = '1';
      requestAnimationFrame(() => { bar.style.width = (+bar.dataset.target) + '%'; });
    });
    // count-up numbers
    document.querySelectorAll('[data-count]').forEach(el => {
      if (el.dataset.animated) return; // đã chạy — giữ nguyên số, không re-animate
      el.dataset.animated = '1';
      const target = +el.dataset.count;
      const dur = 1100, t0 = performance.now();
      (function tick(t) {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  // ----- Overview -----
  function renderOverview() {
    const r = SESSION.result;
    const ha = hireAssess();
    const pv = PASS_VERDICT[ha.verdict] || PASS_VERDICT.uncertain;
    const bd = r.breakdown || {};
    const bdRows = [
      ['content', 'Nội dung'], ['format', 'Trình bày'], ['relevance', 'Liên quan vị trí'], ['impact', 'Tác động'],
    ];
    // Phiên kiểm chứng (nạp lại CV đã chỉnh) — panel so sánh điểm với phiên gốc.
    // parentSessionId nằm ở top-level của session (server đặt khi reupload).
    const parentId = SESSION.parentSessionId || SESSION.meta?.parentSessionId;
    const cmpMount = parentId ? '<div class="mb-6" id="cmpMount"></div>' : '';
    if (parentId) loadCompare(parentId);
    return `
      ${cmpMount}
      ${(ha.headline || (ha.reasons && ha.reasons.length)) ? `
      <div class="panel mb-6 hire-panel">
        <div class="hire-head">
          <div class="hire-pct-wrap">
            <div class="hire-pct" style="color: var(--hire-color, var(--danger));"><span data-count="${ha.passProbability}">0</span>%</div>
            <div class="hire-pct-sub">khả năng đậu</div>
          </div>
          <div class="hire-body">
            <div class="hire-headline"><span class="pg-emoji">${pv.emoji}</span> ${esc(ha.headline || `Khả năng đậu phỏng vấn: ${ha.passProbability}% — ${pv.label.toLowerCase()}`)}</div>
            ${(ha.reasons || []).length ? `<div class="hire-reasons">${ha.reasons.map(x => `<div class="flag-item"><div class="flag-dot" style="background: var(--hire-color, var(--danger));"></div><div>${esc(x)}</div></div>`).join('')}</div>` : ''}
            ${(ha.whatWouldRaise || []).length ? `
              <div class="hire-raise">
                <div class="field-label" style="margin-bottom: 6px; color: var(--accent);">📈 Muốn tăng tỉ lệ này?</div>
                ${ha.whatWouldRaise.map(x => `<div class="flag-item"><div class="flag-dot" style="background: var(--accent);"></div><div>${esc(x)}</div></div>`).join('')}
              </div>` : ''}
            <div class="ai-disclaimer" style="margin-top: 12px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
              Ước lượng do AI đưa ra dựa trên CV &amp; JD — chỉ để tham khảo.
            </div>
          </div>
        </div>
      </div>` : ''}

      ${(r.alternativePaths && r.alternativePaths.length) ? `
      <div class="panel mb-6 alt-paths-panel">
        <div class="panel-title">
          <span class="pt-icon amber"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="10"/></svg></span>
          Cân nhắc hướng đi khác phù hợp hơn
        </div>
        <p class="muted" style="margin-bottom: 14px;">Dựa trên CV hiện tại, AI thấy những vị trí này tận dụng tốt hơn thế mạnh của bạn:</p>
        <div class="alt-paths">
          ${r.alternativePaths.map(p => `
          <div class="alt-path-card">
            <div class="ap-head">
              <div class="ap-role">${esc(p.role || 'Vị trí đề xuất')}</div>
              ${typeof p.fitScore === 'number' ? `<div class="ap-fit" style="color: ${p.fitScore >= 60 ? 'var(--success, #16a34a)' : 'var(--warning, #d97706)'};">${p.fitScore}% phù hợp</div>` : ''}
            </div>
            <div class="ap-why">${esc(p.why || '')}</div>
            ${p.note ? `<div class="ap-note">📌 ${esc(p.note)}</div>` : ''}
          </div>`).join('')}
        </div>
        <div class="ai-disclaimer" style="margin-top: 12px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
          Gợi ý hướng đi do AI đề xuất dựa trên CV — hãy cân nhắc với mục tiêu cá nhân của bạn.
        </div>
      </div>` : ''}

      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">
            <span class="pt-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 5-6"/></svg></span>
            Điểm theo tiêu chí
          </div>
          ${bdRows.map(([k, label]) => `
            <div class="bd-row">
              <div class="bd-lbl">${label}</div>
              <div class="progress-track"><div class="progress-fill" style="width: ${bd[k] || 0}%; transition-delay: 0.1s;"></div></div>
              <div class="bd-val">${bd[k] ?? '—'}</div>
            </div>`).join('')}
        </div>
        <div class="panel">
          <div class="panel-title">
            <span class="pt-icon red"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4m0 4h.01"/></svg></span>
            Red flags ATS
            <span class="count">${(r.atsRedFlags || []).length}</span>
          </div>
          ${(r.atsRedFlags || []).length ? (r.atsRedFlags || []).map(f => `
            <div class="flag-item"><div class="flag-dot"></div><div>${esc(f)}</div></div>`).join('')
            : '<p class="muted">Không phát hiện red flags — tốt!</p>'}
        </div>
        <div class="panel">
          <div class="panel-title">
            <span class="pt-icon green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            Điểm mạnh
            <span class="count">${(r.strengths || []).length}</span>
          </div>
          ${(r.strengths || []).map(st => `
            <div class="sw-item pos">
              <div class="sw-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
              <div class="sw-body">
                <div class="sw-point">${esc(st.point)}</div>
                ${st.evidence ? `<div class="sw-evidence">"${esc(st.evidence)}"</div>` : ''}
              </div>
            </div>`).join('')}
        </div>
        <div class="panel">
          <div class="panel-title">
            <span class="pt-icon red"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></span>
            Điểm yếu &amp; cách sửa
            <span class="count">${(r.weaknesses || []).length}</span>
          </div>
          ${(r.weaknesses || []).map(w => `
            <div class="sw-item neg">
              <div class="sw-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></div>
              <div class="sw-body">
                <div class="sw-point">${esc(w.point)}</div>
                ${w.evidence ? `<div class="sw-evidence">"${esc(w.evidence)}"</div>` : ''}
                ${w.fix ? `<div class="sw-fix"><strong>Cách sửa:</strong> ${esc(w.fix)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="panel mt-6">
        <div class="panel-title">
          <span class="pt-icon amber"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg></span>
          Gợi ý cải thiện (ưu tiên theo tác động)
          <span class="count">${(r.improvements || []).length}</span>
        </div>
        ${(r.improvements || []).map(im => `
          <div class="imp-item">
            <span class="imp-pri badge ${im.priority === 'high' ? 'badge-red' : im.priority === 'medium' ? 'badge-amber' : 'badge-sky'}">${im.priority === 'high' ? 'Ưu tiên cao' : im.priority === 'medium' ? 'Nên làm' : 'Nên có'}</span>
            <div class="imp-body">
              <div class="imp-title">${esc(im.title)}</div>
              <div class="imp-detail">${esc(im.detail)}</div>
              ${im.impact ? `<div class="imp-impact"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:3px"><path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg>${esc(im.impact)}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>

      <div class="panel mt-6">
        <div class="panel-title">
          <span class="pt-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>
          3 câu hỏi phỏng vấn khó nhất có thể gặp
        </div>
        ${(r.hardQuestions || []).map((q, i) => `
          <div class="hq-item"><div class="hq-num">${i + 1}</div><div class="hq-q">${esc(q)}</div></div>`).join('')}
        <div class="hq-cta">
          <button class="btn btn-primary" id="btnPracticeHQ">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/></svg>
            Luyện trả lời các câu hỏi này với AI Interviewer
          </button>
          <span class="hq-cta-note">AI sẽ đóng vai nhà tuyển dụng, chờ bạn nói "sẵn sàng" mới bắt đầu hỏi</span>
        </div>
      </div>`;
  }

  // ----- JD Match -----

  // render tối giản mặc định — được các commit sau định nghĩa lại

  boot();
})();
