function extractEmailsFromPage() {
    const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
    const results = new Set();
    
    // פונקציה לבדיקה אם אלמנט שייך לדף הראשי ומיועד להצגה
    function isElementInMainPage(element) {
        // בדיקה שהאלמנט לא בתוך iframe
        if (element.ownerDocument !== document) return false;
        
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               !element.closest('[aria-hidden="true"]') && // מסנן אלמנטים מוסתרים סמנטית
               !element.closest('[hidden]') && // מסנן אלמנטים עם מאפיין hidden
               !element.closest('template') && // מסנן תבניות
               !element.closest('script') && // מסנן סקריפטים
               !element.closest('style'); // מסנן סגנונות
    }
    
    // מעבר על כל הטקסט בדף
    function extractFromNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) {
                const matches = text.match(emailRegex) || [];
                matches.forEach(email => results.add(email));
            }
        } else if (node.nodeType === Node.ELEMENT_NODE && isElementInMainPage(node)) {
            node.childNodes.forEach(child => extractFromNode(child));
        }
    }

    // התחלת החיפוש מ-body
    extractFromNode(document.body);
    
    // חיפוש בקישורי mailto
    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
        if (isElementInMainPage(link)) {
            const email = link.href.replace('mailto:', '').trim();
            if (email) results.add(email);
        }
    });
    
    // חיפוש בשדות אימייל
    document.querySelectorAll('input[type="email"]').forEach(input => {
        if (isElementInMainPage(input) && input.value) {
            results.add(input.value);
        }
    });
    
    return Array.from(results);
}

// פונקציית עזר לבדיקת תקינות מייל
function isValidEmail(email) {
    // בדיקת תקינות מורחבת למייל
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return email && typeof email === 'string' && emailRegex.test(email);
}

async function saveEmailsToStorage(newEmails) {
    try {
        // סינון מיילים לא תקינים
        const validEmails = newEmails.filter(email => isValidEmail(email));
        
        if (validEmails.length === 0) {
            throw new Error('לא נמצאו כתובות מייל תקינות');
        }

        // קבלת המיילים הקיימים מה-storage
        const result = await chrome.storage.local.get('extractedEmails');
        const existingEmails = result.extractedEmails || [];
        
        // איחוד המיילים החדשים עם הקיימים והסרת כפילויות
        const allEmails = [...new Set([...existingEmails, ...validEmails])];
        
        // שמירה בחזרה ל-storage
        await chrome.storage.local.set({ extractedEmails: allEmails });
        
        return {
            success: true,
            allEmails,
            newValidEmails: validEmails,
            invalidEmails: newEmails.filter(email => !isValidEmail(email))
        };
    } catch (error) {
        console.error('שגיאה בשמירת המיילים:', error);
        return {
            success: false,
            error: error.message,
            allEmails: [],
            newValidEmails: [],
            invalidEmails: newEmails
        };
    }
}

