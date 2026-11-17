/* heatmap.js - 선택한 산업 하나에 대한 히트맵 (표 형태, 외부 라이브러리 없음)
 * 진할수록 값이 큼. 계수 종류(열)마다 색 범위를 따로 잡아서 크기가 달라도 구분됨.
 *
 * d = { code, name, columns:[열 이름...], totals:[합계...],
 *       rows:[{code, name, values:[...]}] }
 */
function renderFocusMap(container, d) {
  const lo = [247, 251, 255], hi = [8, 48, 107];
  const fmt = v => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 4 });
  const el = (tag, text, css) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (css) e.style.cssText = css;
    return e;
  };
  const maxes = d.columns.map((_, k) => Math.max(0, ...d.rows.map(r => r.values[k])));
  const cellCss = 'padding:6px 10px;border:1px solid #ddd;';

  const table = el('table', undefined, 'border-collapse:collapse;width:100%;min-width:520px');
  const head = el('tr');
  ['순위', '산업', ...d.columns].forEach(h => head.append(el('th', h, cellCss + 'background:#f3f3f3')));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);

  const body = el('tbody');
  d.rows.forEach((r, i) => {
    const tr = el('tr');
    const self = r.code === d.code;
    tr.append(el('td', String(i + 1), cellCss + 'text-align:center'));
    tr.append(el('td', `[${r.code}] ${r.name}`, cellCss + (self ? 'font-weight:bold' : '')));
    r.values.forEach((v, k) => {
      const t = maxes[k] > 0 && v > 0 ? Math.sqrt(v / maxes[k]) : 0;
      const c = lo.map((a, n) => Math.round(a + (hi[n] - a) * t));
      tr.append(el('td', fmt(v),
        cellCss + `text-align:right;background:rgb(${c});color:${t > 0.55 ? '#fff' : '#111'}`));
    });
    body.append(tr);
  });
  table.append(body);

  const foot = el('tr');
  const label = el('td', '전체 380개 산업 합계', cellCss + 'font-weight:bold;background:#f3f3f3');
  label.colSpan = 2;
  foot.append(label);
  d.totals.forEach(v => foot.append(el('td', fmt(v), cellCss + 'text-align:right;font-weight:bold;background:#f3f3f3')));
  const tfoot = el('tfoot');
  tfoot.append(foot);
  table.append(tfoot);

  const wrap = el('div', undefined, 'overflow-x:auto');
  wrap.append(table);
  container.replaceChildren(
    el('h3', `[${d.code}] ${d.name} — 수요 1 증가 시 유발효과 상위 ${d.rows.length}개 산업`),
    el('p', '값은 이 산업의 최종수요가 1백만원 늘 때 각 산업에서 유발되는 금액(백만원)입니다. 진할수록 큰 값이며, 열마다 따로 진하기를 정합니다(제곱근 척도). 아래 합계는 380개 산업 전체 기준입니다.', 'font-size:13px;color:#666'),
    wrap
  );
}
