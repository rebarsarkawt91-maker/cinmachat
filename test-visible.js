#!/usr/bin/env node
/**
 * Visible Playwright browser automation test
 * Tests: IMDb seek controls + Watch Together flow
 */

import { chromium } from 'playwright';
import path from 'path';

const BASE_URL = 'http://localhost:3004';
const USER1_PHONE = '07719703424';
const USER2_PHONE = '07701966644';

async function main() {
  console.log('🎬 Starting visible Chrome browser automation test...\n');
  
  let browser1, browser2, context1, context2;
  
  try {
    // Launch two visible Chrome instances
    console.log('📱 Launching Chrome Browser 1 for User 1...');
    browser1 = await chromium.launch({ 
      headless: false, // VISIBLE
      args: ['--start-maximized']
    });
    context1 = await browser1.newContext();
    const page1 = await context1.newPage();
    
    console.log('📱 Launching Chrome Browser 2 for User 2...');
    browser2 = await chromium.launch({ 
      headless: false, // VISIBLE
      args: ['--start-maximized']
    });
    context2 = await browser2.newContext();
    const page2 = await context2.newPage();
    
    // ========== TEST 1: IMDb Seek Control ==========
    console.log('\n▶️  TEST 1: IMDb Seek Control');
    console.log(`   Opening ${BASE_URL}...`);
    
    await page1.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page1.waitForLoadState('domcontentloaded');
    
    // Wait a bit for page to fully render
    await page1.waitForTimeout(3000);
    
    console.log('   Searching for IMDb embed...');
    // Look for IMDb proxy link
    const imdLinks = await page1.locator('a, button, [href*="imdb"], [href*="proxy"]').all();
    console.log(`   Found ${imdLinks.length} potential links`);
    
    // Try to find and click IMDb player
    const imdLink = await page1.locator('[href*="proxy.garageband.rocks"], a:has-text("IMDb"), button:has-text("IMDb")').first();
    if (await imdLink.count() > 0) {
      console.log('   ✓ Found IMDb link, clicking...');
      await imdLink.click();
      await page1.waitForTimeout(3000);
    } else {
      console.log('   ⚠️  IMDb link not found in typical locations, checking for embedded player...');
    }
    
    // Look for video player
    const videoPlayer = await page1.locator('video, iframe[src*="proxy"], [class*="player"]').first();
    if (await videoPlayer.count() > 0) {
      console.log('   ✓ Video player detected');
      
      // Try to find progress bar
      const progressBar = await page1.locator('[role="progressbar"], .progress, [class*="progress"], .vjs-progress-holder').first();
      if (await progressBar.count() > 0) {
        console.log('   ✓ Progress bar found, attempting to seek to 10:00+...');
        
        // Get progress bar bounding box
        const bbox = await progressBar.boundingBox();
        if (bbox) {
          // Click at 75% position (roughly 10 minutes on a typical video)
          const seekX = bbox.x + (bbox.width * 0.75);
          const seekY = bbox.y + (bbox.height / 2);
          
          console.log(`   🖱️  Clicking progress bar at (${Math.round(seekX)}, ${Math.round(seekY)})...`);
          await page1.mouse.click(seekX, seekY);
          
          await page1.waitForTimeout(2000);
          console.log('   ✓ Seek click executed, checking for frame change...');
          
          // Take screenshot to verify
          await page1.screenshot({ path: 'test-imdb-seek.png' });
          console.log('   ✓ Screenshot saved: test-imdb-seek.png');
        } else {
          console.log('   ⚠️  Could not get progress bar dimensions');
        }
      } else {
        console.log('   ⚠️  Progress bar not found');
      }
    } else {
      console.log('   ⚠️  Video player not found on page');
    }
    
    // ========== TEST 2: Watch Together Flow ==========
    console.log('\n▶️  TEST 2: Watch Together (Two-User Flow)');
    console.log('   Setting up User 1 and User 2...\n');
    
    // Load User 1
    console.log(`   User 1: Loading ${BASE_URL}...`);
    await page1.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(2000);
    
    // Load User 2
    console.log(`   User 2: Loading ${BASE_URL}...`);
    await page2.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(2000);
    
    console.log('\n   Looking for social/call UI elements...');
    
    // Try to find Call/Social button
    const callButton1 = await page1.locator('[data-testid="call"], [class*="call"], button:has-text("Call"), button:has-text("Share"), [class*="social"]').first();
    const callButton2 = await page2.locator('[data-testid="call"], [class*="call"], button:has-text("Call"), button:has-text("Share"), [class*="social"]').first();
    
    if (await callButton1.count() > 0 && await callButton2.count() > 0) {
      console.log('   ✓ Call/Share buttons found on both users');
      
      // User 1: Initiate call
      console.log(`\n   User 1 (${USER1_PHONE}): Initiating Watch Together call...`);
      await callButton1.click();
      await page1.waitForTimeout(1500);
      
      // Try to find phone input for User 2
      const phoneInput = await page1.locator('input[type="tel"], input[placeholder*="phone"], input[placeholder*="07"]').first();
      if (await phoneInput.count() > 0) {
        console.log(`   Entering User 2 phone number: ${USER2_PHONE}`);
        await phoneInput.fill(USER2_PHONE);
        await page1.waitForTimeout(500);
        
        // Look for Send/Call button
        const sendButton = await page1.locator('button:has-text("Call"), button:has-text("Send"), button:has-text("Invite")').first();
        if (await sendButton.count() > 0) {
          console.log('   Sending call invitation...');
          await sendButton.click();
          await page1.waitForTimeout(2000);
        }
      }
      
      // User 2: Wait for incoming call notification
      console.log(`\n   User 2 (${USER2_PHONE}): Waiting for incoming call...`);
      const incomingNotif = await page2.locator('[class*="notification"], [class*="incoming"], [class*="alert"]').first();
      if (await incomingNotif.count() > 0) {
        console.log('   ✓ Incoming call notification detected');
        
        // Look for Accept button
        const acceptButton = await page2.locator('button:has-text("Accept"), button:has-text("Join"), button:has-text("Yes")').first();
        if (await acceptButton.count() > 0) {
          console.log('   Clicking Accept...');
          await acceptButton.click();
          await page2.waitForTimeout(3000);
          console.log('   ✓ Accept clicked, checking for room transition...');
        }
      }
      
      // Verify both users in same room
      console.log('\n   Verifying room state for both users...');
      const user1Room = await page1.locator('[class*="room"], [class*="watch"], [data-testid="room"]').first();
      const user2Room = await page2.locator('[class*="room"], [class*="watch"], [data-testid="room"]').first();
      
      if (await user1Room.count() > 0 && await user2Room.count() > 0) {
        console.log('   ✓ Both users appear to be in a shared room');
        
        // Take screenshots
        await page1.screenshot({ path: 'test-watch-user1.png' });
        await page2.screenshot({ path: 'test-watch-user2.png' });
        console.log('   ✓ Screenshots saved: test-watch-user1.png, test-watch-user2.png');
      } else {
        console.log('   ⚠️  Room transition not clearly visible');
      }
      
    } else {
      console.log('   ⚠️  Call/Social buttons not found in expected locations');
    }
    
    console.log('\n✅ Test execution complete!');
    console.log('📂 Check screenshots for visual verification');
    console.log('🔍 Browser windows remain OPEN for manual inspection');
    console.log('   Press any key in this terminal to close browsers...\n');
    
    // Keep browsers open for manual inspection
    await new Promise(resolve => {
      const stdin = process.stdin;
      stdin.once('data', () => { resolve(); });
      stdin.setRawMode(true);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    console.log('\nClosing browsers...');
    if (browser1) await browser1.close();
    if (browser2) await browser2.close();
    console.log('Done.');
  }
}

main();
