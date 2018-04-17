(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
var idb = require('idb')
var pushNotification = require('./push')
var scroll = require('./scroll')

const API_KEY = 'd3119c6bc5da41b0b172a7f71466a063'
const BASE_URL = 'https://newsapi.org/v2/'


class Headlines {
    constructor() {
        var sources = [
            'techcrunch', 'abc-news', 'al-jazeera-english', 'bbc-news', 'bloomberg',
            'cnn', 'espn', 'google-news', 'metro', 'news24', 'the-washington-post',
        ]

        var countries = [
            'ae', 'ar', 'at', 'au', 'be', 'bg', 'br', 'ca', 'ch', 'cn', 'co', 'cu', 'cz', 'de',
            'eg', 'fr', 'gb', 'gr', 'hk', 'hu', 'id', 'ie', 'il', 'it', 'jp', 'kr', 'lt', 'lv',
            'ma', 'mx', 'my', 'ng', 'nl', 'no', 'nz', 'ph', 'pl', 'pt', 'ro', 'rs', 'ru', 'sa',
            'se', 'sg', 'si', 'sk', 'th', 'tr', 'tw', 'ua', 'us', 've', 'za'
        ]     
        this.populateFilters(sources, countries)
        this.openDatabase()
        this.registerServiceWorker()
        this.cacheFirstStrategy()
        this.mainSocketControl()
    }

    /* Register a Service Worker */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(reg => {
                console.log('Service worker and Push Registered', reg)
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
            console.log('You are online')
        }, false)
    }

    /* Open a database, create an objectStore and an Index */
    openDatabase() {
        if (! navigator.serviceWorker) return

        return idb.open('headlines', 1, function (upgradeDb) {
            var headlineStore = upgradeDb.createObjectStore('posts', {
                keyPath: 'publishedAt'
            })

            headlineStore.createIndex('by-date', 'publishedAt')
        })
    }

    /* Show cached posts */
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

    /* Return posts from the cache first before the network */
    cacheFirstStrategy() {
        this.showCachedPosts().then(() => { app.openSocket() })
    }

    mainSocketControl() {
        setInterval(function() {
            app.showCachedPosts()
                .then(app.openSocket())
        }, 60000)
    }

    // Make a request to the network
    openSocket() {
        const url = `${BASE_URL}top-headlines?country=us&apiKey=${API_KEY}`
        return fetch(url).then(response => response.json())
        .then(data => {
            if (data.status != 'ok') return
            app.cachePosts(data) 
        });
    }

    /* Makes a request based on the source chosen */
    openSourceSocket(source) {
        const url = `${BASE_URL}/top-headlines?sources=${source}&apiKey=${API_KEY}`
        return fetch(url).then(response => response.json())
            .then(data => {
                if (data.status != 'ok') return
                app.cachePosts(data)
            });
    }

    /* Makes a request based on the country chosen */
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
    
    /* Cache posts from the network */
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
            
            /* Delete old posts and keep the 20 most recent posts */
            store.index('by-date').openCursor(null, 'prev').then(function(cursor) {
                return cursor.advance(20)
            }).then(function deletePosts(cursor) {
                if (!cursor) return
                cursor.delete()
                return cursor.continue().then(deletePosts);
            })
            
            app.sendPushNotification()
                .then(app.displayPosts(data.articles))
                    console.log('From the Socket:', data.articles)
        })
    }
    
    /* sending push through to the user */
    sendPushNotification () {
        if (! navigator.serviceWorker) return
        
        return navigator.serviceWorker.ready
            .then(function (registration) {
                registration.pushManager.getSubscription()
                    .then(function (subscription) {
                        //If already access granted, send the push notification
                        if (subscription) {
                            setTimeout(() => {
                                fetch('http://localhost:3333/api/notify', {
                                    method: 'POST'
                                })
                                .then(() => {
                                    console.log('dispatched the notification')
                                })
                            }, 10000)
                        }
                        else {
                            return false
                        }
                    })
                })        
    }

    /* Populate the sources filter */
    populateSource(sources) {
        var selectOption = ''
        sources.forEach((source) => {
            selectOption += `<option>${source}</option>`
        })
        document.querySelector('#source-names').insertAdjacentHTML('beforeend', selectOption)
    }

    /* Populate the country filter */
    populateCountry(countries) {
        var countryOption = ''
        countries.forEach((country) => {
            countryOption += `<option>${country}</option>`
        })
        document.querySelector('#country-names').insertAdjacentHTML('beforeend', countryOption)
    }

    populateFilters(sources, countries) {
        this.populateSource(sources)
        this.populateCountry(countries)
    }

    /* Display Headlines */
    displayPosts(data) {
        var content = ''
        var headlines = data.forEach(headline => {
            content += `<div class="card">
                <div class="card-media">
                    <img src="${headline.urlToImage}" alt="Image">
                </div>
                <div class="card-content">
                    <h2><a href="${headline.url}" target="_blank">${headline.title}</a></h2>
                    <p>${headline.description}</p>
                    <em>Source: ${headline.source.name}</em>
                </div>
            </div>`

            document.querySelector('.posts').innerHTML = content
        });
    }
    
}

var app = new Headlines()

/* Listen for a click event from the source filter and open a socket */
document.querySelector('#source-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const source = e.target.querySelector("select[name='source']").selectedOptions[0].value;
    app.openSourceSocket(source)
    console.log(source)
})

