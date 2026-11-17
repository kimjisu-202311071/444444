import json, io
import numpy as np
import openpyxl

book = None

def emit(x):
    return json.dumps(x, ensure_ascii=False, allow_nan=False)

def _row_map(rows):
    return {str(r[0]): i for i, r in enumerate(rows) if r and r[0] is not None and len(r) > 1 and r[1] is not None}

def initialize(raw):
    global book, codes, names, L, M, V, sheets, valid, residuals, classification
    wb = openpyxl.load_workbook(io.BytesIO(bytes(raw)), read_only=True, data_only=True)
    book = {s: list(wb[s].values) for s in wb.sheetnames}
    wb.close()
    sheets = list(book)
    base = book['국산투입계수(Ad)']
    base_rows = _row_map(base[6:])
    # 산업코드는 열 머리글과 행 자료에 동시에 존재하는 항목으로 식별한다.
    codes = [str(c) for c in base[4][2:] if c is not None and str(c) in base_rows]
    codes = list(dict.fromkeys(codes))
    if len(codes) < 10:
        raise ValueError('산업코드를 판별할 수 없습니다. 선택한 엑셀 파일의 구조를 확인하세요.')
    names_by_code = {str(r[0]): str(r[1]) for r in base[6:] if r and len(r)>1 and r[0] is not None and r[1] is not None}
    names = [names_by_code[c] for c in codes]
    classification = {33:'대분류', 83:'중분류', 165:'소분류', 380:'기본부문'}.get(len(codes), f'{len(codes)}개 산업')

    def matrix(s):
        rows = book[s]
        ri = {str(r[0]): i for i,r in enumerate(rows) if r and r[0] is not None}
        ci = {str(c): i for i,c in enumerate(rows[4]) if c is not None}
        missing_rows = [c for c in codes if c not in ri]
        missing_cols = [c for c in codes if c not in ci]
        if missing_rows or missing_cols:
            raise ValueError(f'{s}: 산업코드 누락 (행 {len(missing_rows)}개, 열 {len(missing_cols)}개)')
        a = np.array([[rows[ri[c]][ci[k]] for k in codes] for c in codes], dtype=float)
        if not np.isfinite(a).all(): raise ValueError(s + ': 비수치 또는 결측 데이터')
        return a

    L = matrix('생산유발계수')
    M = matrix('수입유발계수')
    V = matrix('부가가치유발계수')
    ad = matrix('국산투입계수(Ad)')
    am = matrix('수입투입계수(Am)')
    rows = book['총투입계수(A)']
    ci = {str(c):i for i,c in enumerate(rows[4]) if c is not None}
    vr = next((r for r in rows if r and str(r[0])=='9690'), None)
    if vr is None: raise ValueError('총투입계수표에서 부가가치계(9690)를 찾을 수 없습니다.')
    v = np.array([vr[ci[c]] for c in codes], dtype=float)
    residuals = {
        '생산': float(np.max(np.abs((np.eye(len(codes))-ad)@L-np.eye(len(codes))))),
        '수입': float(np.max(np.abs(am@L-M))),
        '부가가치': float(np.max(np.abs(v[:,None]*L-V)))
    }
    valid = max(residuals.values()) < 1e-8
    if not valid: raise ValueError('계수 검증 실패: '+str(residuals))
    return emit({
        'sectors':[{'code':c,'name':n} for c,n in zip(codes,names)],
        'sheets':sheets,'residuals':residuals,'classification':classification,
        'sectorCount':len(codes),'year':'2023','priceBasis':'생산자가격'
    })

def explore(sheet, rowcode):
    rows=book[sheet]
    choices=[{'code':str(r[0]),'name':str(r[1])} for r in rows[6:] if len(r)>1 and r[0] is not None and r[1] is not None]
    chosen=next((r for r in rows[6:] if str(r[0])==rowcode),None)
    if chosen is None: chosen=next(r for r in rows[6:] if r[0] is not None and r[1] is not None)
    cells=[]
    for i in range(2,len(rows[4])):
        if rows[4][i] is None: continue
        val=chosen[i] if i<len(chosen) else None
        if isinstance(val,(float,int)): val=float(val)
        elif val is not None: val=str(val)
        cells.append({'code':str(rows[4][i]),'name':str(rows[5][i] or ''),'value':val})
    raw_unit = str(rows[3][0] or '').strip()
    unit = raw_unit.replace('단위 : ', '').replace('단위:', '').strip() if raw_unit else ('계수·비율' if '계수' in sheet or '투입계수' in sheet else '원자료 표기 확인')
    return emit({'rows':choices,'selected':str(chosen[0]),'name':str(chosen[1]),
                 'unit':unit,'cells':cells})

