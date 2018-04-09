(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({"/home/okpala/node-sites/headlines/node_modules/idb/lib/idb.js":[function(require,module,exports){
'use strict';

(function() {
  function toArray(arr) {
    return Array.prototype.slice.call(arr);
  }

  function promisifyRequest(request) {
    return new Promise(function(resolve, reject) {
      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onerror = function() {
        reject(request.error);
      };
    });
  }

  function promisifyRequestCall(obj, method, args) {
    var request;
    var p = new Promise(function(resolve, reject) {
      request = obj[method].apply(obj, args);
      promisifyRequest(request).then(resolve, reject);
    });

    p.request = request;
    return p;
  }

  function promisifyCursorRequestCall(obj, method, args) {
    var p = promisifyRequestCall(obj, method, args);
    return p.then(function(value) {
      if (!value) return;
      return new Cursor(value, p.request);
    });
  }

  function proxyProperties(ProxyClass, targetProp, properties) {
    properties.forEach(function(prop) {
      Object.defineProperty(ProxyClass.prototype, prop, {
        get: function() {
          return this[targetProp][prop];
        },
        set: function(val) {
          this[targetProp][prop] = val;
        }
      });
    });
  }

  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return this[targetProp][prop].apply(this[targetProp], arguments);
      };
    });
  }

  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function Index(index) {
    this._index = index;
  }

  proxyProperties(Index, '_index', [
    'name',
    'keyPath',
    'multiEntry',
    'unique'
  ]);

  proxyRequestMethods(Index, '_index', IDBIndex, [
    'get',
    'getKey',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(Index, '_index', IDBIndex, [
    'openCursor',
    'openKeyCursor'
  ]);

  function Cursor(cursor, request) {
    this._cursor = cursor;
    this._request = request;
  }

  proxyProperties(Cursor, '_cursor', [
    'direction',
    'key',
    'primaryKey',
    'value'
  ]);

  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
    'update',
    'delete'
  ]);

  // proxy 'next' methods
  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {
    if (!(methodName in IDBCursor.prototype)) return;
    Cursor.prototype[methodName] = function() {
      var cursor = this;
      var args = arguments;
      return Promise.resolve().then(function() {
        cursor._cursor[methodName].apply(cursor._cursor, args);
        return promisifyRequest(cursor._request).then(function(value) {
          if (!value) return;
          return new Cursor(value, cursor._request);
        });
      });
    };
  });

  function ObjectStore(store) {
    this._store = store;
  }

  ObjectStore.prototype.createIndex = function() {
    return new Index(this._store.createIndex.apply(this._store, arguments));
  };

  ObjectStore.prototype.index = function() {
    return new Index(this._store.index.apply(this._store, arguments));
  };

  proxyProperties(ObjectStore, '_store', [
    'name',
    'keyPath',
    'indexNames',
    'autoIncrement'
  ]);

  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'put',
    'add',
    'delete',
    'clear',
    'get',
    'getAll',
    'getKey',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'openCursor',
    'openKeyCursor'
  ]);

  proxyMethods(ObjectStore, '_store', IDBObjectStore, [
    'deleteIndex'
  ]);

  function Transaction(idbTransaction) {
    this._tx = idbTransaction;
    this.complete = new Promise(function(resolve, reject) {
      idbTransaction.oncomplete = function() {
        resolve();
      };
      idbTransaction.onerror = function() {
        reject(idbTransaction.error);
      };
      idbTransaction.onabort = function() {
        reject(idbTransaction.error);
      };
    });
  }

  Transaction.prototype.objectStore = function() {
    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
  };

  proxyProperties(Transaction, '_tx', [
    'objectStoreNames',
    'mode'
  ]);

  proxyMethods(Transaction, '_tx', IDBTransaction, [
    'abort'
  ]);

  function UpgradeDB(db, oldVersion, transaction) {
    this._db = db;
    this.oldVersion = oldVersion;
    this.transaction = new Transaction(transaction);
  }

  UpgradeDB.prototype.createObjectStore = function() {
    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
  };

  proxyProperties(UpgradeDB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(UpgradeDB, '_db', IDBDatabase, [
    'deleteObjectStore',
    'close'
  ]);

  function DB(db) {
    this._db = db;
  }

  DB.prototype.transaction = function() {
    return new Transaction(this._db.transaction.apply(this._db, arguments));
  };

  proxyProperties(DB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(DB, '_db', IDBDatabase, [
    'close'
  ]);

  // Add cursor iterators
  // TODO: remove this once browsers do the right thing with promises
  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
    [ObjectStore, Index].forEach(function(Constructor) {
      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
        var args = toArray(arguments);
        var callback = args[args.length - 1];
        var nativeObject = this._store || this._index;
        var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
        request.onsuccess = function() {
          callback(request.result);
        };
      };
    });
  });

  // polyfill getAll
  [Index, ObjectStore].forEach(function(Constructor) {
    if (Constructor.prototype.getAll) return;
    Constructor.prototype.getAll = function(query, count) {
      var instance = this;
      var items = [];

      return new Promise(function(resolve) {
        instance.iterateCursor(query, function(cursor) {
          if (!cursor) {
            resolve(items);
            return;
          }
          items.push(cursor.value);

          if (count !== undefined && items.length == count) {
            resolve(items);
            return;
          }
          cursor.continue();
        });
      });
    };
  });

  var exp = {
    open: function(name, version, upgradeCallback) {
      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
      var request = p.request;

      request.onupgradeneeded = function(event) {
        if (upgradeCallback) {
          upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
        }
      };

      return p.then(function(db) {
        return new DB(db);
      });
    },
    delete: function(name) {
      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = exp;
    module.exports.default = module.exports;
  }
  else {
    self.idb = exp;
  }
}());

},{}],"/home/okpala/node-sites/headlines/public/js/main.js":[function(require,module,exports){
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



},{"idb":"/home/okpala/node-sites/headlines/node_modules/idb/lib/idb.js"}]},{},["/home/okpala/node-sites/headlines/public/js/main.js"])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJwdWJsaWMvanMvbWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIndXNlIHN0cmljdCc7XG5cbihmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gdG9BcnJheShhcnIpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeVJlcXVlc3QocmVxdWVzdCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlc29sdmUocmVxdWVzdC5yZXN1bHQpO1xuICAgICAgfTtcblxuICAgICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncykge1xuICAgIHZhciByZXF1ZXN0O1xuICAgIHZhciBwID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICByZXF1ZXN0ID0gb2JqW21ldGhvZF0uYXBwbHkob2JqLCBhcmdzKTtcbiAgICAgIHByb21pc2lmeVJlcXVlc3QocmVxdWVzdCkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgIH0pO1xuXG4gICAgcC5yZXF1ZXN0ID0gcmVxdWVzdDtcbiAgICByZXR1cm4gcDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeUN1cnNvclJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKSB7XG4gICAgdmFyIHAgPSBwcm9taXNpZnlSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncyk7XG4gICAgcmV0dXJuIHAudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgaWYgKCF2YWx1ZSkgcmV0dXJuO1xuICAgICAgcmV0dXJuIG5ldyBDdXJzb3IodmFsdWUsIHAucmVxdWVzdCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eVByb3BlcnRpZXMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUHJveHlDbGFzcy5wcm90b3R5cGUsIHByb3AsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICByZXR1cm4gdGhpc1t0YXJnZXRQcm9wXVtwcm9wXTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICB0aGlzW3RhcmdldFByb3BdW3Byb3BdID0gdmFsO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5UmVxdWVzdE1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdENhbGwodGhpc1t0YXJnZXRQcm9wXSwgcHJvcCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eU1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpc1t0YXJnZXRQcm9wXVtwcm9wXS5hcHBseSh0aGlzW3RhcmdldFByb3BdLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5Q3Vyc29yUmVxdWVzdENhbGwodGhpc1t0YXJnZXRQcm9wXSwgcHJvcCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBJbmRleChpbmRleCkge1xuICAgIHRoaXMuX2luZGV4ID0gaW5kZXg7XG4gIH1cblxuICBwcm94eVByb3BlcnRpZXMoSW5kZXgsICdfaW5kZXgnLCBbXG4gICAgJ25hbWUnLFxuICAgICdrZXlQYXRoJyxcbiAgICAnbXVsdGlFbnRyeScsXG4gICAgJ3VuaXF1ZSdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhJbmRleCwgJ19pbmRleCcsIElEQkluZGV4LCBbXG4gICAgJ2dldCcsXG4gICAgJ2dldEtleScsXG4gICAgJ2dldEFsbCcsXG4gICAgJ2dldEFsbEtleXMnLFxuICAgICdjb3VudCdcbiAgXSk7XG5cbiAgcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhJbmRleCwgJ19pbmRleCcsIElEQkluZGV4LCBbXG4gICAgJ29wZW5DdXJzb3InLFxuICAgICdvcGVuS2V5Q3Vyc29yJ1xuICBdKTtcblxuICBmdW5jdGlvbiBDdXJzb3IoY3Vyc29yLCByZXF1ZXN0KSB7XG4gICAgdGhpcy5fY3Vyc29yID0gY3Vyc29yO1xuICAgIHRoaXMuX3JlcXVlc3QgPSByZXF1ZXN0O1xuICB9XG5cbiAgcHJveHlQcm9wZXJ0aWVzKEN1cnNvciwgJ19jdXJzb3InLCBbXG4gICAgJ2RpcmVjdGlvbicsXG4gICAgJ2tleScsXG4gICAgJ3ByaW1hcnlLZXknLFxuICAgICd2YWx1ZSdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhDdXJzb3IsICdfY3Vyc29yJywgSURCQ3Vyc29yLCBbXG4gICAgJ3VwZGF0ZScsXG4gICAgJ2RlbGV0ZSdcbiAgXSk7XG5cbiAgLy8gcHJveHkgJ25leHQnIG1ldGhvZHNcbiAgWydhZHZhbmNlJywgJ2NvbnRpbnVlJywgJ2NvbnRpbnVlUHJpbWFyeUtleSddLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuICAgIGlmICghKG1ldGhvZE5hbWUgaW4gSURCQ3Vyc29yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICBDdXJzb3IucHJvdG90eXBlW21ldGhvZE5hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgY3Vyc29yID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGN1cnNvci5fY3Vyc29yW21ldGhvZE5hbWVdLmFwcGx5KGN1cnNvci5fY3Vyc29yLCBhcmdzKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3QoY3Vyc29yLl9yZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKCF2YWx1ZSkgcmV0dXJuO1xuICAgICAgICAgIHJldHVybiBuZXcgQ3Vyc29yKHZhbHVlLCBjdXJzb3IuX3JlcXVlc3QpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIE9iamVjdFN0b3JlKHN0b3JlKSB7XG4gICAgdGhpcy5fc3RvcmUgPSBzdG9yZTtcbiAgfVxuXG4gIE9iamVjdFN0b3JlLnByb3RvdHlwZS5jcmVhdGVJbmRleCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgSW5kZXgodGhpcy5fc3RvcmUuY3JlYXRlSW5kZXguYXBwbHkodGhpcy5fc3RvcmUsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIE9iamVjdFN0b3JlLnByb3RvdHlwZS5pbmRleCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgSW5kZXgodGhpcy5fc3RvcmUuaW5kZXguYXBwbHkodGhpcy5fc3RvcmUsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIFtcbiAgICAnbmFtZScsXG4gICAgJ2tleVBhdGgnLFxuICAgICdpbmRleE5hbWVzJyxcbiAgICAnYXV0b0luY3JlbWVudCdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ3B1dCcsXG4gICAgJ2FkZCcsXG4gICAgJ2RlbGV0ZScsXG4gICAgJ2NsZWFyJyxcbiAgICAnZ2V0JyxcbiAgICAnZ2V0QWxsJyxcbiAgICAnZ2V0S2V5JyxcbiAgICAnZ2V0QWxsS2V5cycsXG4gICAgJ2NvdW50J1xuICBdKTtcblxuICBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAnb3BlbkN1cnNvcicsXG4gICAgJ29wZW5LZXlDdXJzb3InXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ2RlbGV0ZUluZGV4J1xuICBdKTtcblxuICBmdW5jdGlvbiBUcmFuc2FjdGlvbihpZGJUcmFuc2FjdGlvbikge1xuICAgIHRoaXMuX3R4ID0gaWRiVHJhbnNhY3Rpb247XG4gICAgdGhpcy5jb21wbGV0ZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9O1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QoaWRiVHJhbnNhY3Rpb24uZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KGlkYlRyYW5zYWN0aW9uLmVycm9yKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBUcmFuc2FjdGlvbi5wcm90b3R5cGUub2JqZWN0U3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdFN0b3JlKHRoaXMuX3R4Lm9iamVjdFN0b3JlLmFwcGx5KHRoaXMuX3R4LCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoVHJhbnNhY3Rpb24sICdfdHgnLCBbXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnLFxuICAgICdtb2RlJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoVHJhbnNhY3Rpb24sICdfdHgnLCBJREJUcmFuc2FjdGlvbiwgW1xuICAgICdhYm9ydCdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gVXBncmFkZURCKGRiLCBvbGRWZXJzaW9uLCB0cmFuc2FjdGlvbikge1xuICAgIHRoaXMuX2RiID0gZGI7XG4gICAgdGhpcy5vbGRWZXJzaW9uID0gb2xkVmVyc2lvbjtcbiAgICB0aGlzLnRyYW5zYWN0aW9uID0gbmV3IFRyYW5zYWN0aW9uKHRyYW5zYWN0aW9uKTtcbiAgfVxuXG4gIFVwZ3JhZGVEQi5wcm90b3R5cGUuY3JlYXRlT2JqZWN0U3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdFN0b3JlKHRoaXMuX2RiLmNyZWF0ZU9iamVjdFN0b3JlLmFwcGx5KHRoaXMuX2RiLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoVXBncmFkZURCLCAnX2RiJywgW1xuICAgICduYW1lJyxcbiAgICAndmVyc2lvbicsXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhVcGdyYWRlREIsICdfZGInLCBJREJEYXRhYmFzZSwgW1xuICAgICdkZWxldGVPYmplY3RTdG9yZScsXG4gICAgJ2Nsb3NlJ1xuICBdKTtcblxuICBmdW5jdGlvbiBEQihkYikge1xuICAgIHRoaXMuX2RiID0gZGI7XG4gIH1cblxuICBEQi5wcm90b3R5cGUudHJhbnNhY3Rpb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IFRyYW5zYWN0aW9uKHRoaXMuX2RiLnRyYW5zYWN0aW9uLmFwcGx5KHRoaXMuX2RiLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoREIsICdfZGInLCBbXG4gICAgJ25hbWUnLFxuICAgICd2ZXJzaW9uJyxcbiAgICAnb2JqZWN0U3RvcmVOYW1lcydcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKERCLCAnX2RiJywgSURCRGF0YWJhc2UsIFtcbiAgICAnY2xvc2UnXG4gIF0pO1xuXG4gIC8vIEFkZCBjdXJzb3IgaXRlcmF0b3JzXG4gIC8vIFRPRE86IHJlbW92ZSB0aGlzIG9uY2UgYnJvd3NlcnMgZG8gdGhlIHJpZ2h0IHRoaW5nIHdpdGggcHJvbWlzZXNcbiAgWydvcGVuQ3Vyc29yJywgJ29wZW5LZXlDdXJzb3InXS5mb3JFYWNoKGZ1bmN0aW9uKGZ1bmNOYW1lKSB7XG4gICAgW09iamVjdFN0b3JlLCBJbmRleF0uZm9yRWFjaChmdW5jdGlvbihDb25zdHJ1Y3Rvcikge1xuICAgICAgQ29uc3RydWN0b3IucHJvdG90eXBlW2Z1bmNOYW1lLnJlcGxhY2UoJ29wZW4nLCAnaXRlcmF0ZScpXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuICAgICAgICB2YXIgbmF0aXZlT2JqZWN0ID0gdGhpcy5fc3RvcmUgfHwgdGhpcy5faW5kZXg7XG4gICAgICAgIHZhciByZXF1ZXN0ID0gbmF0aXZlT2JqZWN0W2Z1bmNOYW1lXS5hcHBseShuYXRpdmVPYmplY3QsIGFyZ3Muc2xpY2UoMCwgLTEpKTtcbiAgICAgICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICBjYWxsYmFjayhyZXF1ZXN0LnJlc3VsdCk7XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBwb2x5ZmlsbCBnZXRBbGxcbiAgW0luZGV4LCBPYmplY3RTdG9yZV0uZm9yRWFjaChmdW5jdGlvbihDb25zdHJ1Y3Rvcikge1xuICAgIGlmIChDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZ2V0QWxsKSByZXR1cm47XG4gICAgQ29uc3RydWN0b3IucHJvdG90eXBlLmdldEFsbCA9IGZ1bmN0aW9uKHF1ZXJ5LCBjb3VudCkge1xuICAgICAgdmFyIGluc3RhbmNlID0gdGhpcztcbiAgICAgIHZhciBpdGVtcyA9IFtdO1xuXG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSkge1xuICAgICAgICBpbnN0YW5jZS5pdGVyYXRlQ3Vyc29yKHF1ZXJ5LCBmdW5jdGlvbihjdXJzb3IpIHtcbiAgICAgICAgICBpZiAoIWN1cnNvcikge1xuICAgICAgICAgICAgcmVzb2x2ZShpdGVtcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGl0ZW1zLnB1c2goY3Vyc29yLnZhbHVlKTtcblxuICAgICAgICAgIGlmIChjb3VudCAhPT0gdW5kZWZpbmVkICYmIGl0ZW1zLmxlbmd0aCA9PSBjb3VudCkge1xuICAgICAgICAgICAgcmVzb2x2ZShpdGVtcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1cnNvci5jb250aW51ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIHZhciBleHAgPSB7XG4gICAgb3BlbjogZnVuY3Rpb24obmFtZSwgdmVyc2lvbiwgdXBncmFkZUNhbGxiYWNrKSB7XG4gICAgICB2YXIgcCA9IHByb21pc2lmeVJlcXVlc3RDYWxsKGluZGV4ZWREQiwgJ29wZW4nLCBbbmFtZSwgdmVyc2lvbl0pO1xuICAgICAgdmFyIHJlcXVlc3QgPSBwLnJlcXVlc3Q7XG5cbiAgICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgaWYgKHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgICAgIHVwZ3JhZGVDYWxsYmFjayhuZXcgVXBncmFkZURCKHJlcXVlc3QucmVzdWx0LCBldmVudC5vbGRWZXJzaW9uLCByZXF1ZXN0LnRyYW5zYWN0aW9uKSk7XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIHJldHVybiBwLnRoZW4oZnVuY3Rpb24oZGIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEQihkYik7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIGRlbGV0ZTogZnVuY3Rpb24obmFtZSkge1xuICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3RDYWxsKGluZGV4ZWREQiwgJ2RlbGV0ZURhdGFiYXNlJywgW25hbWVdKTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBleHA7XG4gICAgbW9kdWxlLmV4cG9ydHMuZGVmYXVsdCA9IG1vZHVsZS5leHBvcnRzO1xuICB9XG4gIGVsc2Uge1xuICAgIHNlbGYuaWRiID0gZXhwO1xuICB9XG59KCkpO1xuIiwidmFyIGlkYiA9IHJlcXVpcmUoJ2lkYicpXG5cbmNsYXNzIEhlYWRsaW5lcyB7XG4gICAgXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHZhciBzb3VyY2VzID0gW1xuICAgICAgICAgICAgJ3RlY2hjcnVuY2gnLCAnYWJjLW5ld3MnLCAnYWwtamF6ZWVyYS1lbmdsaXNoJywgJ2JiYy1uZXdzJywgJ2Jsb29tYmVyZycsXG4gICAgICAgICAgICAnY25uJywgJ2VzcG4nLCAnZ29vZ2xlLW5ld3MnLCAnbWV0cm8nLCAnbmV3czI0JywgJ3RoZS13YXNoaW5ndG9uLXBvc3QnLFxuICAgICAgICBdO1xuICAgICAgICB2YXIgY291bnRyaWVzID0gW1xuICAgICAgICAgICAgJ2FlJywgJ2FyJywgJ2F0JywgJ2F1JywgJ2JlJywgJ2JnJywgJ2JyJywgJ2NhJywgJ2NoJywgJ2NuJywgJ2NvJywgJ2N1JywgJ2N6JywgJ2RlJyxcbiAgICAgICAgICAgICdlZycsJ2ZyJywgJ2diJywgJ2dyJywgJ2hrJywgJ2h1JywgJ2lkJywgJ2llJywgJ2lsJywgJ2l0JywgJ2pwJywgJ2tyJywgJ2x0JywgJ2x2JywgXG4gICAgICAgICAgICAnbWEnLCdteCcsICdteScsICduZycsICdubCcsICdubycsICdueicsICdwaCcsICdwbCcsICdwdCcsICdybycsICdycycsICdydScsICdzYScsXG4gICAgICAgICAgICAnc2UnLCAnc2cnLCAnc2knLCAnc2snLCAndGgnLCAndHInLCAndHcnLCAndWEnLCAndXMnLCAndmUnLCAnemEnXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5wb3B1bGF0ZVNvdXJjZShzb3VyY2VzKVxuICAgICAgICB0aGlzLnBvcHVsYXRlQ291bnRyeShjb3VudHJpZXMpXG4gICAgICAgIHRoaXMub3BlbkRhdGFiYXNlKClcbiAgICAgICAgdGhpcy5yZWdpc3RlclNlcnZpY2VXb3JrZXIoKVxuICAgICAgICB0aGlzLnNob3dDYWNoZWRQb3N0cygpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBhcHAub3BlblNvY2tldCgpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmVnaXN0ZXJTZXJ2aWNlV29ya2VyKCkge1xuICAgICAgICBpZiAoJ3NlcnZpY2VXb3JrZXInIGluIG5hdmlnYXRvcikge1xuICAgICAgICAgICAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVnaXN0ZXIoJy9zdy5qcycpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlIHdvcmtlciBhbmQgSURCIHJlZ2lzdGVyZWQnKVxuICAgICAgICAgICAgfSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlIHdvcmtlciByZWdpc3RyYXRvbiBmYWlsZWQnLCBlcnJvcilcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgb2ZmbGluZSgpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvZmZsaW5lJywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1lvdSBhcmUgb2ZmbGluZScpXG4gICAgICAgIH0sIGZhbHNlKVxuICAgIH1cblxuICAgIG9ubGluZSgpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvbmxpbmUnLCBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgYWxlcnQoJ1lvdSBhcmUgb25saW5lJylcbiAgICAgICAgfSwgZmFsc2UpXG4gICAgfVxuXG4gICAgb3BlbkRhdGFiYXNlKCkge1xuICAgICAgICBpZiAoISBuYXZpZ2F0b3Iuc2VydmljZVdvcmtlcikgcmV0dXJuXG5cbiAgICAgICAgcmV0dXJuIGlkYi5vcGVuKCdoZWFkbGluZXMnLCAxLCBmdW5jdGlvbiAodXBncmFkZURiKSB7XG4gICAgICAgICAgICB2YXIgaGVhZGxpbmVTdG9yZSA9IHVwZ3JhZGVEYi5jcmVhdGVPYmplY3RTdG9yZSgncG9zdHMnLCB7XG4gICAgICAgICAgICAgICAga2V5UGF0aDogJ3B1Ymxpc2hlZEF0J1xuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgaGVhZGxpbmVTdG9yZS5jcmVhdGVJbmRleCgnYnktZGF0ZScsICdwdWJsaXNoZWRBdCcpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgc2hvd0NhY2hlZFBvc3RzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5vcGVuRGF0YWJhc2UoKS50aGVuKGZ1bmN0aW9uKGRiKSB7XG4gICAgICAgICAgICBpZiAoIWRiKSByZXR1cm5cbiAgICAgICAgICAgIGlmIChhcHAub25saW5lKCkpIHJldHVyblxuICAgIFxuICAgICAgICAgICAgdmFyIGluZGV4ID0gZGIudHJhbnNhY3Rpb24oJ3Bvc3RzJylcbiAgICAgICAgICAgIC5vYmplY3RTdG9yZSgncG9zdHMnKS5pbmRleCgnYnktZGF0ZScpXG5cbiAgICAgICAgICAgIHJldHVybiBpbmRleC5nZXRBbGwoKS50aGVuKChwb3N0cykgPT4ge1xuICAgICAgICAgICAgICAgIGFwcC5kaXNwbGF5UG9zdHMocG9zdHMucmV2ZXJzZSgpKVxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcm9tIEluZGV4ZWQgZGI6JywgcG9zdHMucmV2ZXJzZSgpKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyBNYWtlIGEgcmVxdWVzdCB0byB0aGUgbmV0d29ya1xuICAgIG9wZW5Tb2NrZXQoKSB7XG4gICAgICAgIGNvbnN0IEFQSV9LRVkgPSAnZDMxMTljNmJjNWRhNDFiMGIxNzJhN2Y3MTQ2NmEwNjMnXG4gICAgICAgIGNvbnN0IEJBU0VfVVJMID0gJ2h0dHBzOi8vbmV3c2FwaS5vcmcvdjIvJ1xuICAgICAgICBjb25zdCB1cmwgPSBgJHtCQVNFX1VSTH10b3AtaGVhZGxpbmVzP2NvdW50cnk9dXMmYXBpS2V5PSR7QVBJX0tFWX1gXG4gICAgICAgIHJldHVybiBmZXRjaCh1cmwpLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKVxuICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICAgIGlmIChkYXRhLnN0YXR1cyAhPSAnb2snKSByZXR1cm5cbiAgICAgICAgICAgIGFwcC5jYWNoZVBvc3RzKGRhdGEpIFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvcGVuU291cmNlU29ja2V0KHNvdXJjZSkge1xuICAgICAgICBjb25zdCBBUElfS0VZID0gJ2QzMTE5YzZiYzVkYTQxYjBiMTcyYTdmNzE0NjZhMDYzJ1xuICAgICAgICBjb25zdCBCQVNFX1VSTCA9ICdodHRwczovL25ld3NhcGkub3JnL3YyJ1xuICAgICAgICBjb25zdCB1cmwgPSBgJHtCQVNFX1VSTH0vdG9wLWhlYWRsaW5lcz9zb3VyY2VzPSR7c291cmNlfSZhcGlLZXk9JHtBUElfS0VZfWBcbiAgICAgICAgcmV0dXJuIGZldGNoKHVybCkudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4gICAgICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5zdGF0dXMgIT0gJ29rJykgcmV0dXJuXG4gICAgICAgICAgICAgICAgYXBwLmNhY2hlUG9zdHMoZGF0YSlcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9wZW5Db3VudHJ5U29ja2V0KGNvdW50cnkpIHtcbiAgICAgICAgY29uc3QgQVBJX0tFWSA9ICdkMzExOWM2YmM1ZGE0MWIwYjE3MmE3ZjcxNDY2YTA2MydcbiAgICAgICAgY29uc3QgQkFTRV9VUkwgPSAnaHR0cHM6Ly9uZXdzYXBpLm9yZy92MidcbiAgICAgICAgY29uc3QgdXJsID0gYCR7QkFTRV9VUkx9L3RvcC1oZWFkbGluZXM/Y291bnRyeT0ke2NvdW50cnl9JmFwaUtleT0ke0FQSV9LRVl9YFxuICAgICAgICByZXR1cm4gZmV0Y2godXJsKS50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLnN0YXR1cyAhPSAnb2snKSByZXR1cm5cbiAgICAgICAgICAgICAgICBhcHAuY2FjaGVQb3N0cyhkYXRhKVxuICAgICAgICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIGNhY2hlUG9zdHMoZGF0YSkge1xuICAgICAgICB2YXIgcG9zdHMgPSBkYXRhLmFydGljbGVzXG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5EYXRhYmFzZSgpLnRoZW4oZnVuY3Rpb24gKGRiKSB7XG4gICAgICAgICAgICBpZiAoIWRiKSByZXR1cm47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciB0eCA9IGRiLnRyYW5zYWN0aW9uKCdwb3N0cycsICdyZWFkd3JpdGUnKTtcbiAgICAgICAgICAgIHZhciBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKCdwb3N0cycpO1xuICAgICAgICAgICAgcG9zdHMuZm9yRWFjaChmdW5jdGlvbiAocG9zdCkge1xuICAgICAgICAgICAgICAgIHN0b3JlLnB1dChwb3N0KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnc2F2aW5nIHBvc3RzIHRvIGlkYicpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgc3RvcmUuaW5kZXgoJ2J5LWRhdGUnKS5vcGVuQ3Vyc29yKG51bGwsICdwcmV2JykudGhlbihmdW5jdGlvbihjdXJzb3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3Vyc29yLmFkdmFuY2UoMjApXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIGRlbGV0ZVBvc3RzKGN1cnNvcikge1xuICAgICAgICAgICAgICAgIGlmICghY3Vyc29yKSByZXR1cm5cbiAgICAgICAgICAgICAgICBjdXJzb3IuZGVsZXRlKClcbiAgICAgICAgICAgICAgICByZXR1cm4gY3Vyc29yLmNvbnRpbnVlKCkudGhlbihkZWxldGVQb3N0cyk7XG4gICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICBhcHAuZGlzcGxheVBvc3RzKGRhdGEuYXJ0aWNsZXMpXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRnJvbSB0aGUgU29ja2V0OicsIGRhdGEuYXJ0aWNsZXMpXG4gICAgICAgIH0pXG5cbiAgICB9XG5cbiAgICBwb3B1bGF0ZVNvdXJjZShzb3VyY2VzKSB7XG4gICAgICAgIHZhciBzZWxlY3RPcHRpb24gPSAnJ1xuICAgICAgICBzb3VyY2VzLmZvckVhY2goKHNvdXJjZSkgPT4ge1xuICAgICAgICAgICAgc2VsZWN0T3B0aW9uICs9IGA8b3B0aW9uPiR7c291cmNlfTwvb3B0aW9uPmBcbiAgICAgICAgfSlcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3NvdXJjZS1uYW1lcycpLmluc2VydEFkamFjZW50SFRNTCgnYmVmb3JlZW5kJywgc2VsZWN0T3B0aW9uKVxuICAgIH1cblxuICAgIHBvcHVsYXRlQ291bnRyeShjb3VudHJpZXMpIHtcbiAgICAgICAgdmFyIGNvdW50cnlPcHRpb24gPSAnJ1xuICAgICAgICBjb3VudHJpZXMuZm9yRWFjaCgoY291bnRyeSkgPT4ge1xuICAgICAgICAgICAgY291bnRyeU9wdGlvbiArPSBgPG9wdGlvbj4ke2NvdW50cnl9PC9vcHRpb24+YFxuICAgICAgICB9KVxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY291bnRyeS1uYW1lcycpLmluc2VydEFkamFjZW50SFRNTCgnYmVmb3JlZW5kJywgY291bnRyeU9wdGlvbilcbiAgICB9XG5cbiAgICBnZXRTb3VyY2VWYWx1ZSgpIHtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3NvdXJjZS1mb3JtJykuYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0JywgKGUpID0+IHtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICAgICAgY29uc3Qgc291cmNlID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcInNlbGVjdFtuYW1lPSdzb3VyY2UnXVwiKS5zZWxlY3RlZE9wdGlvbnNbMF0udmFsdWU7XG4gICAgICAgICAgICBhcHAub3BlblNvdXJjZVNvY2tldChzb3VyY2UpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgZGlzcGxheVBvc3RzKGRhdGEpIHtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSAnJ1xuICAgICAgICB2YXIgaGVhZGxpbmVzID0gZGF0YS5mb3JFYWNoKGhlYWRsaW5lID0+IHtcbiAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxkaXYgY2xhc3M9XCJjYXJkXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtbWVkaWFcIj5cbiAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9XCIke2hlYWRsaW5lLnVybFRvSW1hZ2V9XCIgYWx0PVwiSW1hZ2VcIj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1jb250ZW50XCI+XG4gICAgICAgICAgICAgICAgICAgIDxoMT48YSBocmVmPVwiJHtoZWFkbGluZS51cmx9XCIgdGFyZ2V0PVwiX2JsYW5rXCI+JHtoZWFkbGluZS50aXRsZX08L2E+PC9oMT5cbiAgICAgICAgICAgICAgICAgICAgPHA+JHtoZWFkbGluZS5kZXNjcmlwdGlvbn08L3A+XG4gICAgICAgICAgICAgICAgICAgIDxlbT5Tb3VyY2U6ICR7aGVhZGxpbmUuc291cmNlLm5hbWV9PC9lbT5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PmBcblxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBvc3RzJykuaW5uZXJIVE1MID0gY29udGVudFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgXG59XG5cbnZhciBhcHAgPSBuZXcgSGVhZGxpbmVzKClcblxuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3NvdXJjZS1mb3JtJykuYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0JywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICBjb25zdCBzb3VyY2UgPSBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwic2VsZWN0W25hbWU9J3NvdXJjZSddXCIpLnNlbGVjdGVkT3B0aW9uc1swXS52YWx1ZTtcbiAgICBhcHAub3BlblNvdXJjZVNvY2tldChzb3VyY2UpXG4gICAgY29uc29sZS5sb2coc291cmNlKVxufSlcblxuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NvdW50cnktZm9ybScpLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgY29uc3QgY291bnRyeSA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJzZWxlY3RbbmFtZT0nY291bnRyeSddXCIpLnNlbGVjdGVkT3B0aW9uc1swXS52YWx1ZTtcbiAgICBhcHAub3BlbkNvdW50cnlTb2NrZXQoY291bnRyeSlcbiAgICBjb25zb2xlLmxvZyhjb3VudHJ5KVxufSlcblxuXG4iXX0=
