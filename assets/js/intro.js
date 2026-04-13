(function () {

  /* Session check */
  try {
    if (sessionStorage.getItem('introPlayed') === 'true') return;
    sessionStorage.setItem('introPlayed', 'true');
  } catch (e) {}

  var isPortrait  = window.innerWidth < window.innerHeight;
  var deviceSrc   = isPortrait ? 'assets/images/phone.png'  : 'assets/images/laptop.png';
  var deviceClass = isPortrait ? 'phone'                    : 'laptop';
  var bgSrc       = 'assets/images/1.1.webp';

  /* DOM:
     #intro-overlay
       .intro-scene
         .device-wrap.phone|laptop
           img.device-img
           .screen
             img (bg)
  */
  var overlay = document.createElement('div');
  overlay.id = 'intro-overlay';

  var scene = document.createElement('div');
  scene.className = 'intro-scene';

  var deviceWrap = document.createElement('div');
  deviceWrap.className = 'device-wrap ' + deviceClass;

  var deviceImg = document.createElement('img');
  deviceImg.className = 'device-img';
  deviceImg.src = deviceSrc;
  deviceImg.alt = '';

  var screen = document.createElement('div');
  screen.className = 'screen';

  var screenImg = document.createElement('img');
  screenImg.src = bgSrc;
  screenImg.alt = '';

  screen.appendChild(screenImg);
  deviceWrap.appendChild(deviceImg);
  deviceWrap.appendChild(screen);
  scene.appendChild(deviceWrap);
  overlay.appendChild(scene);

  document.body.insertBefore(overlay, document.body.firstChild);

  /* Timeline:
     16ms    — device fades in (600ms)
     800ms   — screen-in-device fades in (800ms)
     1400ms  — screen fades OUT (400ms) — clears before zoom
     1600ms  — scene zooms forward scale(12) + fades (2.2s/2s)
     2800ms  — overlay fades out (1.1s) → real page revealed
     4000ms  — overlay removed
  */
  setTimeout(function () { deviceWrap.classList.add('visible'); }, 16);
  setTimeout(function () { screen.classList.add('visible'); }, 800);
  setTimeout(function () { screen.classList.add('hide'); }, 1400);   /* screen fades out before zoom */
  setTimeout(function () { scene.classList.add('zoom'); }, 1600);
  setTimeout(function () { overlay.classList.add('fade-out'); }, 2800);
  setTimeout(function () { overlay.remove(); }, 4000);

}());
