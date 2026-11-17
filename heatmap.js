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
  const label = el('td', `전체 ${d.sectorCount || d.rows.length}개 산업 기준 합계`, cellCss + 'font-weight:bold;background:#f3f3f3');
  label.colSpan = 2;
  foot.append(label);
  d.totals.forEach(v => foot.append(el('td', fmt(v), cellCss + 'text-align:right;font-weight:bold;background:#f3f3f3')));
  const tfoot = el('tfoot');
  tfoot.append(foot);
  const avgRow = el('tr');
  avgRow.append(el('td', '✓ 전체 산업 평균', cellCss + 'font-weight:bold;background:#fffafa;border-top:2px solid #d92727;color:#a83232'));
  avgRow.append(el('td', '평균값', cellCss + 'font-weight:bold;background:#fffafa;border-top:2px solid #d92727;color:#a83232'));
  (d.averages || [0,0,0]).forEach(v => avgRow.append(el('td', fmt(v), cellCss + 'text-align:right;font-weight:bold;background:#fffafa;border-top:2px solid #d92727;color:#a83232')));
  tfoot.append(avgRow);
  table.append(tfoot);

  const wrap = el('div', undefined, 'overflow-x:auto');
  wrap.append(table);
  container.replaceChildren(
    el('h3', `[${d.code}] ${d.name} — 수요 1 증가 시 유발효과 상위 ${d.rows.length}개 산업`),
    el('p', '표시값은 생산·수입·부가가치 유발계수(배)입니다. 선택 산업의 국산 최종수요가 1백만원 증가할 때 각 산업에 유발되는 금액(백만원)으로도 해석할 수 있습니다. 진할수록 값이 크며, 열마다 색상 범위를 따로 적용합니다.', 'font-size:13px;color:#666'),
    wrap
  );
}
