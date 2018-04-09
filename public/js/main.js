var idb = require('idb')

class Headlines {
    
    constructor() {
        var sources = [
            'techcrunch', 'abc-news', 'al-jazeera-english', 'bbc-news', 'bloomberg',
            'cnn', 'espn', 'google-news', 'metro', 'news24', 'the-washington-post',
        ];
        var countries = [
            'ae', 'ar', 'at', 'au', 'be', 'bg', 'br', 'ca', 'ch', 'cn', 'co', 'cu', 'cz', 'de',
            'eg','fr', 'gb', 'gr', 'hk', 'hu', 'id', 'ie', 'il', 'it', 'jp', 'kr', 'lt', 'lv', 
            'ma','mx', 'my', 'ng', 'nl', 'no', 'nz', 'ph', 'pl', 'pt', 'ro', 'rs', 'ru', 'sa',
            'se', 'sg', 'si', 'sk', 'th', 'tr', 'tw', 'ua', 'us', 've', 'za'
        ];

        this.populateSource(sources)
        this.populateCountry(countries)
        this.openDatabase()
        this.registerServiceWorker()
        this.showCachedPosts().then(function() {
            app.openSocket()
        })
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(response => {
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
        const API_KEY = 'd3119c6bc5da41b0b172a7f71466a063'
        const BASE_URL = 'https://newsapi.org/v2/'
        const url = `${BASE_URL}top-headlines?country=us&apiKey=${API_KEY}`
        return fetch(url).then(response => response.json())
        .then(data => {
            if (data.status != 'ok') return
            app.cachePosts(data) 
        });
    }

    openSourceSocket(source) {
        const API_KEY = 'd3119c6bc5da41b0b172a7f71466a063'
        const BASE_URL = 'https://newsapi.org/v2'
        const url = `${BASE_URL}/top-headlines?sources=${source}&apiKey=${API_KEY}`
        return fetch(url).then(response => response.json())
            .then(data => {
                if (data.status != 'ok') return
                app.cachePosts(data)
            });
    }

    openCountrySocket(country) {
        const API_KEY = 'd3119c6bc5da41b0b172a7f71466a063'
        const BASE_URL = 'https://newsapi.org/v2'
        const url = `${BASE_URL}/top-headlines?country=${country}&apiKey=${API_KEY}`
        return fetch(url).then(response => response.json())
            .then(data => {
                if (data.status != 'ok') return
                app.cachePosts(data)
            });
    }
    
    cachePosts(data) {
        var posts = data.articles
        return this.openDatabase().then(function (db) {
            if (!db) return;
            
            var tx = db.transaction('posts', 'readwrite');
            var store = tx.objectStore('posts');
            posts.forEach(function (post) {
                store.put(post);
                console.log('saving posts to idb')
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

    populateSource(sources) {
        var selectOption = ''
        sources.forEach((source) => {
            selectOption += `<option>${source}</option>`
        })
        document.querySelector('#source-names').insertAdjacentHTML('beforeend', selectOption)
    }

    populateCountry(countries) {
        var countryOption = ''
        countries.forEach((country) => {
            countryOption += `<option>${country}</option>`
        })
        document.querySelector('#country-names').insertAdjacentHTML('beforeend', countryOption)
    }

    getSourceValue() {
        document.querySelector('#source-form').addEventListener('submit', (e) => {
            e.preventDefault()
            const source = e.target.querySelector("select[name='source']").selectedOptions[0].value;
            app.openSourceSocket(source)
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

var app = new Headlines()

document.querySelector('#source-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const source = e.target.querySelector("select[name='source']").selectedOptions[0].value;
    app.openSourceSocket(source)
    console.log(source)
})

document.querySelector('#country-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const country = e.target.querySelector("select[name='country']").selectedOptions[0].value;
    app.openCountrySocket(country)
    console.log(country)
})


