import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } }); // Clean slate

test('Treasurer Global 404 Check', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  
  await page.fill('input[name="email"]', 'treasurer@dormy.local');
  await page.fill('input[name="password"]', 'DormyPass123!');
  await page.click('button[type="submit"]');
  
  await page.waitForURL('**/treasurer/home');
  await page.goto('http://localhost:3000/treasurer/contributions');

  // Wait for Manage buttons to appear
  await page.waitForSelector('text=Manage', { timeout: 10000 });

  const links = await page.$$eval('a', els => els.map(e => e.href).filter(h => h.includes('/treasurer/contributions/')));
  console.log("Found matching links:", links);
  
  if (links.length > 0) {
     const target = links[0];
     console.log("Navigating to:", target);
     await page.goto(target);
     
     // Wait for either the debug block or the 404 page
     await page.waitForTimeout(2000); 
     
     const content = await page.textContent('body');
     if (content?.includes('DEBUG NO ENTRIES (404 Avoided)')) {
        console.log("HIT DEBUG BLOCK!");
        const pTags = await page.$$eval('p', texts => texts.map(t => t.innerText));
        console.log(pTags.filter(t => t.includes('URL Params contributionId:') || t.includes('Raw DB Entries Count:') || t.includes('ID:') || t.includes('Metadata:')));
     } else if (content?.includes('Page Not Found') || content?.includes('404')) {
        console.log("HIT STANDARD 404 PAGE!");
     } else {
        console.log("Hit detail page successfully?");
        console.log(content?.substring(0, 500));
     }
  } else {
     console.log("No Manage buttons found on the page.");
  }
});
