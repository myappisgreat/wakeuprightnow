const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(saved) {
  const elements = new Map(); const handlers = {};
  function element(id) { if (!elements.has(id)) elements.set(id, {value:'07:00',hidden:false,textContent:'',innerHTML:'',classList:{toggle(){}},addEventListener(event,fn){ handlers[`${id}:${event}`] = fn; },replaceChildren(){},setAttribute(){},focus(){},select(){},showModal(){this.open=true;},close(){this.open=false;}}); return elements.get(id); }
  const storage = new Map(saved ? [['wakeuprightnow-alarm',JSON.stringify(saved)]] : []);
  const context = vm.createContext({document:{getElementById:element,createElement:()=>({}),addEventListener(){},visibilityState:'visible'},window:{addEventListener(){},AudioContext:class {constructor(){this.state='running';this.currentTime=0;} async resume(){} createOscillator(){return {frequency:{},connect(){},start(){},stop(){}};} createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};} }},navigator:{},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},Date,Math,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'),context);
  return {context,element,handlers,storage,run:code=>vm.runInContext(code,context),submit(id){return handlers[`${id}:submit`]({preventDefault(){}});}};
}
test('random questions use two integers from 10 to 99 with correct addition',()=>{const app=setup();for(let i=0;i<1000;i++){app.run('nextProblem()');assert.equal(app.run('problem.a >= 10 && problem.a <= 99 && problem.b >= 10 && problem.b <= 99 && problem.answer === problem.a + problem.b'),true);}});
test('wrong answers do not advance; exactly five correct answers stop alarm',()=>{const app=setup();app.run('startRinging()');app.element('answer').value='-1';app.submit('answer-form');assert.equal(app.run('correct'),0);for(let i=0;i<5;i++){app.element('answer').value=String(app.run('problem.answer'));app.submit('answer-form');assert.equal(app.run('ringing'),i<4);}assert.equal(app.element('challenge').open,false);});
test('Escape cannot dismiss the challenge',()=>{const app=setup();let prevented=false;app.handlers['challenge:cancel']({preventDefault(){prevented=true;}});assert.equal(prevented,true);});
test('setting alarm schedules future occurrence and persists it',async()=>{const app=setup();app.element('alarm-time').value='07:00';await app.submit('alarm-form');assert.ok(app.run('alarm.at')>Date.now());assert.ok(app.storage.has('wakeuprightnow-alarm'));});
test('expired saved alarm rings and is removed only after five answers',()=>{const app=setup({at:Date.now()-1000,time:'07:00'});assert.equal(app.run('ringing'),true);for(let i=0;i<5;i++){app.element('answer').value=String(app.run('problem.answer'));app.submit('answer-form');}assert.equal(app.storage.has('wakeuprightnow-alarm'),false);});
test('practice preserves a future scheduled alarm',()=>{const app=setup({at:Date.now()+3600000,time:'07:00'});app.run('startRinging()');for(let i=0;i<5;i++){app.element('answer').value=String(app.run('problem.answer'));app.submit('answer-form');}assert.equal(app.storage.has('wakeuprightnow-alarm'),true);});
