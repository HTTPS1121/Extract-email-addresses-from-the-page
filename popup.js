let extractedEmails = [];
let ignoredEmails = [];
let currentEditingEmail = null;
let currentLanguage = navigator.language.startsWith('he') ? 'he' : 'en';

// טעינת הנתונים בעת פתיחת הפופאפ
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // טעינת רל הנתונים מהאחסון
        const result = await chrome.storage.local.get(['ignoredEmails', 'extractedEmails']);
        ignoredEmails = result.ignoredEmails || [];
        extractedEmails = result.extractedEmails || [];
        
        // עדכון התצוגה
        updateEmailsList();
        updateIgnoreList();
        updateStats();
        
        // טעינת ערכת הנושא
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // טיפול בלחיצות על טאבים
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                switchTab(tabName);
            });
        });

        // טיפול בלחיצות על כפתורים
        document.addEventListener('click', (e) => {
            const button = e.target.closest('.btn, .icon-btn');
            if (!button) return;

            const action = button.dataset.action;
            switch(action) {
                case 'extract':
                    extractEmails();
                    break;
                case 'copy':
                    copyToClipboard();
                    break;
                case 'reset':
                    if (document.querySelector('.tab.active').dataset.tab === 'emails') {
                        resetExtractedList();
                    } else {
                        resetIgnoreList();
                    }
                    break;
                case 'save':
                    saveEdit();
                    break;
                case 'cancel':
                    closeEdit();
                    break;
                case 'add':
                    addToIgnoreList();
                    break;
                case 'add-manual':
                    addManualEmails();
                    break;
            }
        });

        // אתחול מצב השפה
        const savedLanguage = localStorage.getItem('language') || (navigator.language.startsWith('he') ? 'he' : 'en');
        currentLanguage = savedLanguage;
        const langToggle = document.getElementById('language');
        langToggle.checked = currentLanguage === 'en';
        document.documentElement.setAttribute('data-lang', currentLanguage);
        updateUILanguage(currentLanguage);
        langToggle.addEventListener('change', toggleLanguage);
    } catch (error) {
        console.error('Error initializing popup:', error);
    }
});

async function extractEmails() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        
        const response = await chrome.tabs.sendMessage(tab.id, { action: "extractEmails" });
        
        if (response && response.emails) {
            // הוספת המיילים החדשים לרשימה הקיימת
            const newEmails = response.emails.filter(email => 
                !ignoredEmails.includes(email) && !extractedEmails.includes(email)
            );
            extractedEmails.push(...newEmails);
            
            // שמירה ב-storage
            await chrome.storage.local.set({ extractedEmails });
            
            updateEmailsList();
            updateStats();
        }
    } catch (error) {
        console.error('Error extracting emails:', error);
    }
}

async function addToIgnoreList() {
    const input = document.getElementById('ignore-input').value;
    if (!input.trim()) return;

    // רגקס לבדיקת תקינות כתובת מייל
    const emailRegex = /^[\w\.-]+@[\w\.-]+\.\w+$/;
    
    // פיצול לפי רווחים ו/או שורות חדשות
    const potentialEmails = input
        .split(/[\s]+/)
        .map(email => email.trim())
        .filter(email => email && emailRegex.test(email));
    
    if (potentialEmails.length === 0) return;
    
    // סינון כפילויות מהרשימה הקיימת
    const newEmails = potentialEmails.filter(email => !ignoredEmails.includes(email));
    if (newEmails.length === 0) return;
    
    ignoredEmails.push(...newEmails);
    
    // שמירה ב-storage
    await chrome.storage.local.set({ ignoredEmails });
    
    updateIgnoreList();
    updateStats();
    document.getElementById('ignore-input').value = '';
}

async function removeFromIgnoreList(email) {
    ignoredEmails = ignoredEmails.filter(e => e !== email);
    await chrome.storage.local.set({ ignoredEmails });
    updateIgnoreList();
    updateStats();
}

