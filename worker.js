const BASE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
let py;
let chain = Promise.resolve();
async function handle({id,type,payload}) {
  try {
    let result;
    if(type==='init') {
      postMessage({type:'status',text:'Python 분석 환경 준비 중…'});
      if(!py) {
        importScripts(BASE+'pyodide.js');
        py=await loadPyodide({indexURL:BASE});
        await py.loadPackage(['numpy','micropip']);
        await py.runPythonAsync("import micropip\nawait micropip.install('openpyxl==3.1.5')");
        const response=await fetch('./model.py');
        if(!response.ok) throw Error('model.py를 불러올 수 없습니다.');
        await py.runPythonAsync(await response.text());
      }
      postMessage({type:'status',text:'선택한 산업연관표를 읽고 계수를 검증 중…'});
      py.globals.set('raw_input',new Uint8Array(payload));
      await py.runPythonAsync('raw_bytes = raw_input.to_py()');
      result=await py.runPythonAsync('initialize(raw_bytes)');
      await py.runPythonAsync('del raw_input, raw_bytes');
    } else if(type==='dashboard') {
      result=py.runPython('dashboard_data()');
    } else if(type==='explore') {
      py.globals.set('sheet_input',payload.sheet);
      py.globals.set('row_input',payload.row||'');
      result=py.runPython('explore(sheet_input, row_input)');
    } else if(type==='industry') {
      py.globals.set('code_input',payload.code);
      result=py.runPython('industry_data(code_input)');
    } else if(type==='matrix') {
      py.globals.set('code_input',payload.code);
      py.globals.set('topn_input',payload.topn);
      result=py.runPython('focus_data(code_input, topn_input)');
    } else if(type==='compare') {
      py.globals.set('compare_codes_json', JSON.stringify(payload.codes));
      result=py.runPython('comparison_data(json.loads(compare_codes_json))');
    } else if(type==='network') {
      py.globals.set('code_input',payload.code);
      result=py.runPython('network_data(code_input)');
    } else {
      py.globals.set('scenario_input',JSON.stringify(payload));
      result=py.runPython('simulate(scenario_input)');
    }
    postMessage({id,ok:true,result:JSON.parse(result)});
  } catch(error) { postMessage({id,ok:false,error:String(error)}); }
}
onmessage=e=>{ chain=chain.then(()=>handle(e.data)); };
