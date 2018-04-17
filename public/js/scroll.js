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