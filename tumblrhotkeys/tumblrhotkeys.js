var DEBUG = false,
    KEY_LEFT_ARROW = 37,
    KEY_RIGHT_ARROW = 39,
    KEY_H = 72,
    KEY_J = 74,
    KEY_K = 75,
    KEY_L = 76,
    i18n = chrome.i18n,
    PREFIX = "-tumblrhotkeys",

    // list of posts on the current page to iterate through.  there's no "one
    // true way" to find tumblr posts, so let's try a few
    posts = getElements([
        {class: "post"},
        {class: "entry"},
        {tag: "article"},
        {class: "date"} // dates are often used as post separators
    ]),

    // whether the current page has any posts
    hasPosts = Boolean(posts.length),

    // the post most recently moved to by this extension
    selectedPost = null,

    // whether this extension is "active". clicking the spark toggles this
    active = false,

    // the bit of HTML in the top left that contains the controls
    spark;

// init immediately. there are only function definitions below this
init();

// log to console when DEBUG is set
function log() {
    if (DEBUG) {
        console.log.apply(console, arguments);
    }
}

// getElements([{class: "post"}, {tag: "article"}]) => [...]
function getElements(specs) {
    log("getElements()");
    var spec,
        elts,
        i;

    for (i = 0; i < specs.length; i++) {
        spec = specs[i];
        if (spec.class) {
            // class selection is case sensitive
            log("getElements(): try class \"" + spec.class + "\"");
            elts = document.body.getElementsByClassName(spec.class);
            if (!elts.length) {
                log("getElements(): try class \"" + spec.class.toUpperCase() + "\"");
                elts = document.body.getElementsByClassName(
                    spec.class.toUpperCase());
            }
        } else if (spec.tag) {
            log("getElements(): try tag \"" + spec.tag + "\"");
            elts = document.body.getElementsByTagName(spec.tag);
        }

        if (elts.length) {
            return elts;
        }
    }

    // none found
    return [];
}

// template("Hi $name$", { "name": "Chris" }) -> "Hi Chris"
function template(templ, data) {
    log("template()");
    for (var key in data) {
        if (data.hasOwnProperty(key)) {
            templ = templ.replace(new RegExp("\\$"+key+"\\$", "g"), data[key]);
        }
    }
    return templ;
}

// synchronously HTTP GET a URL's content as a string
function getURL(path) {
    log("getURL()");
    var xhr = new XMLHttpRequest();
    xhr.open("GET", chrome.extension.getURL(path), false);
    xhr.send();
    return xhr.responseText;
}

// register event callbacks and set up the UI controls
function init() {
    log("init()");

    // XHR conveniently lets us keep the HTML out of JS
    var nest = document.createElement("div");
    nest.innerHTML = template(getURL("/spark.html"), {
        "subject": encodeURIComponent(i18n.getMessage("bugEmailSubject")),
        "body": encodeURIComponent(i18n.getMessage("bugEmailBody",
            [window.location]))
    });

    document.body.appendChild(nest);
    spark = nest.firstChild;

    setActive(true);
    window.addEventListener("scroll", onWindowScroll, false);
    document.body.addEventListener("keydown", onDocumentKeydown, false);
    spark.addEventListener("click", onSparkClick, false);
}

// handle clicks on the spark
function onSparkClick(e) {
    log("onSparkClick()");
    var target = e.target;
    if (target.classList.contains(PREFIX+"-btn") ||
            target.parentNode.classList.contains(PREFIX+"-btn")) {
        // clicks on the spark button
        setActive(!active);
    } else if (target.nodeName.toLowerCase() == "th:a" ||
            target.parentNode.nodeName.toLowerCase() == "th:a") {
        // clicks in the help menu
        switch (target.className) {
        case PREFIX + "-prevpage":
            prevPage();
            break;
        case PREFIX + "-nextpage":
            nextPage();
            break;
        case PREFIX + "-prevpost":
            prevPost();
            break;
        case PREFIX + "-nextpost":
            nextPost();
            break;
        case PREFIX + "-bugreport":
            // must manually trigger because we're using a non-HTML namespace
            window.location = target.getAttribute("href");
            break;
        default:
            //do nothing
            break;
        }
    }
}

