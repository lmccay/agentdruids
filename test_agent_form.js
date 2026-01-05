#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function testAgentForm() {
  console.log('Testing agent form population...');
  
  const browser = await puppeteer.launch({ 
    headless: false, 
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Go to the agents page
    console.log('Navigating to agents page...');
    await page.goto('http://localhost:3004/agents', { waitUntil: 'networkidle0' });
    
    // Wait for the page to load
    await page.waitForSelector('.card', { timeout: 10000 });
    console.log('Agents page loaded');
    
    // Find the first edit button and click it
    const editButtons = await page.$$('[data-testid="edit-button"], .edit-button, button[title*="Edit"]');
    if (editButtons.length === 0) {
      // Try finding edit icon in dropdown menu
      const moreButtons = await page.$$('button[aria-label*="menu"], button[title*="More"]');
      if (moreButtons.length > 0) {
        console.log('Clicking more options button...');
        await moreButtons[0].click();
        await page.waitForTimeout(500);
        
        // Look for edit in dropdown
        const editInDropdown = await page.$('button:has-text("Edit")');
        if (editInDropdown) {
          console.log('Clicking edit from dropdown...');
          await editInDropdown.click();
        } else {
          console.log('Could not find edit button in dropdown');
          await browser.close();
          return;
        }
      } else {
        console.log('No edit buttons found');
        await browser.close();
        return;
      }
    } else {
      console.log('Clicking edit button...');
      await editButtons[0].click();
    }
    
    // Wait for modal to appear
    await page.waitForSelector('.modal, [role="dialog"], .fixed.inset-0', { timeout: 5000 });
    console.log('Edit modal opened');
    
    // Check if form fields are populated
    const nameField = await page.$('input[name="name"], input[placeholder*="name"], input[type="text"]');
    const descField = await page.$('textarea[name="description"], textarea[placeholder*="description"]');
    
    if (nameField) {
      const nameValue = await page.evaluate(el => el.value, nameField);
      console.log('Name field value:', nameValue);
    }
    
    if (descField) {
      const descValue = await page.evaluate(el => el.value, descField);
      console.log('Description field value:', descValue);
    }
    
    console.log('Test completed - check console for form field values');
    
    // Keep browser open for manual inspection
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

// Check if puppeteer is available
try {
  testAgentForm();
} catch (error) {
  console.log('Puppeteer not available, testing manually...');
  console.log('Please:');
  console.log('1. Open http://localhost:3004/agents in your browser');
  console.log('2. Click the three dots menu on any agent card');
  console.log('3. Click "Edit" from the dropdown');
  console.log('4. Check if the form fields are populated with the agent data');
}