const CACHE_NAME = 'alam-almarah-v4-learning-audio';
const FILES = ["./", "./index.html", "./style.css", "./game.js", "./manifest.webmanifest", "./assets/mascot.svg", "./assets/audio/effects/click.wav", "./assets/audio/effects/correct.wav", "./assets/audio/effects/level-up.wav", "./assets/audio/effects/playful-loop.mp3", "./assets/audio/effects/playful-loop.wav", "./assets/audio/effects/pop.wav", "./assets/audio/effects/star.wav", "./assets/audio/effects/try-again.wav", "./assets/audio/effects/whoosh.wav", "./assets/audio/voice/en/apple.mp3", "./assets/audio/voice/en/banana.mp3", "./assets/audio/voice/en/bird.mp3", "./assets/audio/voice/en/blue.mp3", "./assets/audio/voice/en/book.mp3", "./assets/audio/voice/en/cake.mp3", "./assets/audio/voice/en/car.mp3", "./assets/audio/voice/en/cat.mp3", "./assets/audio/voice/en/circle.mp3", "./assets/audio/voice/en/dog.mp3", "./assets/audio/voice/en/fish.mp3", "./assets/audio/voice/en/flower.mp3", "./assets/audio/voice/en/green.mp3", "./assets/audio/voice/en/house.mp3", "./assets/audio/voice/en/moon.mp3", "./assets/audio/voice/en/orange.mp3", "./assets/audio/voice/en/rabbit.mp3", "./assets/audio/voice/en/red.mp3", "./assets/audio/voice/en/square.mp3", "./assets/audio/voice/en/star.mp3", "./assets/audio/voice/en/sun.mp3", "./assets/audio/voice/en/tree.mp3", "./assets/audio/voice/en/triangle.mp3", "./assets/audio/voice/en/yellow.mp3"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok) { const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)); }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