// when the user scrolls junk the last known position. we could be anywhere
function onWindowScroll() {
    log("onWindowScroll()");
    selectedPost = null;
}

// this is pretty much the meat of the extension. hotkey navigation 
function onDocumentKeydown(e) {
    log("onDocumentKeydown("+e.keyCode+")");
    var nodeName = e.target.nodeName.toLowerCase(),

        // ignore modifiers. CTRL+K is someone else's hotkey. shift we'll
        // accept. the help does list the hotkeys as upper case, after all
        modified = e.altKey || e.ctrlKey || e.metaKey;

    // avoid jumping around the page when the user is trying to type something
    // in a text entry field
    if (!active || modified || nodeName == "input" || nodeName == "textarea") {
        return;
    }

    switch (e.keyCode) {
    case KEY_LEFT_ARROW:
    //case KEY_H:
        prevPage();
        break;
    case KEY_RIGHT_ARROW:
    //case KEY_L:
        nextPage();
        break;
    case KEY_K:
        prevPost();
        break;
    case KEY_J:
        nextPost();
        break;
    default:
        //do nothing
        break;
    }
}

// toggle the extension's behavior on or off
function setActive(active_) {
    log("setActive("+active_+")");
    active = active_;

    var onBtn = spark.querySelector("."+PREFIX+"-on"),
        offBtn = spark.querySelector("."+PREFIX+"-off");
    
    onBtn.style.display = active_ ? "block" : "none";
    offBtn.style.display = active_ ? "none" : "block";
}

// jump to the next post, or, if there aren't any posts left, move on to the
// next page.
function nextPost() {
    log("nextPost()");
    var body = document.body,
        rect,
        i;

    if (!hasPosts) {
        return;
    }

    for (i = 0; i < posts.length; i++) {
        rect = posts[i].getBoundingClientRect();

        if (rect.top > 20 && posts[i] !== selectedPost) {
            body.scrollTop += rect.top - 20;
            setTimeout(function() {
                // run after window.onscroll triggers from setting scrollTop
                selectedPost = posts[i];
            }, 1);
            return;
        }
    }

    // this bit will enable moving past the last post to the bottom of the
    // page. this is because if a post isn't close enough to the bottom of the
    // page, it can be jarring to load the next page when you're just expecting
    // to move down by one.
    if (body.scrollHeight - window.innerHeight !== body.scrollTop) {
        body.scrollTop = body.scrollHeight - window.innerHeight;
        selectedPost = null;
    } else {
        nextPage();
    }
}

// jump to the previous post, or, if already at the first post, navigate to the
// previous page.
function prevPost() {
    log("prevPost()");
    var body = document.body,
        rect,
        i;

    if (!hasPosts) {
        return;
    }

    for (i = posts.length - 1; i >= 0; i--) {
        rect = posts[i].getBoundingClientRect();
        if (rect.top < 20 && posts[i] !== selectedPost) {
            body.scrollTop += rect.top - 20;
            setTimeout(function() {
                // run after window.onscroll triggers from setting scrollTop
                selectedPost = posts[i];
            }, 1);
            return;
        }
    }

    // this, like the code in nextPost(), makes moving to the previous page
    // less jarring because you first hit a buffer, the top of the current
    // page.
    if (body.scrollTop !== 0) {
        body.scrollTop = 0;
        selectedPost = null;
    } else {
        prevPage();
    }
}

// what page are we on, anyway? assumes that "/" is page number 1
function getPage() {
    log("getPage()");
    var match = window.location.pathname.match(/\/page\/(\d+)/),
        page = 1;
    if (match) {
        page = parseInt(match[1], 10);
    }
    return page;
}

// navigate to a page. tumblr will redirect "/page/1" to simply "/"
function setPage(page) {
    log("setPage("+page+")");
    var path = "/page/" + page;
    if (page !== getPage()) {
        window.location.pathname = path;
    }
}

// navigate to the next page
function nextPage() {
    log("nextPage()");
    setPage(getPage() + 1);
}

// navigate to the previous page
function prevPage() {
    log("prevPage()");
    setPage(Math.max(1, getPage() - 1))
}
