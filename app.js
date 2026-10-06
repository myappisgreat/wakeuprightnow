const $ = id => document.getElementById(id);
const STORAGE = 'wakeuprightnow-alarm';
let alarm = null, ringing = false, correct = 0, problem, audio, soundTimer, wakeLock, installPrompt;
try { const saved = JSON.parse(localStorage.getItem(STORAGE)); if (saved && Number.isFinite(saved.at) && typeof saved.time === 'string') alarm = saved; } catch {}
if (alarm) $('alarm-time').value = alarm.time;
function persist() { try { if (alarm) localStorage.setItem(STORAGE, JSON.stringify(alarm)); else localStorage.removeItem(STORAGE); } catch { toast('無法儲存設定，請保持此頁面開啟。'); } }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 5000); }
function renderAlarm() {
  $('status').textContent = alarm ? '鬧鐘已啟用' : '尚未設定'; $('status').classList.toggle('active', !!alarm); $('cancel').hidden = !alarm;
  $('set-alarm').innerHTML = alarm ? '更新鬧鐘 <span>↗</span>' : '設定鬧鐘 <span>↗</span>';
  $('schedule').textContent = alarm ? `將於 ${new Date(alarm.at).toLocaleString('zh-TW', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})} 響鈴 · 答對 5 題才能停止` : '設定時間，給明天一個清醒的開始。';
}
async function enableAudio() {
  // Request media playback on Safari instead of its default ambient sound session.
  // Older browsers may not implement AudioSession or allow changing its type.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('此瀏覽器不支援音訊播放');
  if (!audio || audio.state === 'closed') audio = new AudioContext();
  let timeout;
  try {
    await Promise.race([audio.resume(), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('音訊啟動逾時，請再點一次恢復鈴聲')), 3000);
    })]);
    if (audio.state !== 'running') throw new Error('瀏覽器暫停了音訊，請點恢復鈴聲');
  } finally { clearTimeout(timeout); }
}
function showAudioError(error) {
  $('resume-audio').hidden = false;
  $('audio-status').textContent = `鈴聲尚未啟動：${error.message || '請再試一次'}。`;
  toast('鈴聲啟動失敗，請點「恢復鈴聲」。');
}
function beep() {
  if (!audio || audio.state !== 'running') { $('resume-audio').hidden = false; $('audio-status').textContent = '音訊已暫停，請點「恢復鈴聲」。'; return; }
  $('resume-audio').hidden = true;
  $('audio-status').textContent = '正在播放鈴聲。若聽不到，請調高媒體音量、關閉靜音，並確認聲音未送到藍牙耳機。';
  for (let i = 0; i < 3; i++) { const oscillator = audio.createOscillator(), gain = audio.createGain(); const start = audio.currentTime + i * .24; oscillator.type = 'sine'; oscillator.frequency.value = i % 2 ? 880 : 660; gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.22, start + .015); gain.gain.exponentialRampToValueAtTime(.001, start + .19); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .2); }
}
async function keepAwake() { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) { try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } catch {} } }
function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
function randomTwoDigits() { return Math.floor(Math.random() * 90) + 10; }
function nextProblem() { const a = randomTwoDigits(), b = randomTwoDigits(); problem = {a,b,answer:a+b}; $('question').textContent = `${a} + ${b} = ?`; $('answer').value = ''; $('progress').replaceChildren(...Array.from({length:5}, (_, i) => { const dot = document.createElement('span'); dot.className = i < correct ? 'done' : ''; return dot; })); $('progress').setAttribute('aria-label', `已答對 ${correct} / 5 題`); $('answer').focus(); }
function startRinging() { if (ringing) return; ringing = true; correct = 0; $('feedback').textContent = ''; $('challenge').showModal(); nextProblem(); beep(); soundTimer = setInterval(beep, 1100); keepAwake(); }
function tick() { const now = new Date(); $('clock').innerHTML = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}<span>:${String(now.getSeconds()).padStart(2,'0')}</span>`; $('date').textContent = now.toLocaleDateString('zh-TW', {year:'numeric',month:'long',day:'numeric',weekday:'long'}); if (alarm && Date.now() >= alarm.at) startRinging(); }
$('alarm-form').addEventListener('submit', async event => { event.preventDefault(); try { await enableAudio(); } catch { toast('無法啟用音訊，請使用支援 Web Audio 的瀏覽器。'); return; } const time = $('alarm-time').value; const [h,m] = time.split(':').map(Number); if (!Number.isInteger(h) || !Number.isInteger(m)) return; const next = new Date(); next.setHours(h,m,0,0); if (next.getTime() <= Date.now()) next.setDate(next.getDate()+1); alarm = {time, at:next.getTime()}; persist(); renderAlarm(); await keepAwake(); toast('鬧鐘已設定，請保持 App 開啟並確認音量。'); });
$('cancel').addEventListener('click', () => { if (ringing) return; alarm = null; persist(); renderAlarm(); releaseWake(); toast('鬧鐘已取消'); });
$('test').addEventListener('click', async () => { try { await enableAudio(); startRinging(); } catch (error) { startRinging(); showAudioError(error); } });
$('challenge').addEventListener('cancel', event => event.preventDefault());
$('answer-form').addEventListener('submit', event => { event.preventDefault(); const raw = $('answer').value.trim(); if (!/^\d+$/.test(raw) || Number(raw) !== problem.answer) { $('feedback').textContent = '還差一點，再算一次。'; $('answer').select(); return; } correct++; if (correct === 5) { ringing = false; clearInterval(soundTimer); $('challenge').close(); if (alarm && Date.now() >= alarm.at) { alarm = null; persist(); renderAlarm(); } if (!alarm) releaseWake(); toast('五題全對！早安，你已經醒了 ☀'); } else { $('feedback').textContent = `答對了！再 ${5-correct} 題就完成。`; nextProblem(); } });
$('resume-audio').addEventListener('click', async () => { try { await enableAudio(); beep(); } catch (error) { showAudioError(error); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); if (alarm || ringing) keepAwake(); } });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = false; });
$('install').addEventListener('click', async () => { if (!installPrompt) return; await installPrompt.prompt(); installPrompt = null; $('install').hidden = true; });
window.addEventListener('appinstalled', () => $('install').hidden = true);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => toast('離線功能未啟用，請透過 HTTPS 或 localhost 開啟。'));
renderAlarm(); tick(); setInterval(tick, 500);
