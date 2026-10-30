(() => {
  'use strict';

  const CONFIG = window.PUZZLE_CONFIG || {
    repo: 'SuperLeeK/AutoJigsawPuzzle',
    proxyUrl: '',
    encodedAuth: '',
    defaultPieces: 500,
    defaultNickname: '또갈통'
  };

  const STORAGE_KEYS = {
    NICKNAME: 'ajp_nickname_v1',
    COMMENT_CACHE: 'ajp_issue_meta_cache_v1',
    SOLVED_MAP: 'ajp_solved_map_v1'
  };

  // =========================================================================
  // 1. Modern Web Guidance 준수: :user-invalid 폴백 & ARIA 동기화
  // =========================================================================
  const UserInvalidFallback = (() => {
    const dirtyState = new WeakMap();

    const updateState = (input) => {
      const isValid = input.checkValidity();
      input.classList.toggle('user-invalid-fallback', !isValid);
      input.classList.toggle('user-valid-fallback', isValid);
      if (!isValid) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    };

    const handleEvent = (event) => {
      const input = event.target;
      if (event.type === 'reset') {
        const controls = input.elements || [];
        for (const control of controls) {
          dirtyState.delete(control);
          control.classList.remove('user-invalid-fallback', 'user-valid-fallback');
          control.removeAttribute('aria-invalid');
        }
        return;
      }
      if (!input || !input.checkValidity) return;

      if (event.type === 'input' || event.type === 'change') {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasInteracted = true;
        dirtyState.set(input, state);
        if (state.hasBlurred) updateState(input);
      } else if (event.type === 'blur') {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasBlurred = true;
        dirtyState.set(input, state);
        if (state.hasInteracted) updateState(input);
      }
    };

    const init = (root = document) => {
      if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('selector(:user-invalid)')) return;
      root.addEventListener('blur', handleEvent, true);
      root.addEventListener('input', handleEvent);
      root.addEventListener('change', handleEvent);
      root.addEventListener('reset', handleEvent, true);
    };

    return { init };
  })();

  const syncAria = (el) => {
    if (!el || !el.matches) return;
    try {
      if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('selector(:user-invalid)')) {
        el.setAttribute?.('aria-invalid', el.matches(':user-invalid') ? 'true' : 'false');
      }
    } catch (_) {}
  };

  document.addEventListener('blur', (e) => syncAria(e.target), true);
  document.addEventListener('input', (e) => {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('aria-invalid')) {
      syncAria(e.target);
    }
  });

  // =========================================================================
  // 2. Modern Web Guidance 준수: <dialog closedby="any"> 폴백
  // =========================================================================
  function setupDialogLightDismiss(dialog) {
    if (!dialog) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (isDialogContent) return;
        dialog.close();
      });
    }
  }

  // =========================================================================
  // 3. GitHub Actions 빌드 주입 인코딩 복호화 헬퍼
  // =========================================================================
  function decodeRuntimeSecrets() {
    if (!CONFIG.encodedAuth) return {};
    try {
      const raw = atob(CONFIG.encodedAuth);
      const mask = 'AutoJigsawPuzzleSecretMask2026';
      let jsonStr = '';
      for (let i = 0; i < raw.length; i++) {
        jsonStr += String.fromCharCode(raw.charCodeAt(i) ^ mask.charCodeAt(i % mask.length));
      }
      return JSON.parse(decodeURIComponent(escape(jsonStr)));
    } catch (e) {
      console.warn('런타임 설정 디코딩 실패:', e);
      return {};
    }
  }

  const RUNTIME_SECRETS = decodeRuntimeSecrets();

  function getGithubToken() {
    return RUNTIME_SECRETS.githubToken || '';
  }

  function getPostimagesConfig() {
    return {
      key: RUNTIME_SECRETS.postimagesKey || '',
      gallery: RUNTIME_SECRETS.postimagesGallery || 'jigsaw',
      o: RUNTIME_SECRETS.postimagesO || '2b819584285c102318568238c7d4a4c7',
      m: RUNTIME_SECRETS.postimagesM || '59c2ad4b46b0c1e12d5703302bff0120'
    };
  }

  // =========================================================================
  // 4. DOM 요소 참조 및 상태 관리
  // =========================================================================
  const els = {
    repoLink: document.getElementById('repoLink'),
    puzzleForm: document.getElementById('puzzleForm'),
    tabFile: document.getElementById('tabFile'),
    tabUrl: document.getElementById('tabUrl'),
    panelFile: document.getElementById('panelFile'),
    panelUrl: document.getElementById('panelUrl'),
    dropZone: document.getElementById('dropZone'),
    imageFileInput: document.getElementById('imageFileInput'),
    dropZoneEmpty: document.getElementById('dropZoneEmpty'),
    dropZonePreview: document.getElementById('dropZonePreview'),
    previewImage: document.getElementById('previewImage'),
    previewFileName: document.getElementById('previewFileName'),
    clearImageBtn: document.getElementById('clearImageBtn'),
    imageUrlInput: document.getElementById('imageUrlInput'),
    piecesInput: document.getElementById('piecesInput'),
    nicknameInput: document.getElementById('nicknameInput'),
    titleInput: document.getElementById('titleInput'),
    creationProgressBox: document.getElementById('creationProgressBox'),
    progressTitle: document.getElementById('progressTitle'),
    progressDesc: document.getElementById('progressDesc'),
    stepUpload: document.getElementById('stepUpload'),
    stepIssue: document.getElementById('stepIssue'),
    stepBot: document.getElementById('stepBot'),
    submitPuzzleBtn: document.getElementById('submitPuzzleBtn'),
    refreshListBtn: document.getElementById('refreshListBtn'),
    searchInput: document.getElementById('searchInput'),
    countAll: document.getElementById('countAll'),
    countPending: document.getElementById('countPending'),
    countCreated: document.getElementById('countCreated'),
    countSolved: document.getElementById('countSolved'),
    listLoading: document.getElementById('listLoading'),
    listEmpty: document.getElementById('listEmpty'),
    listEmptyText: document.getElementById('listEmptyText'),
    puzzleGrid: document.getElementById('puzzleGrid'),
    resultDialog: document.getElementById('resultDialog'),
    closeResultDialogBtn: document.getElementById('closeResultDialogBtn'),
    resultDialogImg: document.getElementById('resultDialogImg'),
    resultDialogName: document.getElementById('resultDialogName'),
    resultDialogDetails: document.getElementById('resultDialogDetails'),
    resultGameLinkInput: document.getElementById('resultGameLinkInput'),
    copyDialogLinkBtn: document.getElementById('copyDialogLinkBtn'),
    openGameRoomBtn: document.getElementById('openGameRoomBtn'),
    imagePreviewDialog: document.getElementById('imagePreviewDialog'),
    closePreviewDialogBtn: document.getElementById('closePreviewDialogBtn'),
    fullPreviewImg: document.getElementById('fullPreviewImg'),
    toastContainer: document.getElementById('toastContainer')
  };

  let state = {
    inputMode: 'file', // 'file' | 'url'
    selectedFile: null,
    selectedBase64: '',
    selectedExt: 'jpg',
    selectedName: '',
    puzzles: [],
    currentFilter: 'all',
    searchQuery: '',
    activeCreatingIssueNumber: null,
    pollingTimer: null
  };

  // =========================================================================
  // 5. 유틸리티 함수 (토스트 알림, 클립보드 복사, 날짜 포맷)
  // =========================================================================
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  async function copyToClipboard(text, btnEl = null) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('📋 클립보드에 링크가 복사되었습니다!');
    if (btnEl) {
      const originalText = btnEl.textContent;
      btnEl.textContent = '✅ 복사 완료!';
      setTimeout(() => {
        btnEl.textContent = originalText;
      }, 1800);
    }
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return '방금 전';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // =========================================================================
  // 6. 이미지 파일 처리 및 리사이즈/Base64 인코딩
  // =========================================================================
  function setInputMode(mode) {
    state.inputMode = mode;
    const isFile = mode === 'file';
    els.tabFile.classList.toggle('active', isFile);
    els.tabFile.setAttribute('aria-selected', String(isFile));
    els.tabUrl.classList.toggle('active', !isFile);
    els.tabUrl.setAttribute('aria-selected', String(!isFile));
    els.panelFile.hidden = !isFile;
    els.panelUrl.hidden = isFile;
    if (isFile) {
      els.imageUrlInput.removeAttribute('required');
    } else {
      els.imageUrlInput.setAttribute('required', 'required');
    }
  }

  function processSelectedImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('❌ 이미지 파일(JPG, PNG, WEBP, GIF)만 선택할 수 있습니다.');
      return;
    }

    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    const ext = extMap[file.type] || 'jpg';
    const rawName = (file.name || 'puzzle').replace(/\.[^/.]+$/, '');

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1] || '';
      state.selectedFile = file;
      state.selectedBase64 = base64;
      state.selectedExt = ext;
      state.selectedName = rawName;

      els.previewImage.src = dataUrl;
      const sizeKB = (file.size / 1024).toFixed(1);
      els.previewFileName.textContent = `${file.name || '클립보드_이미지.' + ext} (${sizeKB} KB)`;
      els.dropZoneEmpty.hidden = true;
      els.dropZonePreview.hidden = false;

      if (!els.titleInput.value.trim() && rawName && rawName !== 'image') {
        els.titleInput.value = rawName;
      }
    };
    reader.readAsDataURL(file);
  }

  function clearSelectedImage(e) {
    if (e) e.stopPropagation();
    state.selectedFile = null;
    state.selectedBase64 = '';
    els.imageFileInput.value = '';
    els.previewImage.src = '';
    els.dropZoneEmpty.hidden = false;
    els.dropZonePreview.hidden = true;
  }

  // =========================================================================
  // 7. Postimages 업로드 및 GitHub Issue 자동 생성
  // =========================================================================
  async function uploadBase64ToPostimages(base64Image, name, ext) {
    // 1. 프록시 URL이 설정되어 있는 경우 프록시 경유
    if (CONFIG.proxyUrl) {
      const res = await fetch(`${CONFIG.proxyUrl.replace(/\/$/, '')}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, name, type: ext })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `프록시 이미지 업로드 실패 (${res.status})`);
      }
      const data = await res.json();
      return data.hotlinkUrl;
    }

    // 2. 브라우저에서 직접 Postimages API 호출
    const postCfg = getPostimagesConfig();
    if (!postCfg.key) {
      throw new Error('POSTIMAGES_API_KEY가 설정되지 않았습니다. GitHub Secrets 설정을 확인해 주세요.');
    }

    const formData = {
      key: postCfg.key,
      gallery: postCfg.gallery,
      o: postCfg.o,
      m: postCfg.m,
      version: '1.0.1',
      portable: '1',
      name: `${name || 'puzzle'}_${Date.now()}`,
      type: ext || 'jpg',
      image: base64Image
    };

    const formBody = Object.keys(formData)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(formData[k])}`)
      .join('&');

    const res = await fetch('https://api.postimage.org/1/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: formBody
    });

    if (!res.ok) {
      throw new Error(`Postimages 업로드 실패 (HTTP ${res.status})`);
    }

    const text = await res.text();
    const successMatch = text.match(/success="(\d+)"/);
    if (successMatch && successMatch[1] === '1') {
      const hotlinkMatch = text.match(/<hotlink>(.*?)<\/hotlink>/);
      if (hotlinkMatch && hotlinkMatch[1]) {
        return hotlinkMatch[1];
      }
    }
    throw new Error('Postimages에서 이미지 링크를 받지 못했습니다.');
  }

  async function createPuzzleIssue({ title, imageUrl, pieces, nickname }) {
    const issueTitle = `[퍼즐생성] ${title || '직소 퍼즐'} (${pieces}피스)`;
    const issueBody = [
      '### 🖼️ 퍼즐 이미지',
      `![퍼즐 이미지](${imageUrl})`,
      '',
      '### 🧩 퍼즐 조각 수',
      String(pieces),
      '',
      '### 👤 방장 닉네임',
      nickname
    ].join('\n');

    // 1. Cloudflare Worker 프록시 설정 시
    if (CONFIG.proxyUrl) {
      const res = await fetch(`${CONFIG.proxyUrl.replace(/\/$/, '')}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: ['puzzle-generator']
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `퍼즐 생성 요청 실패 (HTTP ${res.status})`);
      }
      return await res.json();
    }

    // 2. GitHub Secrets(PUZZLE_GITHUB_TOKEN) 주입 시 무인증 API 호출
    const token = getGithubToken();
    if (token) {
      const res = await fetch(`https://api.github.com/repos/${CONFIG.repo}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: ['puzzle-generator']
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub 이슈 등록 실패 (HTTP ${res.status})`);
      }
      return await res.json();
    }

    // 3. 토큰 미설정 시 안전한 폴백: 자동 완성된 GitHub 이슈 페이지 열기
    const newIssueUrl = `https://github.com/${CONFIG.repo}/issues/new?labels=puzzle-generator&title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
    window.open(newIssueUrl, '_blank', 'noopener,noreferrer');
    return { fallbackOpened: true };
  }

  // =========================================================================
  // 8. 이슈 본문 & 댓글에서 퍼즐 정보 파싱
  // =========================================================================
  function getCommentCache() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.COMMENT_CACHE) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveCommentCache(cache) {
    try {
      localStorage.setItem(STORAGE_KEYS.COMMENT_CACHE, JSON.stringify(cache));
    } catch (_) {}
  }

  function getSolvedMap() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SOLVED_MAP) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveSolvedMap(map) {
    try {
      localStorage.setItem(STORAGE_KEYS.SOLVED_MAP, JSON.stringify(map));
    } catch (_) {}
  }

  function extractPuzzleMetaTag(text) {
    if (!text) return null;
    const match = text.match(/<!--\s*PUZZLE_META:\s*(\{[\s\S]*?\})\s*-->/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (_) {
      return null;
    }
  }

  function parseIssueBodyFields(body) {
    if (!body) return { imageUrl: '', pieces: 500, nickname: '또갈통' };
    let imageUrl = '';
    const imgSec = body.match(/###\s*🖼️\s*퍼즐 이미지\s*([\s\S]*?)(?=###|<!--|$)/i);
    const rawImg = imgSec ? imgSec[1].trim() : body;

    const mdMatch = rawImg.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    const htmlMatch = rawImg.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    const urlMatch = rawImg.match(/(https?:\/\/[^\s)]+)/);
    if (mdMatch) imageUrl = mdMatch[1];
    else if (htmlMatch) imageUrl = htmlMatch[1];
    else if (urlMatch) imageUrl = urlMatch[1];

    let pieces = 500;
    const piecesMatch = body.match(/###\s*🧩\s*퍼즐 조각 수\s*([\s\S]*?)(?=###|<!--|$)/i);
    if (piecesMatch) {
      const p = parseInt(piecesMatch[1].trim(), 10);
      if (!isNaN(p) && p > 0) pieces = p;
    }

    let nickname = '또갈통';
    const nickMatch = body.match(/###\s*👤\s*방장 닉네임\s*([\s\S]*?)(?=###|<!--|$)/i);
    if (nickMatch) {
      const n = nickMatch[1].trim();
      if (n && n !== '_No response_') nickname = n;
    }

    return { imageUrl, pieces, nickname };
  }

  function parseLegacyCommentLinks(commentBody) {
    if (!commentBody) return null;
    const meta = extractPuzzleMetaTag(commentBody);
    if (meta) return meta;

    if (commentBody.includes('멀티플레이어 직소 퍼즐 생성 완료')) {
      const soloMatch = commentBody.match(/\[혼자 맞추기\]\((https?:\/\/[^\s)]+)\)/);
      const multiMatch = commentBody.match(/\[👉\s*\*\*친구 초대 게임방 바로가기\*\*\]\((https?:\/\/[^\s)]+)\)/) ||
                         commentBody.match(/```text\s*(https?:\/\/[^\s`]+)\s*```/);
      if (multiMatch) {
        return {
          status: 'completed',
          shortLink: soloMatch ? soloMatch[1] : '',
          gameLink: multiMatch[1]
        };
      }
    }
    if (commentBody.includes('퍼즐 생성 중 오류가 발생했습니다') || commentBody.includes('퍼즐 생성 실패')) {
      return { status: 'failed' };
    }
    return null;
  }

  function extractSignedImageFromHtml(bodyHtml) {
    if (!bodyHtml) return '';
    const match = bodyHtml.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (!match) return '';
    return match[1].replace(/&amp;/g, '&');
  }

  function normalizeIssueToPuzzle(issue, commentCache, solvedMap) {
    const body = issue.body || '';
    const parsedFields = parseIssueBodyFields(body);
    const signedHtmlImg = extractSignedImageFromHtml(issue.body_html || '');
    const embeddedMeta = extractPuzzleMetaTag(body);
    const cachedMeta = commentCache[issue.number];
    const meta = embeddedMeta || cachedMeta || {};

    const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
    const isSolvedLabel = labels.includes('puzzle-solved');
    const localSolved = solvedMap[issue.number];
    const isSolved = localSolved !== undefined ? localSolved : isSolvedLabel;

    let status = 'pending';

    if (meta.status === 'completed' || meta.gameLink || labels.includes('completed')) {
      status = isSolved ? 'solved' : 'created';
    } else if (meta.status === 'failed' || labels.includes('failed')) {
      status = 'failed';
    } else if (issue.state === 'closed') {
      if (meta.gameLink) {
        status = isSolved ? 'solved' : 'created';
      } else {
        // 레거시 이슈는 댓글 확인 전까지 보류 후 댓글에도 링크가 없으면 failed 처리
        status = issue.comments > 0 && !embeddedMeta && !cachedMeta ? 'checking' : 'failed';
      }
    } else {
      status = 'pending';
    }

    const cleanTitle = (issue.title || `퍼즐 #${issue.number}`)
      .replace(/^\[퍼즐생성\]\s*/i, '')
      .trim() || `퍼즐 #${issue.number}`;

    let resolvedImageUrl = meta.imageUrl || parsedFields.imageUrl || '';
    if ((!resolvedImageUrl || resolvedImageUrl.includes('user-attachments')) && signedHtmlImg) {
      resolvedImageUrl = signedHtmlImg;
    }

    return {
      number: issue.number,
      title: cleanTitle,
      htmlUrl: issue.html_url,
      createdAt: issue.created_at,
      status,
      isSolved,
      imageUrl: resolvedImageUrl,
      pieces: meta.pieces || parsedFields.pieces || 500,
      nickname: meta.nickname || parsedFields.nickname || '또갈통',
      shortLink: meta.shortLink || '',
      gameLink: meta.gameLink || '',
      error: meta.error || '',
      needsLegacyCommentCheck: !embeddedMeta && !cachedMeta && (issue.comments > 0)
    };
  }

  // =========================================================================
  // 9. 퍼즐 목록 조회 및 실시간 폴링
  // =========================================================================
  async function fetchPuzzleList(silent = false) {
    if (!silent && state.puzzles.length === 0) {
      els.listLoading.hidden = false;
    }

    try {
      const headers = {
        'Accept': 'application/vnd.github.full+json',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      const token = getGithubToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = CONFIG.proxyUrl
        ? `${CONFIG.proxyUrl.replace(/\/$/, '')}/issues?state=all&per_page=50`
        : `https://api.github.com/repos/${CONFIG.repo}/issues?state=all&per_page=50`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`목록 조회 실패 (HTTP ${res.status})`);
      }

      const rawIssues = await res.json();
      const puzzleIssues = rawIssues.filter(item => {
        if (item.pull_request) return false;
        const labels = (item.labels || []).map(l => typeof l === 'string' ? l : l.name);
        return (
          labels.includes('puzzle-generator') ||
          (item.title && item.title.includes('[퍼즐생성]')) ||
          (item.body && item.body.includes('퍼즐 이미지'))
        );
      });

      const commentCache = getCommentCache();
      const solvedMap = getSolvedMap();
      const puzzles = puzzleIssues.map(iss => normalizeIssueToPuzzle(iss, commentCache, solvedMap));

      // 이전 버전에서 생성되어 본문에 PUZZLE_META가 없는 이슈(최대 10개씩)는 댓글에서 링크 보강 후 캐싱
      const legacyTargets = puzzles.filter(p => p.needsLegacyCommentCheck).slice(0, 10);
      if (legacyTargets.length > 0) {
        await Promise.all(legacyTargets.map(async (p) => {
          try {
            const cUrl = CONFIG.proxyUrl
              ? `${CONFIG.proxyUrl.replace(/\/$/, '')}/issues/${p.number}/comments`
              : `https://api.github.com/repos/${CONFIG.repo}/issues/${p.number}/comments`;
            const cRes = await fetch(cUrl, { headers });
            if (!cRes.ok) return;
            const comments = await cRes.json();
            let matched = false;
            for (let i = comments.length - 1; i >= 0; i--) {
              const parsed = parseLegacyCommentLinks(comments[i].body);
              if (parsed) {
                matched = true;
                Object.assign(p, parsed);
                if (parsed.gameLink) {
                  p.status = p.isSolved ? 'solved' : 'created';
                } else if (parsed.status === 'failed') {
                  p.status = 'failed';
                }
                commentCache[p.number] = parsed;
                break;
              }
            }
            if (!matched && p.status === 'checking') {
              p.status = 'failed';
            }
          } catch (_) {}
        }));
        saveCommentCache(commentCache);
      }

      checkActiveCreatingIssue(puzzles);

      // 실패(failed) 상태인 퍼즐은 목록에서 완전히 제외하고 생성 중(pending), 생성 완료(created), 완료(solved) 3상태만 유지
      const visiblePuzzles = puzzles.filter(p =>
        p.status === 'pending' || p.status === 'created' || p.status === 'solved'
      );

      state.puzzles = visiblePuzzles;
      renderPuzzleList();
      manageAutoPolling(visiblePuzzles);
    } catch (err) {
      console.warn('퍼즐 목록 불러오기 오류:', err);
      if (!silent) {
        showToast(`⚠️ 목록 조회 중 오류가 발생했습니다: ${err.message}`);
      }
    } finally {
      els.listLoading.hidden = true;
    }
  }

  function manageAutoPolling(puzzles) {
    const hasPending = puzzles.some(p => p.status === 'pending') || Boolean(state.activeCreatingIssueNumber);
    if (hasPending && !state.pollingTimer) {
      state.pollingTimer = setInterval(() => {
        fetchPuzzleList(true);
      }, 4500);
    } else if (!hasPending && state.pollingTimer) {
      clearInterval(state.pollingTimer);
      state.pollingTimer = null;
    }
  }

  function checkActiveCreatingIssue(puzzles) {
    if (!state.activeCreatingIssueNumber) return;
    const found = puzzles.find(p => p.number === state.activeCreatingIssueNumber);
    if (!found) return;

    if ((found.status === 'created' || found.status === 'solved') && found.gameLink) {
      state.activeCreatingIssueNumber = null;
      els.stepBot.className = 'step-item done';
      els.stepBot.textContent = '3. 멀티플레이 게임방 링크 발급 완료 ✅';
      els.progressTitle.textContent = '🎉 퍼즐방 생성이 완료되었습니다!';
      els.submitPuzzleBtn.disabled = false;
      els.submitPuzzleBtn.textContent = '🧩 멀티플레이 퍼즐 만들기';

      setTimeout(() => {
        els.creationProgressBox.hidden = true;
      }, 3000);

      openResultModal(found);
    } else if (found.status === 'failed') {
      state.activeCreatingIssueNumber = null;
      els.creationProgressBox.hidden = true;
      els.submitPuzzleBtn.disabled = false;
      els.submitPuzzleBtn.textContent = '🧩 멀티플레이 퍼즐 만들기';
      showToast(`❌ 퍼즐 생성에 실패했습니다: ${found.error || '올바른 이미지인지 확인 후 다시 시도해 주세요.'}`);
    }
  }

  async function togglePuzzleSolved(issueNumber, markSolved) {
    const num = Number(issueNumber);
    const target = state.puzzles.find(p => p.number === num);
    if (!target) return;

    target.isSolved = markSolved;
    target.status = markSolved ? 'solved' : 'created';

    const solvedMap = getSolvedMap();
    solvedMap[num] = markSolved;
    saveSolvedMap(solvedMap);

    renderPuzzleList();
    showToast(markSolved ? '🏆 퍼즐을 [완료] 상태로 변경했습니다!' : '🟢 퍼즐을 [생성 완료] 상태로 되돌렸습니다.');

    // GitHub Issue 라벨에도 동기화하여 다른 사용자에게도 완료 상태 공유
    const token = getGithubToken();
    if (!token && !CONFIG.proxyUrl) return;

    try {
      const headers = {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (markSolved) {
        const url = CONFIG.proxyUrl
          ? `${CONFIG.proxyUrl.replace(/\/$/, '')}/issues/${num}/labels`
          : `https://api.github.com/repos/${CONFIG.repo}/issues/${num}/labels`;
        await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ labels: ['puzzle-solved'] })
        });
      } else {
        const url = CONFIG.proxyUrl
          ? `${CONFIG.proxyUrl.replace(/\/$/, '')}/issues/${num}/labels/puzzle-solved`
          : `https://api.github.com/repos/${CONFIG.repo}/issues/${num}/labels/puzzle-solved`;
        await fetch(url, {
          method: 'DELETE',
          headers
        });
      }
    } catch (err) {
      console.warn('완료 라벨 동기화 실패:', err);
    }
  }

  // =========================================================================
  // 10. 퍼즐 목록 렌더링 및 모달 표시
  // =========================================================================
  function renderPuzzleList() {
    const allCount = state.puzzles.length;
    const pendingCount = state.puzzles.filter(p => p.status === 'pending').length;
    const createdCount = state.puzzles.filter(p => p.status === 'created').length;
    const solvedCount = state.puzzles.filter(p => p.status === 'solved').length;

    els.countAll.textContent = String(allCount);
    els.countPending.textContent = String(pendingCount);
    els.countCreated.textContent = String(createdCount);
    els.countSolved.textContent = String(solvedCount);

    const q = state.searchQuery.trim().toLowerCase();
    const filtered = state.puzzles.filter(p => {
      if (state.currentFilter !== 'all' && p.status !== state.currentFilter) return false;
      if (q) {
        const hay = `${p.title} ${p.nickname} #${p.number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    els.puzzleGrid.innerHTML = '';

    if (filtered.length === 0) {
      els.listEmpty.hidden = false;
      return;
    }
    els.listEmpty.hidden = true;

    for (const p of filtered) {
      const card = document.createElement('article');
      const stateClass = p.status === 'pending' ? 'is-pending' : (p.status === 'solved' ? 'is-solved' : '');
      card.className = `puzzle-card ${stateClass}`;

      let badgeHtml = '';
      if (p.status === 'created') {
        badgeHtml = '<span class="badge badge-created puzzle-status-float">🟢 생성 완료</span>';
      } else if (p.status === 'solved') {
        badgeHtml = '<span class="badge badge-solved puzzle-status-float">🏆 완료</span>';
      } else {
        badgeHtml = '<span class="badge badge-pending puzzle-status-float">⏳ 생성 중...</span>';
      }

      const safeThumb = p.imageUrl && !p.imageUrl.includes('user-attachments')
        ? p.imageUrl
        : 'data:image/svg+xml;utf8,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260"><rect width="400" height="260" fill="#1e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="22">🧩 퍼즐 #${p.number}</text></svg>`
          );

      let actionsHtml = '';
      if ((p.status === 'created' || p.status === 'solved') && p.gameLink) {
        const toggleBtnHtml = p.status === 'solved'
          ? `<button type="button" class="btn btn-ghost btn-sm js-toggle-solved" data-number="${p.number}" data-solved="false" title="생성 완료 상태로 되돌리기">↩️ 완료 취소</button>`
          : `<button type="button" class="btn btn-ghost btn-sm js-toggle-solved" data-number="${p.number}" data-solved="true" title="퍼즐을 다 풀었으면 완료로 변경">✅ 완료</button>`;

        actionsHtml = `
          <div class="puzzle-actions">
            <button type="button" class="btn btn-primary btn-sm btn-block js-copy-link" data-link="${escapeAttr(p.gameLink)}">
              📋 멀티플레이 링크 복사
            </button>
            <div class="puzzle-actions-row">
              <a href="${escapeAttr(p.gameLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-success btn-sm">
                🎮 게임방 입장
              </a>
              ${toggleBtnHtml}
            </div>
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="puzzle-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-block" disabled>
              <span class="spinner" aria-hidden="true"></span> 자동 생성 진행 중 (약 40초)
            </button>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="puzzle-thumb-wrap js-preview-thumb" data-img="${escapeAttr(safeThumb)}" data-title="${escapeAttr(p.title)}">
          <img src="${escapeAttr(safeThumb)}" alt="${escapeAttr(p.title)}" class="puzzle-thumb" loading="lazy">
          ${badgeHtml}
          <span class="puzzle-issue-num">#${p.number}</span>
        </div>
        <div class="puzzle-body">
          <h3 class="puzzle-title" title="${escapeAttr(p.title)}">${escapeHtml(p.title)}</h3>
          <div class="puzzle-tags">
            <span class="puzzle-tag">🧩 ${p.pieces}조각</span>
            <span class="puzzle-tag">👤 ${escapeHtml(p.nickname)}</span>
          </div>
          <span class="puzzle-date">🕒 ${formatDateTime(p.createdAt)}</span>
          ${actionsHtml}
        </div>
      `;

      els.puzzleGrid.appendChild(card);
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function openResultModal(puzzle) {
    els.resultDialogImg.src = puzzle.imageUrl || '';
    els.resultDialogName.textContent = puzzle.title;
    els.resultDialogDetails.textContent = `🧩 ${puzzle.pieces} 조각 · 👤 방장: ${puzzle.nickname}`;
    els.resultGameLinkInput.value = puzzle.gameLink || '';
    els.openGameRoomBtn.href = puzzle.gameLink || '#';
    els.resultDialog.showModal();
  }

  // =========================================================================
  // 11. 이벤트 바인딩 및 초기화
  // =========================================================================
  function initEvents() {
    UserInvalidFallback.init(els.puzzleForm);
    setupDialogLightDismiss(els.resultDialog);
    setupDialogLightDismiss(els.imagePreviewDialog);

    // 닉네임 로컬 스토리지 복원
    const savedNick = localStorage.getItem(STORAGE_KEYS.NICKNAME);
    if (savedNick) {
      els.nicknameInput.value = savedNick;
    } else if (CONFIG.defaultNickname) {
      els.nicknameInput.value = CONFIG.defaultNickname;
    }

    // 탭 전환
    els.tabFile.addEventListener('click', () => setInputMode('file'));
    els.tabUrl.addEventListener('click', () => setInputMode('url'));

    // 드래그 앤 드롭 & 파일 클릭
    els.dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#clearImageBtn')) return;
      els.imageFileInput.click();
    });
    els.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.imageFileInput.click();
      }
    });
    els.imageFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        processSelectedImageFile(e.target.files[0]);
      }
    });
    els.clearImageBtn.addEventListener('click', clearSelectedImage);

    els.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.dropZone.classList.add('drag-over');
    });
    els.dropZone.addEventListener('dragleave', () => {
      els.dropZone.classList.remove('drag-over');
    });
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        setInputMode('file');
        processSelectedImageFile(e.dataTransfer.files[0]);
      }
    });

    // 화면 어디서든 Ctrl+V / Cmd+V 로 클립보드 이미지 붙여넣기
    window.addEventListener('paste', (e) => {
      if (!e.clipboardData || !e.clipboardData.items) return;
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setInputMode('file');
            processSelectedImageFile(file);
            showToast('🖼️ 클립보드에서 이미지가 첨부되었습니다!');
            break;
          }
        }
      }
    });

    // 조각 수 프리셋 칩 클릭
    const chips = document.querySelectorAll('.preset-chips .chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        els.piecesInput.value = chip.dataset.pieces;
      });
    });
    els.piecesInput.addEventListener('input', () => {
      const val = els.piecesInput.value;
      chips.forEach(c => {
        c.classList.toggle('active', c.dataset.pieces === val);
      });
    });

    // 폼 제출 (퍼즐 만들기)
    els.puzzleForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!els.puzzleForm.checkValidity()) {
        els.puzzleForm.reportValidity();
        return;
      }

      if (state.inputMode === 'file' && !state.selectedBase64) {
        showToast('🖼️ 먼저 퍼즐로 만들 이미지를 선택하거나 붙여넣어 주세요!');
        return;
      }

      const pieces = parseInt(els.piecesInput.value, 10) || 500;
      const nickname = els.nicknameInput.value.trim() || '또갈통';
      const customTitle = els.titleInput.value.trim();

      localStorage.setItem(STORAGE_KEYS.NICKNAME, nickname);

      els.submitPuzzleBtn.disabled = true;
      els.submitPuzzleBtn.textContent = '⏳ 퍼즐 생성 요청 중...';
      els.creationProgressBox.hidden = false;
      els.stepUpload.className = 'step-item active';
      els.stepUpload.textContent = '1. 이미지 호스팅 업로드 중...';
      els.stepIssue.className = 'step-item';
      els.stepIssue.textContent = '2. 퍼즐 생성 이슈 등록';
      els.stepBot.className = 'step-item';
      els.stepBot.textContent = '3. 멀티플레이 게임방 링크 발급 대기';

      try {
        let finalImageUrl = '';
        if (state.inputMode === 'file') {
          els.progressTitle.textContent = '이미지를 업로드하고 있습니다...';
          finalImageUrl = await uploadBase64ToPostimages(
            state.selectedBase64,
            state.selectedName || 'puzzle',
            state.selectedExt
          );
        } else {
          finalImageUrl = els.imageUrlInput.value.trim();
        }

        els.stepUpload.className = 'step-item done';
        els.stepUpload.textContent = '1. 이미지 호스팅 업로드 완료 ✅';
        els.stepIssue.className = 'step-item active';
        els.stepIssue.textContent = '2. 퍼즐 생성 이슈 등록 중...';
        els.progressTitle.textContent = 'GitHub에 퍼즐 생성 작업을 등록하고 있습니다...';

        const titleToUse = customTitle || state.selectedName || `${nickname}의 퍼즐`;
        const createdIssue = await createPuzzleIssue({
          title: titleToUse,
          imageUrl: finalImageUrl,
          pieces,
          nickname
        });

        if (createdIssue.fallbackOpened) {
          els.creationProgressBox.hidden = true;
          els.submitPuzzleBtn.disabled = false;
          els.submitPuzzleBtn.textContent = '🧩 멀티플레이 퍼즐 만들기';
          showToast('↗️ 새 창에서 Submit new issue 버튼을 눌러 완료해 주세요!');
          return;
        }

        els.stepIssue.className = 'step-item done';
        els.stepIssue.textContent = `2. 퍼즐 생성 이슈(#${createdIssue.number}) 등록 완료 ✅`;
        els.stepBot.className = 'step-item active';
        els.stepBot.textContent = '3. 멀티플레이 게임방 생성 중 (약 30~45초 소요)... ⏳';
        els.progressTitle.textContent = `봇이 #${createdIssue.number} 퍼즐방을 만들고 있습니다...`;

        state.activeCreatingIssueNumber = createdIssue.number;
        clearSelectedImage();
        els.titleInput.value = '';

        await fetchPuzzleList(true);
      } catch (err) {
        console.error(err);
        els.creationProgressBox.hidden = true;
        els.submitPuzzleBtn.disabled = false;
        els.submitPuzzleBtn.textContent = '🧩 멀티플레이 퍼즐 만들기';
        showToast(`❌ 오류 발생: ${err.message}`);
      }
    });

    // 목록 필터 탭 & 검색 & 새로고침
    const filterTabs = document.querySelectorAll('.filter-tabs .filter-tab');
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentFilter = tab.dataset.filter;
        renderPuzzleList();
      });
    });

    els.searchInput.addEventListener('input', () => {
      state.searchQuery = els.searchInput.value;
      renderPuzzleList();
    });

    els.refreshListBtn.addEventListener('click', () => {
      fetchPuzzleList(false);
      showToast('🔄 퍼즐 목록을 새로고침했습니다.');
    });

    // 그리드 내부 위임 클릭 (링크 복사, 완료 상태 토글 & 이미지 미리보기)
    els.puzzleGrid.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.js-copy-link');
      if (copyBtn) {
        copyToClipboard(copyBtn.dataset.link, copyBtn);
        return;
      }
      const toggleBtn = e.target.closest('.js-toggle-solved');
      if (toggleBtn) {
        const markSolved = toggleBtn.dataset.solved === 'true';
        togglePuzzleSolved(toggleBtn.dataset.number, markSolved);
        return;
      }
      const thumbWrap = e.target.closest('.js-preview-thumb');
      if (thumbWrap && thumbWrap.dataset.img) {
        els.fullPreviewImg.src = thumbWrap.dataset.img;
        els.imagePreviewDialog.showModal();
      }
    });

    // 모달 내부 버튼
    els.closeResultDialogBtn.addEventListener('click', () => els.resultDialog.close());
    els.closePreviewDialogBtn.addEventListener('click', () => els.imagePreviewDialog.close());
    els.copyDialogLinkBtn.addEventListener('click', () => {
      copyToClipboard(els.resultGameLinkInput.value, els.copyDialogLinkBtn);
    });
  }

  initEvents();
  fetchPuzzleList(false);
})();