function updateEmailsList() {
    const listElement = document.getElementById('emails-list');
    const t = translations[currentLanguage];
    
    if (extractedEmails.length === 0) {
        listElement.innerHTML = `<div class="empty-state">${t.emptyExtracted}</div>`;
        return;
    }
    
    listElement.innerHTML = '';
    
    extractedEmails.forEach((email, index) => {
        const div = document.createElement('div');
        div.className = 'email-item';
        
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = email;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'icon-btn delete';
        removeBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none">
                <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromExtractedList(email);
        });
        
        div.appendChild(span);
        div.appendChild(removeBtn);
        
        div.addEventListener('click', function(e) {
            if (e.target.classList.contains('editing') || e.target === removeBtn) return;
            
            const span = div.querySelector('.email-text');
            const originalText = span.textContent;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = originalText;
            input.className = 'email-edit editing';
            
            span.replaceWith(input);
            input.focus();
            
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleEdit(input, index, originalText);
                } else if (e.key === 'Escape') {
                    handleEdit(input, index, originalText, true);
                }
            });
            
            input.addEventListener('blur', function() {
                handleEdit(input, index, originalText);
            });
        });
        
        listElement.appendChild(div);
    });
}

async function removeFromExtractedList(email) {
    extractedEmails = extractedEmails.filter(e => e !== email);
    await chrome.storage.local.set({ extractedEmails });
    updateEmailsList();
    updateStats();
}

// פונקציה מאוחדת לטיפול בעריכה
function handleEdit(input, index, originalText, isCancel = false) {
    const newValue = input.value.trim();
    
    if (isCancel || !newValue) {
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = originalText;
        input.replaceWith(span);
        return;
    }
    
    if (newValue !== originalText) {
        extractedEmails[index] = newValue;
        // שמירה ב-storage
        chrome.storage.local.set({ extractedEmails });
        
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = newValue;
        input.replaceWith(span);
        updateStats();
    } else {
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = originalText;
        input.replaceWith(span);
    }
}

function updateIgnoreList() {
    const list = document.getElementById('ignore-list');
    const t = translations[currentLanguage];
    
    if (ignoredEmails.length === 0) {
        list.innerHTML = `<div class="empty-state">${t.emptyIgnored}</div>`;
        return;
    }
    
    list.innerHTML = '';
    
    ignoredEmails.forEach((email, index) => {
        const div = document.createElement('div');
        div.className = 'email-item';
        
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = email;
        
        // החלפת כפתור ההסרה באייקון
        const removeBtn = document.createElement('button');
        removeBtn.className = 'icon-btn delete';
        removeBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none">
                <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromIgnoreList(email);
        });
        
        div.appendChild(span);
        div.appendChild(removeBtn);
        
        // הוספת פונקציונליות העריכה
        div.addEventListener('click', function(e) {
            if (e.target.classList.contains('editing') || e.target === removeBtn) return;
            
            const span = div.querySelector('.email-text');
            const originalText = span.textContent;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = originalText;
            input.className = 'email-edit editing';
            
            span.replaceWith(input);
            input.focus();
            
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleIgnoreEdit(input, index, originalText);
                } else if (e.key === 'Escape') {
                    handleIgnoreEdit(input, index, originalText, true);
                }
            });
            
            input.addEventListener('blur', function() {
                handleIgnoreEdit(input, index, originalText);
            });
        });
        
        list.appendChild(div);
    });
}

// פונקציה לטיפול בעריכ כתובת מוחרגת
function handleIgnoreEdit(input, index, originalText, isCancel = false) {
    const newValue = input.value.trim();
    
    if (isCancel || !newValue) {
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = originalText;
        input.replaceWith(span);
        return;
    }
    
    if (newValue !== originalText) {
        ignoredEmails[index] = newValue;
        // שמירה ב-storage
        chrome.storage.local.set({ ignoredEmails });
        
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = newValue;
        input.replaceWith(span);
        updateStats();
    } else {
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = originalText;
        input.replaceWith(span);
    }
}

function animateValue(element, start, end, duration = 300) {
    start = parseInt(start) || 0;
    end = parseInt(end) || 0;
    
    if (start === end) return;
    
    // מתחילים מיד עם הערך הראשון
    element.textContent = start;
    element.style.transform = 'scale(1.2)';
    
    const steps = Math.min(Math.abs(end - start), 30);
    const stepValue = (end - start) / steps;
    const stepTime = duration / steps;
    
    let current = start;
    
    // מתחילים את האנימציה מיד בפריים הבא
    requestAnimationFrame(() => {
        const timer = setInterval(() => {
            current += stepValue;
            const displayValue = Math.round(current);
            
            element.textContent = displayValue;
            element.style.transform = 'scale(1.2)';
            
            requestAnimationFrame(() => {
                element.style.transform = 'scale(1)';
            });
            
            if ((stepValue > 0 && current >= end) || (stepValue < 0 && current <= end)) {
                element.textContent = end;
                clearInterval(timer);
            }
        }, stepTime);
    });
}

