// 生态模拟器测试脚手架：DOM 桩 + 载入页面真实引擎
// 与 v1（evolution-sim）同一套思路：不改测试专用副本，直接驱动页面里的引擎代码
import fs from 'node:fs';

export function loadEngine(htmlUrl = './index.html'){
  const html = fs.readFileSync(new URL(htmlUrl, import.meta.url), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if(!m) throw new Error('index.html 中未找到 <script> 代码块');
  const script = m[1];

  function makeCtx(){
    return {
      canvas: null,
      save(){}, restore(){}, beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, arc(){},
      quadraticCurveTo(){}, bezierCurveTo(){}, rect(){}, fill(){}, stroke(){},
      fillRect(){}, strokeRect(){}, clearRect(){}, fillText(){}, strokeText(){},
      drawImage(){}, putImageData(){}, setTransform(){}, translate(){}, scale(){}, rotate(){},
      createLinearGradient(){ return { addColorStop(){} }; },
      createImageData(w, h){ return { width:w, height:h, data:new Uint8ClampedArray(Math.max(0, w * h * 4)) }; },
      getImageData(x, y, w, h){ return { width:w, height:h, data:new Uint8ClampedArray(Math.max(0, w * h * 4)) }; },
      measureText(){ return { width: 10 }; },
      fillStyle:'', strokeStyle:'', lineWidth:1, globalAlpha:1, font:'', imageSmoothingEnabled:true,
    };
  }
  function makeClassList(){
    const s = new Set();
    return {
      add(c){ s.add(c); }, remove(c){ s.delete(c); },
      contains(c){ return s.has(c); },
      toggle(c){ if(s.has(c)) s.delete(c); else s.add(c); },
    };
  }
  function makeEl(id){
    const el = {
      id, value:'', textContent:'', innerHTML:'', width:0, height:0,
      dataset:{}, style:{}, clientWidth:900, clientHeight:600,
      classList: makeClassList(),
      addEventListener(){}, removeEventListener(){},
      appendChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
      getContext(){ return makeCtx(); },
      getBoundingClientRect(){ return { left:0, top:0, width:900, height:600 }; },
      closest(){ return null; },
    };
    el.parentElement = { clientWidth:900, clientHeight:600 };
    return el;
  }
  const els = {};
  globalThis.document = {
    getElementById(id){ return els[id] || (els[id] = makeEl(id)); },
    createElement(){ return makeEl('dyn'); },
    querySelectorAll(){ return []; },
  };
  globalThis.window = { addEventListener(){}, devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = () => 0;

  /* 执行页面脚本（脚本末尾会挂 globalThis.__E） */
  new Function(script)();
  const E = globalThis.__E;
  if(!E) throw new Error('引擎未导出 __E（检查 index.html 末尾的测试导出块）');
  return E;
}
