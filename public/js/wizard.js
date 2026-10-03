// wizard.js — form nạp CV: tạo phiên → gửi file + meta → poll trạng thái
(function () {
  'use strict';

  var MAX_FILES = 12;
  var MAX_SIZE = 15 * 1024 * 1024;
  var OK_EXT = /\.(pdf|docx|txt|md|png|jpe?g|webp)$/i;
  var STAGE_LABELS = {
    queued: 'Trong hàng đợi',
    extracting: 'Đọc CV',
    validating: 'Kiểm tra CV',
    jd: 'Đọc JD',
    analyzing: 'Phân tích',
    done: 'Hoàn tất',
  };

  var sessionId = null;
  var files = [];
  var polling = false;

  var $ = function (id) { return document.getElementById(id); };
  var dropzone = $('dropzone'), fileInput = $('fileInput'), fileList = $('fileList');
  var submitBtn = $('submitBtn'), errBox = $('err'), formCard = $('formCard'), proc = $('proc');

  // ---- chọn file ----
  dropzone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
  ['dragover', 'dragenter'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('drag'); });
  });
  dropzone.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });

  function addFiles(list) {
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (files.length >= MAX_FILES) { showErr('Tối đa ' + MAX_FILES + ' file.'); break; }
      if (!OK_EXT.test(f.name)) { showErr('Định dạng chưa hỗ trợ: ' + f.name); continue; }
      if (f.size > MAX_SIZE) { showErr('"' + f.name + '" vượt quá 15MB.'); continue; }
      files.push(f);
    }
    renderFiles();
  }

  function renderFiles() {
    fileList.textContent = files.length
      ? files.map(function (f) { return '• ' + f.name; }).join('\n')
      : '';
  }

  function showErr(msg) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
  }

  // ---- submit ----
  submitBtn.addEventListener('click', function () {
    errBox.style.display = 'none';
    var role = $('targetRole').value.trim();
    if (!role) { showErr('Chưa nhập "Vị trí nhắm tới".'); return; }
    if (!files.length && !$('jdManual').value.trim() && !hasManualCv()) {
      showErr('Cần có CV (file hoặc nhập tay) — hoặc ít nhất JD dán tay để phân tích.');
      return;
    }
    submitBtn.disabled = true;
    startProcessing(role)
      .catch(function (e) {
        showErr(e.message || 'Có lỗi xảy ra — thử lại.');
        submitBtn.disabled = false;
      });
  });

  function hasManualCv() { return false; } // TODO(giờ 2): ô nhập CV tay khi không có file

  // ---- Trích xuất PDF ngay trên trình duyệt (pdf.js local, không CDN) ----
  // PDF text-rich: lấy text trực tiếp. Trang mỏng (<80 ký tự = scan) → render ảnh
  // gửi AI vision OCR. Cap 8 trang ảnh (server cũng chỉ OCR 8) + JPEG 0.7 + rộng
  // ~1600px để payload không phình (field multipart có giới hạn).
  var MAX_PDF_PAGES_TEXT = 20;
  var MAX_PDF_IMAGES = 8;

  async function extractPdf(file) {
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var text = '';
    var images = [];
    var pages = Math.min(pdf.numPages, MAX_PDF_PAGES_TEXT);
    for (var i = 1; i <= pages; i++) {
      var page = await pdf.getPage(i);
      var tc = await page.getTextContent();
      var pageText = tc.items.map(function (it) { return it.str; }).join(' ').trim();
      if (pageText.length < 80 && images.length < MAX_PDF_IMAGES) {
        var img = await renderPageToImage(page);
        if (img) images.push(img);
      }
      text += pageText + '\n\n';
    }
    return { text: text.trim(), images: images };
  }

  async function renderPageToImage(page) {
    try {
      var base = page.getViewport({ scale: 1 });
      var scale = Math.min(2, 1600 / base.width); // cap ~1600px rộng
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
      return { base64: canvas.toDataURL('image/jpeg', 0.7).split(',')[1], mime: 'image/jpeg' };
    } catch (e) {
      console.warn('render page failed', e);
      return null;
    }
  }

  async function startProcessing(role) {
    $('stageLabel').textContent = 'Đang tạo phiên…';
    var res = await fetch('/api/session/new', { method: 'POST' });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Tạo phiên thất bại.');
    sessionId = data.id;

    var fd = new FormData();
    fd.append('meta', JSON.stringify({
      targetRole: role,
      experienceLevel: $('experienceLevel').value,
      jdUrl: $('jdUrl').value.trim(),
      jdManual: $('jdManual').value.trim(),
    }));

    // Trích xuất PDF client-side: text + ảnh trang scan. Tuần tự để không giữ
    // nhiều PDF trong bộ nhớ. MỘT field clientPdfText duy nhất — nhiều field
    // trùng tên sẽ thành array ở server và vỡ khi xử lý.
    $('stageLabel').textContent = 'Đang đọc CV trên trình duyệt…';
    var clientText = '';
    var images = [];
    for (var i = 0; i < files.length; i++) {
      if (!/\.pdf$/i.test(files[i].name)) continue;
      try {
        var r = await extractPdf(files[i]);
        if (r.text) clientText += (clientText ? '\n\n' : '') + r.text;
        images = images.concat(r.images);
      } catch (e) {
        // PDF lỗi client đọc không được — vẫn gửi file, server sẽ thử parse
        console.warn('extractPdf failed', files[i].name, e);
      }
    }
    if (clientText.trim()) fd.append('clientPdfText', clientText.trim());
    if (images.length) fd.append('clientPdfImages', JSON.stringify(images));

    for (var j = 0; j < files.length; j++) fd.append('files', files[j]);

    var upRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'X-Session-Id': sessionId },
      body: fd,
    });
    var upData = await upRes.json();
    if (!upRes.ok) throw new Error(upData.error || 'Gửi file thất bại.');

    formCard.style.display = 'none';
    proc.style.display = 'block';
    $('procLink').innerHTML = 'Link phiên: <a href="' + data.url + '">' + location.origin + data.url + '</a>';
    poll(sessionId);
  }

  // ---- poll ----
  async function poll(id) {
    if (polling) return;
    polling = true;
    for (;;) {
      try {
        var res = await fetch('/api/session/' + id);
        if (res.ok) {
          var s = await res.json();
          if (s.status === 'ready') { location.href = '/s/' + id; return; }
          if (s.status === 'error') {
            $('stageLabel').textContent = s.error || 'Phân tích gặp lỗi.';
            document.querySelector('#proc .spinner').style.display = 'none';
            return;
          }
          $('stageLabel').textContent = STAGE_LABELS[s.stage] || s.stageLabel || 'Đang xử lý…';
        }
      } catch (e) { /* mạng chập chờn — thử vòng sau */ }
      await new Promise(function (r) { setTimeout(r, 2500); });
    }
  }
})();