function createPopup(emails, savedResult) {
    // הסרת פופאפ קודם אם קיים
    const existingPopup = document.querySelector('#email-extractor-popup');
    if (existingPopup) existingPopup.remove();

    // הוספת הפונט
    if (!document.querySelector('#heebo-font')) {
        const fontLink = document.createElement('link');
        fontLink.id = 'heebo-font';
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600&display=swap';
        document.head.appendChild(fontLink);
    }

    // יצירת הפופאפ
    const popup = document.createElement('div');
    popup.id = 'email-extractor-popup';

    // כותרת
    const title = document.createElement('h3');

    // הוספת אייקון לכותרת
    const icon = document.createElement('div');
    if (savedResult.success) {
        icon.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        title.textContent = 'המיילים הבאים נוספו לרשימה:';
        title.className = 'success';
    } else {
        icon.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" stroke="var(--error)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        title.textContent = 'שגיאה בהוספת המיילים:';
        title.className = 'error';
    }
    title.prepend(icon);
    popup.appendChild(title);

    // רשימת המיילים
    const list = document.createElement('div');
    list.className = 'list-area';
    
    if (savedResult.success) {
        savedResult.newValidEmails.forEach(email => {
            const emailDiv = document.createElement('div');
            emailDiv.className = 'email-item';
            
            const emailIcon = document.createElement('div');
            emailIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" stroke="var(--primary)" stroke-width="1.5"/></svg>';
            emailDiv.appendChild(emailIcon);
            
            const emailText = document.createElement('span');
            emailText.textContent = email;
            emailDiv.appendChild(emailText);
            
            list.appendChild(emailDiv);
        });

        if (savedResult.invalidEmails.length > 0) {
            const invalidTitle = document.createElement('div');
            invalidTitle.className = 'invalid-title';
            invalidTitle.textContent = 'כתובות לא תקינות שלא נוספו:';
            list.appendChild(invalidTitle);

            savedResult.invalidEmails.forEach(email => {
                const emailDiv = document.createElement('div');
                emailDiv.className = 'email-item invalid';
                
                const emailIcon = document.createElement('div');
                emailIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" stroke="var(--error)" stroke-width="1.5"/></svg>';
                emailDiv.appendChild(emailIcon);
                
                const emailText = document.createElement('span');
                emailText.textContent = email;
                emailDiv.appendChild(emailText);
                
                list.appendChild(emailDiv);
            });
        }
    } else {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        
        const errorIcon = document.createElement('div');
        errorIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" stroke="var(--error)" stroke-width="1.5"/></svg>';
        errorDiv.appendChild(errorIcon);
        
        const errorText = document.createElement('span');
        errorText.textContent = savedResult.error;
        errorDiv.appendChild(errorText);
        
        list.appendChild(errorDiv);
    }
    
    popup.appendChild(list);

    if (savedResult.success) {
        // סיכום
        const summary = document.createElement('div');
        summary.className = 'summary';
        
        const summaryIcon = document.createElement('div');
        summaryIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--success)" stroke-width="1.5"/></svg>';
        summary.appendChild(summaryIcon);
        
        const summaryText = document.createElement('span');
        summaryText.textContent = `נוספו ${savedResult.newValidEmails.length} כתובות מייל חדשות לרשימה`;
        summary.appendChild(summaryText);
        
        popup.appendChild(summary);
    }

    // כפתור סגירה
    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    closeButton.onclick = () => {
        popup.remove();
        overlay.remove();
    };
    popup.appendChild(closeButton);

    // רקע אפור
    const overlay = document.createElement('div');
    overlay.id = 'email-extractor-popup-overlay';
    overlay.onclick = () => {
        popup.remove();
        overlay.remove();
    };

    // הוספה לדף
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    // סגירה אוטומטית אחרי 3 שניות רק אם הצליח
    if (savedResult.success) {
        setTimeout(() => {
            popup.remove();
            overlay.remove();
        }, 3000);
    }
}

function extractSelectedEmails() {
    // מציאת כל האימיילים המסומנים
    const selectedRows = document.querySelectorAll('tr.x7');
    const emails = new Set();
    
    selectedRows.forEach(row => {
        // מציאת תא השולח בשורה
        const senderCell = row.querySelector('td[role="gridcell"] span[email]');
        if (senderCell) {
            const email = senderCell.getAttribute('email');
            // בדיקה שהמייל קיים ותקין
            if (email && isValidEmail(email)) {
                emails.add(email);
            }
        }
    });

    return Array.from(emails);
}

function addExtractButton() {
    const toolbar = document.querySelector('.G-Ni.G-aE.J-J5-Ji');
    if (!toolbar) return;

    if (document.querySelector('#extract-emails-button')) return;

    const button = document.createElement('div');
    button.id = 'extract-emails-button';
    button.className = 'T-I J-J5-Ji T-I-ax7 T-I-Js-Gs';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'חלץ כתובות אימייל');
    button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
        <circle cx="18" cy="18" r="6" fill="currentColor"/>
        <path d="M18 15v6M15 18h6" stroke="white"/>
    </svg>`;
    button.title = 'חלץ כתובות אימייל';

    // הוספת אירועי hover
    button.addEventListener('mouseover', () => {
        button.classList.add('T-I-JW');
    });
    
    button.addEventListener('mouseout', () => {
        button.classList.remove('T-I-JW');
    });

    // הוספת אירועי click
    button.addEventListener('mousedown', () => {
        button.classList.add('T-I-Js-Gs');
    });
    
    button.addEventListener('mouseup', () => {
        button.classList.remove('T-I-Js-Gs');
    });

    // הוספת אירוע לחיצה לחילוץ מיילים
    button.addEventListener('click', async () => {
        const selectedEmails = extractSelectedEmails();
        if (selectedEmails.length === 0) {
            createPopup([], { 
                success: false, 
                error: 'לא נמצאו כתובות מייל בהודעות שנבחרו',
                allEmails: [],
                newValidEmails: [],
                invalidEmails: []
            });
            return;
        }
        const savedResult = await saveEmailsToStorage(selectedEmails);
        createPopup(selectedEmails, savedResult);
    });

    toolbar.insertBefore(button, null);
}

// הגדרת MutationObserver לזיהוי טעינת הממשק
const observer = new MutationObserver((mutations) => {
    if (document.querySelector('.G-Ni.G-aE.J-J5-Ji')) {
        addExtractButton();
    }
});

// התחלת המעקב אחרי שינויים בדף
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// האזנה להודעות מהפופאפ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractEmails") {
        const emails = extractEmailsFromPage();
        sendResponse({ emails });
    }
    return true;
}); 