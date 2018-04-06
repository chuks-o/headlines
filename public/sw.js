var staticCacheName = 'headline-static-v7';
var contentImgsCache = 'headline-content-imgs';
var allCaches = [
    staticCacheName,
    contentImgsCache
];

var filesToCache = [
    '/',
    'index.html',
    'js/main.js',
    'stylesheets/css/app.css',
    'https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css'
]

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(staticCacheName).then(function (cache) {
            return cache.addAll(filesToCache);
        }).then(self.skipWaiting())
    )
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request).then(function (response) {
            return response || fetch(event.request);
        })
    );
})

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(cacheName) {
                    return cacheName.startsWith('headline') && 
                    cacheName != staticCacheName
                }).map(function(cacheName) {
                    caches.delete(cacheName)
                })
            )
        })

    )
})

// self.addEventListener('message', function (event) {
//     if (event.data.action === 'skipWaiting') {
//         self.skipWaiting();
//     }
// });