function updateStats() {
    const extractedBadge = document.getElementById('extracted-badge');
    const ignoredBadge = document.getElementById('ignored-badge');
    
    // הסתרת/הצגת הבאדג'ים בהתאם לכמות הרשומות
    extractedBadge.style.display = extractedEmails.length > 0 ? 'flex' : 'none';
    ignoredBadge.style.display = ignoredEmails.length > 0 ? 'flex' : 'none';
    
    const oldExtracted = parseInt(extractedBadge.textContent) || 0;
    const oldIgnored = parseInt(ignoredBadge.textContent) || 0;
    
    if (oldExtracted !== extractedEmails.length) {
        animateValue(extractedBadge, oldExtracted, extractedEmails.length);
    }
    
    if (oldIgnored !== ignoredEmails.length) {
        animateValue(ignoredBadge, oldIgnored, ignoredEmails.length);
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
    
    if (tab === 'emails') {
        document.querySelector('.tab:first-child').classList.add('active');
        document.getElementById('emails-content').style.display = 'flex';
    } else {
        document.querySelector('.tab:last-child').classList.add('active');
        document.getElementById('ignore-content').style.display = 'flex';
    }
}

function showEdit(event, email) {
    const popup = document.getElementById('edit-popup');
    popup.style.display = 'block';
    
    document.getElementById('edit-input').value = email;
    currentEditingEmail = email;
    
    event.stopPropagation();
    document.addEventListener('click', closeEditOnClickOutside);
}

function closeEditOnClickOutside(event) {
    const popup = document.getElementById('edit-popup');
    if (!popup.contains(event.target) && event.target.className !== 'email-item') {
        closeEdit();
        document.removeEventListener('click', closeEditOnClickOutside);
    }
}

function closeEdit() {
    document.getElementById('edit-popup').style.display = 'none';
    currentEditingEmail = null;
    document.removeEventListener('click', closeEditOnClickOutside);
}

function saveEdit() {
    const newEmail = document.getElementById('edit-input').value;
    const index = extractedEmails.indexOf(currentEditingEmail);
    
    if (index !== -1) {
        extractedEmails[index] = newEmail;
        updateEmailsList();
    }
    
    closeEdit();
}

function copyToClipboard() {
    const t = translations[currentLanguage];
    
    navigator.clipboard.writeText(extractedEmails.join('\n'))
        .then(() => {
            // הצגת הודעה נייטיבית
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = t.copiedToClipboard;
            document.body.appendChild(notification);
            
            // הסרת ההודעה אחרי 2 שניות
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        })
        .catch(err => console.error('Error copying to clipboard:', err));
}

async function resetExtractedList() {
    extractedEmails = [];
    await chrome.storage.local.set({ extractedEmails });
    updateEmailsList();
    updateStats();
}

async function resetIgnoreList() {
    ignoredEmails = [];
    await chrome.storage.local.set({ ignoredEmails });
    updateIgnoreList();
    updateStats();
}

function toggleTheme() {
    const themeToggle = document.getElementById('theme');
    const root = document.documentElement;
    
    if (themeToggle.checked) {
        root.setAttribute('data-theme', 'light');
    } else {
        root.removeAttribute('data-theme');
    }
    
    localStorage.setItem('theme', themeToggle.checked ? 'light' : 'dark');
}

// עדכון מצב התחלתי
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const themeToggle = document.getElementById('theme');
    themeToggle.checked = savedTheme === 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.addEventListener('change', toggleTheme);
});

// הוספת פונקציית החלפת שפה
function toggleLanguage() {
    const langToggle = document.getElementById('language');
    currentLanguage = langToggle.checked ? 'en' : 'he';
    document.documentElement.setAttribute('data-lang', currentLanguage);
    localStorage.setItem('language', currentLanguage);
    
    // כאן תוכל להוסיף לוגיקה להחלפת הטקסטים בממשק
    updateUILanguage(currentLanguage);
}

