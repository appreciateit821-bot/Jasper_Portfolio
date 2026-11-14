(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.getElementById('motion-toggle');
  let motionPaused = reducedMotion.matches;
  let refreshMotion = () => {};

  function setMotion(paused) {
    motionPaused = paused;
    root.classList.toggle('motion-paused', paused);
    root.classList.toggle('motion-enabled', !paused);
    if (motionButton) {
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? '애니메이션 재개' : '애니메이션 일시정지');
    motionButton.innerHTML = `<span aria-hidden="true">${paused ? '▷' : 'Ⅱ'}</span>`;
    }
    if (paused) document.getAnimations().forEach(animation => animation.cancel());
    if (paused) document.querySelectorAll('[data-magnet]').forEach(element => element.style.removeProperty('transform'));
    if (paused) document.getElementById('expression-visual')?.style.removeProperty('--preview-x');
    if (paused) document.getElementById('expression-visual')?.style.removeProperty('--preview-y');
    refreshMotion();
    document.dispatchEvent(new CustomEvent('jasper:motionchange', {detail: {paused}}));
  }

  setMotion(motionPaused);
  motionButton?.addEventListener('click', () => setMotion(!motionPaused));
  reducedMotion.addEventListener('change', event => setMotion(event.matches));

  // Cinema cover: still → painting → profile, with a fresh selection per visit.
  const heroSlides = [...document.querySelectorAll('.editorial-slide')];
  const heroChoices = [...document.querySelectorAll('[data-hero-slide]')];
  const heroFrame = document.getElementById('opening-frame');
  let heroPhotos = {};
  try { heroPhotos = JSON.parse(document.getElementById('acting-photos-data')?.textContent || '{}'); } catch (_) { /* Keep the reviewed fallback images. */ }
  const heroPools = {...heroPhotos, painting: (window.JASPER_ARTWORKS || []).filter(work => work.kind === 'painting')};
  heroSlides.forEach(slide => {
    const kind = slide.dataset.heroKind;
    const pool = heroPools[kind] || [];
    if (!pool.length) return;
    let previous;
    try { previous = sessionStorage.getItem('jasper:cover:' + kind); } catch (_) { /* File previews may not allow storage. */ }
    const candidates = pool.length > 1 ? pool.filter(work => work.id !== previous) : pool;
    const work = candidates[Math.floor(Math.random() * candidates.length)];
    const url = work.presentationImage || work.preview || work.image;
    if (!url) return;
    const preview = new Image();
    preview.onload = async () => {
      try { await preview.decode?.(); } catch (_) { /* A loaded image can still be displayed. */ }
      slide.src = url;
      slide.alt = work.alt || '';
      slide.width = work.width;
      slide.height = work.height;
      slide.dataset.heroImage = work.id;
      try { sessionStorage.setItem('jasper:cover:' + kind, work.id); } catch (_) { /* Random selection still works without storage. */ }
    };
    // Keep the valid fallback if the selected image fails to load.
    preview.src = url;
  });
  let heroTimer;
  let heroIndex = 0;
  let heroVisible = true;
  let heroFocused = false;
  const stopHero = () => clearTimeout(heroTimer);
  function selectHero(index) {
    if (!Number.isInteger(index) || index < 0 || index >= heroSlides.length) return;
    heroIndex = index;
    heroSlides.forEach((slide, i) => { slide.classList.toggle('is-active', i === index); slide.setAttribute('aria-hidden', String(i !== index)); });
    heroChoices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  function scheduleHero() {
    stopHero();
    if (motionPaused || document.hidden || !heroVisible || heroFocused || heroSlides.length < 2) return;
    heroTimer = setTimeout(() => {
      selectHero((heroIndex + 1) % heroSlides.length);
      scheduleHero();
    }, 5000);
  }
  heroChoices.forEach(button => button.addEventListener('click', () => { selectHero(Number(button.dataset.heroSlide)); scheduleHero(); }));
  heroFrame?.addEventListener('focusin', () => { heroFocused = true; stopHero(); });
  heroFrame?.addEventListener('focusout', event => { if (!heroFrame.contains(event.relatedTarget)) { heroFocused = false; scheduleHero(); } });
  if (heroSlides.length) { selectHero(0); scheduleHero(); }
  if (heroFrame && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; scheduleHero(); }, {threshold: 0}).observe(heroFrame);
  }
  document.addEventListener('jasper:motionchange', scheduleHero);
  document.addEventListener('visibilitychange', scheduleHero);
  window.addEventListener('pagehide', stopHero);
  window.addEventListener('pageshow', scheduleHero);

  const artDialog = document.getElementById('art-dialog');
  const artVisual = document.getElementById('art-visual');
  const artZoom = document.getElementById('art-zoom');
  const artFollow = document.getElementById('art-follow');
  const archiveDialog = document.getElementById('archive-dialog');
  const archiveItems = document.getElementById('archive-items');
  const archiveStatus = document.getElementById('archive-status');
  const previousWork = document.getElementById('art-previous');
  const nextWork = document.getElementById('art-next');
  let workSequence = ['painting', 'acting', 'writing'];
  let activeWork = 0;
  const catalog = window.JASPER_ARTWORKS || [];
  const paintings = catalog.filter(work => work.kind === 'painting');
  const counts = Object.fromEntries(['painting', 'acting', 'writing'].map(kind => [kind, catalog.filter(work => work.kind === kind).length]));
  const works = {
    acting: { kind: 'acting', type: 'ACTING & FILM', title: '연기와 장면', description: '연기 영상의 원본을 이곳에 정리하고 있습니다. 유튜브 채널에서도 기록을 확인할 수 있습니다.', link: 'https://www.youtube.com/@life_by_play', linkLabel: 'YouTube에서 연기 기록 보기' },
    writing: { kind: 'writing', type: 'WORDS & NOTES', title: '창작글과 기록', description: '인스타그램에 남긴 창작글과 기록을 이곳에 정리하고 있습니다. 원문은 개인 계정에서 확인할 수 있습니다.', link: 'https://www.instagram.com/KDH_SMILE/', linkLabel: 'Instagram에서 원문 보기' },
    ...Object.fromEntries(catalog.map(work => [work.id, work]))
  };
  const mediumKeys = Object.fromEntries(['painting', 'acting', 'writing'].map(kind => [kind, catalog.find(work => work.kind === kind)?.id || kind]));
  const countLabel = kind => `${counts[kind]}${kind === 'acting' ? '편' : kind === 'writing' ? '편' : '점'}`;

  // Selecting a medium changes the preview immediately; animation never delays navigation.
  const expressionLayout = document.getElementById('expression-layout');
  const expressionVisual = document.getElementById('expression-visual');
  const expressionNames = { painting: '그림', acting: '연기', writing: '창작글과 기록' };
  let expressionAnimation;
  if (expressionLayout && expressionVisual) {
    const choices = [...expressionLayout.querySelectorAll('button[data-expression]')];
    const panels = [...expressionVisual.querySelectorAll('[data-expression-panel]')];
    panels.forEach(panel => {
      const work = works[mediumKeys[panel.dataset.expressionPanel]];
      const imagePath = work?.image || work?.poster;
      if (imagePath) {
        const image = new Image();
        image.src = imagePath;
        image.alt = work.alt || work.title;
        image.loading = 'lazy';
        panel.replaceChildren(image);
      } else if (work?.mediaType === 'text') {
        const excerpt = document.createElement('span');
        excerpt.className = 'archive-text-preview';
        excerpt.textContent = work.text.length > 260 ? work.text.slice(0, 260) + '…' : work.text;
        panel.replaceChildren(excerpt);
      }
    });
    expressionVisual.dataset.art = mediumKeys[expressionLayout.dataset.expression];
    choices.forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.expression;
      const work = works[mediumKeys[key]];
      if (!work || expressionLayout.dataset.expression === key) return;
      const direction = choices.indexOf(button) > choices.findIndex(choice => choice.getAttribute('aria-pressed') === 'true') ? 1 : -1;
      expressionAnimation?.cancel();
      expressionLayout.dataset.expression = key;
      expressionLayout.style.setProperty('--active-medium', String(choices.indexOf(button)));
      choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
      panels.forEach(panel => { panel.hidden = panel.dataset.expressionPanel !== key; });
      expressionVisual.dataset.art = mediumKeys[key];
      expressionVisual.setAttribute('aria-label', `${expressionNames[key]} 자세히 보기`);
      document.getElementById('expression-stage').setAttribute('aria-label', `${expressionNames[key]} 미리보기`);
      document.getElementById('expression-edition').textContent = work.type;
      document.getElementById('expression-title').textContent = expressionNames[key];
      document.getElementById('expression-note').textContent = counts[key]
        ? `${expressionNames[key]} ${countLabel(key)}`
        : key === 'acting' ? 'YouTube에서 연기 기록 보기' : '원문 수집·정리 중';
      expressionVisual.style.removeProperty('--preview-x');
      expressionVisual.style.removeProperty('--preview-y');
      if (!motionPaused) {
        const selected = panels.find(panel => !panel.hidden);
        const frames = key === 'acting'
          ? [{opacity: .3, clipPath: 'inset(40% 0)'}, {opacity: 1, clipPath: 'inset(0)'}]
          : key === 'writing' ? [{opacity: .2, transform: 'translateY(24px)'}, {opacity: 1, transform: 'none'}]
          : [{opacity: .3, clipPath: 'inset(0 12% 0 0)', transform: 'scale(1.025)'}, {opacity: 1, clipPath: 'inset(0)', transform: 'none'}];
        expressionAnimation = selected.animate(frames, {duration: 650, easing: 'cubic-bezier(.16,1,.3,1)'});
      }
    }));
    // Optional arrow-key navigation complements the normal Tab / Enter controls.
    choices.forEach((button, index) => button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % choices.length
        : event.key === 'ArrowLeft' ? (index - 1 + choices.length) % choices.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      choices[next].focus({ preventScroll: true });
      choices[next].click();
    }));
  }

  // Native horizontal tracks: touch/trackpad, mouse drag, buttons and keyboard.
  document.querySelectorAll('[data-rail]').forEach(shell => {
    const track = shell.querySelector('.rail-track');
    let slides = [...track.children];
    const previous = shell.querySelector('[data-rail-step="-1"]');
    const next = shell.querySelector('[data-rail-step="1"]');
    const progress = shell.querySelector('progress');
    let frame = 0, drag = null, blockClick = false, blockTimer;
    function update() {
      frame = 0;
      if (!track.clientWidth) return; // Hidden category; ResizeObserver refreshes on reveal.
      const max = Math.max(0,track.scrollWidth-track.clientWidth);
      const left = Math.max(0,Math.min(max,track.scrollLeft));
      previous.disabled = left < 2; next.disabled = left >= max-2;
      progress.value = max ? left/max*100 : 100;
      const bounds = track.getBoundingClientRect();
      slides.forEach(slide => {
        const rect = slide.getBoundingClientRect();
        const distance = Math.max(-1,Math.min(1,(rect.left+rect.width/2-bounds.left-bounds.width/2)/bounds.width));
        const visible = rect.right > bounds.left && rect.left < bounds.right;
        slide.style.setProperty('--rail-distance',motionPaused?0:distance.toFixed(3));
        slide.classList.toggle('rail-in-view',visible);
      });
    }
    function schedule() {if(!frame)frame=requestAnimationFrame(update);}
    function scrollToSlide(index) {
      const slide=slides[Math.max(0,Math.min(slides.length-1,index))];
      const left=track.scrollLeft+slide.getBoundingClientRect().left-track.getBoundingClientRect().left;
      track.scrollTo({left,behavior:motionPaused?'instant':'smooth'});
    }
    function step(direction) {
      const left=track.getBoundingClientRect().left;
      let index=0,nearest=Infinity;
      slides.forEach((slide,i)=>{const d=Math.abs(slide.getBoundingClientRect().left-left);if(d<nearest){nearest=d;index=i;}});
      scrollToSlide(index+direction);
    }
    previous.addEventListener('click',()=>step(-1));
    next.addEventListener('click',()=>step(1));
    track.addEventListener('keydown',event=>{
      if(event.target!==track || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='Home')scrollToSlide(0);
      else if(event.key==='End')track.scrollTo({left:track.scrollWidth,behavior:motionPaused?'instant':'smooth'});
      else step(event.key==='ArrowRight'?1:-1);
    });
    track.addEventListener('scroll',schedule,{passive:true});
    track.addEventListener('focusin',event=>{
      const slide=event.target.closest('.rail-slide');if(!slide)return;
      const box=slide.getBoundingClientRect(),view=track.getBoundingClientRect();
      if(box.left<view.left || box.right>view.right)scrollToSlide(slides.indexOf(slide));
    });
    // Touch stays entirely native, including vertical page scrolling.
    track.addEventListener('pointerdown',event=>{
      if(event.pointerType!=='mouse' || event.button!==0)return;
      blockClick=false;clearTimeout(blockTimer);
      drag={id:event.pointerId,x:event.clientX,left:track.scrollLeft,moved:false};
    });
    track.addEventListener('pointermove',event=>{
      if(!drag || event.pointerId!==drag.id)return;
      const delta=event.clientX-drag.x;
      if(!drag.moved && Math.abs(delta)<8)return;
      if(!drag.moved){drag.moved=true;track.setPointerCapture(event.pointerId);track.classList.add('is-dragging');}
      event.preventDefault();track.scrollLeft=drag.left-delta;
    });
    function release() {
      if(!drag)return;
      const {id,moved}=drag;drag=null;
      if(track.hasPointerCapture(id))track.releasePointerCapture(id);
      track.classList.remove('is-dragging');
      if(moved){blockClick=true;blockTimer=setTimeout(()=>{blockClick=false;},250);}
      schedule();
    }
    track.addEventListener('pointerup',release);
    track.addEventListener('pointercancel',release);
    track.addEventListener('lostpointercapture',release);
    track.addEventListener('pointerleave',()=>{if(drag && !drag.moved)drag=null;});
    track.addEventListener('dragstart',event=>event.preventDefault());
    track.addEventListener('click',event=>{if(blockClick && event.detail!==0){event.preventDefault();event.stopImmediatePropagation();}},true);
    new ResizeObserver(schedule).observe(track);
    document.addEventListener('jasper:motionchange',()=>{track.scrollTo({left:track.scrollLeft,behavior:'instant'});schedule();});
    const shuffleButton=shell.querySelector('[data-rail-shuffle]');
    if(shuffleButton) {
      function shuffle(announce=false) {
        const keep=Number(shuffleButton.dataset.railShuffle) || 0;
        const fixed=slides.slice(0,keep),tail=slides.slice(keep),before=[...tail];
        for(let i=tail.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tail[i],tail[j]]=[tail[j],tail[i]];}
        if(tail.length>1 && tail.every((node,i)=>node===before[i]))tail.push(tail.shift());
        slides=[...fixed,...tail];track.append(...slides);
        track.scrollTo({left:0,behavior:'instant'});update();
        if(announce)shell.querySelector('.rail-status').textContent='새로운 순서로 보여드립니다.';
      }
      shuffleButton.addEventListener('click',()=>shuffle(true));
      shuffle();
    }
    update();
  });

  function resetArtZoom() {
    artVisual.classList.remove('is-zoomed');
    artVisual.scrollTop = 0;
    artVisual.scrollLeft = 0;
    if (artZoom) {
      artZoom.setAttribute('aria-pressed', 'false');
      artZoom.textContent = '확대해서 보기 ＋';
      artVisual.tabIndex = -1;
    }
  }
  artZoom?.addEventListener('click', () => {
    const zoomed = artVisual.classList.toggle('is-zoomed');
    artZoom.setAttribute('aria-pressed', String(zoomed));
    artZoom.textContent = zoomed ? '전체 보기 −' : '확대해서 보기 ＋';
    artVisual.tabIndex = zoomed ? 0 : -1;
    if (zoomed) artVisual.focus({ preventScroll: true });
    if (!zoomed) resetArtZoom();
  });
  function stopArtMedia() {
    artVisual.querySelectorAll('video,audio').forEach(media => {
      media.pause();
      media.removeAttribute('src');
      media.load();
    });
    artVisual.querySelectorAll('iframe').forEach(frame => frame.remove());
  }
  function pauseArtMedia() {
    artVisual.querySelectorAll('video,audio').forEach(media => media.pause());
    artVisual.querySelectorAll('iframe').forEach(frame => {
      frame.src = frame.src.replace('autoplay=1', 'autoplay=0');
    });
  }
  artDialog.addEventListener('close', () => { stopArtMedia(); resetArtZoom(); });
  window.addEventListener('pagehide', stopArtMedia);

  function renderImage(work) {
    const image = new Image();
    image.src = work.presentationImage || work.image;
    image.alt = work.alt || work.title;
    if(work.width) image.width=work.width;
    if(work.height) image.height=work.height;
    artVisual.classList.remove('has-gallery');
    artVisual.append(image);
  }

  function renderMedia(work) {
    artVisual.classList.remove('has-gallery');
    artVisual.dataset.mediaType = work.mediaType || 'placeholder';
    if (work.mediaType === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = work.video;
      if (work.poster) video.poster = work.poster;
      video.setAttribute('aria-label', work.title);
      video.textContent = '브라우저에서 이 영상을 재생할 수 없습니다.';
      artVisual.append(video);
      const directLink = document.createElement('a');
      directLink.className = 'art-media-direct';
      directLink.href = work.video;
      directLink.target = '_blank';
      directLink.rel = 'noopener noreferrer';
      directLink.textContent = '영상 파일 열기';
      artVisual.append(directLink);
    } else if (work.mediaType === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(work.youtubeId)) {
      const player = document.createElement('button');
      player.className = 'art-youtube-load';
      player.type = 'button';
      if (work.poster) {
        const poster = new Image();
        poster.src = work.poster;
        poster.alt = '';
        player.append(poster);
      }
      const label = document.createElement('span');
      label.textContent = `${work.title} 재생`;
      player.append(label);
      player.addEventListener('click', () => {
        const frame = document.createElement('iframe');
        frame.src = `https://www.youtube-nocookie.com/embed/${work.youtubeId}?autoplay=1`;
        frame.title = work.title;
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        player.replaceWith(frame);
        frame.focus();
      }, {once: true});
      artVisual.append(player);
    } else if (work.mediaType === 'text') {
      const original = document.createElement('article');
      original.className = 'art-original-text';
      original.setAttribute('aria-label', `${work.title} 원문`);
      const characters = Array.from(work.text);
      const boundaries = [0, ...(work.readingBreaks || []), characters.length];
      for (let i = 1; i < boundaries.length; i++) {
        const paragraph = document.createElement('p');
        paragraph.textContent = characters.slice(boundaries[i - 1], boundaries[i]).join('');
        original.append(paragraph);
      }
      // The reader can enlarge type without losing the original words or line breaks.
      const tools = document.createElement('div');
      tools.className = 'reading-tools';
      const duration = document.createElement('span');
      duration.textContent = `약 ${Math.max(1, Math.ceil(characters.length / 500))}분 읽기`;
      const size = document.createElement('button');
      size.type = 'button'; size.textContent = '글자 크게';
      size.setAttribute('aria-pressed', String(artDialog.classList.contains('reading-large')));
      size.addEventListener('click', () => {
        const large = artDialog.classList.toggle('reading-large');
        size.setAttribute('aria-pressed', String(large));
        size.textContent = large ? '기본 크기로' : '글자 크게';
      });
      if (artDialog.classList.contains('reading-large')) size.textContent = '기본 크기로';
      tools.append(duration, size);
      artVisual.append(tools);
      artVisual.append(original);
    } else if (work.image) {
      renderImage(work);
    } else {
      const title = document.createElement('div');
      title.className = 'writing-dialog-visual';
      title.textContent = work.kind === 'acting' ? 'Acting & film' : 'Words & notes';
      artVisual.append(title);
    }
  }

  let artOpener = null;
  artDialog.addEventListener('close', () => artOpener?.focus({preventScroll:true}));
  function showWork(key, sourceButton) {
      if(sourceButton) artOpener=sourceButton;
      const work = works[key];
      if (!work) return;
      const sourceImage = sourceButton?.querySelector('[data-expression-panel]:not([hidden]) img') || sourceButton?.querySelector('img');
      const sourceBounds = sourceImage?.getBoundingClientRect();
      stopArtMedia();
      resetArtZoom();
      if (artZoom) {
        artZoom.hidden = !work.image;
        artZoom.disabled = !work.image;
      }
      if (artFollow) {
        const fallbackLink = work.kind === 'acting' ? 'https://www.youtube.com/@life_by_play'
          : work.kind === 'writing' ? 'https://www.instagram.com/KDH_SMILE/' : 'https://www.instagram.com/jasperkim_official/';
        artFollow.href = work.link || fallbackLink;
        artFollow.querySelector('span').textContent = work.linkLabel || (work.link ? '원문 출처 보기' : work.kind === 'acting' ? 'YouTube에서 연기 기록 보기' : work.kind === 'writing' ? 'Instagram에서 기록 보기' : 'Instagram에서 그림 기록 보기');
      }
      activeWork = workSequence.indexOf(key);
      const layout = artDialog.querySelector('.art-layout');
      const copy = layout.querySelector('.art-copy');
      if (work.kind === 'writing') layout.prepend(copy); else layout.append(copy);
      artDialog.dataset.kind = work.kind;
      artDialog.dataset.work = key;
      artDialog.querySelector('.presentation-controls')?.remove();
      artDialog.classList.toggle('dark', work.kind === 'acting');
      document.getElementById('art-type').textContent = work.type;
      const titleNode=document.getElementById('art-title');
      titleNode.textContent = work.kind==='writing' ? '글 읽기' : work.title;
      titleNode.classList.toggle('sr-only',work.kind==='writing');
      document.getElementById('art-description').textContent = work.description;
      document.getElementById('art-description').hidden = work.kind==='writing' || !work.description;
      artVisual.replaceChildren();
      renderMedia(work);
      if (work.kind === 'writing') {
        const end = document.createElement('nav');
        end.className = 'reading-end'; end.setAttribute('aria-label', '글 끝에서 이동');
        for (const [label, offset] of [['이전 글', -1], ['다음 글', 1]]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.disabled = !workSequence[activeWork + offset];
          button.addEventListener('click', () => moveWork(offset));
          const adjacent = works[workSequence[activeWork + offset]];
          if (adjacent) {
            const preview = document.createElement('span'); preview.textContent = adjacent.title || adjacent.text?.slice(0,32) || '';
            button.append(preview);
          }
          end.append(button);
        }
        const back = document.createElement('button'); back.type = 'button';
        back.className = 'reading-back'; back.textContent = '글 목록으로 돌아가기';
        back.addEventListener('click', () => dismissDialog(artDialog));
        artVisual.append(end, back);
      }
      const mediumNoun = work.kind === 'writing' ? '글' : work.kind === 'acting' ? '영상' : '작품';
      previousWork.textContent = `← 이전 ${mediumNoun}`;
      nextWork.textContent = `다음 ${mediumNoun} →`;
      previousWork.disabled = activeWork === 0;
      nextWork.disabled = activeWork === workSequence.length - 1;
      document.getElementById('art-position').hidden = work.kind === 'painting';
      document.getElementById('art-position').textContent = `${activeWork + 1} / ${workSequence.length}`;
      document.getElementById('art-close-label').textContent = archiveDialog.open ? '아카이브로' : '닫기';
      if (!artDialog.open) artDialog.showModal();
      artDialog.scrollTop = 0;
      if (!motionPaused) {
        const target = artVisual.querySelector('img');
        const destination = target?.getBoundingClientRect();
        if (work.kind === 'painting' && sourceBounds?.width && destination?.width) {
          target.animate([
            { transformOrigin: '0 0', transform: `translate(${sourceBounds.left - destination.left}px, ${sourceBounds.top - destination.top}px) scale(${sourceBounds.width / destination.width}, ${sourceBounds.height / destination.height})`, opacity: .75 },
            { transformOrigin: '0 0', transform: 'none', opacity: 1 }
          ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
        } else {
          artVisual.animate(work.kind === 'writing' ? [{opacity:0,clipPath:'inset(0 18% 0 0)',transform:'perspective(1000px) rotateY(-5deg)'},{opacity:1,clipPath:'inset(0)',transform:'none'}] : [
            { opacity: .15, clipPath: 'inset(8% 0 8% 0)', transform: 'scale(.97)' },
            { opacity: 1, clipPath: 'inset(0)', transform: 'none' }
          ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
        }
      }
  }

  document.querySelectorAll('[data-art]').forEach(button => {
    button.addEventListener('click', () => {
      workSequence = button.closest('#archive-dialog')
        ? [...archiveItems.querySelectorAll('[data-art]')].filter(item => !item.hidden && item.dataset.kind === works[button.dataset.art].kind).map(item => item.dataset.art)
        : catalog.some(work => work.id === button.dataset.art) ? catalog.filter(work => work.kind === works[button.dataset.art].kind).map(work => work.id) : [button.dataset.art];
      const track=button.closest('.rail-track');
      if(track)workSequence=[...track.querySelectorAll('[data-art]')].map(item=>item.dataset.art);
      showWork(button.dataset.art, button);
    });
  });

  function moveWork(offset) {
    const key = workSequence[activeWork + offset];
    if (!key) return;
    showWork(key);
    const heading = document.getElementById('art-title');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  previousWork.addEventListener('click', () => moveWork(-1));
  nextWork.addEventListener('click', () => moveWork(1));
  artDialog.addEventListener('keydown', event => {
    if (artVisual.classList.contains('is-zoomed') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target.closest('video,audio,iframe,.art-image-pagination,.presentation-controls,.reading-tools')) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    moveWork(event.key === 'ArrowLeft' ? -1 : 1);
  });

  document.querySelectorAll('[data-open-archive]').forEach(button => {
    button.addEventListener('click', () => {
      const kind = button.dataset.openArchive || 'all';
      document.querySelector(`[data-filter="${kind}"]`)?.click();
      archiveDialog.showModal();
    });
  });
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      const kind = button.dataset.filter;
      let count = 0;
      archiveItems.dataset.filterMode = kind;
      archiveItems.querySelectorAll('[data-kind]').forEach(item => {
        item.hidden = kind !== 'all' && item.dataset.kind !== kind;
        if (!item.hidden) count += 1;
      });
      document.querySelectorAll('[data-filter]').forEach(item => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      const unit = kind === 'acting' ? '편' : kind === 'writing' || kind === 'all' ? '개' : '점';
      archiveStatus.textContent = `${button.textContent} · ${count}${unit}${count ? "" : " · 자료 정리 중"}`;
    });
  });
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      if (archiveItems.dataset.viewMode === button.dataset.view) return;
      const visibleItems = [...archiveItems.querySelectorAll('[data-kind]')].filter(item => !item.hidden);
      const previousBounds = visibleItems.map(item => item.getBoundingClientRect());
      archiveItems.dataset.viewMode = button.dataset.view;
      document.querySelectorAll('[data-view]').forEach(item => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      if (!motionPaused) visibleItems.forEach((item, index) => {
        const next = item.getBoundingClientRect();
        const previous = previousBounds[index];
        item.animate([
          { transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px)`, opacity: .4 },
          { transform: 'none', opacity: 1 }
        ], { duration: 450, delay: index * 35, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
    });
  });

  const connectDialog = document.getElementById('connect-dialog');
  const form = document.getElementById('connect-form');
  const brand = document.getElementById('brand-select');
  const purpose = document.getElementById('connection-purpose');
  const feedback = document.getElementById('form-feedback');
  const connections = {
    partner: {
      title: '브랜드 채용',
      description: 'AI를 잘 쓰거나, 미감이 높은 분을 찾습니다. 둘 중 하나만 해당해도 좋습니다. 원하는 브랜드를 맡아 운영하고 키워갈 수 있습니다.',
      question: '본인 소개와 맡고 싶은 브랜드, 잘하는 일을 알려주세요.'
    },
    art: {
      title: '그림과 영화',
      description: '그림으로 콜라보 작품을 만들거나 전시를 함께 기획할 사람, 영화를 함께 만들거나 실험적인 연기를 시도할 사람을 찾습니다.',
      question: '본인 소개와 함께 만들고 싶은 작업을 들려주세요.'
    },
    lab: {
      title: '재스퍼의 실험실',
      description: '다양한 직업과 가치관을 가진 사람들이 모이는 소규모 모임입니다. 서로의 생각과 관심사를 나누고 싶다면 자기소개와 함께 신청해 주세요.',
      question: '어떤 일을 하고, 무엇에 관심이 있나요? 본인을 소개해 주세요.'
    }
  };
  let applicationId = null;
  let submitting = false;
  let connectOpener = null;
  const applicationButton = form.querySelector('[type="submit"]');
  const localFile = location.protocol === 'file:';
  if (localFile) {
    document.getElementById('application-note').textContent = '로컬 화면에서는 전송되지 않습니다. 공개 후 이곳에서 신청할 수 있습니다.';
    applicationButton.textContent = '작성 내용 확인하기';
  }
  connectDialog.addEventListener('close', () => connectOpener?.focus({preventScroll:true}));

  function setPurpose(key) {
      const connection = connections[key];
      if (!connection) return;
      purpose.value = key;
      applicationId = null;
      document.getElementById('connect-title').textContent = connection.title;
      document.getElementById('connect-description').textContent = connection.description;
      document.getElementById('question-copy').textContent = connection.question;
      document.getElementById('brand-label').hidden = key !== 'partner';
      brand.disabled = key !== 'partner';
      feedback.hidden = true;
  }

  purpose.addEventListener('change', () => setPurpose(purpose.value));
  document.querySelectorAll('[data-connect]').forEach(button => {
    button.addEventListener('click', () => {
      if (submitting) return;
      if (artDialog.open) pauseArtMedia();
      connectOpener = button;
      setPurpose(button.dataset.connect);
      if (button.dataset.brand) brand.value = button.dataset.brand;
      connectDialog.showModal();
      connectDialog.scrollTop = 0;
      const connectTitle = document.getElementById('connect-title');
      if (connectTitle.hasAttribute('tabindex')) connectTitle.focus({ preventScroll: true });
    });
  });

  form.addEventListener('input', () => { feedback.hidden = true; applicationId = null; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    if (localFile) {
      feedback.textContent = '작성 내용을 확인했습니다. 로컬 미리보기이므로 전송·저장하지 않았습니다.';
      feedback.hidden = false; feedback.focus(); return;
    }
    const data = new FormData(form);
    applicationId ||= crypto.randomUUID();
    const payload = {id:applicationId, purpose:purpose.value, name:String(data.get('name') || '').trim(), email:String(data.get('email') || '').trim(), brand:brand.disabled?'':brand.value, message:String(data.get('message') || '').trim(), consent:data.get('consent')==='on', website:String(data.get('website') || '')};
    submitting = true; applicationButton.disabled = true; applicationButton.textContent = '보내는 중…';
    // Preserve exactly the submitted values while a request is pending.
    const controls = [...form.elements, purpose];
    const disabledBefore = controls.map(control => control.disabled);
    controls.forEach(control => control.disabled = true);
    try {
      const response = await fetch('/api/applications', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
      const result = await response.json();
      if (!response.ok || result.id !== applicationId) throw new Error(response.status === 429 ? '잠시 후 다시 신청해 주세요.' : '접수하지 못했습니다. 작성 내용은 그대로 있으니 다시 시도하거나 이메일로 보내 주세요.');
      feedback.textContent = '신청이 접수되었습니다. 남겨주신 이메일로 연락드릴게요.';
      form.reset(); applicationId = null;
    } catch (error) {
      feedback.textContent = error.message?.startsWith('잠시') || error.message?.startsWith('접수하지') ? error.message : '접수 여부를 확인하지 못했습니다. 작성 내용은 그대로 있습니다. 다시 누르면 중복 없이 접수 여부를 확인합니다.';
    } finally {
      controls.forEach((control,index) => control.disabled=disabledBefore[index]);
      submitting=false; applicationButton.disabled=false; applicationButton.textContent='신청 남기기';
      feedback.hidden=false;feedback.focus({preventScroll:true});feedback.scrollIntoView({block:'nearest',behavior:motionPaused?'auto':'smooth'});
    }
  });

  const closingDialogs = new WeakMap();
  function dismissDialog(dialog) {
    if (closingDialogs.has(dialog)) return closingDialogs.get(dialog);
    if (!dialog.open) return Promise.resolve();
    if (dialog === artDialog) stopArtMedia();
    if (motionPaused) {
      dialog.close();
      return Promise.resolve();
    }
    const menuExit = document.body.classList.contains('variant-atelier') ? 'inset(0 100% 0 0)' : 'inset(0 0 100% 0)';
    const frames = dialog.id === 'menu-dialog'
      ? [{ clipPath: 'inset(0)' }, { clipPath: menuExit }]
      : dialog.id === 'connect-dialog' && document.querySelector('.correspondence')
        ? [{ transform: 'none' }, { transform: 'translateX(100%)' }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px)' }];
    const animation = dialog.animate(frames, { duration: dialog.id === 'menu-dialog' ? 340 : 180, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    const completion = animation.finished.catch(() => {}).then(() => {
      dialog.close();
      animation.cancel();
      closingDialogs.delete(dialog);
    });
    closingDialogs.set(dialog, completion);
    return completion;
  }

  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('[data-close]').addEventListener('click', () => dismissDialog(dialog));
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dismissDialog(dialog);
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) dismissDialog(dialog);
    });
  });

  // Progressive enhancement: the three sections remain readable without JavaScript.
  const photoTabs = [...document.querySelectorAll('[data-photo-tab]')];
  const photoPanels = [...document.querySelectorAll('[data-photo-panel]')];
  const photoLabels = {profile:'프로필 사진',still:'스틸컷',journal:'촬영 현장'};
  function selectPhotoCategory(key) {
    photoTabs.forEach(tab => {
      const active = tab.dataset.photoTab === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    photoPanels.forEach(panel => {panel.hidden = panel.dataset.photoPanel !== key;if(panel.hidden)panel.querySelectorAll('[data-instagram-post]').forEach(details=>{details.open=false;details.querySelector('iframe')?.removeAttribute('src');});});
  }
  if (photoTabs.length) {
    document.querySelector('.acting-photo-tabs').setAttribute('role','tablist');
    photoTabs.forEach((tab,index) => {
      tab.setAttribute('role','tab');
      tab.setAttribute('aria-controls',tab.hash.slice(1));
      tab.addEventListener('click', event => {
        event.preventDefault();
        selectPhotoCategory(tab.dataset.photoTab);
        history.replaceState(null,'',tab.hash);
      });
      tab.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        let next = event.key === 'ArrowRight' ? (index + 1) % photoTabs.length : event.key === 'ArrowLeft' ? (index + photoTabs.length - 1) % photoTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? photoTabs.length - 1 : -1;
        if (event.key === ' ') {event.preventDefault();tab.click();return;}
        if (next < 0) return;
        event.preventDefault();photoTabs[next].click();photoTabs[next].focus({preventScroll:true});
      });
    });
    photoPanels.forEach(panel => {panel.setAttribute('role','tabpanel');panel.tabIndex=0;});
    const fromHash = () => {
      const tab = photoTabs.find(tab => tab.hash === location.hash);
      if (tab) selectPhotoCategory(tab.dataset.photoTab);
    };
    selectPhotoCategory('profile');fromHash();window.addEventListener('hashchange',fromHash);
  }

  const portraitDialog = document.getElementById('portrait-dialog');
  const portraitData = document.getElementById('portrait-data');
  if (portraitDialog && portraitData) {
    const allData = document.getElementById('acting-photos-data');
    const groups = allData ? JSON.parse(allData.textContent) : {profile:JSON.parse(portraitData.textContent)};
    let portraits = groups.profile;
    const image = document.getElementById('portrait-image');
    const thumbnailList = portraitDialog.querySelector('.portrait-thumbnails');
    let thumbnails = [];
    let portraitIndex = 0;
    let portraitOpener = null;
    function showPortrait(index, scrollThumbnail = true) {
      portraitIndex = (index + portraits.length) % portraits.length;
      const p = portraits[portraitIndex];
      image.getAnimations().forEach(animation => animation.cancel());
      image.src = p.image;image.alt = p.alt;image.width = p.width;image.height = p.height;
      document.getElementById('portrait-caption').textContent = p.label;
      document.getElementById('portrait-position').textContent = `${portraitIndex + 1} / ${portraits.length}`;
      thumbnails.forEach((button,i) => button.setAttribute('aria-pressed',String(i === portraitIndex)));
      if (scrollThumbnail) thumbnails[portraitIndex]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
      if (!motionPaused) image.animate([{opacity:.4,clipPath:'inset(0 8% 0 0)'},{opacity:1,clipPath:'inset(0)'}],{duration:240,easing:'ease-out'});
    }
    function openPhoto(button,category,id) {
      const ordered=[...document.querySelectorAll(`[data-photo-panel="${category}"] [data-photo-id]`)].map(node=>groups[category]?.find(p=>p.id===node.dataset.photoId)).filter(Boolean);
      portraits = ordered.length ? ordered : groups[category];
      if (!portraits?.length) return;
      const index = portraits.findIndex(p => p.id === id);
      if (index < 0) return;
      portraitOpener=button;
      document.getElementById('portrait-title').textContent=photoLabels[category] || '프로필 사진';
      thumbnailList.replaceChildren();
      thumbnails=portraits.map((p,i) => {
        const thumb=document.createElement('button');thumb.type='button';thumb.dataset.portraitSelect=String(i);thumb.setAttribute('aria-label',`${p.label} 보기`);thumb.setAttribute('aria-pressed','false');
        const picture=new Image();picture.src=p.thumb;picture.alt='';picture.width=80;picture.height=100;picture.loading='lazy';
        const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');thumb.append(picture,number);
        thumb.addEventListener('click',()=>showPortrait(i));thumbnailList.append(thumb);return thumb;
      });
      showPortrait(index,false);portraitDialog.showModal();portraitDialog.scrollTop=0;
      portraitDialog.querySelector('[data-close]').focus({preventScroll:true});
    }
    document.querySelectorAll('[data-portrait]').forEach(button => button.addEventListener('click',()=>openPhoto(button,'profile',button.dataset.portrait)));
    document.querySelectorAll('[data-photo-id]').forEach(button => button.addEventListener('click',()=>openPhoto(button,button.dataset.photoCategory,button.dataset.photoId)));
    document.getElementById('portrait-prev').addEventListener('click',()=>showPortrait(portraitIndex-1));
    document.getElementById('portrait-next').addEventListener('click',()=>showPortrait(portraitIndex+1));
    portraitDialog.addEventListener('keydown',event=>{
      if(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if(event.key==='ArrowLeft'||event.key==='ArrowRight') {event.preventDefault();showPortrait(portraitIndex+(event.key==='ArrowRight'?1:-1));}
    });
    portraitDialog.addEventListener('close',()=>portraitOpener?.focus({preventScroll:true}));
  }

  const menu = document.getElementById('menu-dialog');
  const menuToggle = document.getElementById('menu-toggle');
  if (menu && menuToggle) {
  menuToggle.addEventListener('click', () => {
    menu.showModal();
    menu.scrollTop = 0;
    menuToggle.setAttribute('aria-expanded', 'true');
  });
  menu.addEventListener('close', () => menuToggle.setAttribute('aria-expanded', 'false'));
  menu.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', async event => {
      event.preventDefault();
      const hash = link.getAttribute('href');
      await dismissDialog(menu);
      location.hash = hash;
    });
  });

  }

  // Every brand is visible in the index; each row opens its corresponding detail.
  document.querySelectorAll('[data-instagram-post]').forEach(details=>details.addEventListener('toggle',()=>{
    const frame=details.querySelector('iframe');
    if(details.open && !frame.hasAttribute('src'))frame.src=frame.dataset.instagramSrc;
    if(!details.open)frame.removeAttribute('src');
  }));

  const ventureDialog = document.getElementById('venture-dialog');
  if (ventureDialog) {
    document.querySelectorAll('[data-open-venture]').forEach(button => {
      button.addEventListener('click', () => {
        const sheets = [...ventureDialog.querySelectorAll('[data-venture-sheet]')];
        const selected = sheets.find(sheet => sheet.dataset.ventureSheet === button.dataset.openVenture);
        if (!selected) return;
        sheets.forEach(sheet => { sheet.hidden = sheet !== selected; });
        ventureDialog.dataset.venture = button.dataset.openVenture;
        document.getElementById('venture-dialog-title').textContent = button.querySelector('.venture-name strong').textContent;
        const embed = selected.querySelector('[data-instagram-src]');
        if (embed && !embed.hasAttribute('src')) embed.src = embed.dataset.instagramSrc;
        ventureDialog.showModal();
        ventureDialog.scrollTop = 0;
      });
    });
  }

  const detailsAnimations = new WeakMap();
  document.querySelectorAll('.brand-row').forEach(details => {
    const summary = details.querySelector('summary');
    const content = details.querySelector('.brand-detail');
    summary.addEventListener('click', event => {
      if (motionPaused && !detailsAnimations.has(details)) return;
      event.preventDefault();
      if (detailsAnimations.has(details)) return;
      const opening = !details.open;
      details.open = true;
      const collapsed = { transform: 'translateY(-6px)', opacity: 0 };
      const expanded = { transform: 'translateY(0)', opacity: 1 };
      const animation = content.animate(opening ? [collapsed, expanded] : [expanded, collapsed], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
      detailsAnimations.set(details, animation);
      animation.finished.catch(() => {}).then(() => {
        details.open = opening;
        detailsAnimations.delete(details);
        refreshMotion();
      });
    });
  });

  if ('IntersectionObserver' in window) {
    document.querySelectorAll('.section-caption,.biography-lead,.brand-intro,.contact-layout').forEach(element => element.setAttribute('data-reveal', ''));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -25px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
    root.classList.add('js-reveals');
  }

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  expressionVisual?.addEventListener('pointermove', event => {
    if (motionPaused || !finePointer.matches) return;
    const bounds = expressionVisual.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    expressionVisual.style.setProperty('--preview-x', `${Math.max(-6, Math.min(6, x * 12))}px`);
    expressionVisual.style.setProperty('--preview-y', `${Math.max(-4, Math.min(4, y * 8))}px`);
  });
  expressionVisual?.addEventListener('pointerleave', () => {
    expressionVisual.style.removeProperty('--preview-x');
    expressionVisual.style.removeProperty('--preview-y');
  });
  document.querySelectorAll('[data-magnet]').forEach(element => {
    element.addEventListener('pointermove', event => {
      if (motionPaused || !finePointer.matches) return;
      const rect = element.getBoundingClientRect();
      const x = Math.max(-6, Math.min(6, (event.clientX - rect.left - rect.width / 2) * .09));
      const y = Math.max(-4, Math.min(4, (event.clientY - rect.top - rect.height / 2) * .13));
      element.style.transform = `translate(${x}px, ${y}px)`;
    });
    element.addEventListener('pointerleave', () => element.style.removeProperty('transform'));
  });

  const opening = document.querySelector('.opening');
  const openingSticky = document.querySelector('.opening-sticky');
  const openingFrame = document.getElementById('opening-frame');
  const header = document.getElementById('site-header');
  const track = document.getElementById('practice-track');
  const strip = document.querySelector('.practice-strip');
  const darkSection = document.querySelector('[data-dark-section]');
  const parallaxItems = [...document.querySelectorAll('[data-parallax]')];
  const chapters = [...document.querySelectorAll('[data-chapter]')].map(link => ({ link, section: document.getElementById(link.dataset.chapter) }));
  const lastOffset = new WeakMap();
  const clamp = value => Math.max(0, Math.min(1, value));
  let framePending = false;
  function updateScrollMotion() {
    framePending = false;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const openingBounds = opening.getBoundingClientRect();
    const progress = clamp(-openingBounds.top / Math.max(1, openingBounds.height - openingSticky.offsetHeight));
    const stripBounds = strip?.getBoundingClientRect();
    const stripProgress = stripBounds ? clamp((viewportHeight - stripBounds.top) / (viewportHeight + stripBounds.height)) : 0;
    const pageProgress = clamp(window.scrollY / Math.max(1, root.scrollHeight - viewportHeight));
    const activeChapter = chapters.filter(({ section }) => section && section.getBoundingClientRect().top <= viewportHeight * .4).at(-1);
    const positions = parallaxItems.map(element => {
      const bounds = element.getBoundingClientRect();
      const top = bounds.top - (lastOffset.get(element) || 0);
      const amount = Number(element.dataset.parallax);
      const y = motionPaused || viewportWidth <= 760 ? 0 : (.5 - clamp((viewportHeight - top) / (viewportHeight + bounds.height))) * amount * 2;
      return { element, y };
    });
    header.classList.toggle('is-past-opening', openingBounds.top < -60);
    header.classList.toggle('is-on-dark', Boolean(darkSection && darkSection.getBoundingClientRect().top < header.offsetHeight / 2));
    header.style.setProperty('--page-progress', String(pageProgress));
    chapters.forEach(chapter => {
      if (chapter === activeChapter) chapter.link.setAttribute('aria-current', 'location');
      else chapter.link.removeAttribute('aria-current');
    });
    if (!motionPaused) {
      openingFrame.style.setProperty('--frame-inset', `${progress * Math.min(64, viewportWidth * .045)}px`);
      openingFrame.style.setProperty('--image-scale', String(1.12 - progress * .12));
      openingFrame.style.setProperty('--name-y', `${-progress * 45}px`);
      track?.style.setProperty('--track-x', `${-30 - stripProgress * (viewportWidth > 760 ? 260 : 110)}px`);
    }
    positions.forEach(({ element, y }) => {
      element.style.setProperty('--parallax-y', `${y}px`);
      lastOffset.set(element, y);
    });
  }
  refreshMotion = () => {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(updateScrollMotion);
  };
  window.addEventListener('scroll', refreshMotion, { passive: true });
  window.addEventListener('resize', refreshMotion, { passive: true });
  window.addEventListener('load', refreshMotion, { once: true });
  refreshMotion();
})();
