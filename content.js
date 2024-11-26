function extractEmailsFromPage() {
    const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
    const results = new Set();
    
    // חונקציה לבדיקה אם אלמנט שייך לדף הראשי ומיועד להצגה
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

// האזנה להודעות מהפופאפ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractEmails") {
        const emails = extractEmailsFromPage();
        sendResponse({ emails });
    }
    return true;
}); 