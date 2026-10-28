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
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? '모션 켜기' : '모션 끄기';
    if (paused) document.getAnimations().forEach(animation => animation.cancel());
    if (paused) document.querySelectorAll('[data-magnet]').forEach(element => element.style.removeProperty('transform'));
    if (paused) document.getElementById('expression-visual')?.style.removeProperty('--preview-x');
    if (paused) document.getElementById('expression-visual')?.style.removeProperty('--preview-y');
    refreshMotion();
    document.dispatchEvent(new CustomEvent('jasper:motionchange', {detail: {paused}}));
  }

  setMotion(motionPaused);
  motionButton.addEventListener('click', () => setMotion(!motionPaused));
  reducedMotion.addEventListener('change', event => setMotion(event.matches));

  const finishHero = () => { root.classList.add('hero-settled'); document.getElementById('hero-finish')?.setAttribute('hidden', ''); };
  document.getElementById('hero-finish')?.addEventListener('click', finishHero);
  if (motionPaused) finishHero();
  const heroTimer = setTimeout(finishHero, 7200);
  document.addEventListener('jasper:motionchange', event => { if (event.detail.paused) finishHero(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(heroTimer); finishHero(); } });

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
  const paintings = window.JASPER_ARTWORKS || [];
  const works = {
    ...Object.fromEntries(paintings.map(work => [work.id, work])),
    acting: { kind: 'acting', type: 'ACTING & FILM', title: '연기와 장면', description: '공부하고 훈련하며, 다양한 장면 속에서 표현을 시도합니다. 연기 기록은 유튜브 채널에서 볼 수 있습니다.', link: 'https://www.youtube.com/@life_by_play', linkLabel: 'YouTube에서 연기 기록 보기' },
    writing: { kind: 'writing', type: 'WORDS & NOTES', title: '창작글과 기록', description: '인스타그램에 남긴 창작글과 기록을 이곳에 정리하고 있습니다. 원문은 개인 계정에서 확인할 수 있습니다.', link: 'https://www.instagram.com/KDH_SMILE/', linkLabel: 'Instagram에서 원문 보기' }
  };

  // Selecting a medium changes the preview immediately; animation never delays navigation.
  const expressionLayout = document.getElementById('expression-layout');
  const expressionVisual = document.getElementById('expression-visual');
  const expressionNames = { painting: '회화', acting: '연기', writing: '창작글과 기록' };
  let expressionAnimation;
  if (expressionLayout && expressionVisual) {
    const choices = [...expressionLayout.querySelectorAll('button[data-expression]')];
    const panels = [...expressionVisual.querySelectorAll('[data-expression-panel]')];
    choices.forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.expression;
      if (!works[key] || expressionLayout.dataset.expression === key) return;
      const direction = choices.indexOf(button) > choices.findIndex(choice => choice.getAttribute('aria-pressed') === 'true') ? 1 : -1;
      expressionAnimation?.cancel();
      expressionLayout.dataset.expression = key;
      expressionLayout.style.setProperty('--active-medium', String(choices.indexOf(button)));
      choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
      panels.forEach(panel => { panel.hidden = panel.dataset.expressionPanel !== key; });
      expressionVisual.dataset.art = key;
      expressionVisual.setAttribute('aria-label', `${expressionNames[key]} 자세히 보기`);
      document.getElementById('expression-stage').setAttribute('aria-label', `${expressionNames[key]} 미리보기`);
      document.getElementById('expression-edition').textContent = works[key].type;
      document.getElementById('expression-title').textContent = expressionNames[key];
      document.getElementById('expression-note').textContent = key === 'acting'
        ? 'YouTube에서 연기 기록 보기'
        : key === 'writing' ? '원문 수집·정리 중' : `직접 그린 회화 ${paintings.length}점`;
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
  artDialog.addEventListener('close', resetArtZoom);

  function showWork(key, sourceButton) {
      const work = works[key];
      if (!work) return;
      const sourceImage = sourceButton?.querySelector('[data-expression-panel]:not([hidden]) img') || sourceButton?.querySelector('img');
      const sourceBounds = sourceImage?.getBoundingClientRect();
      resetArtZoom();
      if (artZoom) {
        artZoom.hidden = !work.image;
        artZoom.disabled = !work.image;
      }
      if (artFollow) {
        artFollow.href = work.link || 'https://www.instagram.com/jasperkim_official/';
        artFollow.querySelector('span').textContent = work.linkLabel || 'Instagram에서 그림 기록 보기';
      }
      activeWork = workSequence.indexOf(key);
      artDialog.classList.toggle('dark', key === 'acting');
      document.getElementById('art-type').textContent = work.type;
      document.getElementById('art-title').textContent = work.title;
      document.getElementById('art-description').textContent = work.description;
      artVisual.replaceChildren();
      if (work.image) {
        const image = new Image();
        image.src = work.image;
        image.alt = work.alt;
        image.width = work.width;
        image.height = work.height;
        artVisual.append(image);
      } else {
        const title = document.createElement('div');
        title.className = 'writing-dialog-visual';
        title.textContent = work.kind === 'acting' ? 'Acting & film' : 'Words & notes';
        artVisual.append(title);
      }
      previousWork.disabled = activeWork === 0;
      nextWork.disabled = activeWork === workSequence.length - 1;
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
          artVisual.animate([
            { opacity: .15, clipPath: 'inset(8% 0 8% 0)', transform: 'scale(.97)' },
            { opacity: 1, clipPath: 'inset(0)', transform: 'none' }
          ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
        }
      }
  }

  document.querySelectorAll('[data-art]').forEach(button => {
    button.addEventListener('click', () => {
      workSequence = button.closest('#archive-dialog')
        ? [...archiveItems.querySelectorAll('[data-art]')].filter(item => !item.hidden).map(item => item.dataset.art)
        : Object.keys(works);
      showWork(button.dataset.art, button);
    });
  });

  function moveWork(offset) {
    const key = workSequence[activeWork + offset];
    if (!key) return;
    showWork(key);
    artDialog.querySelector('[data-close]').focus({ preventScroll: true });
  }
  previousWork.addEventListener('click', () => moveWork(-1));
  nextWork.addEventListener('click', () => moveWork(1));
  artDialog.addEventListener('keydown', event => {
    if (artVisual.classList.contains('is-zoomed') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    moveWork(event.key === 'ArrowLeft' ? -1 : 1);
  });

  document.querySelectorAll('[data-open-archive]').forEach(button => {
    button.addEventListener('click', () => archiveDialog.showModal());
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
      archiveStatus.textContent = `${button.textContent} · ${count}점${count ? "" : " · 자료 정리 중"}`;
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
      title: '브랜드 운영 파트너',
      description: '브랜드 하나를 책임지고 키워갈 사람을 찾습니다. AI를 활용해 일하고, 엔지니어링 사고와 미감을 함께 나눌 수 있으면 좋겠습니다.',
      question: '어떤 브랜드를 어떻게 키워보고 싶으세요?'
    },
    art: {
      title: '예술 협업',
      description: '그림 전시, 독립영화 촬영, 서로의 표현을 넓히는 새로운 작업. 함께 만들고 싶은 장면을 들려주세요.',
      question: '함께해보고 싶은 작업이 있나요?'
    },
    mentoring: {
      title: '비즈니스 멘토링',
      description: '제가 10년 걸려 배운 것들로, 누군가는 덜 헤맸으면 합니다. 초기 고객 확보와 B2B 영업, 정신건강 서비스의 고객 이해, 정부지원사업·투자 유치에 관한 경험을 나눕니다. 창업 3년 이내 또는 연 매출 10억 원 이하의 초기 창업자를 중심으로 만나고 싶습니다. 실제 모집 일정과 조건은 접수 시작 전 안내합니다.',
      question: '하고 있는 서비스와 지금 막혀 있는 지점을 알려주세요.'
    },
    lab: {
      title: '재스퍼의 실험실',
      description: '월 한 번, 다양한 직업의 사람들이 만나 이야기를 나누는 친목 모임입니다. 구체적인 일정과 참여 안내는 모집 때 공개합니다.',
      question: '어떤 일을 하고 있고, 어떤 만남을 기대하세요?'
    }
  };

  function setPurpose(key) {
      const connection = connections[key];
      if (!connection) return;
      purpose.value = key;
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
      setPurpose(button.dataset.connect);
      if (button.dataset.brand) brand.value = button.dataset.brand;
      connectDialog.showModal();
      connectDialog.scrollTop = 0;
      const connectTitle = document.getElementById('connect-title');
      if (connectTitle.hasAttribute('tabindex')) connectTitle.focus({ preventScroll: true });
    });
  });

  form.addEventListener('input', () => { feedback.hidden = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = String(new FormData(form).get('name') || '').trim();
    feedback.textContent = `${name ? name + '님, ' : ''}작성 흐름을 확인했습니다.\n이 화면은 디자인 미리보기입니다. 내용이 전송되거나 저장되지 않았습니다.`;
    feedback.hidden = false;
    feedback.scrollIntoView({ block: 'nearest', behavior: motionPaused ? 'auto' : 'smooth' });
  });

  const closingDialogs = new WeakMap();
  function dismissDialog(dialog) {
    if (closingDialogs.has(dialog)) return closingDialogs.get(dialog);
    if (!dialog.open) return Promise.resolve();
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

  const menu = document.getElementById('menu-dialog');
  const menuToggle = document.getElementById('menu-toggle');
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

  // Every brand is visible in the index; each row opens its corresponding detail.
  const ventureDialog = document.getElementById('venture-dialog');
  if (ventureDialog) {
    document.querySelectorAll('[data-open-venture]').forEach(button => {
      button.addEventListener('click', () => {
        const sheets = [...ventureDialog.querySelectorAll('[data-venture-sheet]')];
        const selected = sheets.find(sheet => sheet.dataset.ventureSheet === button.dataset.openVenture);
        if (!selected) return;
        sheets.forEach(sheet => { sheet.hidden = sheet !== selected; });
        document.getElementById('venture-dialog-title').textContent = button.querySelector('.venture-name strong').textContent;
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
      const height = content.getBoundingClientRect().height;
      const padding = getComputedStyle(content).paddingBottom;
      const collapsed = { height: '0px', paddingBottom: '0px', opacity: 0 };
      const expanded = { height: `${height}px`, paddingBottom: padding, opacity: 1 };
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
    const stripBounds = strip.getBoundingClientRect();
    const stripProgress = clamp((viewportHeight - stripBounds.top) / (viewportHeight + stripBounds.height));
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
      track.style.setProperty('--track-x', `${-30 - stripProgress * (viewportWidth > 760 ? 260 : 110)}px`);
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