def dashboard_data():
    def row_values(sheet, rowcode):
        rows=book[sheet]
        row=next((r for r in rows if r and str(r[0])==str(rowcode)),None)
        if row is None: return []
        ci={str(c):i for i,c in enumerate(rows[4]) if c is not None}
        out=[]
        for c,n in zip(codes,names):
            idx=ci.get(c)
            val=row[idx] if idx is not None and idx<len(row) else None
            if isinstance(val,(int,float)) and np.isfinite(val): out.append({'code':c,'name':n,'value':float(val)})
        return out
    output=row_values('A표_총거래표(생산자)','9790')
    value_added=row_values('A표_총거래표(생산자)','9690')
    intermediate=row_values('A표_총거래표(생산자)','9590')
    domestic=row_values('A표_국산거래표(생산자)','9590')
    imported=row_values('A표_수입거래표(생산자)','9590')
    influence=row_values('생산유발계수','9801')
    total_map={x['code']:x['value'] for x in output}
    int_map={x['code']:x['value'] for x in intermediate}
    dom_map={x['code']:x['value'] for x in domestic}
    imp_map={x['code']:x['value'] for x in imported}
    def ratio_rows(num, den):
        return [{'code':x['code'],'name':x['name'],'value':(num.get(x['code'],0)/den[x['code']]*100 if den.get(x['code'],0) else 0)} for x in output]
    intermediate_rate=ratio_rows(int_map,total_map)
    domestic_rate=ratio_rows(dom_map,int_map)
    import_rate=ratio_rows(imp_map,int_map)
    # 한국은행 표의 최종수요 항목별 생산유발액 구성비(9812)를 사용
    fd=book['최종수요 항목별 생산유발액']
    fdrow=next((r for r in fd if r and str(r[0])=='9812'),None)
    final_demand=[]
    if fdrow:
        for i in range(2, min(len(fdrow),len(fd[5]))):
            code=fd[4][i] if i<len(fd[4]) else None
            label=fd[5][i] if i<len(fd[5]) else None
            value=fdrow[i]
            if code is not None and code!='9190' and isinstance(value,(int,float)):
                final_demand.append({'code':str(code),'name':str(label or code).replace('\n',' '),'value':float(value)})
    sort=lambda a: sorted(a,key=lambda x:x['value'],reverse=True)
    return emit({'sectorCount':len(codes),'classification':classification,
        'metrics':{'output':sort(output),'valueAdded':sort(value_added),'influence':sort(influence),
                   'intermediate':sort(intermediate_rate),'domestic':sort(domestic_rate),'importDependence':sort(import_rate)},
        'finalDemand':final_demand})

def simulate(payload):
    if not valid: raise ValueError('검증된 데이터가 없습니다.')
    shocks=json.loads(payload); f=np.zeros(len(codes))
    for s in shocks:
        a=float(s['amount'])
        if not np.isfinite(a) or a<0: raise ValueError('수요 증가액은 유한한 0 이상의 수여야 합니다.')
        f[codes.index(str(s['code']))]+=a
    if not f.sum()>0: raise ValueError('한 산업 이상의 양의 수요 증가액을 입력하세요.')
    x=L@f; m=M@f; v=V@f
    result=[{'code':c,'name':n,'production':float(a),'imports':float(b),'valueAdded':float(d)}
            for c,n,a,b,d in zip(codes,names,x,m,v)]
    result.sort(key=lambda r:r['production'],reverse=True)
    return emit({'demand':float(f.sum()),'production':float(x.sum()),'imports':float(m.sum()),
                 'valueAdded':float(v.sum()),'multiplier':float(x.sum()/f.sum()),'rows':result})

def focus_data(code, topn):
    topn = max(1, min(int(topn), 50))
    j = codes.index(str(code))
    order = np.argsort(-L[:, j])[:topn]
    rows = [{'code': codes[i], 'name': names[i],
             'values': [float(L[i, j]), float(M[i, j]), float(V[i, j])]} for i in order]
    return emit({'code': codes[j], 'name': names[j],
                 'columns': ['생산유발계수', '수입유발계수', '부가가치유발계수'],
                 'totals': [float(L[:, j].sum()), float(M[:, j].sum()), float(V[:, j].sum())],
                 'rows': rows, 'sectorCount':len(codes)})

def industry_data(code):
    j = codes.index(str(code))
    production = L.sum(axis=0)
    imports = M.sum(axis=0)
    value_added = V.sum(axis=0)
    influence = production / float(production.mean())
    sensitivity_raw = L.sum(axis=1)
    sensitivity = sensitivity_raw / float(sensitivity_raw.mean())
    return emit({
        'code': codes[j], 'name': names[j],
        'production': float(production[j]),
        'imports': float(imports[j]),
        'valueAdded': float(value_added[j]),
        'influence': float(influence[j]),
        'sensitivity': float(sensitivity[j]),
        'scatter': [
            {'code': c, 'name': n, 'influence': float(ix), 'sensitivity': float(sy)}
            for c, n, ix, sy in zip(codes, names, influence, sensitivity)
        ]
    })