/* Listen for a click event from the country filter and open a socket */
document.querySelector('#country-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const country = e.target.querySelector("select[name='country']").selectedOptions[0].value;
    app.openCountrySocket(country)
    console.log(country)
})

},{"./push":3,"./scroll":4,"idb":1}],3:[function(require,module,exports){
(function (window) {
    'use strict';

    //Push notification button
    var fabPushElement = document.querySelector('#push-btn');

    //To check `push notification` is supported or not
    function isPushSupported() {
        //To check `push notification` permission is denied by user
        if (Notification.permission === 'denied') {
            alert('User has blocked push notification.');
            return;
        }

        //Check `push notification` is supported or not
        if (!('PushManager' in window)) {
            alert('Sorry, Push notification isn\'t supported in your browser.');
            return;
        }

        //Get `push notification` subscription
        //If `serviceWorker` is registered and ready
        navigator.serviceWorker.ready
            .then(function (registration) {
                registration.pushManager.getSubscription()
                    .then(function (subscription) {
                        //If already access granted, enable push button status
                        if (subscription) {
                            console.log('User subscribed for push already')
                        }
                        else {
                            subscribePush();
                            // changePushStatus(false);
                            // setTimeout(function() {
                            // }, 300000)
                        }
                    })
                    .catch(function (error) {
                        console.error('Error occurred while enabling push ', error);
                    });
            });
    }

    // Ask User if he/she wants to subscribe to push notifications and then
    // ..subscribe and send push notification
    function subscribePush() {
        navigator.serviceWorker.ready.then(function (registration) {
            if (!registration.pushManager) {
                alert('Your browser doesn\'t support push notification.');
                return false;
            }

            //To subscribe `push notification` from push manager
            registration.pushManager.subscribe({
                userVisibleOnly: true //Always show notification when received
            })
                .then(function (subscription) {
                    console.info('Push notification subscribed.');
                    console.log(subscription);
                    saveSubscriptionID(subscription);
                    changePushStatus(true);
                })
                .catch(function (error) {
                    changePushStatus(false);
                    console.error('Push notification subscription error: ', error);
                });
        })
    }

    // Unsubscribe the user from push notifications
    function unsubscribePush() {
        navigator.serviceWorker.ready
            .then(function (registration) {
                //Get `push subscription`
                registration.pushManager.getSubscription()
                    .then(function (subscription) {
                        //If no `push subscription`, then return
                        if (!subscription) {
                            alert('Unable to unregister push notification.');
                            return;
                        }

                        //Unsubscribe `push notification`
                        subscription.unsubscribe()
                            .then(function () {
                                console.info('Push notification unsubscribed.');
                                console.log(subscription);
                                deleteSubscriptionID(subscription);
                                changePushStatus(false);
                            })
                            .catch(function (error) {
                                console.error(error);
                            });
                    })
                    .catch(function (error) {
                        console.error('Failed to unsubscribe push notification.');
                    });
            })
    }

    //To change status
    function changePushStatus(status) {
        if (status) {
            fabPushElement.classList.add('active');
        }
        else {
            fabPushElement.classList.remove('active');
        }
    }

    function saveSubscriptionID(subscription) {
        var subscription_id = subscription.endpoint.split('gcm/send/')[1];

        console.log("Subscription ID", subscription_id);

        fetch('http://localhost:3333/api/users', {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: subscription_id })
        });
    }

    function deleteSubscriptionID(subscription) {
        var subscription_id = subscription.endpoint.split('gcm/send/')[1];

        fetch('http://localhost:3333/api/user/' + subscription_id, {
            method: 'delete',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
    }

    // Click event for subscribe push
    // fabPushElement.addEventListener('click', function () {
    //     var isSubscribed = (fabPushElement.classList.contains('active'));
    //     if (isSubscribed) {
    //         unsubscribePush();
    //     }
    //     else {
    //         subscribePush();
    //     }
    // });

    setTimeout(function() {
        isPushSupported(); //Check for push notification support
    }, 120000)

})(window);


},{}],4:[function(require,module,exports){
(function(window) {
    window.onscroll = function () {
        scrollFunction()
    }

    function scrollFunction() {
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            document.querySelector('.scroll').style.display = "block"
        }
        else {
            document.querySelector('.scroll').style.display = "none"
        }
    }

    document.querySelector('.scroll').addEventListener('click', function () {
        document.body.scrollTop = 0;

        document.documentElement.scrollTop = 0;
    })
})(window)
},{}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJwdWJsaWMvanMvbWFpbi5qcyIsInB1YmxpYy9qcy9wdXNoLmpzIiwicHVibGljL2pzL3Njcm9sbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9PQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiJ3VzZSBzdHJpY3QnO1xuXG4oZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIHRvQXJyYXkoYXJyKSB7XG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycik7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlSZXF1ZXN0KHJlcXVlc3QpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlKHJlcXVlc3QucmVzdWx0KTtcbiAgICAgIH07XG5cbiAgICAgIHJlcXVlc3Qub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5UmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpIHtcbiAgICB2YXIgcmVxdWVzdDtcbiAgICB2YXIgcCA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgcmVxdWVzdCA9IG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJncyk7XG4gICAgICBwcm9taXNpZnlSZXF1ZXN0KHJlcXVlc3QpLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICB9KTtcblxuICAgIHAucmVxdWVzdCA9IHJlcXVlc3Q7XG4gICAgcmV0dXJuIHA7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlDdXJzb3JSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncykge1xuICAgIHZhciBwID0gcHJvbWlzaWZ5UmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpO1xuICAgIHJldHVybiBwLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmICghdmFsdWUpIHJldHVybjtcbiAgICAgIHJldHVybiBuZXcgQ3Vyc29yKHZhbHVlLCBwLnJlcXVlc3QpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlQcm9wZXJ0aWVzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFByb3h5Q2xhc3MucHJvdG90eXBlLCBwcm9wLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF07XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdGhpc1t0YXJnZXRQcm9wXVtwcm9wXSA9IHZhbDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eVJlcXVlc3RNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3RDYWxsKHRoaXNbdGFyZ2V0UHJvcF0sIHByb3AsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF0uYXBwbHkodGhpc1t0YXJnZXRQcm9wXSwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeUN1cnNvclJlcXVlc3RDYWxsKHRoaXNbdGFyZ2V0UHJvcF0sIHByb3AsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gSW5kZXgoaW5kZXgpIHtcbiAgICB0aGlzLl9pbmRleCA9IGluZGV4O1xuICB9XG5cbiAgcHJveHlQcm9wZXJ0aWVzKEluZGV4LCAnX2luZGV4JywgW1xuICAgICduYW1lJyxcbiAgICAna2V5UGF0aCcsXG4gICAgJ211bHRpRW50cnknLFxuICAgICd1bmlxdWUnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoSW5kZXgsICdfaW5kZXgnLCBJREJJbmRleCwgW1xuICAgICdnZXQnLFxuICAgICdnZXRLZXknLFxuICAgICdnZXRBbGwnLFxuICAgICdnZXRBbGxLZXlzJyxcbiAgICAnY291bnQnXG4gIF0pO1xuXG4gIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoSW5kZXgsICdfaW5kZXgnLCBJREJJbmRleCwgW1xuICAgICdvcGVuQ3Vyc29yJyxcbiAgICAnb3BlbktleUN1cnNvcidcbiAgXSk7XG5cbiAgZnVuY3Rpb24gQ3Vyc29yKGN1cnNvciwgcmVxdWVzdCkge1xuICAgIHRoaXMuX2N1cnNvciA9IGN1cnNvcjtcbiAgICB0aGlzLl9yZXF1ZXN0ID0gcmVxdWVzdDtcbiAgfVxuXG4gIHByb3h5UHJvcGVydGllcyhDdXJzb3IsICdfY3Vyc29yJywgW1xuICAgICdkaXJlY3Rpb24nLFxuICAgICdrZXknLFxuICAgICdwcmltYXJ5S2V5JyxcbiAgICAndmFsdWUnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoQ3Vyc29yLCAnX2N1cnNvcicsIElEQkN1cnNvciwgW1xuICAgICd1cGRhdGUnLFxuICAgICdkZWxldGUnXG4gIF0pO1xuXG4gIC8vIHByb3h5ICduZXh0JyBtZXRob2RzXG4gIFsnYWR2YW5jZScsICdjb250aW51ZScsICdjb250aW51ZVByaW1hcnlLZXknXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcbiAgICBpZiAoIShtZXRob2ROYW1lIGluIElEQkN1cnNvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgQ3Vyc29yLnByb3RvdHlwZVttZXRob2ROYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGN1cnNvciA9IHRoaXM7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBjdXJzb3IuX2N1cnNvclttZXRob2ROYW1lXS5hcHBseShjdXJzb3IuX2N1cnNvciwgYXJncyk7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0KGN1cnNvci5fcmVxdWVzdCkudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGlmICghdmFsdWUpIHJldHVybjtcbiAgICAgICAgICByZXR1cm4gbmV3IEN1cnNvcih2YWx1ZSwgY3Vyc29yLl9yZXF1ZXN0KTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICBmdW5jdGlvbiBPYmplY3RTdG9yZShzdG9yZSkge1xuICAgIHRoaXMuX3N0b3JlID0gc3RvcmU7XG4gIH1cblxuICBPYmplY3RTdG9yZS5wcm90b3R5cGUuY3JlYXRlSW5kZXggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IEluZGV4KHRoaXMuX3N0b3JlLmNyZWF0ZUluZGV4LmFwcGx5KHRoaXMuX3N0b3JlLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBPYmplY3RTdG9yZS5wcm90b3R5cGUuaW5kZXggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IEluZGV4KHRoaXMuX3N0b3JlLmluZGV4LmFwcGx5KHRoaXMuX3N0b3JlLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBbXG4gICAgJ25hbWUnLFxuICAgICdrZXlQYXRoJyxcbiAgICAnaW5kZXhOYW1lcycsXG4gICAgJ2F1dG9JbmNyZW1lbnQnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdwdXQnLFxuICAgICdhZGQnLFxuICAgICdkZWxldGUnLFxuICAgICdjbGVhcicsXG4gICAgJ2dldCcsXG4gICAgJ2dldEFsbCcsXG4gICAgJ2dldEtleScsXG4gICAgJ2dldEFsbEtleXMnLFxuICAgICdjb3VudCdcbiAgXSk7XG5cbiAgcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ29wZW5DdXJzb3InLFxuICAgICdvcGVuS2V5Q3Vyc29yJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdkZWxldGVJbmRleCdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gVHJhbnNhY3Rpb24oaWRiVHJhbnNhY3Rpb24pIHtcbiAgICB0aGlzLl90eCA9IGlkYlRyYW5zYWN0aW9uO1xuICAgIHRoaXMuY29tcGxldGUgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfTtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KGlkYlRyYW5zYWN0aW9uLmVycm9yKTtcbiAgICAgIH07XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmFib3J0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChpZGJUcmFuc2FjdGlvbi5lcnJvcik7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgVHJhbnNhY3Rpb24ucHJvdG90eXBlLm9iamVjdFN0b3JlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBPYmplY3RTdG9yZSh0aGlzLl90eC5vYmplY3RTdG9yZS5hcHBseSh0aGlzLl90eCwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKFRyYW5zYWN0aW9uLCAnX3R4JywgW1xuICAgICdvYmplY3RTdG9yZU5hbWVzJyxcbiAgICAnbW9kZSdcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKFRyYW5zYWN0aW9uLCAnX3R4JywgSURCVHJhbnNhY3Rpb24sIFtcbiAgICAnYWJvcnQnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIFVwZ3JhZGVEQihkYiwgb2xkVmVyc2lvbiwgdHJhbnNhY3Rpb24pIHtcbiAgICB0aGlzLl9kYiA9IGRiO1xuICAgIHRoaXMub2xkVmVyc2lvbiA9IG9sZFZlcnNpb247XG4gICAgdGhpcy50cmFuc2FjdGlvbiA9IG5ldyBUcmFuc2FjdGlvbih0cmFuc2FjdGlvbik7XG4gIH1cblxuICBVcGdyYWRlREIucHJvdG90eXBlLmNyZWF0ZU9iamVjdFN0b3JlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBPYmplY3RTdG9yZSh0aGlzLl9kYi5jcmVhdGVPYmplY3RTdG9yZS5hcHBseSh0aGlzLl9kYiwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKFVwZ3JhZGVEQiwgJ19kYicsIFtcbiAgICAnbmFtZScsXG4gICAgJ3ZlcnNpb24nLFxuICAgICdvYmplY3RTdG9yZU5hbWVzJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoVXBncmFkZURCLCAnX2RiJywgSURCRGF0YWJhc2UsIFtcbiAgICAnZGVsZXRlT2JqZWN0U3RvcmUnLFxuICAgICdjbG9zZSdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gREIoZGIpIHtcbiAgICB0aGlzLl9kYiA9IGRiO1xuICB9XG5cbiAgREIucHJvdG90eXBlLnRyYW5zYWN0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBUcmFuc2FjdGlvbih0aGlzLl9kYi50cmFuc2FjdGlvbi5hcHBseSh0aGlzLl9kYiwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKERCLCAnX2RiJywgW1xuICAgICduYW1lJyxcbiAgICAndmVyc2lvbicsXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhEQiwgJ19kYicsIElEQkRhdGFiYXNlLCBbXG4gICAgJ2Nsb3NlJ1xuICBdKTtcblxuICAvLyBBZGQgY3Vyc29yIGl0ZXJhdG9yc1xuICAvLyBUT0RPOiByZW1vdmUgdGhpcyBvbmNlIGJyb3dzZXJzIGRvIHRoZSByaWdodCB0aGluZyB3aXRoIHByb21pc2VzXG4gIFsnb3BlbkN1cnNvcicsICdvcGVuS2V5Q3Vyc29yJ10uZm9yRWFjaChmdW5jdGlvbihmdW5jTmFtZSkge1xuICAgIFtPYmplY3RTdG9yZSwgSW5kZXhdLmZvckVhY2goZnVuY3Rpb24oQ29uc3RydWN0b3IpIHtcbiAgICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZVtmdW5jTmFtZS5yZXBsYWNlKCdvcGVuJywgJ2l0ZXJhdGUnKV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICAgICAgdmFyIG5hdGl2ZU9iamVjdCA9IHRoaXMuX3N0b3JlIHx8IHRoaXMuX2luZGV4O1xuICAgICAgICB2YXIgcmVxdWVzdCA9IG5hdGl2ZU9iamVjdFtmdW5jTmFtZV0uYXBwbHkobmF0aXZlT2JqZWN0LCBhcmdzLnNsaWNlKDAsIC0xKSk7XG4gICAgICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgY2FsbGJhY2socmVxdWVzdC5yZXN1bHQpO1xuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gcG9seWZpbGwgZ2V0QWxsXG4gIFtJbmRleCwgT2JqZWN0U3RvcmVdLmZvckVhY2goZnVuY3Rpb24oQ29uc3RydWN0b3IpIHtcbiAgICBpZiAoQ29uc3RydWN0b3IucHJvdG90eXBlLmdldEFsbCkgcmV0dXJuO1xuICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZS5nZXRBbGwgPSBmdW5jdGlvbihxdWVyeSwgY291bnQpIHtcbiAgICAgIHZhciBpbnN0YW5jZSA9IHRoaXM7XG4gICAgICB2YXIgaXRlbXMgPSBbXTtcblxuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUpIHtcbiAgICAgICAgaW5zdGFuY2UuaXRlcmF0ZUN1cnNvcihxdWVyeSwgZnVuY3Rpb24oY3Vyc29yKSB7XG4gICAgICAgICAgaWYgKCFjdXJzb3IpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpdGVtcy5wdXNoKGN1cnNvci52YWx1ZSk7XG5cbiAgICAgICAgICBpZiAoY291bnQgIT09IHVuZGVmaW5lZCAmJiBpdGVtcy5sZW5ndGggPT0gY291bnQpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjdXJzb3IuY29udGludWUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICB2YXIgZXhwID0ge1xuICAgIG9wZW46IGZ1bmN0aW9uKG5hbWUsIHZlcnNpb24sIHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgdmFyIHAgPSBwcm9taXNpZnlSZXF1ZXN0Q2FsbChpbmRleGVkREIsICdvcGVuJywgW25hbWUsIHZlcnNpb25dKTtcbiAgICAgIHZhciByZXF1ZXN0ID0gcC5yZXF1ZXN0O1xuXG4gICAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIGlmICh1cGdyYWRlQ2FsbGJhY2spIHtcbiAgICAgICAgICB1cGdyYWRlQ2FsbGJhY2sobmV3IFVwZ3JhZGVEQihyZXF1ZXN0LnJlc3VsdCwgZXZlbnQub2xkVmVyc2lvbiwgcmVxdWVzdC50cmFuc2FjdGlvbikpO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gcC50aGVuKGZ1bmN0aW9uKGRiKSB7XG4gICAgICAgIHJldHVybiBuZXcgREIoZGIpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBkZWxldGU6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0Q2FsbChpbmRleGVkREIsICdkZWxldGVEYXRhYmFzZScsIFtuYW1lXSk7XG4gICAgfVxuICB9O1xuXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZXhwO1xuICAgIG1vZHVsZS5leHBvcnRzLmRlZmF1bHQgPSBtb2R1bGUuZXhwb3J0cztcbiAgfVxuICBlbHNlIHtcbiAgICBzZWxmLmlkYiA9IGV4cDtcbiAgfVxufSgpKTtcbiIsInZhciBpZGIgPSByZXF1aXJlKCdpZGInKVxudmFyIHB1c2hOb3RpZmljYXRpb24gPSByZXF1aXJlKCcuL3B1c2gnKVxudmFyIHNjcm9sbCA9IHJlcXVpcmUoJy4vc2Nyb2xsJylcblxuY29uc3QgQVBJX0tFWSA9ICdkMzExOWM2YmM1ZGE0MWIwYjE3MmE3ZjcxNDY2YTA2MydcbmNvbnN0IEJBU0VfVVJMID0gJ2h0dHBzOi8vbmV3c2FwaS5vcmcvdjIvJ1xuXG5cbmNsYXNzIEhlYWRsaW5lcyB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHZhciBzb3VyY2VzID0gW1xuICAgICAgICAgICAgJ3RlY2hjcnVuY2gnLCAnYWJjLW5ld3MnLCAnYWwtamF6ZWVyYS1lbmdsaXNoJywgJ2JiYy1uZXdzJywgJ2Jsb29tYmVyZycsXG4gICAgICAgICAgICAnY25uJywgJ2VzcG4nLCAnZ29vZ2xlLW5ld3MnLCAnbWV0cm8nLCAnbmV3czI0JywgJ3RoZS13YXNoaW5ndG9uLXBvc3QnLFxuICAgICAgICBdXG5cbiAgICAgICAgdmFyIGNvdW50cmllcyA9IFtcbiAgICAgICAgICAgICdhZScsICdhcicsICdhdCcsICdhdScsICdiZScsICdiZycsICdicicsICdjYScsICdjaCcsICdjbicsICdjbycsICdjdScsICdjeicsICdkZScsXG4gICAgICAgICAgICAnZWcnLCAnZnInLCAnZ2InLCAnZ3InLCAnaGsnLCAnaHUnLCAnaWQnLCAnaWUnLCAnaWwnLCAnaXQnLCAnanAnLCAna3InLCAnbHQnLCAnbHYnLFxuICAgICAgICAgICAgJ21hJywgJ214JywgJ215JywgJ25nJywgJ25sJywgJ25vJywgJ256JywgJ3BoJywgJ3BsJywgJ3B0JywgJ3JvJywgJ3JzJywgJ3J1JywgJ3NhJyxcbiAgICAgICAgICAgICdzZScsICdzZycsICdzaScsICdzaycsICd0aCcsICd0cicsICd0dycsICd1YScsICd1cycsICd2ZScsICd6YSdcbiAgICAgICAgXSAgICAgXG4gICAgICAgIHRoaXMucG9wdWxhdGVGaWx0ZXJzKHNvdXJjZXMsIGNvdW50cmllcylcbiAgICAgICAgdGhpcy5vcGVuRGF0YWJhc2UoKVxuICAgICAgICB0aGlzLnJlZ2lzdGVyU2VydmljZVdvcmtlcigpXG4gICAgICAgIHRoaXMuY2FjaGVGaXJzdFN0cmF0ZWd5KClcbiAgICAgICAgdGhpcy5tYWluU29ja2V0Q29udHJvbCgpXG4gICAgfVxuXG4gICAgLyogUmVnaXN0ZXIgYSBTZXJ2aWNlIFdvcmtlciAqL1xuICAgIHJlZ2lzdGVyU2VydmljZVdvcmtlcigpIHtcbiAgICAgICAgaWYgKCdzZXJ2aWNlV29ya2VyJyBpbiBuYXZpZ2F0b3IpIHtcbiAgICAgICAgICAgIG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlZ2lzdGVyKCcvc3cuanMnKS50aGVuKHJlZyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1NlcnZpY2Ugd29ya2VyIGFuZCBQdXNoIFJlZ2lzdGVyZWQnLCByZWcpXG4gICAgICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1NlcnZpY2Ugd29ya2VyIHJlZ2lzdHJhdG9uIGZhaWxlZCcsIGVycm9yKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBvZmZsaW5lKCkge1xuICAgICAgICByZXR1cm4gd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ29mZmxpbmUnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnWW91IGFyZSBvZmZsaW5lJylcbiAgICAgICAgfSwgZmFsc2UpXG4gICAgfVxuXG4gICAgb25saW5lKCkge1xuICAgICAgICByZXR1cm4gd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ29ubGluZScsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnWW91IGFyZSBvbmxpbmUnKVxuICAgICAgICB9LCBmYWxzZSlcbiAgICB9XG5cbiAgICAvKiBPcGVuIGEgZGF0YWJhc2UsIGNyZWF0ZSBhbiBvYmplY3RTdG9yZSBhbmQgYW4gSW5kZXggKi9cbiAgICBvcGVuRGF0YWJhc2UoKSB7XG4gICAgICAgIGlmICghIG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyKSByZXR1cm5cblxuICAgICAgICByZXR1cm4gaWRiLm9wZW4oJ2hlYWRsaW5lcycsIDEsIGZ1bmN0aW9uICh1cGdyYWRlRGIpIHtcbiAgICAgICAgICAgIHZhciBoZWFkbGluZVN0b3JlID0gdXBncmFkZURiLmNyZWF0ZU9iamVjdFN0b3JlKCdwb3N0cycsIHtcbiAgICAgICAgICAgICAgICBrZXlQYXRoOiAncHVibGlzaGVkQXQnXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICBoZWFkbGluZVN0b3JlLmNyZWF0ZUluZGV4KCdieS1kYXRlJywgJ3B1Ymxpc2hlZEF0JylcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICAvKiBTaG93IGNhY2hlZCBwb3N0cyAqL1xuICAgIHNob3dDYWNoZWRQb3N0cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMub3BlbkRhdGFiYXNlKCkudGhlbihmdW5jdGlvbihkYikge1xuICAgICAgICAgICAgaWYgKCFkYikgcmV0dXJuXG4gICAgICAgICAgICBpZiAoYXBwLm9ubGluZSgpKSByZXR1cm5cbiAgICBcbiAgICAgICAgICAgIHZhciBpbmRleCA9IGRiLnRyYW5zYWN0aW9uKCdwb3N0cycpXG4gICAgICAgICAgICAub2JqZWN0U3RvcmUoJ3Bvc3RzJykuaW5kZXgoJ2J5LWRhdGUnKVxuXG4gICAgICAgICAgICByZXR1cm4gaW5kZXguZ2V0QWxsKCkudGhlbigocG9zdHMpID0+IHtcbiAgICAgICAgICAgICAgICBhcHAuZGlzcGxheVBvc3RzKHBvc3RzLnJldmVyc2UoKSlcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJvbSBJbmRleGVkIGRiOicsIHBvc3RzLnJldmVyc2UoKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgLyogUmV0dXJuIHBvc3RzIGZyb20gdGhlIGNhY2hlIGZpcnN0IGJlZm9yZSB0aGUgbmV0d29yayAqL1xuICAgIGNhY2hlRmlyc3RTdHJhdGVneSgpIHtcbiAgICAgICAgdGhpcy5zaG93Q2FjaGVkUG9zdHMoKS50aGVuKCgpID0+IHsgYXBwLm9wZW5Tb2NrZXQoKSB9KVxuICAgIH1cblxuICAgIG1haW5Tb2NrZXRDb250cm9sKCkge1xuICAgICAgICBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGFwcC5zaG93Q2FjaGVkUG9zdHMoKVxuICAgICAgICAgICAgICAgIC50aGVuKGFwcC5vcGVuU29ja2V0KCkpXG4gICAgICAgIH0sIDYwMDAwKVxuICAgIH1cblxuICAgIC8vIE1ha2UgYSByZXF1ZXN0IHRvIHRoZSBuZXR3b3JrXG4gICAgb3BlblNvY2tldCgpIHtcbiAgICAgICAgY29uc3QgdXJsID0gYCR7QkFTRV9VUkx9dG9wLWhlYWRsaW5lcz9jb3VudHJ5PXVzJmFwaUtleT0ke0FQSV9LRVl9YFxuICAgICAgICByZXR1cm4gZmV0Y2godXJsKS50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgICBpZiAoZGF0YS5zdGF0dXMgIT0gJ29rJykgcmV0dXJuXG4gICAgICAgICAgICBhcHAuY2FjaGVQb3N0cyhkYXRhKSBcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyogTWFrZXMgYSByZXF1ZXN0IGJhc2VkIG9uIHRoZSBzb3VyY2UgY2hvc2VuICovXG4gICAgb3BlblNvdXJjZVNvY2tldChzb3VyY2UpIHtcbiAgICAgICAgY29uc3QgdXJsID0gYCR7QkFTRV9VUkx9L3RvcC1oZWFkbGluZXM/c291cmNlcz0ke3NvdXJjZX0mYXBpS2V5PSR7QVBJX0tFWX1gXG4gICAgICAgIHJldHVybiBmZXRjaCh1cmwpLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKVxuICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuc3RhdHVzICE9ICdvaycpIHJldHVyblxuICAgICAgICAgICAgICAgIGFwcC5jYWNoZVBvc3RzKGRhdGEpXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKiBNYWtlcyBhIHJlcXVlc3QgYmFzZWQgb24gdGhlIGNvdW50cnkgY2hvc2VuICovXG4gICAgb3BlbkNvdW50cnlTb2NrZXQoY291bnRyeSkge1xuICAgICAgICBjb25zdCBBUElfS0VZID0gJ2QzMTE5YzZiYzVkYTQxYjBiMTcyYTdmNzE0NjZhMDYzJ1xuICAgICAgICBjb25zdCBCQVNFX1VSTCA9ICdodHRwczovL25ld3NhcGkub3JnL3YyJ1xuICAgICAgICBjb25zdCB1cmwgPSBgJHtCQVNFX1VSTH0vdG9wLWhlYWRsaW5lcz9jb3VudHJ5PSR7Y291bnRyeX0mYXBpS2V5PSR7QVBJX0tFWX1gXG4gICAgICAgIHJldHVybiBmZXRjaCh1cmwpLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKVxuICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuc3RhdHVzICE9ICdvaycpIHJldHVyblxuICAgICAgICAgICAgICAgIGFwcC5jYWNoZVBvc3RzKGRhdGEpXG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLyogQ2FjaGUgcG9zdHMgZnJvbSB0aGUgbmV0d29yayAqL1xuICAgIGNhY2hlUG9zdHMoZGF0YSkge1xuICAgICAgICB2YXIgcG9zdHMgPSBkYXRhLmFydGljbGVzXG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5EYXRhYmFzZSgpLnRoZW4oZnVuY3Rpb24gKGRiKSB7XG4gICAgICAgICAgICBpZiAoIWRiKSByZXR1cm47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciB0eCA9IGRiLnRyYW5zYWN0aW9uKCdwb3N0cycsICdyZWFkd3JpdGUnKTtcbiAgICAgICAgICAgIHZhciBzdG9yZSA9IHR4Lm9iamVjdFN0b3JlKCdwb3N0cycpO1xuICAgICAgICAgICAgcG9zdHMuZm9yRWFjaChmdW5jdGlvbiAocG9zdCkge1xuICAgICAgICAgICAgICAgIHN0b3JlLnB1dChwb3N0KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnc2F2aW5nIHBvc3RzIHRvIGlkYicpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLyogRGVsZXRlIG9sZCBwb3N0cyBhbmQga2VlcCB0aGUgMjAgbW9zdCByZWNlbnQgcG9zdHMgKi9cbiAgICAgICAgICAgIHN0b3JlLmluZGV4KCdieS1kYXRlJykub3BlbkN1cnNvcihudWxsLCAncHJldicpLnRoZW4oZnVuY3Rpb24oY3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnNvci5hZHZhbmNlKDIwKVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiBkZWxldGVQb3N0cyhjdXJzb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWN1cnNvcikgcmV0dXJuXG4gICAgICAgICAgICAgICAgY3Vyc29yLmRlbGV0ZSgpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnNvci5jb250aW51ZSgpLnRoZW4oZGVsZXRlUG9zdHMpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYXBwLnNlbmRQdXNoTm90aWZpY2F0aW9uKClcbiAgICAgICAgICAgICAgICAudGhlbihhcHAuZGlzcGxheVBvc3RzKGRhdGEuYXJ0aWNsZXMpKVxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJvbSB0aGUgU29ja2V0OicsIGRhdGEuYXJ0aWNsZXMpXG4gICAgICAgIH0pXG4gICAgfVxuICAgIFxuICAgIC8qIHNlbmRpbmcgcHVzaCB0aHJvdWdoIHRvIHRoZSB1c2VyICovXG4gICAgc2VuZFB1c2hOb3RpZmljYXRpb24gKCkge1xuICAgICAgICBpZiAoISBuYXZpZ2F0b3Iuc2VydmljZVdvcmtlcikgcmV0dXJuXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVhZHlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChyZWdpc3RyYXRpb24pIHtcbiAgICAgICAgICAgICAgICByZWdpc3RyYXRpb24ucHVzaE1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKHN1YnNjcmlwdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9JZiBhbHJlYWR5IGFjY2VzcyBncmFudGVkLCBzZW5kIHRoZSBwdXNoIG5vdGlmaWNhdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN1YnNjcmlwdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMzMzL2FwaS9ub3RpZnknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnZGlzcGF0Y2hlZCB0aGUgbm90aWZpY2F0aW9uJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCAxMDAwMClcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH0pICAgICAgICBcbiAgICB9XG5cbiAgICAvKiBQb3B1bGF0ZSB0aGUgc291cmNlcyBmaWx0ZXIgKi9cbiAgICBwb3B1bGF0ZVNvdXJjZShzb3VyY2VzKSB7XG4gICAgICAgIHZhciBzZWxlY3RPcHRpb24gPSAnJ1xuICAgICAgICBzb3VyY2VzLmZvckVhY2goKHNvdXJjZSkgPT4ge1xuICAgICAgICAgICAgc2VsZWN0T3B0aW9uICs9IGA8b3B0aW9uPiR7c291cmNlfTwvb3B0aW9uPmBcbiAgICAgICAgfSlcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3NvdXJjZS1uYW1lcycpLmluc2VydEFkamFjZW50SFRNTCgnYmVmb3JlZW5kJywgc2VsZWN0T3B0aW9uKVxuICAgIH1cblxuICAgIC8qIFBvcHVsYXRlIHRoZSBjb3VudHJ5IGZpbHRlciAqL1xuICAgIHBvcHVsYXRlQ291bnRyeShjb3VudHJpZXMpIHtcbiAgICAgICAgdmFyIGNvdW50cnlPcHRpb24gPSAnJ1xuICAgICAgICBjb3VudHJpZXMuZm9yRWFjaCgoY291bnRyeSkgPT4ge1xuICAgICAgICAgICAgY291bnRyeU9wdGlvbiArPSBgPG9wdGlvbj4ke2NvdW50cnl9PC9vcHRpb24+YFxuICAgICAgICB9KVxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY291bnRyeS1uYW1lcycpLmluc2VydEFkamFjZW50SFRNTCgnYmVmb3JlZW5kJywgY291bnRyeU9wdGlvbilcbiAgICB9XG5cbiAgICBwb3B1bGF0ZUZpbHRlcnMoc291cmNlcywgY291bnRyaWVzKSB7XG4gICAgICAgIHRoaXMucG9wdWxhdGVTb3VyY2Uoc291cmNlcylcbiAgICAgICAgdGhpcy5wb3B1bGF0ZUNvdW50cnkoY291bnRyaWVzKVxuICAgIH1cblxuICAgIC8qIERpc3BsYXkgSGVhZGxpbmVzICovXG4gICAgZGlzcGxheVBvc3RzKGRhdGEpIHtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSAnJ1xuICAgICAgICB2YXIgaGVhZGxpbmVzID0gZGF0YS5mb3JFYWNoKGhlYWRsaW5lID0+IHtcbiAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxkaXYgY2xhc3M9XCJjYXJkXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtbWVkaWFcIj5cbiAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9XCIke2hlYWRsaW5lLnVybFRvSW1hZ2V9XCIgYWx0PVwiSW1hZ2VcIj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1jb250ZW50XCI+XG4gICAgICAgICAgICAgICAgICAgIDxoMj48YSBocmVmPVwiJHtoZWFkbGluZS51cmx9XCIgdGFyZ2V0PVwiX2JsYW5rXCI+JHtoZWFkbGluZS50aXRsZX08L2E+PC9oMj5cbiAgICAgICAgICAgICAgICAgICAgPHA+JHtoZWFkbGluZS5kZXNjcmlwdGlvbn08L3A+XG4gICAgICAgICAgICAgICAgICAgIDxlbT5Tb3VyY2U6ICR7aGVhZGxpbmUuc291cmNlLm5hbWV9PC9lbT5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PmBcblxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBvc3RzJykuaW5uZXJIVE1MID0gY29udGVudFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgXG59XG5cbnZhciBhcHAgPSBuZXcgSGVhZGxpbmVzKClcblxuLyogTGlzdGVuIGZvciBhIGNsaWNrIGV2ZW50IGZyb20gdGhlIHNvdXJjZSBmaWx0ZXIgYW5kIG9wZW4gYSBzb2NrZXQgKi9cbmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNzb3VyY2UtZm9ybScpLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgY29uc3Qgc291cmNlID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcInNlbGVjdFtuYW1lPSdzb3VyY2UnXVwiKS5zZWxlY3RlZE9wdGlvbnNbMF0udmFsdWU7XG4gICAgYXBwLm9wZW5Tb3VyY2VTb2NrZXQoc291cmNlKVxuICAgIGNvbnNvbGUubG9nKHNvdXJjZSlcbn0pXG5cbi8qIExpc3RlbiBmb3IgYSBjbGljayBldmVudCBmcm9tIHRoZSBjb3VudHJ5IGZpbHRlciBhbmQgb3BlbiBhIHNvY2tldCAqL1xuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NvdW50cnktZm9ybScpLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgY29uc3QgY291bnRyeSA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJzZWxlY3RbbmFtZT0nY291bnRyeSddXCIpLnNlbGVjdGVkT3B0aW9uc1swXS52YWx1ZTtcbiAgICBhcHAub3BlbkNvdW50cnlTb2NrZXQoY291bnRyeSlcbiAgICBjb25zb2xlLmxvZyhjb3VudHJ5KVxufSlcbiIsIihmdW5jdGlvbiAod2luZG93KSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy9QdXNoIG5vdGlmaWNhdGlvbiBidXR0b25cbiAgICB2YXIgZmFiUHVzaEVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjcHVzaC1idG4nKTtcblxuICAgIC8vVG8gY2hlY2sgYHB1c2ggbm90aWZpY2F0aW9uYCBpcyBzdXBwb3J0ZWQgb3Igbm90XG4gICAgZnVuY3Rpb24gaXNQdXNoU3VwcG9ydGVkKCkge1xuICAgICAgICAvL1RvIGNoZWNrIGBwdXNoIG5vdGlmaWNhdGlvbmAgcGVybWlzc2lvbiBpcyBkZW5pZWQgYnkgdXNlclxuICAgICAgICBpZiAoTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gPT09ICdkZW5pZWQnKSB7XG4gICAgICAgICAgICBhbGVydCgnVXNlciBoYXMgYmxvY2tlZCBwdXNoIG5vdGlmaWNhdGlvbi4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vQ2hlY2sgYHB1c2ggbm90aWZpY2F0aW9uYCBpcyBzdXBwb3J0ZWQgb3Igbm90XG4gICAgICAgIGlmICghKCdQdXNoTWFuYWdlcicgaW4gd2luZG93KSkge1xuICAgICAgICAgICAgYWxlcnQoJ1NvcnJ5LCBQdXNoIG5vdGlmaWNhdGlvbiBpc25cXCd0IHN1cHBvcnRlZCBpbiB5b3VyIGJyb3dzZXIuJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvL0dldCBgcHVzaCBub3RpZmljYXRpb25gIHN1YnNjcmlwdGlvblxuICAgICAgICAvL0lmIGBzZXJ2aWNlV29ya2VyYCBpcyByZWdpc3RlcmVkIGFuZCByZWFkeVxuICAgICAgICBuYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5yZWFkeVxuICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKHJlZ2lzdHJhdGlvbikge1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJhdGlvbi5wdXNoTWFuYWdlci5nZXRTdWJzY3JpcHRpb24oKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoc3Vic2NyaXB0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL0lmIGFscmVhZHkgYWNjZXNzIGdyYW50ZWQsIGVuYWJsZSBwdXNoIGJ1dHRvbiBzdGF0dXNcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdWJzY3JpcHRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnVXNlciBzdWJzY3JpYmVkIGZvciBwdXNoIGFscmVhZHknKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3Vic2NyaWJlUHVzaCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoYW5nZVB1c2hTdGF0dXMoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfSwgMzAwMDAwKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBvY2N1cnJlZCB3aGlsZSBlbmFibGluZyBwdXNoICcsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBBc2sgVXNlciBpZiBoZS9zaGUgd2FudHMgdG8gc3Vic2NyaWJlIHRvIHB1c2ggbm90aWZpY2F0aW9ucyBhbmQgdGhlblxuICAgIC8vIC4uc3Vic2NyaWJlIGFuZCBzZW5kIHB1c2ggbm90aWZpY2F0aW9uXG4gICAgZnVuY3Rpb24gc3Vic2NyaWJlUHVzaCgpIHtcbiAgICAgICAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVhZHkudGhlbihmdW5jdGlvbiAocmVnaXN0cmF0aW9uKSB7XG4gICAgICAgICAgICBpZiAoIXJlZ2lzdHJhdGlvbi5wdXNoTWFuYWdlcikge1xuICAgICAgICAgICAgICAgIGFsZXJ0KCdZb3VyIGJyb3dzZXIgZG9lc25cXCd0IHN1cHBvcnQgcHVzaCBub3RpZmljYXRpb24uJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL1RvIHN1YnNjcmliZSBgcHVzaCBub3RpZmljYXRpb25gIGZyb20gcHVzaCBtYW5hZ2VyXG4gICAgICAgICAgICByZWdpc3RyYXRpb24ucHVzaE1hbmFnZXIuc3Vic2NyaWJlKHtcbiAgICAgICAgICAgICAgICB1c2VyVmlzaWJsZU9ubHk6IHRydWUgLy9BbHdheXMgc2hvdyBub3RpZmljYXRpb24gd2hlbiByZWNlaXZlZFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoc3Vic2NyaXB0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnUHVzaCBub3RpZmljYXRpb24gc3Vic2NyaWJlZC4nKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3Vic2NyaXB0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVN1YnNjcmlwdGlvbklEKHN1YnNjcmlwdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIGNoYW5nZVB1c2hTdGF0dXModHJ1ZSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNoYW5nZVB1c2hTdGF0dXMoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdQdXNoIG5vdGlmaWNhdGlvbiBzdWJzY3JpcHRpb24gZXJyb3I6ICcsIGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyBVbnN1YnNjcmliZSB0aGUgdXNlciBmcm9tIHB1c2ggbm90aWZpY2F0aW9uc1xuICAgIGZ1bmN0aW9uIHVuc3Vic2NyaWJlUHVzaCgpIHtcbiAgICAgICAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVhZHlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChyZWdpc3RyYXRpb24pIHtcbiAgICAgICAgICAgICAgICAvL0dldCBgcHVzaCBzdWJzY3JpcHRpb25gXG4gICAgICAgICAgICAgICAgcmVnaXN0cmF0aW9uLnB1c2hNYW5hZ2VyLmdldFN1YnNjcmlwdGlvbigpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChzdWJzY3JpcHRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vSWYgbm8gYHB1c2ggc3Vic2NyaXB0aW9uYCwgdGhlbiByZXR1cm5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3Vic2NyaXB0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ1VuYWJsZSB0byB1bnJlZ2lzdGVyIHB1c2ggbm90aWZpY2F0aW9uLicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy9VbnN1YnNjcmliZSBgcHVzaCBub3RpZmljYXRpb25gXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5pbmZvKCdQdXNoIG5vdGlmaWNhdGlvbiB1bnN1YnNjcmliZWQuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN1YnNjcmlwdGlvbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZVN1YnNjcmlwdGlvbklEKHN1YnNjcmlwdGlvbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZVB1c2hTdGF0dXMoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHVuc3Vic2NyaWJlIHB1c2ggbm90aWZpY2F0aW9uLicpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pXG4gICAgfVxuXG4gICAgLy9UbyBjaGFuZ2Ugc3RhdHVzXG4gICAgZnVuY3Rpb24gY2hhbmdlUHVzaFN0YXR1cyhzdGF0dXMpIHtcbiAgICAgICAgaWYgKHN0YXR1cykge1xuICAgICAgICAgICAgZmFiUHVzaEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmYWJQdXNoRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNhdmVTdWJzY3JpcHRpb25JRChzdWJzY3JpcHRpb24pIHtcbiAgICAgICAgdmFyIHN1YnNjcmlwdGlvbl9pZCA9IHN1YnNjcmlwdGlvbi5lbmRwb2ludC5zcGxpdCgnZ2NtL3NlbmQvJylbMV07XG5cbiAgICAgICAgY29uc29sZS5sb2coXCJTdWJzY3JpcHRpb24gSURcIiwgc3Vic2NyaXB0aW9uX2lkKTtcblxuICAgICAgICBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMzMzL2FwaS91c2VycycsIHtcbiAgICAgICAgICAgIG1ldGhvZDogJ3Bvc3QnLFxuICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgdXNlcl9pZDogc3Vic2NyaXB0aW9uX2lkIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlbGV0ZVN1YnNjcmlwdGlvbklEKHN1YnNjcmlwdGlvbikge1xuICAgICAgICB2YXIgc3Vic2NyaXB0aW9uX2lkID0gc3Vic2NyaXB0aW9uLmVuZHBvaW50LnNwbGl0KCdnY20vc2VuZC8nKVsxXTtcblxuICAgICAgICBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMzMzL2FwaS91c2VyLycgKyBzdWJzY3JpcHRpb25faWQsIHtcbiAgICAgICAgICAgIG1ldGhvZDogJ2RlbGV0ZScsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENsaWNrIGV2ZW50IGZvciBzdWJzY3JpYmUgcHVzaFxuICAgIC8vIGZhYlB1c2hFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuICAgIC8vICAgICB2YXIgaXNTdWJzY3JpYmVkID0gKGZhYlB1c2hFbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykpO1xuICAgIC8vICAgICBpZiAoaXNTdWJzY3JpYmVkKSB7XG4gICAgLy8gICAgICAgICB1bnN1YnNjcmliZVB1c2goKTtcbiAgICAvLyAgICAgfVxuICAgIC8vICAgICBlbHNlIHtcbiAgICAvLyAgICAgICAgIHN1YnNjcmliZVB1c2goKTtcbiAgICAvLyAgICAgfVxuICAgIC8vIH0pO1xuXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgaXNQdXNoU3VwcG9ydGVkKCk7IC8vQ2hlY2sgZm9yIHB1c2ggbm90aWZpY2F0aW9uIHN1cHBvcnRcbiAgICB9LCAxMjAwMDApXG5cbn0pKHdpbmRvdyk7XG5cbiIsIihmdW5jdGlvbih3aW5kb3cpIHtcbiAgICB3aW5kb3cub25zY3JvbGwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNjcm9sbEZ1bmN0aW9uKClcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY3JvbGxGdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKGRvY3VtZW50LmJvZHkuc2Nyb2xsVG9wID4gMzAwIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxUb3AgPiAzMDApIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zY3JvbGwnKS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc2Nyb2xsJykuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc2Nyb2xsJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuc2Nyb2xsVG9wID0gMDtcblxuICAgICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsVG9wID0gMDtcbiAgICB9KVxufSkod2luZG93KSJdfQ==