const translations = {
    he: {
        // טאבים
        extractTab: 'חילוץ אימיילים',
        ignoreTab: 'רשימת התעלמות',
        
        // כפתורים בטאב החילוץ
        extract: 'חילוץ',
        copy: 'העתקה',
        reset: 'איפוס',
        
        // טאב החרגה
        addToIgnore: 'הוסף לרשימת החרגה',
        resetIgnore: 'איפוס רשימת החרגה',
        inputPlaceholder: 'הכנס כתובת מייל להחרגה',
        separatorHint: 'פסיק להפרדה בין כתובות',
        
        // הודעות
        emptyExtracted: 'לחץ על <strong>חילוץ</strong> כדי להתחיל',
        emptyIgnored: 'הכנס כתובות מייל להחרגה',
        copiedToClipboard: 'הועתק!',
        
        // עריכה
        save: 'שמור',
        cancel: 'ביטול'
    },
    en: {
        // Tabs
        extractTab: 'Extract Emails',
        ignoreTab: 'Ignore List',
        
        // Extract tab buttons
        extract: 'Extract',
        copy: 'Copy',
        reset: 'Reset',
        
        // Ignore tab
        addToIgnore: 'Add to Ignore List',
        resetIgnore: 'Reset Ignore List',
        inputPlaceholder: 'Enter email to ignore',
        separatorHint: 'Use comma to separate emails',
        
        // Messages
        emptyExtracted: 'Click <strong>Extract</strong> to start',
        emptyIgnored: 'Enter emails to ignore',
        copiedToClipboard: 'Copied!',
        
        // Edit
        save: 'Save',
        cancel: 'Cancel'
    }
};

function updateUILanguage(lang) {
    const t = translations[lang];
    
    // עדכון טאבים
    document.querySelector('[data-tab="emails"] span').textContent = t.extractTab;
    document.querySelector('[data-tab="ignore"] span').textContent = t.ignoreTab;
    
    // עדכון כפתורים בטאב החילוץ
    document.querySelector('[data-action="extract"] span').textContent = t.extract;
    document.querySelector('[data-action="copy"] span').textContent = t.copy;
    document.querySelector('[data-action="reset"] span').textContent = t.reset;
    
    // עדכון טאב החרגה
    document.querySelector('#ignore-input').placeholder = t.inputPlaceholder;
    document.querySelector('.tooltip').textContent = t.separatorHint;
    
    // עדכון טולטיפים
    document.querySelector('[data-action="add"]').setAttribute('data-tooltip', t.addToIgnore);
    document.querySelector('.reset-btn').setAttribute('data-tooltip', t.resetIgnore);
    
    // עדכון הודעות ריקות
    const emptyExtractedDiv = document.querySelector('#emails-list .empty-state');
    if (emptyExtractedDiv) {
        emptyExtractedDiv.innerHTML = t.emptyExtracted;
    }
    
    const emptyIgnoredDiv = document.querySelector('#ignore-list .empty-state');
    if (emptyIgnoredDiv) {
        emptyIgnoredDiv.innerHTML = t.emptyIgnored;
    }
    
    // עדכון פופאפ עריכה
    document.querySelector('[data-action="save"]').textContent = t.save;
    document.querySelector('[data-action="cancel"]').textContent = t.cancel;
    
    // שינוי כיוון הטקסט בהתאם לשפה
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

async function addManualEmails() {
    const input = document.getElementById('manual-emails-input').value;
    if (!input.trim()) return;

    // רגקס לבדיקת תקינות כתובת מייל
    const emailRegex = /^[\w\.-]+@[\w\.-]+\.\w+$/;
    
    // פיצול לפי רווחים ו/או פסיקים
    const potentialEmails = input
        .split(/[,\s]+/)
        .map(email => email.trim())
        .filter(email => email && emailRegex.test(email));
    
    if (potentialEmails.length === 0) return;
    
    // סינון כפילויות והתעלמויות
    const newEmails = potentialEmails.filter(email => 
        !extractedEmails.includes(email) && !ignoredEmails.includes(email)
    );
    
    if (newEmails.length === 0) return;
    
    extractedEmails.push(...newEmails);
    
    // שמירה ב-storage
    await chrome.storage.local.set({ extractedEmails });
    
    updateEmailsList();
    updateStats();
    document.getElementById('manual-emails-input').value = '';
}

// שאר הפונקציות נשארות דומות... 