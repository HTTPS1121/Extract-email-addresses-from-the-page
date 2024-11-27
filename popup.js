let extractedEmails = [];
let ignoredEmails = [];
let currentEditingEmail = null;

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
            const button = e.target.closest('.btn');
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
            }
        });
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
    listElement.innerHTML = '';
    
    extractedEmails.forEach((email, index) => {
        const div = document.createElement('div');
        div.className = 'email-item';
        div.innerHTML = `<span class="email-text">${email}</span>`;
        
        div.addEventListener('click', function(e) {
            if (e.target.classList.contains('editing')) return;
            
            const span = div.querySelector('.email-text');
            const originalText = span.textContent;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = originalText;
            input.className = 'email-edit editing';
            
            span.replaceWith(input);
            input.focus();
            
            // טיפול בשמירה/ביטול עם מקשי מקלדת
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault(); // מניעת שבירת שורה
                    handleEdit(input, index, originalText);
                } else if (e.key === 'Escape') {
                    handleEdit(input, index, originalText, true);
                }
            });
            
            // טיפול בלחיצה מחוץ לשדה
            input.addEventListener('blur', function() {
                handleEdit(input, index, originalText);
            });
        });
        
        listElement.appendChild(div);
    });
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
    if (ignoredEmails.length === 0) {
        list.innerHTML = '<div class="empty-state">הכנס כתובות מייל להתעלמות</div>';
        return;
    }
    
    list.innerHTML = ''; // ניקוי הרשימה
    
    // יצירת האלמנטים בצורה תכנותית
    ignoredEmails.forEach((email, index) => {
        const div = document.createElement('div');
        div.className = 'email-item';
        
        // הוספת הטקסט עם אפשרות עריכה
        const span = document.createElement('span');
        span.className = 'email-text';
        span.textContent = email;
        
        // כפתור הסרה
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'הסר';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // מניעת הפעלת אירוע העריכה
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

// פונקציה לטיפול בעריכת כתובת מוחרגת
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

function updateStats() {
    document.getElementById('extracted-count').textContent = extractedEmails.length;
    document.getElementById('total-count').textContent = extractedEmails.length;
    document.getElementById('ignored-count').textContent = ignoredEmails.length;
}

function switchTab(tab) {
    // הסרת הקלאס active מכל הטאבים
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    // הסתרת כל התוכן
    document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
    
    if (tab === 'emails') {
        // הפעלת טאב האימיילים
        document.querySelector('.tab:first-child').classList.add('active');
        document.getElementById('emails-content').style.display = 'flex';
    } else {
        // הפעלת טאב ההתעלמות
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
    navigator.clipboard.writeText(extractedEmails.join('\n'))
        .then(() => alert('הועתק ללוח!'))
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

// שאר הפונקציות נשארות דומות... 