var idb =  require('idb')

var dbPromise = idb.open('headlines-test', 3, function(upgradeDb) {
    switch (upgradeDb.oldVersion) {
        case 0:
            var keyValStore = upgradeDb.createObjectStore('keyval')
            keyValStore.put('Baz', 'Foo')

        case 1:
            upgradeDb.createObjectStore('people', { keyPath: 'name'})
        
        case 2:
            var peopleStore = upgradeDb.transaction.objectStore('people')
            peopleStore.createIndex('animal', 'favoriteAnimal')
    }
})


dbPromise.then(function(db) {
    var tx =  db.transaction('keyval');
    var keyValStore = tx.objectStore('keyval')
    return keyValStore.get('Foo')
}).then(function(val) {
    console.log('The value of Foo is:', val)
})

dbPromise.then(function(db) {
    var tx = db.transaction('keyval', 'readwrite');
    var keyValStore = tx.objectStore('keyval')
    keyValStore.put('Dog', 'favoriteAnimal')
    return tx.complete
}).then(function(animal) {
    console.log('Favorite animal has been set')
})

dbPromise.then(function(db) {
    var tx = db.transaction('people', 'readwrite');
    var peopleStore = tx.objectStore('people')
 
    peopleStore.put({
        name: 'Okpala Chuks',
        age: 23,
        favoriteAnimal: 'Dog'
    })

    peopleStore.put({
        name: 'Okpala Chidi',
        age: 21,
        favoriteAnimal: 'Dog'
    })

    peopleStore.put({
        name: 'Okpala Kene',
        age: 29,
        favoriteAnimal: 'Cow'
    })

    return tx.complete
}).then(function(res) {
    console.log('Okpala has been added to the peopleStore')
})


dbPromise.then(function(db) {
    var tx = db.transaction('people', 'readwrite')
    var peopleStore = tx.objectStore('people')

    var animalIndex = peopleStore.index('animal')

    return animalIndex.openCursor()

}).then(function logPerson(cursor) {
    if (!cursor) return

    console.log('Cursor occured at:', cursor.value.name)

    return cursor.continue().then(logPerson)

}).then(function() {
    console.log('Done cursoring')
})