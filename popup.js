let extractedEmails = [];
let ignoredEmails = [];
let currentEditingEmail = null;

// טעינת הנתונים בעת פתיחת הפופאפ
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // טעינת רשימת ההתעלמות מהאחסון
        const result = await chrome.storage.local.get('ignoredEmails');
        ignoredEmails = result.ignoredEmails || [];
        
        // טעינת ערכת הנושא
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // הוספת מאזיני אירועים לכפתורים
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.textContent.includes('חילוץ') ? 'emails' : 'ignore';
                switchTab(tabName);
            });
        });

        // הוספת מאזין אירועים לכפתור החלפת ערכת נושא
        document.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
        
        // הוספת מאזיני אירועים לכפתורי הפעולה
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent;
                switch(action) {
                    case 'חלץ מיילים':
                        extractEmails();
                        break;
                    case 'העתק ללוח':
                        copyToClipboard();
                        break;
                    case 'איפוס':
                        reset();
                        break;
                    case 'הוסף':
                        addToIgnoreList();
                        break;
                }
            });
        });
        
        // עדכון התצוגה הראשונית
        updateEmailsList();
        updateIgnoreList();
        updateStats();
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
            extractedEmails = response.emails.filter(email => !ignoredEmails.includes(email));
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

    const emails = input
        .split(/[\n,]/)
        .map(email => email.trim())
        .filter(email => email);
    
    const newEmails = emails.filter(email => !ignoredEmails.includes(email));
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
    const list = document.getElementById('emails-list');
    if (extractedEmails.length === 0) {
        list.innerHTML = '<div class="empty-state">לחץ על "חלץ מיילים" כדי להתחיל</div>';
        return;
    }
    list.innerHTML = extractedEmails.map(email => `
        <div class="email-item" onclick="showEdit(event, '${email}')">
            ${email}
        </div>
    `).join('');
}

function updateIgnoreList() {
    const list = document.getElementById('ignore-list');
    if (ignoredEmails.length === 0) {
        list.innerHTML = '<div class="empty-state">הכנס כתובות מייל להתעלמות</div>';
        return;
    }
    list.innerHTML = ignoredEmails.map(email => `
        <div class="email-item">
            ${email}
            <button class="remove-btn" onclick="removeFromIgnoreList('${email}')">הסר</button>
        </div>
    `).join('');
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

function reset() {
    extractedEmails = [];
    updateEmailsList();
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