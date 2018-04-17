var staticCacheName = 'headline-static-v88'

var filesToCache = [
    '/',
    'index.html',
    'dist/js/bundle.js',
    'dist/css/app.css',
    'https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css',
    'https://fonts.googleapis.com/css?family=Source+Sans+Pro'
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

self.addEventListener('push', function (event) {
    console.log('[Service Worker] Push Received.');

    const title = 'Headlines';
    const options = {
        body: 'New headlines making the waves.',
        tag: 'Headlines',
        icon: './images/icons/icon-72x72.png',
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
    var url = '/';

    event.notification.close(); //Close the notification

    // Open the app and navigate to lthe home page after clicking the notification
    event.waitUntil(
        clients.openWindow(url)
    );
});



