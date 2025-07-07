// Disable default context menu
document.addEventListener('contextmenu', e => e.preventDefault());

function handlePress() { this.classList.add('pressed'); }
function handleRelease() { this.classList.remove('pressed'); }
function handleCancel() { this.classList.remove('pressed'); }

function bindPressEffect(elements) {
    elements.forEach(el => {
        el.addEventListener('mousedown', handlePress);
        el.addEventListener('mouseup', handleRelease);
        el.addEventListener('mouseleave', handleCancel);
        el.addEventListener('touchstart', handlePress);
        el.addEventListener('touchend', handleRelease);
        el.addEventListener('touchcancel', handleCancel);
    });
}

function toggleClass(selector, cls) {
    document.querySelectorAll(selector).forEach(el => el.classList.toggle(cls));
}

function pop(url) {
    const img = document.querySelector('.tc-img');
    if (url) img.src = url;
    toggleClass('.tc-main', 'active');
    toggleClass('.tc', 'active');
}

const pageLoading = document.getElementById('zyyo-loading');
window.addEventListener('load', () => {
    setTimeout(() => { pageLoading.style.opacity = '0'; }, 100);
});

function setCookie(name, value, days) {
    let expires = '';
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = '; expires=' + date.toUTCString();
    }
    document.cookie = name + '=' + value + expires + '; path=/';
}

function getCookie(name) {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        while (cookie.charAt(0) === ' ') {
            cookie = cookie.substring(1);
        }
        if (cookie.indexOf(nameEQ) === 0) {
            return cookie.substring(nameEQ.length);
        }
    }
    return null;
}

function renderTags() {
    const container = document.getElementById('tags');
    if (!container) return;
    container.innerHTML = '';
    tags.forEach(t => {
        const div = document.createElement('div');
        div.className = 'left-tag-item';
        div.textContent = t;
        container.appendChild(div);
    });
}

function renderTimeline() {
    const ul = document.getElementById('timeline');
    if (!ul) return;
    ul.innerHTML = '';
    timeline.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<div class="focus"></div><div>${item.text}</div><div>${item.date}</div>`;
        ul.appendChild(li);
    });
}

function renderProjects(selector, list) {
    const container = document.querySelector(selector);
    if (!container) return;
    container.innerHTML = '';
    list.forEach(p => {
        const a = document.createElement('a');
        a.className = 'projectItem';
        a.target = '_blank';
        if (p.link) a.href = p.link;
        a.innerHTML = `<div class="projectItemLeft"><h1>${p.title || ''}</h1><p>${p.desc || ''}</p></div><div class="projectItemRight"><img src="${p.img}" alt=""></div>`;
        container.appendChild(a);
    });
}

function showFPS() {
    const fpsElement = document.createElement('div');
    fpsElement.id = 'fps';
    fpsElement.style.zIndex = '10000';
    fpsElement.style.position = 'fixed';
    fpsElement.style.left = '0';
    document.body.insertBefore(fpsElement, document.body.firstChild);

    let fps = 0, last = Date.now();
    (function step() {
        const offset = Date.now() - last;
        fps += 1;
        if (offset >= 1000) {
            last += offset;
            fpsElement.textContent = 'FPS: ' + fps;
            fps = 0;
        }
        requestAnimationFrame(step);
    })();
}

document.addEventListener('DOMContentLoaded', () => {
    const html = document.documentElement;
    const tanChiShe = document.getElementById('tanChiShe');
    const checkbox = document.getElementById('myonoffswitch');
    let themeState = getCookie('themeState') || 'Light';

    function changeTheme(theme) {
        tanChiShe.src = `./static/svg/snake-${theme}.svg`;
        html.dataset.theme = theme;
        setCookie('themeState', theme, 365);
        themeState = theme;
    }

    checkbox.addEventListener('change', () => {
        changeTheme(themeState === 'Dark' ? 'Light' : 'Dark');
    });

    if (themeState === 'Dark') checkbox.checked = false;
    changeTheme(themeState);

    renderTags();
    renderTimeline();
    renderProjects('#siteList', siteProjects);
    renderProjects('#projectList', otherProjects);
    bindPressEffect(document.querySelectorAll('.projectItem'));
    showFPS();
});
