var idb = require('idb')

class newsHeadlines {

    constructor() {
        this.openDatabase()
        this.registerServiceWorker()
        this.showCachedPosts().then(function() {
            app.openSocket()
        })
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/'}).then(response => {

                console.log('Service worker and IDB registered')
            }).catch(error => {
                console.log('Service worker registraton failed', error)
            })
        }
    }
    
    offline() {
        return window.addEventListener('offline', function(e) {
            console.log('You are offline')
        }, false)
    }

    online() {
        return window.addEventListener('online', function (e) {
            alert('You are online')
        }, false)
    }

    openDatabase() {
        if (! navigator.serviceWorker) return

        return idb.open('headlines', 1, function (upgradeDb) {
            var headlineStore = upgradeDb.createObjectStore('posts', {
                keyPath: 'publishedAt'
            })

            headlineStore.createIndex('by-date', 'publishedAt')
        })
    }

    showCachedPosts() {
        return this.openDatabase().then(function(db) {
            if (!db) return

            if (app.online()) return
            
            var index = db.transaction('posts')
            .objectStore('posts').index('by-date')

            return index.getAll().then((posts) => {
                
                app.displayPosts(posts.reverse())
                console.log('From Indexed db:', posts.reverse())
            })
        })
    }

    // Make a request to the network
    openSocket() {
        const url = 'https://newsapi.org/v2/top-headlines?country=us&apiKey=d3119c6bc5da41b0b172a7f71466a063'
       
        return fetch(url).then(response => response.json())
        .then(data => {
            if (data.status != 'ok') return
            
            app.cachePosts(data) 
        });

        // try and reconnect in 5 seconds
        setTimeout(function () {
            app.openSocket();
        }, 5000);
    }
    
    cachePosts(data) {
        var posts = data.articles
        return this.openDatabase().then(function (db) {
            if (!db) return;
            
            var tx = db.transaction('posts', 'readwrite');
            var store = tx.objectStore('posts');
            posts.forEach(function (post) {
                store.put(post);
            });

            store.index('by-date').openCursor(null, 'prev').then(function(cursor) {
                return cursor.advance(20)
            }).then(function deletePosts(cursor) {
                if (!cursor) return
                cursor.delete()
                return cursor.continue().then(deletePosts);
            })

            app.displayPosts(data.articles)
            console.log('From the Socket:', data.articles)
        })

    }
    
    
    displayPosts(data) {
        var content = ''
        
        var headlines = data.forEach(headline => {
            content += `<div class="card">
                <div class="card-media">
                    <img src="${headline.urlToImage}" alt="Image">
                </div>
                <div class="card-content">
                    <h1><a href="${headline.url}" target="_blank">${headline.title}</a></h1>
                    <p>${headline.description}</p>
                    <em>Source: ${headline.source.name}</em>
                </div>
            </div>`
            
            document.querySelector('.posts').innerHTML = content
        });
    }
    
}


var app = new newsHeadlines()




