(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'alamAlMarah_v2';
  const ids = ['bubbles','memory','catcher','quiz','math','letters','pattern','sorting','arabicWords','arabicMissing','englishListen','englishSpell','arithmetic','sequence','compare'];
  const freshState = () => ({ stars: 0, sound: false, music: false, gamesPlayed: 0, played: [], best: Object.fromEntries(ids.map(id => [id, 0])) });
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      const base = freshState();
      if (!raw || typeof raw !== 'object') return base;
      base.stars = Math.max(0, Number(raw.stars) || 0);
      base.sound = raw.sound === true;
      base.music = raw.music === true;
      base.gamesPlayed = Math.max(0, Number(raw.gamesPlayed) || 0);
      base.played = Array.isArray(raw.played) ? raw.played.filter(id => ids.includes(id)) : [];
      for (const id of ids) base.best[id] = Math.max(0, Number(raw.best?.[id]) || 0);
      return base;
    } catch (_) { return freshState(); }
  }
  let state = loadState();
  let activeGame = null, running = false, score = 0, timeLeft = 30, round = 0;
  let intervalIds = new Set(), timeoutIds = new Set(), cleanups = [], rafId = 0;
  let toastTimer = 0, audioContext = null, firstCard = null, secondCard = null, lockBoard = false;
  let musicAudio = null, voiceAudio = null;
  let pairsFound = 0, catcherX = 0.5, fallingObjects = [], selectedSortItem = null, sortingDone = 0, currentQuestionData = null;
  const homeView = $('homeView'), gameView = $('gameView'), playfield = $('playfield'), modal = $('resultModal');
  const meta = {
    bubbles: { title:'فقّع البالونات', sub:'المس البالونات الطائرة واجمع النقاط قبل انتهاء الوقت.', icon:'🎈', intro:'🎈', introTitle:'جاهز لتفجير الألوان؟', introText:'المس البالونات لتفقعها. البالون الذهبي يمنحك نقاطًا إضافية!', hint:'💡 بعض البالونات ذهبية ومميّزة. حاول أن تلحق بها!' },
    memory: { title:'ذاكرة الأبطال', sub:'اقلب البطاقات وابحث عن الصور المتشابهة.', icon:'🧠', intro:'🦊', introTitle:'هل ذاكرتك مستعدّة؟', introText:'اقلب بطاقتين في كل مرة، وحاول العثور على كل الأزواج الثمانية.', hint:'💡 انظر جيدًا إلى الصورة ومكانها. لا بأس إن احتجت إلى المحاولة ثانية.' },
    catcher: { title:'صائد النجوم', sub:'حرّك السلة والتقط النجوم المتساقطة.', icon:'⭐', intro:'🧺', introTitle:'استعد لصيد النجوم!', introText:'حرّك إصبعك يمينًا ويسارًا لتحريك السلة. التقط النجوم قبل أن تصل إلى الأرض.', hint:'💡 المس واسحب في مساحة اللعب، أو استخدم سهمَي لوحة المفاتيح.' },
    quiz: { title:'ألوان وأشكال', sub:'انظر إلى السؤال واختر الإجابة الصحيحة.', icon:'🎨', intro:'🔺', introTitle:'خبير الألوان والأشكال!', introText:'ثمانية أسئلة قصيرة عن الألوان والأشكال. خذ وقتك وفكّر بهدوء.', hint:'💡 تذكّر اسم اللون أو شكل المجسّم قبل اختيار الإجابة.' },
    math: { title:'سفاري الأرقام', sub:'عدّ الأشياء واكتشف متعة الأرقام.', icon:'🔢', intro:'🦒', introTitle:'هيا نعدّ معًا!', introText:'عدّ الفواكه والنجوم، وساعد أصدقاء السفاري في حلّ مسائل جمع بسيطة.', hint:'💡 يمكنك عدّ الصور واحدة تلو الأخرى. الرياضيات مغامرة!' },
    letters: { title:'حروف وكلمات', sub:'انظر إلى الصورة واختر الحرف الأول من اسمها.', icon:'🔤', intro:'📚', introTitle:'مغامرة الحروف!', introText:'شاهد الصورة، واقرأ اسمها، ثم اختر الحرف الذي تبدأ به الكلمة.', hint:'💡 قل اسم الصورة بصوتك، ثم استمع إلى أول صوت في الكلمة.' },
    pattern: { title:'أكمل النمط', sub:'اكتشف الترتيب واختر ما يأتي بعده.', icon:'🧩', intro:'🧩', introTitle:'عينك تلاحظ التفاصيل!', introText:'راقب تكرار الألوان والأشكال، ثم اختر القطعة التي تكمل النمط.', hint:'💡 انظر إلى ما يتكرر من اليسار إلى اليمين. ما القطعة التالية؟' },
    sorting: { title:'صندوق الفرز', sub:'اختر غرضًا، ثم ضعه في سلّته المناسبة.', icon:'🧺', intro:'🧸', introTitle:'رتّب الأشياء مع لولو!', introText:'المس غرضًا لتحديده، ثم المس السلة ذات اللون المناسب. هيا نرتّب الأشياء!', hint:'💡 تذكّر اللون الذي اخترته، ثم ابحث عن السلة التي تحمل اللون نفسه.' },
    arabicWords: { title:'اقرأ واختر', sub:'اربط الصورة بالكلمة العربية الصحيحة.', icon:'📚', intro:'🦉', introTitle:'مغامرة القراءة العربية!', introText:'شاهد الصورة، واقرأ الخيارات بهدوء، ثم اختر الكلمة المناسبة.', hint:'💡 حاول قراءة الكلمة بصوت مسموع قبل اختيارها.' },
    arabicMissing: { title:'الحرف المفقود', sub:'أكمل الكلمة العربية بالحرف الذي ينقصها.', icon:'✏️', intro:'📝', introTitle:'محقق الحروف الصغير!', introText:'تحتاج كل كلمة إلى حرف واحد. اكتشف الحرف الذي يعيد إليها شكلها الصحيح.', hint:'💡 اقرأ الكلمة كاملة في ذهنك، ثم جرّب الحرف الذي ينقصها.' },
    englishListen: { title:'Listen & Pick', sub:'استمع إلى الكلمة الإنجليزية واختر الصورة المناسبة.', icon:'🔊', intro:'🎧', introTitle:'Ready to listen?', introText:'اضغط زر الصوت، استمع إلى الكلمة الإنجليزية، ثم اختر الصورة الصحيحة.', hint:'💡 يمكنك الاستماع إلى الكلمة أكثر من مرة. Listen again!' },
    englishSpell: { title:'Spell the Word', sub:'اكتشف الحرف الناقص في الكلمة الإنجليزية.', icon:'🔤', intro:'🅰️', introTitle:'Let’s spell together!', introText:'انظر إلى الصورة والكلمة، ثم اختر الحرف الناقص لإكمال التهجئة.', hint:'💡 انطق الكلمة ببطء، واستمع إلى الأصوات التي تكوّنها.' },
    arithmetic: { title:'مملكة الجمع والطرح', sub:'تدرّب على الجمع والطرح حتى العدد 20.', icon:'🧮', intro:'➕', introTitle:'هيا نحسب معًا!', introText:'حل مسائل الجمع والطرح. يمكنك استخدام الصور لمساعدتك في العدّ.', hint:'💡 في الطرح نبدأ بالعدد الأكبر، ثم نعدّ إلى الخلف.' },
    sequence: { title:'قطار الأعداد', sub:'أكمل التسلسل العددي واختر العدد الناقص.', icon:'🚂', intro:'🔢', introTitle:'كل عربة لها رقم!', introText:'راقب الأعداد على القطار، واكتشف الرقم الذي يجب أن يملأ الفراغ.', hint:'💡 هل يزيد العدد واحدًا في كل مرة أم اثنين أم خمسة؟' },
    compare: { title:'من الأكبر؟', sub:'قارن الأعداد واكتشف الأكبر أو الأصغر.', icon:'⚖️', intro:'🐘', introTitle:'ميزان الأعداد!', introText:'اقرأ السؤال وانظر إلى العددين، ثم اختر الأكبر أو الأصغر.', hint:'💡 العدد الأكبر يبعد أكثر عن الصفر على خط الأعداد.' }
  };

  const memoryEmojis = ['🦊','🐸','🐼','🦄','🐙','🐝','🐧','🐢'];
  const quizRounds = [
    { q:'أين الدائرة الزرقاء؟', target:'🔵', options:['🟡','🔵','🔺','🟩'], answer:'🔵' },
    { q:'اختر المثلث الأحمر!', target:'🔺', options:['🟦','⭐','🔺','🟣'], answer:'🔺' },
    { q:'أين النجمة الصفراء؟', target:'⭐', options:['💚','🔻','🔵','⭐'], answer:'⭐' },
    { q:'اختر المربع الأخضر!', target:'🟩', options:['🟩','🔴','🔺','🟡'], answer:'🟩' },
    { q:'أين القلب الوردي؟', target:'💗', options:['🟠','💗','🟦','⭐'], answer:'💗' },
    { q:'اختر الدائرة البنفسجية!', target:'🟣', options:['🟣','🔺','🟩','🟡'], answer:'🟣' },
    { q:'أين الهلال؟', target:'🌙', options:['☀️','🌟','🌙','❤️'], answer:'🌙' },
    { q:'اختر المربع الأزرق!', target:'🟦', options:['🟦','🟡','🔴','🔺'], answer:'🟦' }
  ];
  const mathRounds = [
    { kind:'count', word:'تفاحات', emoji:'🍎', count:3 },
    { kind:'count', word:'نجوم', emoji:'⭐', count:5 },
    { kind:'add', emoji:'🐠', a:2, b:1 },
    { kind:'count', word:'فراشات', emoji:'🦋', count:4 },
    { kind:'add', emoji:'🍐', a:3, b:2 },
    { kind:'count', word:'كواكب', emoji:'🪐', count:6 },
    { kind:'add', emoji:'🐣', a:4, b:1 },
    { kind:'count', word:'قلوب', emoji:'💗', count:7 }
  ];
  const letterRounds = [
    { emoji:'🦁', word:'أسد', answer:'أ', options:['أ','ب','ت','س'] },
    { emoji:'🦆', word:'بطة', answer:'ب', options:['ج','ب','م','د'] },
    { emoji:'🍎', word:'تفاحة', answer:'ت', options:['ن','ث','ت','ل'] },
    { emoji:'🦊', word:'ثعلب', answer:'ث', options:['ث','ف','ش','ع'] },
    { emoji:'🐪', word:'جمل', answer:'ج', options:['ح','ج','خ','ر'] },
    { emoji:'🐳', word:'حوت', answer:'ح', options:['د','خ','ح','ق'] },
    { emoji:'🐻', word:'دب', answer:'د', options:['ذ','د','ز','س'] },
    { emoji:'🍇', word:'عنب', answer:'ع', options:['غ','ف','ع','أ'] }
  ];
  const patternRounds = [
    { seq:['🔵','🟡','🔵','🟡'], answer:'🔵', options:['🟢','🔵','🔺'] },
    { seq:['🍎','🍎','🍐','🍎','🍎'], answer:'🍐', options:['🍐','🍎','🍊'] },
    { seq:['⭐','🌙','⭐','🌙'], answer:'⭐', options:['🌙','⭐','☀️'] },
    { seq:['🔺','🔵','🟩','🔺','🔵'], answer:'🟩', options:['🔺','🟩','🔵'] },
    { seq:['🐸','🐸','🦊','🐸','🐸'], answer:'🦊', options:['🐼','🐸','🦊'] },
    { seq:['💗','💛','💛','💗','💛','💛'], answer:'💗', options:['💛','💗','💜'] },
    { seq:['🟣','🟢','🟢','🟣','🟢','🟢'], answer:'🟣', options:['🟢','🟡','🟣'] },
    { seq:['🐝','🌼','🐝','🌼','🐝'], answer:'🌼', options:['🌸','🌼','🐝'] }
  ];
  const badgeDefs = [
    { id:'first', icon:'🌱', title:'بداية جميلة', desc:'أنهِ أول جولة', test:s=>s.gamesPlayed>=1 },
    { id:'collector', icon:'⭐', title:'جامع النجوم', desc:'اجمع 10 نجوم', test:s=>s.stars>=10 },
    { id:'memory', icon:'🧠', title:'ذاكرة لامعة', desc:'اجمع 8 أزواج في الذاكرة', test:s=>s.best.memory>=80 },
    { id:'pop', icon:'🎈', title:'نجم البالونات', desc:'احصل على 20 نقطة في البالونات', test:s=>s.best.bubbles>=20 },
    { id:'math', icon:'🔢', title:'بطل الأرقام', desc:'احصل على 70 نقطة في الأرقام', test:s=>s.best.math>=70 },
    { id:'quiz', icon:'🎨', title:'فنان الأشكال', desc:'أجب عن أسئلة الأشكال بنجاح', test:s=>s.best.quiz>=80 },
    { id:'explorer', icon:'🗺️', title:'المستكشف', desc:'جرّب 4 ألعاب مختلفة', test:s=>s.played.length>=4 },
    { id:'allround', icon:'🏆', title:'بطل عالم المرح', desc:'جرّب الألعاب التعليمية الخمس عشرة', test:s=>s.played.length>=ids.length },
    { id:'reader', icon:'📚', title:'قارئ صغير', desc:'احصل على 60 نقطة في القراءة العربية', test:s=>s.best.arabicWords>=60 },
    { id:'wordsmith', icon:'🔤', title:'صديق الكلمات', desc:'احصل على 70 نقطة في الحروف والتهجئة', test:s=>s.best.englishSpell>=70 },
    { id:'math-wizard', icon:'🧮', title:'عبقري الحساب', desc:'احصل على 70 نقطة في الجمع والطرح', test:s=>s.best.arithmetic>=70 },
    { id:'listening-star', icon:'🎧', title:'أذن ذهبية', desc:'احصل على 70 نقطة في الاستماع الإنجليزي', test:s=>s.best.englishListen>=70 }
  ];

  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { showToast('تعمل اللعبة، لكن تعذّر حفظ التقدّم على هذا الجهاز.'); } }
  function shuffle(list) { const a = [...list]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function later(fn, ms) { const id=setTimeout(()=>{timeoutIds.delete(id);fn();},ms); timeoutIds.add(id); return id; }
  function every(fn, ms) { const id=setInterval(fn,ms); intervalIds.add(id); return id; }
  function stopRuntime() {
    intervalIds.forEach(clearInterval); intervalIds.clear(); timeoutIds.forEach(clearTimeout); timeoutIds.clear();
    if (rafId) cancelAnimationFrame(rafId); rafId=0;
    cleanups.forEach(fn=>{try{fn();}catch(_){}}); cleanups=[];
    fallingObjects.forEach(o=>o.node?.remove()); fallingObjects=[];
  }
  const soundAsset = { pop:'pop.wav', good:'correct.wav', bad:'try-again.wav', win:'level-up.wav', click:'click.wav', star:'star.wav', whoosh:'whoosh.wav' };
  const activeSfx = new Set();
  function playTone(kind='pop') {
    if (!state.sound) return;
    const file = soundAsset[kind] || soundAsset.pop;
    try {
      const audio = new Audio(`assets/audio/effects/${file}`);
      audio.preload = 'auto'; audio.volume = kind === 'bad' ? 0.42 : 0.62;
      activeSfx.add(audio); audio.addEventListener('ended',()=>activeSfx.delete(audio),{once:true});
      const promise = audio.play();
      if (promise && promise.catch) promise.catch(() => {activeSfx.delete(audio);fallbackTone(kind);});
    } catch (_) { fallbackTone(kind); }
  }
  function fallbackTone(kind='pop') {
    try {
      const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx)return;
      if(!audioContext) audioContext=new Ctx();
      if(audioContext.state==='suspended') audioContext.resume();
      const now=audioContext.currentTime;
      const patterns={pop:[[620,.07,'sine']],good:[[660,.08,'sine'],[880,.12,'sine']],bad:[[230,.12,'triangle']],win:[[523,.1,'sine'],[659,.1,'sine'],[784,.12,'sine'],[1046,.22,'sine']],click:[[440,.045,'sine']],star:[[880,.08,'sine'],[1175,.12,'sine']],whoosh:[[300,.08,'sine'],[600,.1,'sine']]};
      (patterns[kind]||patterns.pop).forEach((n,i)=>{const osc=audioContext.createOscillator(), gain=audioContext.createGain();osc.type=n[2];osc.frequency.setValueAtTime(n[0],now+i*.105);gain.gain.setValueAtTime(.0001,now+i*.105);gain.gain.exponentialRampToValueAtTime(.07,now+i*.105+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.105+n[1]);osc.connect(gain);gain.connect(audioContext.destination);osc.start(now+i*.105);osc.stop(now+i*.105+n[1]+.02);});
    } catch (_) { /* Audio is optional; never interrupt play. */ }
  }
  function playVoice(word) {
    if (voiceAudio) { voiceAudio.pause(); voiceAudio.currentTime = 0; }
    const safe = String(word).toLowerCase().replace(/[^a-z-]/g,'');
    voiceAudio = new Audio(`assets/audio/voice/en/${safe}.mp3`);
    voiceAudio.volume = 0.95;
    voiceAudio.onerror = () => showToast('تعذّر تشغيل النطق الصوتي على هذا الجهاز.');
    voiceAudio.play().catch(() => showToast('اضغط زر الاستماع مرة أخرى لتشغيل الصوت.'));
  }
  function toggleMusic() {
    state.music = !state.music; saveState(); updateHeader();
    if (state.music) {
      if (!musicAudio) { musicAudio = new Audio('assets/audio/effects/playful-loop.mp3'); musicAudio.loop = true; musicAudio.volume = 0.13; }
      musicAudio.play().catch(() => showToast('اضغط زر الموسيقى مرة أخرى لبدء التشغيل.'));
      playTone('star');
    } else if (musicAudio) { musicAudio.pause(); musicAudio.currentTime = 0; }
  }
  function showToast(message) { const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100); }
  function setScore(n) { score=n;$('currentScore').textContent=String(score); }
  function updateProgress(current,max,label) { const pct=max?Math.max(0,Math.min(100,Math.round(current/max*100))):0;$('progressBar').style.width=pct+'%';$('progressValue').textContent=pct+'%';$('progressLabel').textContent=label; }
  function updateHeader() { $('totalStars').textContent=state.stars;$('rewardStars').textContent=state.stars;$('gamesPlayedChip').textContent=`🎮 ${state.gamesPlayed} جولة`;$('bestGamesChip').textContent=`🏅 ${ids.filter(id=>state.best[id]>0).length} أرقام قياسية`;$('badgeChip').textContent=`🏵️ ${getUnlockedBadges().length} أوسمة`;$('soundToggle').setAttribute('aria-pressed',String(state.sound));$('soundIcon').textContent=state.sound?'🔊':'🔇';$('soundToggle').setAttribute('aria-label',state.sound?'إيقاف المؤثرات الصوتية':'تشغيل المؤثرات الصوتية');$('musicToggle').setAttribute('aria-pressed',String(state.music));$('musicIcon').textContent=state.music?'🎶':'🎵';$('musicToggle').setAttribute('aria-label',state.music?'إيقاف موسيقى الخلفية':'تشغيل موسيقى الخلفية'); }
  function getUnlockedBadges() { return badgeDefs.filter(b=>b.test(state)); }
  function renderBadges() {
    const target=$('badgesGrid');target.innerHTML='';const unlocked=new Set(getUnlockedBadges().map(b=>b.id));
    badgeDefs.forEach(b=>{const card=document.createElement('div');card.className='badge-card'+(unlocked.has(b.id)?' earned':'');const icon=document.createElement('span');icon.className='badge-icon';icon.textContent=unlocked.has(b.id)?b.icon:'🔒';const text=document.createElement('span');text.className='badge-text';const title=document.createElement('b');title.textContent=b.title;const desc=document.createElement('small');desc.textContent=unlocked.has(b.id)?'تم الحصول عليه!':b.desc;text.append(title,desc);card.append(icon,text);target.appendChild(card);});
  }
  function renderDaily() {
    const tips=[['مهمّة اليوم: جرّب شيئًا جديدًا!','اختر لعبة لم تجربها من قبل، فقد تكتشف موهبة جديدة.'],['مهمّة اليوم: درّب ذاكرتك!','لاحظ التفاصيل الصغيرة، فهي تساعدك على حلّ الألغاز.'],['مهمّة اليوم: تعلّم وأنت تبتسم!','ليس المهم أن تكون الإجابة صحيحة دائمًا؛ المهم أن تحاول.'],['مهمّة اليوم: اجمع النجوم!','اختر مغامرتك المفضلة واحتفل بكل خطوة صغيرة.'],['مهمّة اليوم: جرّب لعبة ذكية!','الألوان والأرقام والكلمات تصبح أسهل عندما نلعب.']];
    const now=new Date();const index=(now.getFullYear()+now.getMonth()+now.getDate())%tips.length;$('dailyTitle').textContent=tips[index][0];$('dailyText').textContent=tips[index][1];
  }
  function renderLearningPaths() {
    const paths={arabic:['letters','arabicWords','arabicMissing'],english:['englishListen','englishSpell'],math:['math','arithmetic','sequence','compare']};
    Object.entries(paths).forEach(([key,gameIds])=>{const card=document.querySelector(`[data-path="${key}"]`);if(!card)return;const done=gameIds.filter(id=>state.played.includes(id)).length;const pct=Math.round(done/gameIds.length*100);card.querySelector('.path-progress span').style.width=pct+'%';card.querySelector('.path-count').textContent=`${done} من ${gameIds.length} ألعاب · ${pct}%`;card.setAttribute('aria-label',`${card.querySelector('strong').textContent}: أنهيت ${done} من ${gameIds.length} ألعاب`);});
  }
  function renderHome() { updateHeader();renderBadges();renderDaily();renderLearningPaths();ids.forEach(id=>{const card=document.querySelector(`[data-game="${id}"]`);if(card){let chip=card.querySelector('.personal-best');if(!chip&&state.best[id]>0){chip=document.createElement('small');chip.className='personal-best';chip.textContent=`أفضل نتيجة: ${state.best[id]}`;chip.style.cssText='position:absolute;left:12px;top:12px;z-index:2;background:#fff9df;color:#866722;border-radius:8px;padding:5px 7px;font-size:10px;font-weight:900';card.appendChild(chip);}else if(chip&&state.best[id]>0){chip.textContent=`أفضل نتيجة: ${state.best[id]}`;}}}); }
  function showIntro() {
    const m=meta[activeGame];playfield.innerHTML='';const intro=document.createElement('div');intro.className='game-intro';intro.id='gameIntro';
    const emoji=document.createElement('div');emoji.className='intro-emoji';emoji.textContent=m.intro;
    const title=document.createElement('h2');title.textContent=m.introTitle;
    const text=document.createElement('p');text.textContent=m.introText;
    const start=document.createElement('button');start.type='button';start.className='start-button';start.id='startGame';start.innerHTML='ابدأ اللعب <span>✨</span>';start.addEventListener('click',beginRun);
    intro.append(emoji,title,text,start);playfield.appendChild(intro);$('gameHint').textContent=m.hint;
  }
  function openGame(id) {
    if(!ids.includes(id))return;stopRuntime();activeGame=id;running=false;score=0;round=0;timeLeft=30;firstCard=secondCard=null;lockBoard=false;pairsFound=0;selectedSortItem=null;sortingDone=0;
    homeView.classList.add('hidden');gameView.classList.remove('hidden');modal.classList.add('hidden');const m=meta[id];$('activeGameIcon').textContent=m.icon;$('activeGameTitle').textContent=m.title;$('activeGameSub').textContent=m.sub;$('currentScore').textContent='0';$('bestScore').textContent=state.best[id]||0;$('timerLabel').textContent='الوقت';const plannedRounds={memory:8,sorting:9,quiz:8,math:8,letters:8,pattern:8,arabicWords:10,arabicMissing:10,englishListen:10,englishSpell:10,arithmetic:12,sequence:10,compare:12};const totalRounds=plannedRounds[id]||0;$('timerValue').textContent=totalRounds?`0/${totalRounds}`:'30';updateProgress(0,totalRounds||8,'جاهز؟');showIntro();window.scrollTo({top:0,behavior:'smooth'});
  }
  function goHome() { running=false;stopRuntime();modal.classList.add('hidden');$('helpModal').classList.add('hidden');gameView.classList.add('hidden');homeView.classList.remove('hidden');activeGame=null;renderHome();window.scrollTo({top:0,behavior:'smooth'}); }
  function beginRun() {
    if(!activeGame)return;stopRuntime();playfield.innerHTML='';running=true;score=0;round=0;timeLeft=30;pairsFound=0;firstCard=secondCard=null;lockBoard=false;selectedSortItem=null;sortingDone=0;setScore(0);$('bestScore').textContent=state.best[activeGame]||0;$('timerLabel').textContent='الوقت';$('timerValue').textContent='30';updateProgress(0,30,'انطلق!');playTone('click');
    if(activeGame==='bubbles')startBubbles();else if(activeGame==='memory')startMemory();else if(activeGame==='catcher')startCatcher();else if(activeGame==='quiz')startQuiz();else if(activeGame==='math')startMath();else if(activeGame==='letters')startLetters();else if(activeGame==='pattern')startPattern();else if(activeGame==='sorting')startSorting();else if(['arabicWords','arabicMissing','englishListen','englishSpell','arithmetic','sequence','compare'].includes(activeGame))startExpandedLearningGame();
  }
  function startCountdown(seconds, label='استمر في اللعب!') { timeLeft=seconds;$('timerLabel').textContent='الوقت';$('timerValue').textContent=String(timeLeft);every(()=>{if(!running)return;timeLeft--; $('timerValue').textContent=String(timeLeft);updateProgress(seconds-timeLeft,seconds,label);if(timeLeft<=0)finishGame();},1000); }
  function addPointsAt(clientX,clientY,amount=1) { const rect=playfield.getBoundingClientRect(),el=document.createElement('span');el.className='float-points';el.textContent=`+${amount} ⭐`;el.style.left=`${Math.max(2,Math.min(rect.width-76,clientX-rect.left))}px`;el.style.top=`${Math.max(4,clientY-rect.top)}px`;playfield.appendChild(el);later(()=>el.remove(),850); }
  function spawnBubble() {
    if(!running||activeGame!=='bubbles')return;const el=document.createElement('button');el.type='button';const golden=Math.random()<.13;el.className='bubble'+(golden?' golden':'');el.setAttribute('aria-label',golden?'بالون ذهبي، خمس نقاط':'فقع البالون');const size=golden?64:48+Math.random()*37;const rect=playfield.getBoundingClientRect();el.style.width=size+'px';el.style.height=size+'px';el.style.left=Math.max(2,Math.random()*Math.max(1,rect.width-size-4))+'px';el.style.bottom=(-size)+'px';el.style.setProperty('--dur',(3.8+Math.random()*2.2)+'s');el.style.setProperty('--bubble-color',['#8ad8ff','#ff9dc9','#a9e8bb','#c3adff','#ffcf79','#9be4df'][Math.floor(Math.random()*6)]);el.textContent=golden?'🌟':Math.random()>.57?'🎈':'🫧';
    el.addEventListener('click',()=>{if(!running||el.classList.contains('popping'))return;el.classList.add('popping');const pts=golden?5:1;setScore(score+pts);playTone(golden?'good':'pop');const r=el.getBoundingClientRect();addPointsAt(r.left+r.width/2,r.top+r.height/2,pts);later(()=>el.remove(),230);});
    el.addEventListener('animationend',e=>{if(e.animationName==='rise')el.remove();});playfield.appendChild(el);
  }
  function startBubbles() { startCountdown(30,'فقّع المزيد!');spawnBubble();every(spawnBubble,510); }
  function startMemory() {
    const board=document.createElement('div');board.className='memory-board';board.setAttribute('aria-label','لوحة بطاقات الذاكرة');
    const deck=shuffle([...memoryEmojis,...memoryEmojis].map((emoji,i)=>({emoji,key:emoji+'-'+i+'-'+Math.random()})));
    deck.forEach(item=>{const btn=document.createElement('button');btn.type='button';btn.className='memory-card';btn.setAttribute('aria-label','بطاقة مقلوبة');btn.dataset.emoji=item.emoji;btn.textContent='';btn.addEventListener('click',()=>flipCard(btn));board.appendChild(btn);});playfield.appendChild(board);$('timerLabel').textContent='الأزواج';$('timerValue').textContent='0/8';updateProgress(0,8,'ابحث عن الأزواج');
  }
  function flipCard(card) {
    if(!running||lockBoard||card.classList.contains('flipped')||card.classList.contains('matched'))return;card.classList.add('flipped');card.textContent=card.dataset.emoji;card.setAttribute('aria-label',card.dataset.emoji);playTone('pop');
    if(!firstCard){firstCard=card;return;}secondCard=card;lockBoard=true;
    if(firstCard.dataset.emoji===secondCard.dataset.emoji){firstCard.classList.add('matched');secondCard.classList.add('matched');pairsFound++;setScore(score+10);playTone('good');$('timerValue').textContent=`${pairsFound}/8`;$('timerLabel').textContent='الأزواج';updateProgress(pairsFound,8,`${pairsFound} من 8 أزواج`);firstCard=secondCard=null;lockBoard=false;if(pairsFound===8)later(finishGame,550);}
    else{const a=firstCard,b=secondCard;later(()=>{if(a?.isConnected&&!a.classList.contains('matched')){a.classList.remove('flipped');a.textContent='';a.setAttribute('aria-label','بطاقة مقلوبة');}if(b?.isConnected&&!b.classList.contains('matched')){b.classList.remove('flipped');b.textContent='';b.setAttribute('aria-label','بطاقة مقلوبة');}firstCard=secondCard=null;lockBoard=false;},850);}
  }
  function startCatcher() {
    const lane=document.createElement('div');lane.className='catcher-lane';lane.id='catcherLane';const ground=document.createElement('div');ground.className='catcher-ground';lane.appendChild(ground);const basket=document.createElement('div');basket.className='basket';basket.textContent='🧺';basket.setAttribute('aria-label','السلة');lane.appendChild(basket);playfield.appendChild(lane);catcherX=.5;fallingObjects=[];
    const move=(clientX)=>{const r=lane.getBoundingClientRect();catcherX=Math.max(.05,Math.min(.95,(clientX-r.left)/r.width));basket.style.left=`calc(${catcherX*100}% - 30px)`;};
    const onPointer=e=>{if(running)move(e.clientX);};lane.addEventListener('pointerdown',onPointer);lane.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')onPointer(e);});
    const onKey=e=>{if(!running||activeGame!=='catcher')return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();catcherX=Math.max(.05,Math.min(.95,catcherX+(e.key==='ArrowLeft'?.07:-.07)));basket.style.left=`calc(${catcherX*100}% - 30px)`;}};window.addEventListener('keydown',onKey);cleanups.push(()=>{lane.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey);});
    const spawn=()=>{if(!running)return;const special=Math.random()<.13;const node=document.createElement('div');node.className='falling-star'+(special?' special':'');node.style.animation='none';node.textContent=special?'🌟':'⭐';node.setAttribute('aria-label','نجمة ساقطة');const w=lane.clientWidth;const obj={node,x:Math.random()*Math.max(1,w-42),y:-45,speed:105+Math.random()*95,points:special?3:1};node.style.left=obj.x+'px';node.style.transform='translateY(-45px)';lane.appendChild(node);fallingObjects.push(obj);};
    every(spawn,630);startCountdown(30,'التقط النجوم!');let last=0;const frame=(ts)=>{if(!running||activeGame!=='catcher')return;const dt=Math.min(.04,(ts-last)/1000||0);last=ts;const laneRect=lane.getBoundingClientRect(),basketRect=basket.getBoundingClientRect(),height=lane.clientHeight;fallingObjects=fallingObjects.filter(obj=>{if(!obj.node.isConnected)return false;obj.y+=obj.speed*dt;obj.node.style.transform=`translateY(${obj.y}px) rotate(${obj.y*.55}deg)`;const xMid=obj.x+20;const catchY=obj.y>height-105&&obj.y<height-25;const basketCenter=catcherX*lane.clientWidth;if(catchY&&Math.abs(xMid-basketCenter)<55){setScore(score+obj.points);playTone(obj.points>1?'good':'pop');addPointsAt(laneRect.left+xMid,laneRect.top+obj.y,obj.points);obj.node.remove();return false;}if(obj.y>height+20){obj.node.remove();return false;}return true;});rafId=requestAnimationFrame(frame);};rafId=requestAnimationFrame(frame);
  }
  function createOptionsGrid(options, answer, onPick, type='quiz-choice') {
    const choices=document.createElement('div');choices.className='quiz-choices';shuffle(options).forEach(opt=>{const btn=document.createElement('button');btn.type='button';btn.className=type;btn.textContent=opt;btn.setAttribute('aria-label','اختيار '+opt);btn.addEventListener('click',()=>onPick(opt,btn,choices,answer));choices.appendChild(btn);});return choices;
  }
  function showQuestionFeedback(correct) { const line=document.createElement('div');line.className='quiz-feedback';line.textContent=correct?'أحسنت! إجابة صحيحة 🎉':'محاولة جميلة، نتعلّم في كل مرة 💜';return line; }
  function startQuiz() { round=0;showQuizRound(); }
  function showQuizRound() {
    if(!running)return;if(round>=quizRounds.length){finishGame();return;}playfield.innerHTML='';const q=quizRounds[round];currentQuestionData=q;const layout=document.createElement('div');layout.className='quiz-layout';const tag=document.createElement('div');tag.className='quiz-round';tag.textContent=`السؤال ${round+1} من ${quizRounds.length}`;const question=document.createElement('h2');question.className='quiz-question';question.textContent=q.q;const target=document.createElement('div');target.className='quiz-target';target.textContent=q.target;const feedback=document.createElement('div');feedback.className='quiz-feedback';feedback.textContent='اختر الإجابة المناسبة';const choices=createOptionsGrid(q.options,q.answer,(opt,btn,grid,answer)=>{if(!running||btn.disabled)return;[...grid.children].forEach(c=>c.disabled=true);const ok=opt===answer;btn.classList.add(ok?'correct':'wrong');if(ok){setScore(score+10);playTone('good');feedback.textContent='إجابة رائعة! 🎉';}else{[...grid.children].find(c=>c.textContent===answer)?.classList.add('correct');playTone('bad');feedback.textContent='محاولة جميلة! 💜';}round++;updateProgress(round,quizRounds.length,`${round} من ${quizRounds.length} أسئلة`);later(showQuizRound,760);});layout.append(tag,question,target,choices,feedback);playfield.appendChild(layout);$('timerLabel').textContent='السؤال';$('timerValue').textContent=`${round+1}/${quizRounds.length}`;updateProgress(round,quizRounds.length,`${round} من ${quizRounds.length} أسئلة`);
  }
  function numericChoices(answer) { const values=new Set([answer,Math.max(0,answer-1),answer+1,Math.max(0,answer+(Math.random()<.5?-2:2))]);while(values.size<4)values.add(Math.floor(Math.random()*10));return shuffle([...values].slice(0,4).map(String)); }
  function startMath(){round=0;showMathRound();}
  function showMathRound(){if(!running)return;if(round>=mathRounds.length){finishGame();return;}playfield.innerHTML='';const q=mathRounds[round];const layout=document.createElement('div');layout.className='learning-layout';const tag=document.createElement('div');tag.className='round-pill';tag.textContent=`التحدّي ${round+1} من ${mathRounds.length}`;const question=document.createElement('h2');question.className='learning-question';const pictures=document.createElement('div');pictures.className='counting-pictures';
    if(q.kind==='count'){question.textContent=`كم عدد الـ${q.word}؟`;for(let i=0;i<q.count;i++){const s=document.createElement('span');s.textContent=q.emoji;s.style.setProperty('--i',i);pictures.appendChild(s);}}else{question.textContent='كم يصبح العدد عندما نجمع؟';const left=document.createElement('span');left.textContent=Array(q.a).fill(q.emoji).join(' ');const plus=document.createElement('b');plus.textContent='+';plus.style.cssText='font-size:25px;color:#8a7adf';const right=document.createElement('span');right.textContent=Array(q.b).fill(q.emoji).join(' ');pictures.append(left,plus,right);}
    const feedback=document.createElement('div');feedback.className='quiz-feedback';feedback.textContent='اختر الرقم الصحيح';const answer=q.kind==='count'?q.count:q.a+q.b;const choices=document.createElement('div');choices.className='answer-grid two';numericChoices(answer).forEach(opt=>{const btn=document.createElement('button');btn.type='button';btn.className='answer-option word-option';btn.textContent=opt;btn.addEventListener('click',()=>{if(!running||btn.disabled)return;[...choices.children].forEach(b=>b.disabled=true);const ok=Number(opt)===answer;if(ok){btn.classList.add('correct');setScore(score+10);playTone('good');feedback.textContent='يا سلام! عدّ ممتاز 🌟';}else{btn.classList.add('wrong');[...choices.children].find(b=>Number(b.textContent)===answer)?.classList.add('correct');playTone('bad');feedback.textContent='لنعدّ مرة أخرى في السؤال القادم 💛';}round++;updateProgress(round,mathRounds.length,`${round} من ${mathRounds.length} تحدّيات`);later(showMathRound,800);});choices.appendChild(btn);});layout.append(tag,question,pictures,choices,feedback);playfield.appendChild(layout);$('timerLabel').textContent='السؤال';$('timerValue').textContent=`${round+1}/${mathRounds.length}`;updateProgress(round,mathRounds.length,`${round} من ${mathRounds.length} تحدّيات`);}
  function startLetters(){round=0;showLetterRound();}
  function showLetterRound(){if(!running)return;if(round>=letterRounds.length){finishGame();return;}playfield.innerHTML='';const q=letterRounds[round];const layout=document.createElement('div');layout.className='learning-layout';const tag=document.createElement('div');tag.className='round-pill';tag.textContent=`الحرف ${round+1} من ${letterRounds.length}`;const question=document.createElement('h2');question.className='learning-question';question.textContent='بأي حرف تبدأ هذه الكلمة؟';const picture=document.createElement('div');picture.className='letter-picture';picture.textContent=q.emoji;const word=document.createElement('div');word.className='letter-word';word.textContent=q.word;const feedback=document.createElement('div');feedback.className='quiz-feedback';feedback.textContent='اختر الحرف الأول';const choices=document.createElement('div');choices.className='answer-grid two';shuffle(q.options).forEach(opt=>{const btn=document.createElement('button');btn.type='button';btn.className='answer-option word-option';btn.textContent=opt;btn.addEventListener('click',()=>{if(!running||btn.disabled)return;[...choices.children].forEach(b=>b.disabled=true);const ok=opt===q.answer;if(ok){btn.classList.add('correct');setScore(score+10);playTone('good');feedback.textContent='أحسنت! هذا هو الحرف الصحيح 🎉';}else{btn.classList.add('wrong');[...choices.children].find(b=>b.textContent===q.answer)?.classList.add('correct');playTone('bad');feedback.textContent=`الكلمة هي ${q.word}. سنحاول في التالية!`; }round++;updateProgress(round,letterRounds.length,`${round} من ${letterRounds.length} كلمات`);later(showLetterRound,900);});choices.appendChild(btn);});layout.append(tag,question,picture,word,choices,feedback);playfield.appendChild(layout);$('timerLabel').textContent='الكلمة';$('timerValue').textContent=`${round+1}/${letterRounds.length}`;updateProgress(round,letterRounds.length,`${round} من ${letterRounds.length} كلمات`);}
  function startPattern(){round=0;showPatternRound();}
  function showPatternRound(){if(!running)return;if(round>=patternRounds.length){finishGame();return;}playfield.innerHTML='';const q=patternRounds[round];const layout=document.createElement('div');layout.className='learning-layout';const tag=document.createElement('div');tag.className='round-pill';tag.textContent=`النمط ${round+1} من ${patternRounds.length}`;const question=document.createElement('h2');question.className='learning-question';question.textContent='ما الذي يأتي بعد ذلك؟';const seq=document.createElement('div');seq.className='pattern-sequence';q.seq.forEach(item=>{const span=document.createElement('span');span.className='pattern-item';span.textContent=item;seq.appendChild(span);});const missing=document.createElement('span');missing.className='pattern-item pattern-missing';missing.textContent='؟';seq.appendChild(missing);const feedback=document.createElement('div');feedback.className='quiz-feedback';feedback.textContent='اختر القطعة التي تكمل النمط';const choices=document.createElement('div');choices.className='quiz-choices';shuffle(q.options).forEach(opt=>{const btn=document.createElement('button');btn.type='button';btn.className='quiz-choice';btn.textContent=opt;btn.addEventListener('click',()=>{if(!running||btn.disabled)return;[...choices.children].forEach(b=>b.disabled=true);const ok=opt===q.answer;if(ok){btn.classList.add('correct');setScore(score+10);playTone('good');feedback.textContent='اكتشفت النمط! ممتاز 🧩';}else{btn.classList.add('wrong');[...choices.children].find(b=>b.textContent===q.answer)?.classList.add('correct');playTone('bad');feedback.textContent='راقب التكرار مرة أخرى في النمط التالي.';}round++;updateProgress(round,patternRounds.length,`${round} من ${patternRounds.length} أنماط`);later(showPatternRound,850);});choices.appendChild(btn);});layout.append(tag,question,seq,choices,feedback);playfield.appendChild(layout);$('timerLabel').textContent='النمط';$('timerValue').textContent=`${round+1}/${patternRounds.length}`;updateProgress(round,patternRounds.length,`${round} من ${patternRounds.length} أنماط`);}
  const arabicWordBank = [
    {emoji:'🐱',word:'قطة',options:['قطة','بطة','بقرة','نحلة'],answer:'قطة'},
    {emoji:'🐶',word:'كلب',options:['أسد','كلب','فيل','حوت'],answer:'كلب'},
    {emoji:'🍎',word:'تفاحة',options:['موزة','عنب','تفاحة','برتقالة'],answer:'تفاحة'},
    {emoji:'🌙',word:'قمر',options:['شمس','نجمة','سحابة','قمر'],answer:'قمر'},
    {emoji:'🚗',word:'سيارة',options:['قطار','سيارة','طائرة','دراجة'],answer:'سيارة'},
    {emoji:'🐟',word:'سمكة',options:['سمكة','فراشة','عصفور','سلحفاة'],answer:'سمكة'},
    {emoji:'🏠',word:'بيت',options:['باب','بيت','سرير','كتاب'],answer:'بيت'},
    {emoji:'🌳',word:'شجرة',options:['زهرة','شجرة','ورقة','ثمرة'],answer:'شجرة'},
    {emoji:'🍌',word:'موزة',options:['تفاحة','كرزة','موزة','ليمونة'],answer:'موزة'},
    {emoji:'🐘',word:'فيل',options:['فيل','ثعلب','أرنب','دب'],answer:'فيل'},
    {emoji:'📚',word:'كتاب',options:['قلم','كرسي','كتاب','حقيبة'],answer:'كتاب'},
    {emoji:'🌸',word:'زهرة',options:['زهرة','شمس','وردة','غيمة'],answer:'زهرة'}
  ];
  const arabicMissingBank = [
    {emoji:'📘',prefix:'',suffix:'تاب',answer:'ك',word:'كتاب',options:['ك','ت','ب','م']},
    {emoji:'🌙',prefix:'',suffix:'مر',answer:'ق',word:'قمر',options:['ق','ك','م','س']},
    {emoji:'🐶',prefix:'',suffix:'لب',answer:'ك',word:'كلب',options:['س','ك','ب','ل']},
    {emoji:'🌞',prefix:'',suffix:'مس',answer:'ش',word:'شمس',options:['س','ش','م','ق']},
    {emoji:'🍇',prefix:'',suffix:'نب',answer:'ع',word:'عنب',options:['غ','ع','ن','ب']},
    {emoji:'🚗',prefix:'سيا',suffix:'ة',answer:'ر',word:'سيارة',options:['ر','ت','س','د']},
    {emoji:'🍎',prefix:'تفا',suffix:'ة',answer:'ح',word:'تفاحة',options:['ج','ح','خ','ع']},
    {emoji:'🌳',prefix:'شج',suffix:'ة',answer:'ر',word:'شجرة',options:['ز','ر','د','ب']},
    {emoji:'🐝',prefix:'نح',suffix:'ة',answer:'ل',word:'نحلة',options:['م','ل','ب','ه']},
    {emoji:'🐟',prefix:'سم',suffix:'ة',answer:'ك',word:'سمكة',options:['ف','ك','د','ت']},
    {emoji:'🌹',prefix:'ور',suffix:'ة',answer:'د',word:'وردة',options:['د','ز','ت','ب']},
    {emoji:'🦋',prefix:'فرا',suffix:'ة',answer:'ش',word:'فراشة',options:['س','ش','ج','ك']}
  ];
  const englishListenBank = [
    {emoji:'🍎',word:'apple',options:['apple','orange','banana','cake'],answer:'apple'},
    {emoji:'📘',word:'book',options:['car','book','house','fish'],answer:'book'},
    {emoji:'🐱',word:'cat',options:['dog','bird','cat','rabbit'],answer:'cat'},
    {emoji:'🐶',word:'dog',options:['dog','cat','fish','bird'],answer:'dog'},
    {emoji:'🐟',word:'fish',options:['flower','fish','tree','star'],answer:'fish'},
    {emoji:'🌙',word:'moon',options:['sun','moon','star','book'],answer:'moon'},
    {emoji:'☀️',word:'sun',options:['moon','car','sun','cake'],answer:'sun'},
    {emoji:'🌳',word:'tree',options:['tree','house','flower','bird'],answer:'tree'},
    {emoji:'⭐',word:'star',options:['star','apple','book','rabbit'],answer:'star'},
    {emoji:'🎂',word:'cake',options:['car','cake','cat','orange'],answer:'cake'},
    {emoji:'🏠',word:'house',options:['tree','house','fish','sun'],answer:'house'},
    {emoji:'🐦',word:'bird',options:['bird','dog','moon','flower'],answer:'bird'}
  ];
  const englishSpellBank = [
    {emoji:'🍎',word:'apple',missing:1,options:['p','a','l','e']},
    {emoji:'📘',word:'book',missing:2,options:['a','o','e','u']},
    {emoji:'🐱',word:'cat',missing:1,options:['e','a','o','i']},
    {emoji:'🐶',word:'dog',missing:2,options:['a','o','u','e']},
    {emoji:'🐟',word:'fish',missing:1,options:['a','i','e','o']},
    {emoji:'🌙',word:'moon',missing:2,options:['a','o','e','u']},
    {emoji:'☀️',word:'sun',missing:1,options:['a','u','o','e']},
    {emoji:'🌳',word:'tree',missing:1,options:['a','r','o','u']},
    {emoji:'⭐',word:'star',missing:2,options:['e','a','i','o']},
    {emoji:'🎂',word:'cake',missing:1,options:['a','e','i','o']},
    {emoji:'🚗',word:'car',missing:1,options:['e','a','o','u']},
    {emoji:'🏠',word:'house',missing:1,options:['a','o','u','i']}
  ];
  const sequenceBank = [
    {seq:[1,2,'?',4,5],answer:3,options:[2,3,6]}, {seq:[2,4,'?',8,10],answer:6,options:[5,6,7]},
    {seq:[5,6,7,'?',9],answer:8,options:[7,8,10]}, {seq:[10,9,'?',7,6],answer:8,options:[8,6,5]},
    {seq:[3,6,9,'?',15],answer:12,options:[10,12,13]}, {seq:[1,3,5,'?',9],answer:7,options:[6,7,8]},
    {seq:[20,18,'?',14,12],answer:16,options:[15,16,17]}, {seq:[0,5,10,'?',20],answer:15,options:[12,15,18]},
    {seq:[4,8,'?',16,20],answer:12,options:[10,12,14]}, {seq:[12,11,10,'?',8],answer:9,options:[7,8,9]},
    {seq:[2,5,8,'?',14],answer:11,options:[10,11,12]}, {seq:[30,25,'?',15,10],answer:20,options:[18,20,22]}
  ];
  function buildArithmeticBank() {
    const out=[];
    for(let i=0;i<12;i++){
      let a=Math.floor(Math.random()*11), b=Math.floor(Math.random()*11), op=Math.random()<.58?'+':'−';
      if(op==='−'&&b>a)[a,b]=[b,a];
      if(op==='+'&&a+b>20)b=Math.max(0,20-a);
      const answer=op==='+'?a+b:a-b;
      const candidates=new Set([answer]);
      while(candidates.size<4){const delta=1+Math.floor(Math.random()*5);candidates.add(Math.max(0,Math.min(20,answer+(Math.random()<.5?-delta:delta))));}
      out.push({a,b,op,answer,options:shuffle([...candidates]),emoji:['🍎','⭐','🐠','🍓','🦋','🍐'][i%6]});
    }
    return out;
  }
  function buildCompareBank() {
    return Array.from({length:12},(_,i)=>{
      let a,b; do {a=1+Math.floor(Math.random()*20);b=1+Math.floor(Math.random()*20);} while(a===b);
      const askLarger=i%2===0; const answer=askLarger?Math.max(a,b):Math.min(a,b);
      return {a,b,askLarger,answer,options:shuffle([a,b])};
    });
  }
  let expandedRounds=[];
  function startExpandedLearningGame() {
    round=0;
    if(activeGame==='arabicWords') expandedRounds=shuffle(arabicWordBank).slice(0,10);
    else if(activeGame==='arabicMissing') expandedRounds=shuffle(arabicMissingBank).slice(0,10);
    else if(activeGame==='englishListen') expandedRounds=shuffle(englishListenBank).slice(0,10);
    else if(activeGame==='englishSpell') expandedRounds=shuffle(englishSpellBank).slice(0,10);
    else if(activeGame==='arithmetic') expandedRounds=buildArithmeticBank();
    else if(activeGame==='sequence') expandedRounds=shuffle(sequenceBank).slice(0,10);
    else if(activeGame==='compare') expandedRounds=buildCompareBank();
    showExpandedRound();
  }
  function showExpandedRound() {
    if(!running)return;
    if(round>=expandedRounds.length){finishGame();return;}
    const q=expandedRounds[round], total=expandedRounds.length;
    playfield.innerHTML='';
    const layout=document.createElement('div');layout.className='learning-layout expanded-layout';
    const tag=document.createElement('div');tag.className='round-pill';tag.textContent=`التحدّي ${round+1} من ${total}`;
    const question=document.createElement('h2');question.className='learning-question';
    const visual=document.createElement('div');visual.className='expanded-visual';
    let options=q.options.map(v=>typeof v==='object'?v:{label:String(v)});
    let answer=String(q.answer);
    if(activeGame==='arabicWords'){
      question.textContent='اقرأ الكلمة التي تعبّر عن الصورة';
      const pic=document.createElement('div');pic.className='expanded-picture';pic.textContent=q.emoji;pic.setAttribute('aria-label','صورة');visual.appendChild(pic);
      const tip=document.createElement('div');tip.className='mini-instruction';tip.textContent='أي كلمة هي الصحيحة؟';visual.appendChild(tip);
      options=q.options.map(v=>({label:v,display:v}));
    } else if(activeGame==='arabicMissing'){
      question.textContent='اختر الحرف المفقود لإكمال الكلمة';
      const emoji=document.createElement('div');emoji.className='expanded-picture';emoji.textContent=q.emoji;
      const word=document.createElement('div');word.className='missing-word arabic-word';word.dir='rtl';word.textContent=q.prefix+'  ـــ  '+q.suffix;
      visual.append(emoji,word);options=q.options.map(v=>({label:v,display:v}));
    } else if(activeGame==='englishListen'){
      question.textContent='Listen carefully! استمع جيدًا';
      const speaker=document.createElement('button');speaker.type='button';speaker.className='listen-button';speaker.innerHTML='🔊 <span>Listen again</span>';
      speaker.addEventListener('click',()=>{playVoice(q.word);playTone('click');});
      const note=document.createElement('div');note.className='mini-instruction';note.textContent='ما الصورة التي تطابق الكلمة؟';
      visual.append(speaker,note);options=q.options.map(v=>({label:v,display:({'apple':'🍎','book':'📘','cat':'🐱','dog':'🐶','fish':'🐟','moon':'🌙','sun':'☀️','tree':'🌳','star':'⭐','cake':'🎂','house':'🏠','bird':'🐦','car':'🚗','flower':'🌼','orange':'🍊','rabbit':'🐰','banana':'🍌'}[v]||'✨'),sub:v}));
    } else if(activeGame==='englishSpell'){
      question.textContent='Which letter is missing? ما الحرف الناقص؟';
      const pic=document.createElement('div');pic.className='expanded-picture';pic.textContent=q.emoji;
      const word=document.createElement('div');word.className='missing-word english-word';word.dir='ltr';word.textContent=q.word.slice(0,q.missing)+' _ '+q.word.slice(q.missing+1);visual.append(pic,word);
      options=q.options.map(v=>({label:v,display:v.toUpperCase()})); answer=q.word[q.missing];
    } else if(activeGame==='arithmetic'){
      question.textContent='احسب الناتج الصحيح';
      const eq=document.createElement('div');eq.className='math-equation';eq.dir='ltr';eq.innerHTML=`<span>${q.a}</span><i>${q.op}</i><span>${q.b}</span><i>=</i><b>?</b>`;
      const helps=document.createElement('div');helps.className='math-help-pictures';for(let i=0;i<Math.min(q.a,8);i++){const e=document.createElement('span');e.textContent=q.emoji;if(q.op==='−'&&i<q.b)e.classList.add('taken-away');helps.appendChild(e);} if(q.op==='+'){const plus=document.createElement('span');plus.className='math-separator';plus.textContent='+';helps.appendChild(plus);for(let i=0;i<Math.min(q.b,8);i++){const e=document.createElement('span');e.textContent=q.emoji;helps.appendChild(e);}}
      visual.append(eq,helps);options=q.options.map(v=>({label:String(v),display:String(v)}));
    } else if(activeGame==='sequence'){
      question.textContent='ما العدد الناقص في القطار؟';
      const row=document.createElement('div');row.className='sequence-row';q.seq.forEach(v=>{const n=document.createElement('span');n.className=v==='?'?'sequence-missing':'sequence-number';n.textContent=String(v);row.appendChild(n);});visual.appendChild(row);options=q.options.map(v=>({label:String(v),display:String(v)}));
    } else if(activeGame==='compare'){
      question.textContent=q.askLarger?'اختر العدد الأكبر':'اختر العدد الأصغر';
      const row=document.createElement('div');row.className='compare-row';[q.a,q.b].forEach((v,i)=>{const n=document.createElement('span');n.className='compare-number '+(i===0?'compare-a':'compare-b');n.textContent=String(v);row.appendChild(n);});visual.appendChild(row);options=q.options.map(v=>({label:String(v),display:String(v)}));
    }
    const choices=document.createElement('div');choices.className='quiz-choices expanded-choices'+((activeGame==='arabicWords'||activeGame==='arabicMissing'||activeGame==='englishSpell')?' text-choices':'');
    if(activeGame==='englishListen') choices.classList.add('picture-choices');
    const feedback=document.createElement('div');feedback.className='quiz-feedback';feedback.textContent='خذ وقتك وفكّر بهدوء 🌟';
    shuffle(options).forEach(opt=>{
      const btn=document.createElement('button');btn.type='button';btn.className='quiz-choice expanded-choice';
      if(activeGame==='englishListen') {btn.innerHTML=`<span class="choice-emoji">${opt.display}</span>`;}
      else btn.textContent=opt.display;
      btn.setAttribute('aria-label',opt.sub?`صورة ${opt.sub}`:String(opt.display));
      btn.addEventListener('click',()=>{
        if(!running||btn.disabled)return;
        [...choices.children].forEach(b=>b.disabled=true);
        const okay=String(opt.label)===answer;
        if(okay){btn.classList.add('correct');setScore(score+10);playTone('good');feedback.textContent=activeGame==='englishListen'?`Excellent! ${q.word} 👏`:'أحسنت! إجابة صحيحة 🎉';}
        else {btn.classList.add('wrong');const correctButton=[...choices.children].find(b=>b.getAttribute('aria-label')===(activeGame==='englishListen'?`صورة ${q.answer}`:String(activeGame==='englishSpell'?q.word[q.missing]:q.answer)) || b.textContent===String(answer) || b.textContent===String(answer).toUpperCase());if(correctButton)correctButton.classList.add('correct');playTone('bad');
          if(activeGame==='englishListen')feedback.textContent=`الكلمة كانت ${q.word}. استمع إليها مرة أخرى في المرة القادمة.`;
          else if(activeGame==='englishSpell')feedback.textContent=`الكلمة الصحيحة هي ${q.word}. حاول نطقها حرفًا حرفًا.`;
          else if(activeGame==='arabicMissing')feedback.textContent=`الكلمة الصحيحة: ${q.word}. لا بأس، نتعلّم بالمحاولة!`;
          else feedback.textContent='إجابة غير صحيحة هذه المرة. شاهد الإجابة الصحيحة وجرّب مجددًا 💛';
        }
        if(activeGame==='englishListen'&&okay)playVoice(q.word);
        round++;updateProgress(round,total,`${round} من ${total} تحدّيات`);$('timerValue').textContent=`${round}/${total}`;
        later(showExpandedRound,1050);
      });choices.appendChild(btn);
    });
    layout.append(tag,question,visual,choices,feedback);playfield.appendChild(layout);
    $('timerLabel').textContent='التحدّي';$('timerValue').textContent=`${round+1}/${total}`;updateProgress(round,total,`${round} من ${total} تحدّيات`);
  }

  const sortObjects=[{emoji:'🍓',color:'red'},{emoji:'🍎',color:'red'},{emoji:'🍒',color:'red'},{emoji:'🍌',color:'yellow'},{emoji:'🌟',color:'yellow'},{emoji:'🐥',color:'yellow'},{emoji:'🐳',color:'blue'},{emoji:'🦋',color:'blue'},{emoji:'🫐',color:'blue'}];
  const bins=[{id:'red',label:'أحمر',emoji:'🧺',color:'#f28da1',bg:'#fff0f3'},{id:'yellow',label:'أصفر',emoji:'🧺',color:'#e9bd48',bg:'#fff9df'},{id:'blue',label:'أزرق',emoji:'🧺',color:'#72bdf2',bg:'#edf8ff'}];
  function startSorting(){const layout=document.createElement('div');layout.className='learning-layout';const tag=document.createElement('div');tag.className='round-pill';tag.id='sortRound';tag.textContent='الأغراض 0 من 9';const question=document.createElement('h2');question.className='learning-question';question.textContent='اختر غرضًا، ثم اختر سلّته حسب اللون';const items=document.createElement('div');items.className='sorting-items';items.id='sortingItems';const binsEl=document.createElement('div');binsEl.className='sort-bins';bins.forEach(bin=>{const btn=document.createElement('button');btn.type='button';btn.className='sort-bin';btn.dataset.bin=bin.id;btn.style.setProperty('--bin-color',bin.color);btn.style.setProperty('--bin-bg',bin.bg);btn.innerHTML=`${bin.emoji}<span>${bin.label}</span>`;btn.addEventListener('click',()=>placeSelected(bin,btn));binsEl.appendChild(btn);});const feedback=document.createElement('div');feedback.className='quiz-feedback';feedback.id='sortFeedback';feedback.textContent='لنرتّب 9 أشياء معًا!';layout.append(tag,question,items,binsEl,feedback);playfield.appendChild(layout);shuffle(sortObjects).forEach((obj,i)=>{const btn=document.createElement('button');btn.type='button';btn.className='sort-item';btn.textContent=obj.emoji;btn.dataset.color=obj.color;btn.dataset.index=String(i);btn.setAttribute('aria-label','غرض للفرز');btn.addEventListener('click',()=>{if(!running||btn.classList.contains('sorted'))return;document.querySelectorAll('.sort-item.selected').forEach(el=>el.classList.remove('selected'));selectedSortItem=btn;btn.classList.add('selected');$('sortFeedback').textContent='رائع! الآن اختر السلة المناسبة.';playTone('click');});items.appendChild(btn);});$('timerLabel').textContent='الأغراض';$('timerValue').textContent='0/9';updateProgress(0,9,'رتّب الأشياء');}
  function placeSelected(bin,binButton){if(!running||!selectedSortItem){showToast('اختر غرضًا أولًا 👆');return;}const feedback=$('sortFeedback');if(selectedSortItem.dataset.color!==bin.id){feedback.textContent='ليست هذه السلة، جرّب لونًا آخر 💛';playTone('bad');binButton.classList.add('target');later(()=>binButton.classList.remove('target'),350);return;}selectedSortItem.classList.remove('selected');selectedSortItem.classList.add('sorted');selectedSortItem.disabled=true;selectedSortItem=null;sortingDone++;setScore(score+10);playTone('good');binButton.classList.add('good');later(()=>binButton.classList.remove('good'),350);$('sortRound').textContent=`الأغراض ${sortingDone} من 9`; $('timerValue').textContent=`${sortingDone}/9`;feedback.textContent='أحسنت! وضعت الغرض في المكان الصحيح 🌟';updateProgress(sortingDone,9,`${sortingDone} من 9 أغراض`);if(sortingDone===9)later(finishGame,500);}
  function burstConfetti(){const layer=$('celebrationLayer');const colors=['#ff7cb8','#ffd66b','#7fe0cb','#8b77f5','#77d4ff','#ff9c72'];layer.innerHTML='';for(let i=0;i<65;i++){const el=document.createElement('i');el.className='confetti-piece';el.style.left=Math.random()*100+'vw';el.style.background=colors[i%colors.length];el.style.setProperty('--fall-time',(1.6+Math.random()*2)+'s');el.style.setProperty('--drift',(Math.random()*200-100)+'px');el.style.setProperty('--delay',(Math.random()*.4)+'s');el.style.transform=`rotate(${Math.random()*180}deg)`;layer.appendChild(el);}later(()=>layer.innerHTML='',4200);}
  function finishGame(){if(!running)return;running=false;stopRuntime();const game=activeGame;if(!game)return;const starsEarned=Math.max(1,Math.floor(score/10));const before=new Set(getUnlockedBadges().map(b=>b.id));state.stars+=starsEarned;state.gamesPlayed++;if(!state.played.includes(game))state.played.push(game);state.best[game]=Math.max(state.best[game]||0,score);const newly=getUnlockedBadges().filter(b=>!before.has(b.id));saveState();renderHome();$('earnedStars').textContent=`+${starsEarned} ⭐`;$('resultEmoji').textContent=score>=60?'🏆':score>=30?'🌟':'💛';$('resultTitle').textContent=score>=60?'يا له من إنجاز رائع!':score>=30?'أحسنت يا بطل!':'شكرًا لأنك لعبت!';$('resultMessage').textContent=score>=60?`نتيجتك ${score} نقطة! أنت تتقدّم بشكل رائع. استمر في الاستكشاف!`:score>=30?`جمعت ${score} نقطة. كل مرة تلعب فيها تتعلّم شيئًا جديدًا!`:`نتيجتك ${score} نقطة. المحاولة هي بداية التعلّم، فلنجرّب من جديد!`;$('newBadge').classList.toggle('hidden',newly.length===0);$('newBadge').textContent=newly.length?`🏵️ وسام جديد: ${newly[0].title}!`:'🏵️';modal.classList.remove('hidden');playTone('win');burstConfetti();$('playAgain').focus();}

  $('gamesGrid').addEventListener('click',e=>{const btn=e.target.closest('[data-game]');if(btn)openGame(btn.dataset.game);});
  $('exploreButton').addEventListener('click',()=>{$('games').scrollIntoView({behavior:'smooth',block:'start'});playTone('click');});
  $('brandHome').addEventListener('click',e=>{e.preventDefault();if(!gameView.classList.contains('hidden'))goHome();else $('games').scrollIntoView({behavior:'smooth',block:'start'});});
  $('backHome').addEventListener('click',goHome);$('restartGame').addEventListener('click',()=>{if(activeGame){modal.classList.add('hidden');beginRun();}});$('playAgain').addEventListener('click',()=>{modal.classList.add('hidden');beginRun();});$('resultHome').addEventListener('click',goHome);
  $('soundToggle').addEventListener('click',()=>{state.sound=!state.sound;saveState();updateHeader();if(state.sound)playTone('good');else showToast('تم إيقاف المؤثرات الصوتية.');});
  $('musicToggle').addEventListener('click',toggleMusic);
  document.querySelectorAll('[data-filter]').forEach(filter=>filter.addEventListener('click',()=>{const chosen=filter.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{const on=b===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});document.querySelectorAll('.game-card[data-game]').forEach(card=>{card.classList.toggle('filtered-out',chosen!=='all'&&card.dataset.category!==chosen);});playTone('click');}));
  function openHelp(){$('helpModal').classList.remove('hidden');$('helpOkay').focus();}function closeHelp(){$('helpModal').classList.add('hidden');}
  $('helpButton').addEventListener('click',openHelp);$('closeHelp').addEventListener('click',closeHelp);$('helpOkay').addEventListener('click',closeHelp);$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))closeHelp();});modal.addEventListener('click',e=>{if(e.target===modal){/* Keep the result open until a clear next step is chosen. */}});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('helpModal').classList.contains('hidden'))closeHelp();});
  updateHeader();renderHome();
  if(state.music){document.addEventListener('pointerdown',function resumeSavedMusic(){document.removeEventListener('pointerdown',resumeSavedMusic);if(state.music){if(!musicAudio){musicAudio=new Audio('assets/audio/effects/playful-loop.mp3');musicAudio.loop=true;musicAudio.volume=.13;}musicAudio.play().catch(()=>{});}}, {once:true});}
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) { window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{})); }
})();
