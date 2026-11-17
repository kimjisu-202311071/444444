/* heatmap.js - 산업연관표 히트맵 (Canvas, 외부 라이브러리 없음)
 * 값이 클수록 어두운 색. 숫자는 표시하지 않고, 칸 위에 마우스를 올리면 아래에 상세정보 표시.
 *
 * 사용법:
 *   renderHeatmap(document.getElementById('heatmap'), {
 *     matrix,        // 2차원 배열 [행][열] (행: 공급·발생 부문, 열: 수요 부문)
 *     rowLabels, colLabels,  // 산업명 배열
 *     rowCodes, colCodes,    // 산업코드 배열 (선택)
 *     unit: '백만원',        // 단위 문구 (계수표는 '배' 등)
 *   });
 */
function renderHeatmap(container, opts) {
  const { matrix, rowLabels = [], colLabels = [], rowCodes = [], colCodes = [], unit = '' } = opts;
  const n = matrix.length, m = matrix[0].length;
  const cell = Math.max(1, Math.floor(760 / Math.max(n, m)));
  const W = m * cell, H = n * cell;

  container.innerHTML = `
    <div style="margin-bottom:8px">
      색 척도:
      <select class="hm-scale">
        <option value="sqrt">제곱근 (기본)</option>
        <option value="log">로그</option>
        <option value="linear">선형</option>
      </select>
      <span style="color:#666;font-size:13px">진할수록 값이 큼</span>
    </div>
    <div class="hm-wrap" style="position:relative;display:inline-block;max-width:100%;overflow:auto">
      <canvas class="hm-canvas" width="${W}" height="${H}" style="display:block;max-width:100%;height:auto"></canvas>
      <div class="hm-box" style="position:absolute;pointer-events:none;border:1px solid #e11;display:none;box-sizing:border-box"></div>
    </div>
    <div class="hm-info" style="margin-top:8px;min-height:3em;font-size:14px">칸 위에 마우스를 올려 보세요.</div>`;

  const canvas = container.querySelector('.hm-canvas');
  const box = container.querySelector('.hm-box');
  const info = container.querySelector('.hm-info');
  const sel = container.querySelector('.hm-scale');
  const ctx = canvas.getContext('2d');

  // 최댓값 (유한한 양수만)
  let max = 0;
  for (const row of matrix) for (const v of row) if (Number.isFinite(v) && v > max) max = v;

  const lo = [247, 251, 255], hi = [8, 48, 107]; // 연한 파랑 -> 진한 파랑
  function norm(v, mode) {
    if (!Number.isFinite(v) || v <= 0 || max <= 0) return -1;
    const r = v / max;
    if (mode === 'linear') return r;
    if (mode === 'log') return Math.log10(1 + r * 1000) / 3;
    return Math.sqrt(r);
  }

  function draw() {
    const mode = sel.value;
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const t = norm(matrix[i][j], mode);
        const c = t < 0 ? [255, 255, 255] : lo.map((a, k) => Math.round(a + (hi[k] - a) * t));
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) {
            const p = (((i * cell + y) * W) + (j * cell + x)) * 4;
            img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '결측');
  const name = (code, label) => (code ? `[${code}] ` : '') + (label ?? '');

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const j = Math.floor(((e.clientX - r.left) * (W / r.width)) / cell);
    const i = Math.floor(((e.clientY - r.top) * (H / r.height)) / cell);
    if (i < 0 || j < 0 || i >= n || j >= m) return;
    const k = r.width / W;
    box.style.display = 'block';
    box.style.left = j * cell * k + 'px';
    box.style.top = i * cell * k + 'px';
    box.style.width = Math.max(cell * k, 4) + 'px';
    box.style.height = Math.max(cell * k, 4) + 'px';
    info.innerHTML =
      `<b>행(공급)</b> ${name(rowCodes[i], rowLabels[i])}<br>` +
      `<b>열(수요)</b> ${name(colCodes[j], colLabels[j])}<br>` +
      `<b>값</b> ${fmt(matrix[i][j])} ${unit}`;
  });
  canvas.addEventListener('mouseleave', () => { box.style.display = 'none'; });
  sel.addEventListener('change', draw);
  draw();
}
