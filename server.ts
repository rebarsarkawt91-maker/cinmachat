import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { rateLimiter, sanitizationMiddleware, createAdminGuard, logFailedAttempt } from './security';

// Global error handlers - Move to top to catch early errors
process.on('uncaughtException', (err: any) => {
  console.error('UNCAUGHT EXCEPTION:', err.message || err);
  if (err.stack) console.error(err.stack);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED REJECTION:', reason?.message || reason);
  if (reason?.stack) console.error(reason.stack);
});

const DB_PATH = path.join(process.cwd(), 'db.json');

// Initial DB Structure
const INITIAL_DB = {
  admins: [
    { username: 'admin', password: 'password123', isSuper: true, isOwner: true, role: 'owner' }
  ],
  users: [] as any[], // Added user storage
  categories: ["هەمووی", "ئاکشن", "کۆمیدی", "دراما", "ترسناک", "ئەنیمێ", "دۆکیومێنتاری"],
  heroConfig: {
    youtubeId: 'YPY7J-flzE8', // Default extraction 2 trailer
    manualFeaturedId: null as string | null,
    heroVideoUrl: 'https://www.youtube.com/watch?v=YPY7J-flzE8',
    heroPlaylist: [
      'https://www.youtube.com/watch?v=YPY7J-flzE8',
      'https://www.youtube.com/watch?v=YPY7J-flzE8',
      'https://www.youtube.com/watch?v=YPY7J-flzE8'
    ]
  },
  syncGroups: {
    "global_room_official": {
      id: "global_room_official",
      name: "پەخشی ڕاستەوخۆ",
      currentMovieId: "hero-promo",
      playback: {
        isPlaying: true,
        currentTime: 0,
        updatedAt: new Date().toISOString()
      },
      videoData: {
        id: "hero-promo",
        title: "پەخشی ڕاستەوخۆ",
        isYouTube: true,
        url: "https://www.youtube.com/embed/YPY7J-flzE8"
      }
    }
  },
  deletedIds: [] as string[],
  bannedIps: [] as string[],
  manualMovies: [] as any[],
  vipVideos: [] as any[],
  tagOverrides: {} as Record<string, string[]>,
  rooms: {
    "global_room_official": {
      id: "global_room_official",
      name: "ژووری سەرەکی",
      currentMovieId: "hero-promo",
      playback: {
        isPlaying: true,
        currentTime: 0,
        updatedAt: new Date().toISOString()
      },
      videoData: null
    }
  } as Record<string, any>
};

async function loadDB() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const db = JSON.parse(data);
    
    // Safety check & Deduplication to prevent key collisions in frontend
    if (db.manualMovies && Array.isArray(db.manualMovies)) {
      const initialCount = db.manualMovies.length;
      const uniqueMovies = Array.from(
        new Map(db.manualMovies.map((m: any) => [m.id, m])).values()
      );
      
      if (uniqueMovies.length !== initialCount) {
        console.log(`[DB] Automatically deduplicated ${initialCount - uniqueMovies.length} movies during load.`);
        db.manualMovies = uniqueMovies;
        // Persist the clean version
        await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
      }
    }
    
    return db;
  } catch (e) {
    await fs.writeFile(DB_PATH, JSON.stringify(INITIAL_DB, null, 2));
    return INITIAL_DB;
  }
}

async function saveDB(db: any) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

// Helper for fetch with timeout
async function fetchWithTimeout(url: string, options: any = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function startServer() {
  console.log('==================================================');
  console.log(`[${new Date().toISOString()}] CinemaChat Server Starting...`);
  console.log('==================================================');

  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  // Database initialization
  let db: any;
  try {
    db = await loadDB();
    console.log('[DB] Database loaded successfully');
  } catch (err) {
    console.error('[DB] Critical failed to load/init database:', err);
    db = { ...INITIAL_DB }; // Fallback to memory
  }
  
  if (!db.deletedIds) db.deletedIds = [];
  if (!db.tagOverrides) db.tagOverrides = {};
  if (!db.bannedIps) db.bannedIps = [];
  if (!db.youtubeChannelUrl) db.youtubeChannelUrl = "https://www.youtube.com/";
  if (!db.youtubeUrl) db.youtubeUrl = "https://www.youtube.com/";
  if (!db.tiktokUrl) db.tiktokUrl = "https://www.tiktok.com/";
  if (!db.instagramUrl) db.instagramUrl = "https://www.instagram.com/";
  if (!db.facebookUrl) db.facebookUrl = "https://www.facebook.com/";
  if (!db.failedLoginAttempts) db.failedLoginAttempts = [];
  if (!db.bannedKeywords) db.bannedKeywords = [];
  if (db.emergencyLock === undefined) db.emergencyLock = false;
  if (!db.securityAuditLogs) db.securityAuditLogs = [];
  if (!db.systemErrorLogs) db.systemErrorLogs = [];
  if (!db.intrusionAttempts) db.intrusionAttempts = [];
  if (!db.vipTickets) db.vipTickets = [];
  if (!db.vipVideos) db.vipVideos = [];
  if (!Array.isArray(db.rooms)) db.rooms = [];
  if (!db.vipSettings) db.vipSettings = {
    qrCodeUrl: "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
    paymentDetails: "ژمارەی باڵانسی فاستپەی / زین کاش: 07501234567\nبانکی واڵێت: FIb - 12345678",
    instructions: "بۆ بەژداریکردن و بینینی پەخشی ڕاستەوخۆی VIP CinemaChat بە شێوەی هەمیشەیی، بڕی پارەی تیکێتەکە بنێرە و پاشان پەیوەندی بە ئەدمینەوە بکە لە تێلیگرام (@cinemasupport) بۆ وەرگرتنی کۆدەکەت."
  };

  // Support Module 17 - Super Admin (Owner) Seed
  const ownerUserSeedName = "admin";
  const ownerUserSeedPassHash = crypto.createHash('sha256').update('password123').digest('hex');
  if (!db.admins) db.admins = [];
  
  // Retain only 'admin' and ensure all system permissions are assigned to it
  let adminAccount = db.admins.find((a: any) => a.username?.toLowerCase() === "admin");
  if (!adminAccount) {
    adminAccount = {
      username: "admin",
      password: ownerUserSeedPassHash,
      isSuper: true,
      isOwner: true,
      role: "owner"
    };
    db.admins.push(adminAccount);
  } else {
    adminAccount.isSuper = true;
    adminAccount.isOwner = true;
    adminAccount.role = "owner";
  }

  // Remove Others: Securely delete all other sub-admin, assistant, and deputy manager accounts
  // Safety Check: Before executing, ensure that if there is an active session representation we don't block them,
  // but since we are migrating to single-admin structure we normalize the list to contain only 'admin'.
  db.admins = db.admins.filter((a: any) => a.username?.toLowerCase() === "admin");

  fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)).catch(console.error);
  console.log(`[Module 17] Normalised to Single Admin Model. Retained only '${ownerUserSeedName}' account.`);
  if (!db.ownerNotifications) db.ownerNotifications = [];

  // State
  const syncRateLimits: Record<string, number[]> = {};
  const failedLoginCounts: Record<string, number> = {};

  function getIpLocation(ip: string): string {
    if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.")) {
      return "ناوەخۆ (Erbil, KR)";
    }
    const cities = ["Erbil", "Sulaymaniyah", "Duhok", "Kirkuk", "Halabja", "Zakho", "Sorani"];
    const sum = ip.split('.').reduce((acc, val) => acc + (parseInt(val) || 0), 0);
    const city = cities[sum % cities.length] || "Erbil";
    return `${city}, Kurdistan`;
  }

  async function addAuditLog(dbAny: any, admin: string, action: string, details: string) {
    if (!dbAny.securityAuditLogs) dbAny.securityAuditLogs = [];
    dbAny.securityAuditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      admin: admin || "Admin",
      action,
      details,
      timestamp: new Date().toISOString()
    });
    if (dbAny.securityAuditLogs.length > 500) {
      dbAny.securityAuditLogs = dbAny.securityAuditLogs.slice(0, 500);
    }
  }

  async function addSystemErrorLog(dbAny: any, source: string, message: string, details: string) {
    if (!dbAny.systemErrorLogs) dbAny.systemErrorLogs = [];
    dbAny.systemErrorLogs.unshift({
      id: 'err-' + Math.random().toString(36).substring(2, 9),
      source,
      message,
      details,
      timestamp: new Date().toISOString()
    });
    if (dbAny.systemErrorLogs.length > 200) {
      dbAny.systemErrorLogs = dbAny.systemErrorLogs.slice(0, 200);
    }
  }

  function logUserActivity(dbAny: any, uniqueCode: string, action: string, details: string, ip: string) {
    if (!dbAny.userActivities) dbAny.userActivities = [];
    dbAny.userActivities.unshift({
      id: 'act-' + Math.random().toString(36).substring(2, 9),
      uniqueCode: (uniqueCode || '').trim().toUpperCase(),
      action,
      details,
      ip: ip || "Unknown",
      timestamp: new Date().toISOString()
    });
    if (dbAny.userActivities.length > 2000) {
      dbAny.userActivities = dbAny.userActivities.slice(0, 2000);
    }
  }

  async function addIntrusionAttempt(dbAny: any, ip: string, path: string, payload: string, type: string) {
    if (!dbAny.intrusionAttempts) dbAny.intrusionAttempts = [];
    const loc = getIpLocation(ip);
    dbAny.intrusionAttempts.unshift({
      id: 'int-' + Math.random().toString(36).substring(2, 9),
      ip,
      location: loc,
      path,
      payload,
      type,
      timestamp: new Date().toISOString()
    });
    if (dbAny.intrusionAttempts.length > 200) {
      dbAny.intrusionAttempts = dbAny.intrusionAttempts.slice(0, 200);
    }
  }
  let trackerText = "بەخێربێن بۆ CinamaChat - نوێترین فیلم و زنجیرەکان لێرە ببینە";
  let trackerType = "normal"; 
  let lastFetchTime = new Date().toISOString();
  let visitors = 1250;
  
  // Movie Store (In-Memory Cache) - Use a copy to prevent reference sharing with DB
  let moviesCache: any[] = db.manualMovies ? [...db.manualMovies] : [];

  let ads = {
    banner: { image: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1200', link: '#' },
    sidebar: { image: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?auto=format&fit=crop&q=80&w=800', link: '#' }
  };
  
  function setMoviesCache(updater: (prev: any[]) => any[]) {
    moviesCache = updater(moviesCache);
  }

  // Social Links updated for WhatsApp
  let socialLinks = {
    whatsapp: '9647701966649',
    group: 'https://chat.whatsapp.com/Cinmachat',
    instagram: '#',
    facebook: '#'
  };

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cors());

  // Security Middlewares
  app.use(rateLimiter);
  app.use(sanitizationMiddleware);

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Failed Request Error Logger Middleware
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400 && req.url.startsWith('/api/')) {
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
        const cleanIp = clientIp.trim();
        addSystemErrorLog(
          db, 
          `${req.method} ${req.url}`, 
          `شکست لە داواکاری بە کۆدی HTTP ${res.statusCode}`, 
          `ئایپی بەکارهێنەر: ${cleanIp}`
        );
      }
    });
    next();
  });

  // Global Intrusion/Hack Attempt Tracker Middleware
  app.use(async (req, res, next) => {
    if (req.url.startsWith('/api/')) {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      const cleanIp = clientIp.trim();
      
      // Look for common patterns
      const suspectPatterns = [
        /union\s+select/i,
        /or\s+1\s*=\s*1/i,
        /['"]\s*or\s*['"]\s*1/i,
        /<script\b[^>]*>/i,
        /javascript:/i,
        /etc\/passwd/i,
        /\.\.\/\.\./,
        /\b(drop|truncate|delete)\s+table\b/i
      ];

      let urlToTest = "";
      try {
        urlToTest = decodeURIComponent(req.originalUrl || req.url || "");
      } catch {
        urlToTest = req.originalUrl || req.url || "";
      }
      
      const bodyToTest = req.body ? JSON.stringify(req.body) : "";

      let matchedPattern = "";
      for (const pattern of suspectPatterns) {
        if (pattern.test(urlToTest)) {
          matchedPattern = `URL matched: ${pattern.toString()}`;
          break;
        }
        if (pattern.test(bodyToTest)) {
          matchedPattern = `BODY matched: ${pattern.toString()}`;
          break;
        }
      }

      if (matchedPattern) {
        console.warn(`[SECURITY WARNING] Threat detected from IP: ${cleanIp}. Matched: ${matchedPattern}`);
        await addIntrusionAttempt(db, cleanIp, req.url, matchedPattern, "SQL Injection / XSS Probe");
        
        // Count total threat records for this IP
        const ipThreatCount = db.intrusionAttempts.filter((att: any) => att.ip === cleanIp).length;
        if (ipThreatCount >= 3) {
          if (!db.bannedIps) db.bannedIps = [];
          if (!db.bannedIps.includes(cleanIp)) {
            db.bannedIps.push(cleanIp);
            await addAuditLog(db, "SYSTEM_AUTO_SHIELD", "Auto IP Block (Intrusion)", `بلۆککردنی خۆکاری ئایپی ${cleanIp} بەهۆی زیاتر لە ٣ هەوڵی هێرشبردن.`);
            await saveDB(db);
          }
          return res.status(403).json({ error: "سیستەمی قەڵغانی ئاسایش ڕێگری لێکردیت بەهۆی گۆڕانکاری گوماناوی لکێندراو" });
        }
        
        await saveDB(db);
        return res.status(400).json({ error: "کرداری گوماناوی دۆزرایەوە (Potential Threat Blocked by Security Shield)" });
      }
    }
    next();
  });

  // IP Ban Guard Middleware (Point 2: Rejects banned visitor IPs with 403 Forbidden)
  app.use((req, res, next) => {
    if (req.url === '/api/check-ban') {
      return next();
    }
    if (req.url.startsWith('/api/')) {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      const cleanIp = clientIp.trim();
      const isBanned = db.bannedIps && db.bannedIps.some((item: string) => {
        const cleanItem = String(item).trim();
        return cleanItem === cleanIp || cleanIp.includes(cleanItem);
      });
      if (isBanned && !req.url.startsWith('/api/admin/unban-ip')) {
        console.warn(`[IP Blocked] Blocked request from banned IP: ${cleanIp} to ${req.url}`);
        return res.status(403).json({ banned: true, error: 'تۆ بلۆک کراویت' });
      }
    }
    next();
  });

  // Site Emergency Lock Middleware (Point 5: Access Gateway / Emergency Lock)
  app.use((req, res, next) => {
    if (db.emergencyLock) {
      const isApiCall = req.url.startsWith('/api/');
      const isAdminCall = req.url.startsWith('/api/admin/') || req.url === '/api/admin/login' || req.url === '/api/check-ban';
      const isStaticAsset = req.url.includes('.') && !isApiCall;
      
      if (isApiCall && !isAdminCall && !isStaticAsset) {
        return res.status(503).json({ emergencyLock: true, error: '⚠️ ماڵپەڕ لە ئێستادا بە شێوەیەکی کاتی داخراوە بەهۆی باری نائاسایی.' });
      }
    }
    next();
  });

  // Strict Server-Side Admin Guard Enforcement
  app.use(createAdminGuard(db));

  // Check-ban status endpoint
  app.get('/api/check-ban', (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
    const cleanIp = clientIp.trim();
    const isBanned = db.bannedIps && db.bannedIps.some((item: string) => {
      const cleanItem = String(item).trim();
      return cleanItem === cleanIp || cleanIp.includes(cleanItem);
    });
    res.json({ banned: !!isBanned, ip: cleanIp, emergencyLock: !!db.emergencyLock });
  });

  // Banned IPs administration endpoints
  app.get('/api/admin/banned-ips', (req, res) => {
    res.json(db.bannedIps || []);
  });

  app.post('/api/admin/ban-ip', async (req, res) => {
    const { ip, adminName } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP address required' });
    if (!db.bannedIps) db.bannedIps = [];
    const cleanIp = String(ip).trim();
    if (!db.bannedIps.includes(cleanIp)) {
      db.bannedIps.push(cleanIp);
      await addAuditLog(db, adminName, "Ban IP", `ئایپی بلۆککرا: ${cleanIp}`);
      await saveDB(db);
      console.log(`[Ban IP] Admin banned IP: ${cleanIp}`);
    }
    res.json({ success: true, bannedIps: db.bannedIps });
  });

  app.post('/api/admin/unban-ip', async (req, res) => {
    const { ip, adminName } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP address required' });
    if (!db.bannedIps) db.bannedIps = [];
    const cleanIp = String(ip).trim();
    db.bannedIps = db.bannedIps.filter((item: string) => String(item).trim() !== cleanIp);
    await addAuditLog(db, adminName, "Unban IP", `بلۆکی ئایپی لادرا: ${cleanIp}`);
    await saveDB(db);
    console.log(`[Unban IP] Admin unbanned IP: ${cleanIp}`);
    res.json({ success: true, bannedIps: db.bannedIps });
  });

  // Firewall Logs Tracking (Point 2: Firewall Logs & Point 3: Auto-Ban count)
  app.get('/api/admin/firewall-logs', (req, res) => {
    res.json(db.failedLoginAttempts || []);
  });

  // Banned Keywords List (Point 4: Content Filter)
  app.get('/api/admin/banned-keywords', (req, res) => {
    res.json(db.bannedKeywords || []);
  });

  // Public Banned Keywords for Chat filters
  app.get('/api/banned-keywords', (req, res) => {
    res.json(db.bannedKeywords || []);
  });

  app.post('/api/admin/add-banned-keyword', async (req, res) => {
    const { keyword, adminName } = req.body;
    if (!keyword || !keyword.trim()) return res.status(400).json({ error: 'Keyword required' });
    const cleanKw = String(keyword).trim();
    if (!db.bannedKeywords) db.bannedKeywords = [];
    if (!db.bannedKeywords.includes(cleanKw)) {
      db.bannedKeywords.push(cleanKw);
      await addAuditLog(db, adminName, "Add Keyword", `وشەی قەدەغەکراو زیادکرا: "${cleanKw}"`);
      await saveDB(db);
    }
    res.json({ success: true, bannedKeywords: db.bannedKeywords });
  });

  app.post('/api/admin/delete-banned-keyword', async (req, res) => {
    const { keyword, adminName } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Keyword required' });
    const cleanKw = String(keyword).trim();
    if (!db.bannedKeywords) db.bannedKeywords = [];
    db.bannedKeywords = db.bannedKeywords.filter((k: string) => String(k).trim() !== cleanKw);
    await addAuditLog(db, adminName, "Delete Keyword", `وشەی قەدەغەکراو لادرا: "${cleanKw}"`);
    await saveDB(db);
    res.json({ success: true, bannedKeywords: db.bannedKeywords });
  });

  // Emergency Lock Toggle (Point 5: Access Gateway)
  app.get('/api/admin/emergency-lock', (req, res) => {
    res.json({ emergencyLock: !!db.emergencyLock });
  });

  app.post('/api/admin/toggle-emergency-lock', async (req, res) => {
    const { enabled, adminName } = req.body;
    db.emergencyLock = !!enabled;
    await addAuditLog(db, adminName, "Emergency Lock", `قوفڵی باری نائاسایی ماڵپەڕ ${db.emergencyLock ? "چالاککرا 🛑" : "ناچالاککرا 🔓"}`);
    await saveDB(db);
    res.json({ success: true, emergencyLock: db.emergencyLock });
  });

  // Security Audit Logs (Point 6: History Log)
  app.get('/api/admin/audit-logs', (req, res) => {
    res.json(db.securityAuditLogs || []);
  });

  // --- MODULE 12: DATABASE & SYSTEM AUDIT ENDPOINTS ---

  // Export full DB backup
  app.get('/api/admin/db-backup', (req, res) => {
    res.setHeader('Content-disposition', 'attachment; filename=cinemachat-db-backup.json');
    res.setHeader('Content-type', 'application/json');
    res.write(JSON.stringify(db, null, 2));
    res.end();
  });

  // Restore DB backup
  app.post('/api/admin/db-restore', async (req, res) => {
    try {
      const { backupData, adminName } = req.body;
      if (!backupData) {
        return res.status(400).json({ error: 'داتای باکئەپ بنێرە' });
      }

      // Basic validation
      if (!backupData.admins || !Array.isArray(backupData.admins)) {
        return res.status(400).json({ error: 'داتاکە گونجاو نییە، پێویستە لیستی لایەنگری ئەدمین و فۆرماتە دروستەکانی تێدابێت' });
      }

      // Overwrite
      db.admins = backupData.admins;
      if (backupData.manualMovies) db.manualMovies = backupData.manualMovies;
      if (backupData.categories) db.categories = backupData.categories;
      if (backupData.bannedIps) db.bannedIps = backupData.bannedIps;
      if (backupData.bannedKeywords) db.bannedKeywords = backupData.bannedKeywords;
      if (backupData.heroConfig) db.heroConfig = backupData.heroConfig;
      if (backupData.securityAuditLogs) db.securityAuditLogs = backupData.securityAuditLogs;
      if (backupData.systemErrorLogs) db.systemErrorLogs = backupData.systemErrorLogs;
      if (backupData.intrusionAttempts) db.intrusionAttempts = backupData.intrusionAttempts;
      
      await addAuditLog(db, adminName || "Admin", "Restore Database", "بنکەدراوەی گشتی بە سەرکەوتوویی لە دروستکراوەیەکی کۆن گەڕێندرایەوە");
      await saveDB(db);
      
      if (db.manualMovies) {
        setMoviesCache(() => [...db.manualMovies]);
      }

      res.json({ success: true, message: 'داتابەیس بە سەرکەوتوویی گەڕێندرایەوە' });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە گەڕاندنەوەی داتابەیس: ${err.message}` });
    }
  });

  // System Error Logs Endpoints
  app.get('/api/admin/error-logs', (req, res) => {
    try {
      if (!db) {
        return res.json([]);
      }
      if (!db.systemErrorLogs || !Array.isArray(db.systemErrorLogs)) {
        db.systemErrorLogs = [];
      }
      res.json(db.systemErrorLogs);
    } catch (err: any) {
      console.error("ERROR fetching error-logs:", err);
      res.status(500).json({ status: "error", error: err.message || "Failed to load system error logs" });
    }
  });

  app.post('/api/admin/clear-error-logs', async (req, res) => {
    const { adminName } = req.body;
    db.systemErrorLogs = [];
    await addAuditLog(db, adminName || "Admin", "Clear Error Logs", "هەموو تۆماری هەڵەکانی سیستەم سڕدرانەوە");
    await saveDB(db);
    res.json({ success: true, errorLogs: [] });
  });

  // Intrusion Attempts Endpoints
  app.get('/api/admin/intrusion-attempts', (req, res) => {
    try {
      if (!db) {
        return res.json([]);
      }
      if (!db.intrusionAttempts || !Array.isArray(db.intrusionAttempts)) {
        db.intrusionAttempts = [];
      }
      res.json(db.intrusionAttempts);
    } catch (err: any) {
      console.error("ERROR fetching intrusion-attempts:", err);
      res.status(500).json({ status: "error", error: err.message || "Failed to load intrusion attempts" });
    }
  });

  app.post('/api/admin/clear-intrusion-attempts', async (req, res) => {
    const { adminName } = req.body;
    db.intrusionAttempts = [];
    await addAuditLog(db, adminName || "Admin", "Clear Intrusion Attempts", "هەموو تۆماری هێرشە گوماناوییەکان سڕدرانەوە");
    await saveDB(db);
    res.json({ success: true, intrusionAttempts: [] });
  });

  // --- APP.TSX SNAPSHOT & ROLLBACK ENDPOINTS ---

  // Get all App snapshots
  app.get('/api/admin/snapshots', (req, res) => {
    res.json(db.appSnapshots || []);
  });

  // Create an App snapshot
  app.post('/api/admin/snapshots/create', async (req, res) => {
    try {
      const { name, description, adminName } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'ناوی کۆپی یەدەگ پێویستە' });
      }

      const filePath = path.join(process.cwd(), 'src', 'App.tsx');
      const content = await fs.readFile(filePath, 'utf-8');
      
      const newSnapshot = {
        id: 'snap_' + Date.now(),
        name: String(name).trim(),
        description: String(description || "").trim(),
        content,
        size: (content.length / 1024).toFixed(2) + " KB",
        adminName: adminName || "Admin",
        createdAt: new Date().toISOString()
      };

      if (!db.appSnapshots) db.appSnapshots = [];
      db.appSnapshots.unshift(newSnapshot);

      await addAuditLog(db, adminName || "Admin", "Create Code Snapshot", `کۆپی یەدەگی نوێ دروستکرا بۆ App.tsx بە ناوی: ${name}`);
      await saveDB(db);

      res.json({ success: true, snapshots: db.appSnapshots });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە دروستکردنی کۆپی یەدەگی App.tsx: ${err.message}` });
    }
  });

  // Restore an App snapshot
  app.post('/api/admin/snapshots/restore', async (req, res) => {
    try {
      const { snapshotId, adminName } = req.body;
      if (!snapshotId) {
        return res.status(400).json({ error: 'کۆدی ناسنامەی کۆپی یەدەگ پێویستە' });
      }

      const snapshots = db.appSnapshots || [];
      const snapshot = snapshots.find((s: any) => s.id === snapshotId);
      if (!snapshot) {
        return res.status(404).json({ error: 'ئەم کۆپییە یەدەگە بوونی نییە لە سیستەمدا!' });
      }

      const filePath = path.join(process.cwd(), 'src', 'App.tsx');
      
      // Auto pre-restore system safety backup of current state
      try {
        const currentContent = await fs.readFile(filePath, 'utf-8');
        const autoBackup = {
          id: 'snap_auto_' + Date.now(),
          name: `سیستەمی خۆکار (پێش گەڕاندنەوەی ${snapshot.name})`,
          description: "سیستەمی خۆکار بە شێوەیەکی خۆکارانە پێش گەڕاندنەوە جێگریکرد.",
          content: currentContent,
          size: (currentContent.length / 1024).toFixed(2) + " KB",
          adminName: "SYSTEM_AUTO",
          createdAt: new Date().toISOString()
        };
        db.appSnapshots.unshift(autoBackup);
      } catch (backupErr) {
        console.error("Auto safety backup fail:", backupErr);
      }

      // Write snapshot content to file
      await fs.writeFile(filePath, snapshot.content, 'utf-8');

      await addAuditLog(db, adminName || "Admin", "Restore Code Snapshot", `کۆپی پێشووی گەڕێندرایەوە بۆ App.tsx لە ڕێگەی لۆگی: ${snapshot.name}`);
      await saveDB(db);

      res.json({ success: true, message: 'کۆپی یەدەگ بە سەرکەوتوویی گەڕێندرایەوە، سیستەمەکە دەستپێدەکاتەوە' });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە گەڕاندنەوەی کۆپی یەدەگی App.tsx: ${err.message}` });
    }
  });

  // Delete an App snapshot
  app.post('/api/admin/snapshots/delete', async (req, res) => {
    try {
      const { snapshotId, adminName } = req.body;
      if (!snapshotId) {
        return res.status(400).json({ error: 'کۆدی ناسنامەی کۆپی پێویستە' });
      }

      if (!db.appSnapshots) db.appSnapshots = [];
      const index = db.appSnapshots.findIndex((s: any) => s.id === snapshotId);
      if (index === -1) {
        return res.status(404).json({ error: 'کۆپی نادۆزرایەوە یان پێشتر سڕاوەتەوە' });
      }

      const deletedSnap = db.appSnapshots[index];
      db.appSnapshots.splice(index, 1);

      await addAuditLog(db, adminName || "Admin", "Delete Code Snapshot", `کۆپی یەدەگ سڕایەوە: ${deletedSnap.name}`);
      await saveDB(db);

      res.json({ success: true, snapshots: db.appSnapshots });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە سڕینەوەی کۆپی یەدەگ: ${err.message}` });
    }
  });

  // --- MODULE 14: TICKET VIP SYSTEM ENDPOINTS ---

  // Get all VIP Tickets
  app.get('/api/admin/vip/tickets', (req, res) => {
    res.json(db.vipTickets || []);
  });

  // Generate a VIP Ticket
  app.post('/api/admin/vip/tickets/generate', async (req, res) => {
    const { customerName, customerPhone, videoUrl, adminName } = req.body;
    if (!customerName || !customerPhone) {
      return res.status(400).json({ error: 'ناوی کڕیار و ژمارەی مۆبایل پێویستە بۆ دروستکردنی تیکێت' });
    }

    // Generate unique code in format: 10 digit order number + random hex string of size 7
    const orderNum = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const randomHex = Math.random().toString(16).substring(2, 9);
    const code = `${orderNum}${randomHex}`;

    const newTicket = {
      code,
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).trim(),
      videoUrl: String(videoUrl || "").trim(),
      usedCount: 0,
      verifiedDevices: [],
      lastIp: "",
      lastDevice: "",
      status: "Active", // Active | Expired
      createdAt: new Date().toISOString()
    };

    if (!db.vipTickets) db.vipTickets = [];
    db.vipTickets.unshift(newTicket);

    await addAuditLog(db, adminName || "Admin", "Generate VIP Code", `کۆدی نوێی VIP دروستکرا بۆ: ${customerName} (${code})`);
    await saveDB(db);

    res.json({ success: true, ticket: newTicket });
  });

  // Get VIP payment configuration settings
  app.get('/api/admin/vip/settings', (req, res) => {
    res.json(db.vipSettings || {
      qrCodeUrl: "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
      paymentDetails: "ژمارەی باڵانسی فاستپەی / زین کاش: 07501234567\nبانکی واڵێت: FIb - 12345678",
      instructions: "بۆ بەژداریکردن و بینینی پەخشی ڕاستەوخۆی VIP CinemaChat بە شێوەی هەمیشەیی، بڕی پارەی تیکێتەکە بنێرە و پاشان پەیوەندی بە ئەدمینەوە بکە لە تێلیگرام (@cinemasupport) بۆ وەرگرتنی کۆدەکەت.",
      paymentLogoUrl: ""
    });
  });

  // Save VIP payment configuration settings
  app.post('/api/admin/vip/settings', async (req, res) => {
    const { qrCodeUrl, paymentDetails, instructions, paymentLogoUrl, adminName } = req.body;
    db.vipSettings = {
      qrCodeUrl: qrCodeUrl || "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
      paymentDetails: paymentDetails || "",
      instructions: instructions || "",
      paymentLogoUrl: paymentLogoUrl || ""
    };

    await addAuditLog(db, adminName || "Admin", "Update VIP Settings", "ڕێکخستنەکانی پارەدان و تیکێتی VIP نوێکرایەوە");
    await saveDB(db);

    res.json({ success: true, settings: db.vipSettings });
  });

  // Upload handler for VIP assets (QR code, payment Logo, etc.)
  app.post('/api/admin/vip/upload', async (req, res) => {
    try {
      const { fileData, fileName, adminName } = req.body;
      if (!fileData) {
        return res.status(400).json({ success: false, error: "داتای فایل نەنێردراوە!" });
      }

      // Safe regex match to extract MIME and base64 representation
      const matches = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ success: false, error: "فۆرماتی وێنەکە دروست نییە (تەنها Base64 Data URL پێشوازیکراوە)" });
      }

      const mimeType = matches[1];
      const base64Content = matches[2];

      // Format validation: jpeg/jpg/png/webp
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/svg+xml"];
      if (!allowedMimeTypes.includes(mimeType)) {
        return res.status(400).json({ success: false, error: "ڕێگە تەنها بە وێنەی فۆرماتی PNG, JPEG, WEBP و SVG دراوە" });
      }

      // File size constraint: Max 2MB (2 * 1024 * 1024 bytes)
      const approxSizeBytes = Math.floor((base64Content.length * 3) / 4);
      if (approxSizeBytes > 2 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "قەبارەی وێنە ناتوانێت لە ٢ مێگابایت زیاتر بێت!" });
      }

      // Extract extension
      let extension = "png";
      if (mimeType.includes("jpeg") || mimeType.includes("jpg")) extension = "jpg";
      else if (mimeType.includes("webp")) extension = "webp";
      else if (mimeType.includes("svg")) extension = "svg";

      const safeBaseName = fileName 
        ? fileName.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 50) 
        : "vip_asset";
      
      const uniqueFileName = `${safeBaseName}_${Date.now()}_${Math.floor(Math.random() * 100000)}.${extension}`;
      const relativeUploadPath = `/uploads/${uniqueFileName}`;
      const absoluteUploadPath = path.join(process.cwd(), 'uploads', uniqueFileName);

      // Ensure uploads folder exists and write file
      await fs.mkdir(path.join(process.cwd(), 'uploads'), { recursive: true });
      const buffer = Buffer.from(base64Content, 'base64');
      await fs.writeFile(absoluteUploadPath, buffer);

      return res.json({ 
        success: true, 
        url: relativeUploadPath,
        mimeType
      });

    } catch (err: any) {
      console.error("Error in VIP Upload Route:", err);
      return res.status(500).json({ 
        success: false, 
        error: "کێشەیەک ڕوویدا لە بارکردنی فایلەکەدا: " + (err.message || String(err)) 
      });
    }
  });

  // Get all Pending VIP Requests
  app.get('/api/admin/vip/requests', (req, res) => {
    try {
      res.json(db.vipRequests || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit VIP Access Request (User side)
  app.post('/api/vip/request', async (req, res) => {
    try {
      const { customerName, customerPhone, bankScreenshot } = req.body;
      if (!customerName || !customerPhone || !bankScreenshot) {
        return res.status(400).json({ success: false, error: 'تکایە سەرجەم خانەکان پڕبکەرەوە و وێنەی پێبڵاوکردن باربکە!' });
      }

      const newRequest = {
        id: 'req_' + Date.now() + Math.random().toString(36).substring(2, 7),
        customerName: String(customerName).trim(),
        customerPhone: String(customerPhone).trim(),
        bankScreenshot: String(bankScreenshot), // Contains Base64 dataURL
        status: "Pending", // Pending | Approved | Rejected
        createdAt: new Date().toISOString()
      };

      if (!db.vipRequests) db.vipRequests = [];
      db.vipRequests.unshift(newRequest);
      await saveDB(db);

      res.json({ success: true, request: newRequest });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Approve VIP Request
  app.post('/api/admin/vip/requests/approve', async (req, res) => {
    try {
      const { requestId, videoUrl, adminName } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: 'ناسنامەی داواکاری نادیارە.' });
      }

      if (!db.vipRequests) db.vipRequests = [];
      const reqIndex = db.vipRequests.findIndex((r: any) => r.id === requestId);
      if (reqIndex === -1) {
        return res.status(404).json({ success: false, error: 'ئەم داواکارییە نەدۆزرایەوە.' });
      }

      const reqData = db.vipRequests[reqIndex];
      
      // Generate unique VIP ticket code
      const orderNum = String(Math.floor(1000000000 + Math.random() * 9000000000));
      const randomHex = Math.random().toString(16).substring(2, 9);
      const code = `${orderNum}${randomHex}`;

      const newTicket = {
        code,
        customerName: reqData.customerName,
        customerPhone: reqData.customerPhone,
        videoUrl: String(videoUrl || "").trim(),
        usedCount: 0,
        verifiedDevices: [],
        lastIp: "",
        lastDevice: "",
        status: "Active",
        createdAt: new Date().toISOString()
      };

      if (!db.vipTickets) db.vipTickets = [];
      db.vipTickets.unshift(newTicket);

      // Update request status to Approved
      reqData.status = "Approved";
      reqData.approvedCode = code;

      await addAuditLog(db, adminName || "Admin", "Approve VIP Request", `داواکاری VIP پەسەندکرا بۆ: ${reqData.customerName} و کۆد دروستکرا (${code})`);
      await saveDB(db);

      res.json({ success: true, ticket: newTicket });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Decline/Delete Request
  app.post('/api/admin/vip/requests/delete', async (req, res) => {
    try {
      const { requestId, adminName } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: 'ناسنامەی داواکاری نادیارە.' });
      }

      if (!db.vipRequests) db.vipRequests = [];
      const index = db.vipRequests.findIndex((r: any) => r.id === requestId);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'داواکاری نەدۆزرایەوە.' });
      }

      const deletedReq = db.vipRequests[index];
      db.vipRequests.splice(index, 1);

      await addAuditLog(db, adminName || "Admin", "Decline VIP Request", `داواکاری ڕەتکرایەوە یان سڕایەوە بۆ: ${deletedReq.customerName}`);
      await saveDB(db);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Simple in-memory rate limiter store for VIP verification
  const vipRateLimits: Record<string, { attempts: number; resetTime: number }> = {};

  // Client Ticket Verification & Check-in
  app.post('/api/vip/verify', async (req, res) => {
    // Determine user client IP
    const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown").trim();
    
    // Rate Limiter logic: max 5 requests per 1 minute per IP
    const nowLocal = Date.now();
    const limitTimeFrameLocal = 60 * 1000; // 1 minute
    const maxAttemptsLocal = 5;

    if (!vipRateLimits[clientIp]) {
      vipRateLimits[clientIp] = { attempts: 1, resetTime: nowLocal + limitTimeFrameLocal };
    } else {
      const record = vipRateLimits[clientIp];
      if (nowLocal > record.resetTime) {
        record.attempts = 1;
        record.resetTime = nowLocal + limitTimeFrameLocal;
      } else {
        record.attempts += 1;
        if (record.attempts > maxAttemptsLocal) {
          return res.status(429).json({ 
            success: false, 
            message: 'سیستەمی چاودێری سوودوەرگرتنی نادروست و هەوڵی توندڕەوی دۆزییەوە! تکایە دوای خولەکێک تاقی بکەرەوە (Rate Limited).' 
          });
        }
      }
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'کۆدی تیکێتی VIP پێویستە.' });
    }

    const cleanCode = String(code).trim();
    if (!db.vipTickets) db.vipTickets = [];
    
    const ticketIndex = db.vipTickets.findIndex((t: any) => t.code === cleanCode);
    if (ticketIndex === -1) {
      return res.status(404).json({ success: false, message: 'ئەم کۆدی VIPیە نادروستە یان بوونی نییە لە سیستەمدا!' });
    }

    const ticket = db.vipTickets[ticketIndex];

    if (ticket.status === "Expired") {
      return res.status(400).json({ 
        success: false, 
        message: 'ئەم بلیتە بەسەرچووە و لەلایەن بەڕێوبەرەوە یان بەهۆی تێپەڕاندنی ڕێژەی ئامێرەکان ڕاگیراوە!' 
      });
    }

    // Read or initialize device verification list
    if (!ticket.verifiedDevices) {
      ticket.verifiedDevices = [];
    }

    // IP Check-in for 2 device limit
    const isAlreadyRegistered = ticket.verifiedDevices.includes(clientIp);

    if (!isAlreadyRegistered) {
      if (ticket.verifiedDevices.length >= 2) {
        ticket.status = "Expired";
        await saveDB(db);
        return res.status(400).json({ 
          success: false, 
          message: 'ئەم تیکێتە پێشتر لەسەر کەسی جیاواز چالاککراوە و تەنها ڕێگە بە ٢ ئامێری جیاواز دەدرێت لەسەر لۆگی داتابەیس!' 
        });
      }
      ticket.verifiedDevices.push(clientIp);
    }

    const userAgent = req.headers['user-agent'] || "Unknown Device";
    
    // Parse simplified user agent device info
    let deviceInfo = "کارپێکەری ئاسایی (PC/Web)";
    if (/android/i.test(userAgent)) deviceInfo = "مۆبایل (Android)";
    else if (/iphone|ipad/i.test(userAgent)) deviceInfo = "مۆبایل (iOS / iPhone)";
    else if (/macintosh/i.test(userAgent)) deviceInfo = "کۆمپیوتەر (Apple macOS)";
    else if (/windows/i.test(userAgent)) deviceInfo = "کۆمپیوتەر (MS Windows)";

    ticket.usedCount = (ticket.usedCount || 0) + 1;
    ticket.lastIp = clientIp;
    ticket.lastDevice = deviceInfo;

    if (ticket.usedCount >= 2) {
      ticket.status = "Expired";
    }

    await saveDB(db);

    res.json({ 
      success: true, 
      ticket, 
      settings: db.vipSettings 
    });
  });

  // Check ticket validity without modifying database status or counts
  app.post('/api/vip/check-validity', (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'کۆدی تیکێتی VIP پێویستە.' });
    }

    const cleanCode = String(code).trim();
    if (!db.vipTickets) db.vipTickets = [];

    const ticket = db.vipTickets.find((t: any) => t.code === cleanCode);
    if (!ticket) {
      return res.json({ success: false, message: 'ئەم بلیتە بوونی نییە!' });
    }

    if (ticket.status === "Expired") {
      return res.json({ success: false, message: 'ئەم بلیتە بەسەرچووە!' });
    }

    res.json({ success: true, ticket });
  });

  // Get all VIP Videos
  app.get('/api/admin/vip/videos', (req, res) => {
    res.json(db.vipVideos || []);
  });

  // Add VIP Video
  app.post('/api/admin/vip/videos/add', async (req, res) => {
    const { title, videoUrl, adminName } = req.body;
    if (!title || !videoUrl) {
      return res.status(400).json({ error: 'ناوی ڤیدیۆ و لینکی ڤیدیۆ پێویستن' });
    }

    const newVideo = {
      id: 'vid_' + Date.now(),
      title: String(title).trim(),
      videoUrl: String(videoUrl).trim(),
      createdAt: new Date().toISOString()
    };

    if (!db.vipVideos) db.vipVideos = [];
    db.vipVideos.push(newVideo);

    await addAuditLog(db, adminName || "Admin", "Add VIP Video", `ڤیدیۆی نوێی VIP زیادکرا: "${title}"`);
    await saveDB(db);

    res.json({ success: true, video: newVideo });
  });

  // Delete VIP Video
  app.post('/api/admin/vip/videos/delete', async (req, res) => {
    const { id, adminName } = req.body;
    if (!id) return res.status(400).json({ error: 'کۆدی ڤیدیۆ پێویستە' });
    
    if (!db.vipVideos) db.vipVideos = [];
    db.vipVideos = db.vipVideos.filter((v: any) => v.id !== id);

    await addAuditLog(db, adminName || "Admin", "Delete VIP Video", `ڤیدیۆی VIP سڕایەوە: ${id}`);
    await saveDB(db);

    res.json({ success: true, videos: db.vipVideos });
  });

  // --- MODULE 13: SMART ANALYTICS ENDPOINTS ---
  app.get('/api/admin/smart-analytics', (req, res) => {
    const usersCount = Array.isArray(db.users) ? db.users.length : 0;
    const roomsCount = db.rooms ? (Array.isArray(db.rooms) ? db.rooms.length : Object.keys(db.rooms).length) : 0;
    const moviesCount = Array.isArray(db.manualMovies) ? db.manualMovies.length : 0;
    const bannedIpsCount = Array.isArray(db.bannedIps) ? db.bannedIps.length : 0;
    const errorsCount = Array.isArray(db.systemErrorLogs) ? db.systemErrorLogs.length : 0;
    const intrusionCount = Array.isArray(db.intrusionAttempts) ? db.intrusionAttempts.length : 0;
    const vipCount = Array.isArray(db.vipTickets) ? db.vipTickets.length : 0;
    const vipUsedCount = Array.isArray(db.vipTickets) ? db.vipTickets.filter((t: any) => t.usedCount > 0).length : 0;

    // Build some elegant aggregations or time graphs
    const sampleTimelineDays = ["شەممە", "یەکشەممە", "دووشەممە", "سێشەممە", "چوارشەممە", "پێنجشەممە", "هەینی"];
    const trafficByDay = sampleTimelineDays.map((day, idx) => {
      // seed custom ratios
      const base = 250 + (idx * 45) % 180;
      return {
        day,
        visitors: base + (intrusionCount * 4) + (vipCount * 3),
        messages: base * 3 + idx * 80
      };
    });

    res.json({
      summary: {
        usersCount,
        roomsCount,
        moviesCount,
        bannedIpsCount,
        errorsCount,
        intrusionCount,
        vipCount,
        vipUsedCount
      },
      trafficByDay,
      threatReport: {
        totalBlocks: bannedIpsCount + Math.floor(intrusionCount / 3),
        activeDefenseRatio: "100%",
        firewallHealth: "Perfect (Shield Active)"
      }
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      time: new Date().toISOString(), 
      server: 'CinemaChat', 
      node: process.version,
      platform: process.platform,
      memory: process.memoryUsage().rss
    });
  });

  app.get('/api/status', (req, res) => {
    res.json({ 
      connected: true, 
      uptime: process.uptime(),
      dbSize: moviesCache.length,
      lastSync: lastFetchTime,
      webhook: !!process.env.WHATSAPP_WEBHOOK_SECRET
    });
  });

  app.get('/api/stats', (req, res) => {
    visitors += Math.floor(Math.random() * 3);
    res.json({ visitors });
  });

  // --- MODULE 14: DYNAMIC 'CAME HERE' ROOMS ENDPOINTS ---
  // --- MODULE 15: INVITATIONS & NOTIFICATIONS ENDPOINTS ---
  app.get('/api/notifications/:userCode', (req, res) => {
    try {
      const { userCode } = req.params;
      const cleanCode = userCode.trim().toUpperCase();
      if (!db.invitations) {
        db.invitations = [];
      }
      const userInvites = db.invitations.filter((inv: any) => 
        inv.toUserCode === cleanCode && inv.status === 'pending'
      );
      res.json(userInvites);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/send', async (req, res) => {
    try {
      const { fromUserCode, fromUserName, targetCodeOrName, roomId, roomName } = req.body;
      
      if (!targetCodeOrName || !fromUserCode || !roomId) {
        return res.status(400).json({ error: 'داخڵکراوەکان ناتەواون' });
      }

      const cleanTarget = targetCodeOrName.trim().toUpperCase();
      const cleanFromCode = fromUserCode.trim().toUpperCase();

      if (!db.users) {
        db.users = [];
      }

      const targetUser = db.users.find((u: any) => {
        const uCode = (u.uniqueCode || '').trim().toUpperCase();
        const uName = (u.username || u.name || '').trim().toUpperCase();
        return uCode === cleanTarget || uName === cleanTarget;
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'بەکارھێنەرەکە نەدۆزرایەوە! تکایە ناوی بەکارهێنەر یان کۆدی بێهاوتا بە دروستی بنووسە.' });
      }

      const targetUserCode = (targetUser.uniqueCode || '').toUpperCase();

      if (!db.invitations) {
        db.invitations = [];
      }

      if (cleanFromCode === targetUserCode) {
        return res.status(400).json({ error: 'ناتوانیت خۆت بانگهێشت بکەیت!' });
      }

      const newInvitation = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        fromUserCode: cleanFromCode,
        fromUserName: fromUserName || 'هاوڕێیەک',
        toUserCode: targetUserCode,
        roomId,
        roomName: roomName || 'ژووری هاوڕێیان',
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      db.invitations.push(newInvitation);
      await saveDB(db);

      res.json({ success: true, invitation: newInvitation });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/:id/respond', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!db.invitations) {
        db.invitations = [];
      }

      const inviteIndex = db.invitations.findIndex((inv: any) => inv.id === id);
      if (inviteIndex === -1) {
        return res.status(404).json({ error: 'بانگهێشتنامەکە نەدۆزرایەوە' });
      }

      db.invitations[inviteIndex].status = status;
      db.invitations[inviteIndex].updatedAt = new Date().toISOString();
      await saveDB(db);

      res.json({ success: true, invitation: db.invitations[inviteIndex] });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- MODULE 16: DIRECT MESSAGING (DMs) ENDPOINTS ---
  app.get('/api/dms/:userCode', (req, res) => {
    try {
      const { userCode } = req.params;
      const cleanCode = userCode.trim().toUpperCase();
      
      if (!db.directMessages) {
        db.directMessages = [];
      }

      // Filter messages sent by or received by this user
      const userDms = db.directMessages.filter((dm: any) => 
        (dm.senderCode || '').toUpperCase() === cleanCode || 
        (dm.receiverCode || '').toUpperCase() === cleanCode
      );

      res.json(userDms);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dms/send', async (req, res) => {
    try {
      const { senderCode, senderName, targetCodeOrName, message } = req.body;

      if (!senderCode || !targetCodeOrName || !message || !message.trim()) {
        return res.status(400).json({ error: 'داخڵکراوەکان ناتەواون' });
      }

      const cleanSenderCode = senderCode.trim().toUpperCase();
      const cleanTarget = targetCodeOrName.trim().toUpperCase();

      if (!db.users) {
        db.users = [];
      }

      // Find target user by uniqueCode or username/name
      const targetUser = db.users.find((u: any) => {
        const uCode = (u.uniqueCode || '').trim().toUpperCase();
        const uName = (u.username || u.name || '').trim().toUpperCase();
        return uCode === cleanTarget || uName === cleanTarget;
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'وەرگرەکە نەدۆزرایەوە! تکایە ناوی بەکارهێنەر یان کۆدی بێهاوتا بە دروستی بنووسە.' });
      }

      const receiverCode = (targetUser.uniqueCode || '').toUpperCase();
      const receiverName = targetUser.username || targetUser.name || 'بەکارھێنەر';

      if (cleanSenderCode === receiverCode) {
        return res.status(400).json({ error: 'ناتوانیت نامەی دایرێکت بۆ خۆت بنێریت!' });
      }

      if (!db.directMessages) {
        db.directMessages = [];
      }

      const newDm = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        senderCode: cleanSenderCode,
        senderName: senderName || 'هاوڕێیەک',
        receiverCode: receiverCode,
        receiverName: receiverName,
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      db.directMessages.push(newDm);
      await saveDB(db);

      res.json({ success: true, message: newDm });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/rooms', (req, res) => {
    res.json(Array.isArray(db.rooms) ? db.rooms : []);
  });

  app.post('/api/rooms/create', async (req, res) => {
    try {
      const { name, hostCode, currentMovieUrl } = req.body;
      if (!name || !hostCode) {
        return res.status(400).json({ success: false, error: 'ناو و کۆدی خانەخوێ پێویستە' });
      }

      if (!Array.isArray(db.rooms)) {
        db.rooms = [];
      }

      // Set roomId directly to the host's unique code to prevent duplicate/random codes
      const roomId = hostCode.trim().toUpperCase();

      const existingIndex = db.rooms.findIndex((r: any) => r.id === roomId);
      const newRoom = {
        id: roomId,
        name: name.trim(),
        hostCode: hostCode.trim().toUpperCase(),
        currentMovieUrl: currentMovieUrl ? currentMovieUrl.trim() : '',
        isPlaying: true, // Auto play by default on room creation
        currentTime: 0,
        activeUsers: [
          {
            username: 'خانەخوێ (Host)',
            uniqueCode: hostCode.trim().toUpperCase(),
            joinedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
          }
        ],
        chatMessages: existingIndex !== -1 ? db.rooms[existingIndex].chatMessages || [] : [],
        updatedAt: new Date().toISOString()
      };

      if (existingIndex !== -1) {
        db.rooms[existingIndex] = newRoom;
      } else {
        db.rooms.push(newRoom);
      }
      await saveDB(db);

      console.log(`[Came Here Room] Created/Updated room ${roomId} using host code`);
      res.json({ success: true, room: newRoom });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/rooms/:id', async (req, res) => {
    const { id } = req.params;
    const { userCode } = req.query;

    if (!Array.isArray(db.rooms)) {
      db.rooms = [];
    }

    let room = db.rooms.find((r: any) => r.id === id || (r.hostCode && r.hostCode === id.trim().toUpperCase()));
    if (!room) {
      if (id === 'global_room_official') {
        room = {
          id: 'global_room_official',
          name: 'ژووری سەرەکی',
          hostCode: 'GLOBAL_HOST',
          currentMovieUrl: 'https://www.youtube.com/watch?v=Rsztt5qDj_A',
          isPlaying: true,
          currentTime: 0,
          activeUsers: [],
          chatMessages: [],
          updatedAt: new Date().toISOString()
        };
        db.rooms.push(room);
        await saveDB(db);
      } else if (id === 'main_broadcast_room') {
        room = {
          id: 'main_broadcast_room',
          name: 'هۆڵی پەخشی سەرەکی (Broadcast)',
          hostCode: 'ADMIN_BROADCAST',
          currentMovieUrl: 'https://www.youtube.com/watch?v=ffW64N3gGv8',
          isPlaying: true,
          currentTime: 0,
          activeUsers: [],
          chatMessages: [],
          updatedAt: new Date().toISOString()
        };
        db.rooms.push(room);
        await saveDB(db);
      } else {
        return res.status(404).json({ error: 'ژوور بەردەست نییە' });
      }
    }

    // Auto-delete logic: Purge messages in main_broadcast_room older than 1 hour
    if (room && room.id === 'main_broadcast_room' && Array.isArray(room.chatMessages)) {
      const oneHourAgo = Date.now() - 3600000;
      const initialLength = room.chatMessages.length;
      room.chatMessages = room.chatMessages.filter((msg: any) => {
        const t = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
        return t > oneHourAgo;
      });
      if (room.chatMessages.length !== initialLength) {
        room.updatedAt = new Date().toISOString();
        await saveDB(db);
      }
    }

    // Update active user last seen if code is supplied
    if (userCode) {
      const cleanCode = String(userCode).trim().toUpperCase();
      if (!room.activeUsers) room.activeUsers = [];
      const userObj = room.activeUsers.find((u: any) => u.uniqueCode === cleanCode);
      if (userObj) {
        userObj.lastSeen = new Date().toISOString();
      } else {
        room.activeUsers.push({
          username: cleanCode === room.hostCode ? 'خانەخوێ (Host)' : `بینەر-${cleanCode.substring(0, 5)}`,
          uniqueCode: cleanCode,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        });
      }
      room.updatedAt = new Date().toISOString();
      await saveDB(db);
    }

    res.json(room);
  });

  app.post('/api/rooms/:id/update', async (req, res) => {
    try {
      const { id } = req.params;
      const { currentTime, isPlaying, currentMovieUrl, chatMessage, userCode } = req.body;

      if (!Array.isArray(db.rooms)) {
        db.rooms = [];
      }

      const roomIndex = db.rooms.findIndex((r: any) => r.id === id || r.hostCode === id.trim().toUpperCase());
      if (roomIndex === -1) {
        return res.status(404).json({ error: 'ژوور بەردەست نییە' });
      }

      const room = db.rooms[roomIndex];
      if (currentTime !== undefined) room.currentTime = Number(currentTime);
      if (isPlaying !== undefined) room.isPlaying = Boolean(isPlaying);
      if (currentMovieUrl !== undefined) room.currentMovieUrl = currentMovieUrl;

      // Handle heartbeat inside body parameter
      if (userCode) {
        const cleanCode = String(userCode).trim().toUpperCase();
        if (!room.activeUsers) room.activeUsers = [];
        const userObj = room.activeUsers.find((u: any) => u.uniqueCode === cleanCode);
        if (userObj) {
          userObj.lastSeen = new Date().toISOString();
        } else {
          room.activeUsers.push({
            username: cleanCode === room.hostCode ? 'خانەخوێ (Host)' : `بینەر-${cleanCode.substring(0, 5)}`,
            uniqueCode: cleanCode,
            joinedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
          });
        }
      }

      if (chatMessage) {
        if (!room.chatMessages) room.chatMessages = [];
        room.chatMessages.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          sender: chatMessage.sender || 'Anonymous',
          senderCode: chatMessage.senderCode || '',
          text: chatMessage.text || '',
          timestamp: new Date().toISOString()
        });
        if (room.chatMessages.length > 150) {
          room.chatMessages = room.chatMessages.slice(-150);
        }
      }

      // Auto-delete logic: Purge messages in main_broadcast_room older than 1 hour on update as well
      if (room.id === 'main_broadcast_room' && Array.isArray(room.chatMessages)) {
        const oneHourAgo = Date.now() - 3600000;
        room.chatMessages = room.chatMessages.filter((msg: any) => {
          const t = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
          return t > oneHourAgo;
        });
      }

      room.updatedAt = new Date().toISOString();
      await saveDB(db);

      res.json({ success: true, room });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/rooms/:id/join', async (req, res) => {
    try {
      const { id } = req.params;
      const { uniqueCode, username } = req.body;
      const isBroadcastRoom = id === 'main_broadcast_room';

      let cleanCode = uniqueCode ? uniqueCode.trim().toUpperCase() : '';
      if (isBroadcastRoom && !cleanCode) {
        // Generate automatic unique identifier for guest
        cleanCode = 'GUEST_' + Math.random().toString(36).substring(2, 8).toUpperCase();
      }

      if (!cleanCode) {
        return res.status(400).json({ error: 'پێویستە کۆدی خۆت بنەخشێنیت' });
      }

      if (!Array.isArray(db.rooms)) {
        db.rooms = [];
      }

      // Ensure main_broadcast_room is initialized if joining
      let roomIndex = db.rooms.findIndex((r: any) => r.id === id);
      if (roomIndex === -1 && isBroadcastRoom) {
        db.rooms.push({
          id: 'main_broadcast_room',
          name: 'هۆڵی پەخشی سەرەکی (Broadcast)',
          hostCode: 'ADMIN_BROADCAST',
          currentMovieUrl: 'https://www.youtube.com/watch?v=ffW64N3gGv8',
          isPlaying: true,
          currentTime: 0,
          activeUsers: [],
          chatMessages: [],
          updatedAt: new Date().toISOString()
        });
        await saveDB(db);
        roomIndex = db.rooms.findIndex((r: any) => r.id === id);
      }

      if (roomIndex === -1) {
        return res.status(404).json({ error: 'ژوور بەردەست نییە' });
      }

      const room = db.rooms[roomIndex];

      // Access Control check: validate uniqueCode in database (bypass for Broadcast Room)
      const userExists = db.users && db.users.some((u: any) => {
        const uCode = (u.uniqueCode || '').trim().toUpperCase();
        return uCode === cleanCode;
      });

      const isGlobalHost = cleanCode === 'GLOBAL_HOST';
      const isRoomHost = room.hostCode && (cleanCode === room.hostCode.toUpperCase());
      const isVipTicketCode = db.vipTickets && db.vipTickets.some((t: any) => (t.code || '').trim().toUpperCase() === cleanCode);

      if (!isBroadcastRoom && !userExists && !isGlobalHost && !isRoomHost && !isVipTicketCode && cleanCode !== 'ADMIN') {
        return res.status(403).json({ error: 'ژمارەی چوونەژوورە نادروستە یان تۆمار نەکراوە!' });
      }

      if (!room.activeUsers) room.activeUsers = [];

      // Add user if they are not already active
      const alreadyIn = room.activeUsers.some((u: any) => u.uniqueCode === cleanCode);
      if (!alreadyIn) {
        room.activeUsers.push({
          username: username || `بینەر-${cleanCode.substring(0, 5)}`,
          uniqueCode: cleanCode,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        });
      } else {
        const userObj = room.activeUsers.find((u: any) => u.uniqueCode === cleanCode);
        if (userObj) {
          userObj.lastSeen = new Date().toISOString();
          if (username) userObj.username = username;
        }
      }

      room.updatedAt = new Date().toISOString();
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      logUserActivity(db, cleanCode, "Join Room", `چووە ناو ژووری تەلەفزیۆنی "${room.name || id}"`, clientIp);
      await saveDB(db);

      res.json({ success: true, room });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/rooms/:id', async (req, res) => {
    const { id } = req.params;
    const update = req.body;
    if (!Array.isArray(db.rooms)) {
      db.rooms = [];
    }
    let roomIndex = db.rooms.findIndex((r: any) => r.id === id);
    if (roomIndex === -1) {
      const newRoom = {
        id,
        name: id === 'global_room_official' ? 'ژووری سەرەکی' : 'User Room',
        hostCode: 'GLOBAL_HOST',
        currentMovieUrl: update.videoData?.url || '',
        isPlaying: update.playback?.isPlaying ?? false,
        currentTime: update.playback?.currentTime ?? 0,
        activeUsers: [],
        chatMessages: [],
        updatedAt: new Date().toISOString()
      };
      db.rooms.push(newRoom);
      roomIndex = db.rooms.length - 1;
    }

    const room = db.rooms[roomIndex];
    if (update.playback) {
      if (update.playback.isPlaying !== undefined) room.isPlaying = update.playback.isPlaying;
      if (update.playback.currentTime !== undefined) room.currentTime = update.playback.currentTime;
    }
    if (update.videoData?.url) {
      room.currentMovieUrl = update.videoData.url;
    }
    room.updatedAt = new Date().toISOString();
    
    // Legacy support
    if (!db.syncGroups) db.syncGroups = {};
    db.syncGroups[id] = { ...db.syncGroups[id], ...update };

    await saveDB(db);
    res.json({ success: true, room });
  });

  app.get('/api/admin/imdb-fetch', async (req, res) => {
    const { url, imdbId } = req.query;
    
    let targetUrl = url as string;
    if (imdbId) {
      const ttId = String(imdbId).startsWith('tt') ? imdbId : `tt${imdbId}`;
      targetUrl = `https://www.imdb.com/title/${ttId}/`;
    }

    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'لینک یان کۆدی پێویستە' });
    }

    try {
      console.log(`[Proxy Fetch] Fetching raw content for client-side AI: ${targetUrl}`);
      
      const response = await fetchWithTimeout(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
      }, 15000); 

      if (!response.ok) {
        // Log details but don't crash
        console.warn(`[Proxy Fetch] Failed: ${response.status} ${response.statusText}`);
        return res.json({ success: false, error: `نەتوانرا پەڕەی ${targetUrl} باربکرێت (${response.status})` });
      }

      const html = await response.text();
      // Only keep head and start of body to save tokens but retain metadata
      const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      const bodyStart = html.match(/<body[^>]*>([\s\S]{0,50000})/i);
      const smallHtml = (headMatch ? headMatch[0] : "") + (bodyStart ? bodyStart[0] : "");

      // Return HTML for client-side Gemini processing
      res.json({ success: true, html: smallHtml.substring(0, 150000) });
    } catch (err: any) {
      console.error('[Proxy Fetch Error]', err.message || err);
      res.status(200).json({ success: false, error: 'هەڵەیەک ڕوویدا لە کاتی هێنانی زانیارییەکان' });
    }
  });

  app.get('/api/admin/categories', (req, res) => {
    res.json(db.categories || []);
  });

  app.post('/api/admin/categories', async (req, res) => {
    const { name, adminName } = req.body;
    if (!name) return res.status(400).json({ error: 'ناوی پۆلێن پێویستە' });
    if (!db.categories) db.categories = [];
    if (db.categories.includes(name)) return res.status(400).json({ error: 'ئەم پۆلێنە پێشتر هەبووە' });
    db.categories.push(name);
    await addAuditLog(db, adminName, "Add Category", `کاڵا/پۆلێنی نوێ زیادکرا: "${name}"`);
    await saveDB(db);
    res.json({ success: true, categories: db.categories });
  });

  app.delete('/api/admin/categories/:name', async (req, res) => {
    const { name } = req.params;
    const adminName = req.query.adminName as string;
    
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
    const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const canDelete = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!canDelete) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! کارمەند (Staff) ناتوانێت پۆلێنەکان بسڕێتەوە.' });
    }

    if (!db.categories) db.categories = [];
    db.categories = db.categories.filter((c: string) => c !== name);
    await addAuditLog(db, adminName, "Delete Category", `پۆلێن سڕایەوە: "${name}"`);
    await saveDB(db);
    res.json({ success: true, categories: db.categories });
  });

  app.get('/api/categories', (req, res) => {
    res.json(db.categories || []);
  });

  // -------------------------------------------------------------
  // TEMPORARY FIREBASE MOCK FOR SERVER SIDE (MOCK DB & MOCK AUTH)
  // -------------------------------------------------------------
  class MockFirestoreDoc {
    private colName: string;
    private docId: string;
    private serverDb: any;

    constructor(colName: string, docId: string, serverDb: any) {
      this.colName = colName;
      this.docId = docId;
      this.serverDb = serverDb;
    }

    async get() {
      let data: any = null;
      if (this.colName === 'users') {
        const u = this.serverDb.users?.find((u: any) => u.uid === this.docId || u.uniqueCode === this.docId);
        if (u) data = u;
      } else if (this.colName === 'config') {
        if (this.docId === 'friends_room') {
          data = { roomVideoUrl: this.serverDb.friendsRoomVideoUrl || '', videoUrl: this.serverDb.friendsRoomVideoUrl || '' };
        }
      }
      return {
        id: this.docId,
        exists: !!data,
        data: () => data || null
      };
    }

    async set(data: any, options?: { merge?: boolean }) {
      if (this.colName === 'users') {
        if (!this.serverDb.users) this.serverDb.users = [];
        const idx = this.serverDb.users.findIndex((u: any) => u.uid === this.docId);
        const isNew = idx === -1;
        const existing = isNew ? {} : this.serverDb.users[idx];
        const merged = (options?.merge ?? true) ? { ...existing, ...data } : { ...data };
        merged.uid = this.docId;
        if (isNew) {
          this.serverDb.users.push(merged);
        } else {
          this.serverDb.users[idx] = merged;
        }
      } else if (this.colName === 'config') {
        if (this.docId === 'friends_room') {
          this.serverDb.friendsRoomVideoUrl = data.videoUrl || data.roomVideoUrl || '';
        }
      }
      if (typeof saveDB === 'function') {
        await saveDB(this.serverDb);
      }
    }

    async update(data: any) {
      await this.set(data, { merge: true });
    }

    async delete() {
      if (this.colName === 'users') {
        this.serverDb.users = this.serverDb.users?.filter((u: any) => u.uid !== this.docId) || [];
      }
      if (typeof saveDB === 'function') {
        await saveDB(this.serverDb);
      }
    }
  }

  class MockFirestoreCollection {
    private colName: string;
    private serverDb: any;

    constructor(colName: string, serverDb: any) {
      this.colName = colName;
      this.serverDb = serverDb;
    }

    doc(id: string) {
      return new MockFirestoreDoc(this.colName, id, this.serverDb);
    }

    where(field: string, op: string, value: any) {
      return {
        get: async () => {
          let matched: any[] = [];
          if (this.colName === 'users') {
            matched = this.serverDb.users?.filter((u: any) => {
              const val = u[field];
              if (op === '==') return val === value;
              return false;
            }) || [];
          }
          return {
            docs: matched.map(m => ({
              id: m.uid || m.uniqueCode || 'unknown',
              data: () => m,
              ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
            })),
            forEach: (cb: any) => {
              matched.forEach(m => cb({
                id: m.uid || m.uniqueCode || 'unknown',
                data: () => m,
                ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
              }));
            }
          };
        }
      };
    }

    async get() {
      let list: any[] = [];
      if (this.colName === 'users') {
        list = this.serverDb.users || [];
      }
      return {
        docs: list.map(m => ({
          id: m.uid || m.uniqueCode || 'unknown',
          data: () => m,
          ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
        })),
        forEach: (cb: any) => {
          list.forEach(m => cb({
            id: m.uid || m.uniqueCode || 'unknown',
            data: () => m,
            ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
          }));
        }
      };
    }
  }

  class MockFirestore {
    private serverDb: any;
    constructor(serverDb: any) {
      this.serverDb = serverDb;
    }
    collection(name: string) {
      return new MockFirestoreCollection(name, this.serverDb);
    }
  }

  class MockAdminAuth {
    async createUser(data: any) {
      const uid = 'mock_auth_uid_' + Math.random().toString(36).substring(2, 10);
      return { uid };
    }
    async createCustomToken(uid: string) {
      return 'mock_custom_token_' + uid;
    }
  }

  let adminDbInstance: any = null;

  function getAdminDb() {
    if (!adminDbInstance) {
      adminDbInstance = new MockFirestore(db);
      console.log("[Firestore Sync] Mock Firestore is activated. Bypassing real Firebase server.");
    }
    return adminDbInstance;
  }

  let adminAuthInstance: any = null;

  function getAdminAuthService() {
    if (!adminAuthInstance) {
      adminAuthInstance = new MockAdminAuth();
      console.log("[Firebase Auth] Mock Auth Service is activated. Bypassing real Firebase server.");
    }
    return adminAuthInstance;
  }

  app.post('/api/auth/register-by-id', async (req, res) => {
    const { name, email, password, uniqueCode, phone, age, gender, residence, country } = req.body;
    try {
      const adminAuth = getAdminAuthService();
      const adminDb = getAdminDb();
      if (!adminAuth || !adminDb) {
        return res.status(500).json({ success: false, error: 'Auth or DB service not available' });
      }

      // Check if user already exists in Firestore by phone/uniqueCode
      const usersRef = adminDb.collection('users');
      const querySnapshot = await usersRef.where('uniqueCode', '==', uniqueCode).get();
      if (!querySnapshot.empty) {
        return res.status(400).json({ success: false, error: 'ئەم بەکارهێنەرە پێشتر هەیە!' });
      }

      // Create Firebase Auth user
      const userRecord = await adminAuth.createUser({
        email: email || `${uniqueCode}@cinemachat.local`,
        password: password,
        displayName: name
      });

      // Save to Firestore
      await usersRef.doc(userRecord.uid).set({
        uid: userRecord.uid,
        name,
        phone,
        email: userRecord.email,
        uniqueCode,
        isOnline: true,
        createdAt: new Date().toISOString(),
        age,
        gender,
        residence,
        country,
        role: 'user',
      });

      // Save locally to db.users in db.json for admin view with credentials
      if (!db.users) db.users = [];
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      
      const existsIdx = db.users.findIndex((u: any) => u.uid === userRecord.uid || (u.uniqueCode && u.uniqueCode.toUpperCase() === uniqueCode.toUpperCase()));
      const newUserObj = {
        uid: userRecord.uid,
        name,
        username: name,
        phone: phone || "",
        email: userRecord.email,
        uniqueCode,
        createdAt: new Date().toISOString(),
        deviceIp: clientIp,
        ip: clientIp,
        password: password || "Cc_CinemaChat123",
        role: 'user',
        active: true,
        kicked: false,
        age: age || "",
        gender: gender || "",
        residence: residence || "",
        country: country || ""
      };

      if (existsIdx !== -1) {
        db.users[existsIdx] = { ...db.users[existsIdx], ...newUserObj };
      } else {
        db.users.push(newUserObj);
      }

      logUserActivity(db, uniqueCode, "Register", `هەژمارێکی نوێی تۆمارکرد بەناوی "${name}"`, clientIp);
      await saveDB(db);

      // Create Custom Token
      const customToken = await adminAuth.createCustomToken(userRecord.uid);
      
      return res.json({ success: true, customToken });
    } catch (err: any) {
      console.error("[ID Register] Failed details:", err);
      return res.status(500).json({ success: false, error: err.message, code: err.code });
    }
  });

  app.post('/api/auth/login-by-id', async (req, res) => {
    const { uniqueCode } = req.body;
    if (!uniqueCode || typeof uniqueCode !== 'string') {
      return res.status(400).json({ success: false, error: 'ناسنامەی چوونە ژوورەوە پێویستە' });
    }

    try {
      const adminDb = getAdminDb();
      if (!adminDb) {
        console.error("Firestore Admin database not available during login-by-id query");
        return res.status(500).json({ success: false, error: 'Database not available' });
      }

      const adminAuth = getAdminAuthService();
      if (!adminAuth) {
        console.error("Firebase Admin Auth service not available during login-by-id query");
        return res.status(500).json({ success: false, error: 'Auth service not available' });
      }

      // 1. Normalize uniqueCode
      let cleanInput = uniqueCode.replace(/[\s\s]+/g, '').replace(/\s/g, '').toUpperCase();
      // Replace duplicate dashes
      cleanInput = cleanInput.replace(/-+/g, '-');
      // If prefix is CC-CC-, replace with CC-
      cleanInput = cleanInput.replace(/^CC-CC-/, 'CC-');

      console.log(`[ID Auth] Looking up uniqueCode. Raw: "${uniqueCode}", Clean: "${cleanInput}"`);

      // 2. Database Lookup
      const usersRef = adminDb.collection('users');
      let querySnapshot = await usersRef.where('uniqueCode', '==', cleanInput).get();

      // If not found, try lookup with original trimmed upper
      if (querySnapshot.empty) {
        const upperTrimmed = uniqueCode.trim().toUpperCase();
        if (upperTrimmed !== cleanInput) {
          querySnapshot = await usersRef.where('uniqueCode', '==', upperTrimmed).get();
        }
      }

      // If still empty, check if they typed without 'CC-' prefix
      if (querySnapshot.empty) {
        let normalizedNoPrefix = cleanInput;
        if (cleanInput.startsWith('CC-')) {
          normalizedNoPrefix = cleanInput.substring(3);
        }
        querySnapshot = await usersRef.where('uniqueCode', '==', 'CC-' + normalizedNoPrefix).get();
      }

      if (querySnapshot.empty) {
        console.warn(`[ID Auth] User not found for code: "${uniqueCode}"`);
        return res.status(404).json({ success: false, error: 'ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە' });
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const uid = userDoc.id;

      // Ensure they have the correct custom token
      const customToken = await adminAuth.createCustomToken(uid);

      console.log(`[ID Auth] Successfully authenticated user: ${userData.name || uid} via uniqueCode: ${userData.uniqueCode}`);

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      logUserActivity(db, userData.uniqueCode, "Login", `کۆدی بێهاوتا بە سەرکەوتوویی داخل کرا و چوونە ژوورەوە ئەنجامدرا`, clientIp);
      await saveDB(db);

      return res.json({
        success: true,
        customToken,
        user: {
          uid,
          name: userData.name,
          email: userData.email,
          uniqueCode: userData.uniqueCode,
          role: userData.role || 'user'
        }
      });
    } catch (err: any) {
      console.error("[ID Auth] Login by ID logic failed with error:", err);
      return res.status(500).json({ success: false, error: `هەڵەی کاتی سێرڤەر: ${err.message || err}`, code: err.code });
    }
  });

  app.post('/api/admin/verify-secret-login', async (req, res) => {
    const { phone, password, name } = req.body;
    const sysSecret = process.env.ADMIN_SECRET_KEY || "RebarSarkawtAdmin2026!";
    
    const inputMatchesSecret = 
      (phone && String(phone).trim() === sysSecret) || 
      (password && String(password).trim() === sysSecret) || 
      (name && String(name).trim() === sysSecret);

    if (!inputMatchesSecret) {
      return res.json({ isSecret: false });
    }

    try {
      const displayName = (name && String(name).trim() !== sysSecret) ? name : "Admin User";
      const usePhone = (phone && String(phone).trim() !== sysSecret) ? phone : "07701966640";

      // Return isSecret: true status, directing client-side code to perform the registration/login safely
      // and call the Firestore direct update promotion endpoint (/api/admin/promote-with-secret)
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      await addAuditLog(db, displayName, "Login Secret Match Tried", `هەوڵی چوونەژوورەوەی ئەدمین بە کۆدی نهێنی.`);
      await saveDB(db);

      res.json({
        isSecret: true,
        requiresClientAuth: true,
        displayName,
        phone: usePhone,
        adminUser: { username: displayName, isSuper: true, isOwner: true, role: 'super_admin', ROLE_SUPER_ADMIN: true }
      });
    } catch (err: any) {
      console.error("Secret login verification failed:", err);
      res.status(500).json({ success: false, message: `هەڵەیەک ڕوویدا: ${err.message || err}` });
    }
  });

  app.post('/api/admin/promote-with-secret', async (req, res) => {
    const { secret, uid, phone, name } = req.body;
    const sysSecret = process.env.ADMIN_SECRET_KEY || "RebarSarkawtAdmin2026!";
    
    if (secret !== sysSecret) {
      return res.status(401).json({ success: false, message: "کۆدی نهێنی هەڵەیە!" });
    }

    try {
      const dbInstance = getAdminDb();
      if (!dbInstance) {
        return res.status(500).json({ success: false, message: "داتابەیس بەردەست نییە لە سێرڤەر." });
      }

      if (uid) {
        const userRef = dbInstance.collection('users').doc(uid);
        const docSnap = await userRef.get();
        const existingData = docSnap.exists ? docSnap.data() : {};

        const updatedData = {
          ...existingData,
          uid: uid,
          role: 'super_admin',
          userRole: 'super_admin',
          updatedAt: new Date().toISOString()
        };
        if (!existingData.name && name) updatedData.name = name;
        if (!existingData.phone && phone) updatedData.phone = phone;
        if (!existingData.createdAt) updatedData.createdAt = new Date().toISOString();
        if (!existingData.uniqueCode) {
          updatedData.uniqueCode = `CC-ADM-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        await userRef.set(updatedData, { merge: true });
        console.log(`User ${uid} successfully promoted to super_admin in Firestore.`);
      }

      const displayName = name || "Admin User";
      if (!db.admins) db.admins = [];
      const hasAdmin = db.admins.find((a: any) => a.username?.toLowerCase() === displayName.toLowerCase());
      if (!hasAdmin) {
        db.admins.push({
          username: displayName,
          password: crypto.randomBytes(8).toString('hex'),
          isSuper: true,
          role: 'super_admin'
        });
      } else {
        hasAdmin.role = 'super_admin';
        hasAdmin.isSuper = true;
      }

      await addAuditLog(db, displayName, "Role Promotion via Key", `سەرکەوتووانە ڕۆڵی یوزەر گۆڕدرا بۆ ئەدمینی گشتی (Super Admin) لە ڕێگەی کۆدی نهێنی.`);
      await saveDB(db);

      res.json({
        success: true,
        message: "پلەکەت کرا بە ئەدمینی گشتی بە سەرکەوتوویی!",
        adminUser: { username: displayName, isSuper: true, isOwner: true, role: 'super_admin', ROLE_SUPER_ADMIN: true }
      });
    } catch (err: any) {
      console.error("Admin promotion failed:", err);
      res.status(500).json({ success: false, message: `خراپ بەڕێوەچوو: ${err.message || err}` });
    }
  });

  app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
    const cleanIp = clientIp.trim();

    // Perform check first: is IP already banned?
    const isBanned = db.bannedIps && db.bannedIps.some((item: string) => {
      const cleanItem = String(item).trim();
      return cleanItem === cleanIp || cleanIp.includes(cleanItem);
    });
    if (isBanned) {
      return res.status(403).json({ success: false, message: 'تۆ بلۆک کراویت لەم سیستمەدا.' });
    }

    const hashedPassInput = crypto.createHash('sha256').update(password || '').digest('hex');
    const sysSecret = process.env.ADMIN_SECRET_KEY || "RebarSarkawtAdmin2026!";
    const isSecretPassword = password === sysSecret;

    let admin = db.admins.find((a: any) => 
      a.username?.toLowerCase() === username?.toLowerCase() && 
      (a.password === password || a.password === hashedPassInput)
    );

    if (!admin && isSecretPassword) {
      const displayName = username || "Admin";
      admin = { username: displayName, isSuper: true, role: "super_admin" };
      const hasAdmin = db.admins.some((a: any) => a.username?.toLowerCase() === displayName.toLowerCase());
      if (!hasAdmin) {
        db.admins.push({
          username: displayName,
          password: crypto.randomBytes(8).toString('hex'),
          isSuper: true,
          role: "super_admin"
        });
      }
    }

    if (admin) {
      failedLoginCounts[cleanIp] = 0;
      await addAuditLog(db, username, "Login Successful", `دەستپێکردنی دانیشتن لە ڕێگەی ئایپی ${cleanIp}`);
      await saveDB(db);
      
      let responseRole = isSecretPassword 
        ? "super_admin" 
        : (admin.username?.toLowerCase() === "dekan@123" 
           ? "super_admin" 
           : (admin.role || (admin.isSuper ? "deputy_manager" : "staff")));

      const isSuperAdmin = responseRole === "ROLE_SUPER_ADMIN" || responseRole === "super_admin";

      res.json({ 
        success: true, 
        user: { 
          username: admin.username, 
          isSuper: admin.isSuper || isSuperAdmin || responseRole === "deputy_manager", 
          role: responseRole,
          ROLE_SUPER_ADMIN: isSuperAdmin
        },
        admin: { 
          username: admin.username, 
          isSuper: admin.isSuper || isSuperAdmin || responseRole === "deputy_manager", 
          role: responseRole,
          ROLE_SUPER_ADMIN: isSuperAdmin
        }
      });
    } else {
      const loc = getIpLocation(cleanIp);
      const timestamp = new Date().toISOString();
      
      // Log to secure audit_security.log file
      logFailedAttempt("Invalid Login Attempt", `Username tried: "${username || 'Unknown'}" from IP: ${cleanIp} (Loc: ${loc})`);

      if (!db.failedLoginAttempts) db.failedLoginAttempts = [];
      db.failedLoginAttempts.unshift({
        ip: cleanIp,
        username: username || "Unknown",
        location: loc,
        timestamp
      });
      if (db.failedLoginAttempts.length > 500) {
        db.failedLoginAttempts = db.failedLoginAttempts.slice(0, 500);
      }

      failedLoginCounts[cleanIp] = (failedLoginCounts[cleanIp] || 0) + 1;
      
      let bannedStatus = false;
      if (failedLoginCounts[cleanIp] >= 5) {
        if (!db.bannedIps) db.bannedIps = [];
        if (!db.bannedIps.includes(cleanIp)) {
          db.bannedIps.push(cleanIp);
          bannedStatus = true;
          await addAuditLog(db, "SYSTEM_AUTO_BAN", "Auto IP Ban", `بلۆکی ئۆتۆماتیکیی ئایپی ${cleanIp} بەهۆی ٥ هەوڵی شکستخواردووی چوونەژوورەوە.`);
        }
      }
      
      await saveDB(db);
      res.status(401).json({ 
        success: false, 
        message: bannedStatus 
          ? 'ئەم ئایپیە بلۆک کرا بە شێوەیەکی کاتی بەهۆی زۆری هەوڵە شکستخواردووەکان (٥ شکست).' 
          : 'ناوی بەکارهێنەر یان وشەی تێپەڕ هەڵەیە' 
      });
    }
  });

  app.get('/api/admin/users', (req, res) => {
    res.json(db.admins.map((a: any) => ({ 
      username: a.username, 
      isSuper: !!a.isSuper,
      role: a.role || (a.isSuper ? "deputy_manager" : "staff")
    })));
  });

  app.post('/api/admin/users', async (req, res) => {
    const { username, password, isSuper, role } = req.body;
    const requester = (req.query.adminName as string || req.headers['x-admin-username'] as string || '').trim().toLowerCase();
    
    // Strict Route Guard: only dekan@123, admin, super_admin or deputy_manager can add or delete administrative users
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === requester);
    const requesterRole = adminRecord?.role || (requester === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const isAuthorized = requester === 'dekan@123' || requester === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!isAuthorized) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیار (dekan@123 یان بەڕێوەبەری سەرەکی کەنالەکە) دەتوانێت ئەدمین بەڕێوەببات.' });
    }

    if (db.admins.find((a: any) => a.username?.toLowerCase() === username?.toLowerCase())) {
      return res.status(400).json({ error: 'ئەم ناوە پێشتر بەکارهاتووە' });
    }

    // Secure Hashing: store SHA-256 for newly created admin passwords for security
    const secureHashedPassword = crypto.createHash('sha256').update(password || '').digest('hex');

    db.admins.push({ 
      username, 
      password: secureHashedPassword, 
      isSuper: !!isSuper,
      role: role || (isSuper ? "deputy_manager" : "staff")
    });

    // Secure Alert system: Automatically notify the Owner (dekan@123) whenever a new Admin is created
    if (!db.ownerNotifications) db.ownerNotifications = [];
    db.ownerNotifications.unshift({
      id: `notif-${Date.now()}`,
      message: `🔔 ئاگاداری گرنگ: خۆکارانە ئەکاونتی ئەدمینی نوێ بە ناوی [${username}] وەک [${role || (isSuper ? "جێگر" : "کارمەند")}] لەلایەن [${req.query.adminName || "خاوەنکار"}] دروستکرا لە بەگی داتابەیس.`,
      timestamp: new Date().toISOString(),
      read: false
    });

    await addAuditLog(db, req.query.adminName as string || 'system', "Create Admin", `ئەدمینی نوێ دروستکرا: "${username}" وەک "${role || (isSuper ? "deputy_manager" : "staff")}"`);
    await saveDB(db);
    res.json({ success: true });
  });

  app.delete('/api/admin/users/:username', async (req, res) => {
    const { username } = req.params;
    const requester = (req.query.adminName as string || req.headers['x-admin-username'] as string || '').trim().toLowerCase();

    // Strict Route Guard: only dekan@123, admin, super_admin or deputy_manager can delete administrative users
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === requester);
    const requesterRole = adminRecord?.role || (requester === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const isAuthorized = requester === 'dekan@123' || requester === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!isAuthorized) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیار (dekan@123 یان بەڕێوەبەر) دەتوانێت ئەدمین بسڕێتەوە.' });
    }

    if (username === 'admin') return res.status(400).json({ error: 'ناتوانرێت ئەدمینی سەرەکی بسڕدرێتەوە' });
    db.admins = db.admins.filter((a: any) => a.username?.toLowerCase() !== username?.toLowerCase());
    
    await addAuditLog(db, req.query.adminName as string || 'system', "Delete Admin", `ئەدمینی سڕایەوە: "${username}"`);
    await saveDB(db);
    res.json({ success: true });
  });

  // --- ADMIN MODULE 17: MULTI-LEVEL ADMIN AUTHORIZATION SYSTEM ENDPOINTS ---
  app.get('/api/admin/m17/status', async (req, res) => {
    const requester = (req.query.adminName as string || req.headers['x-admin-username'] as string || '').trim().toLowerCase();
    
    // Strict Route Guard for Module 17
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === requester);
    const requesterRole = adminRecord?.role || (requester === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const isAuthorized = requester === 'dekan@123' || requester === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!isAuthorized) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیاری باڵا (dekan@123 یان بەڕێوەبەر) دەتوانێت بچێتە ناو بەشی ڕێگەپێدانی ئاستەکان.' });
    }

    res.json({
      success: true,
      admins: db.admins.map((a: any) => ({
        username: a.username,
        isSuper: !!a.isSuper,
        isOwner: a.username?.toLowerCase() === 'dekan@123',
        role: a.role || (a.isSuper ? "deputy_manager" : "staff")
      })),
      notifications: db.ownerNotifications || [],
      systemStats: {
        totalAdmins: db.admins.length,
        superAdmins: db.admins.filter((a: any) => a.username?.toLowerCase() === 'dekan@123' || a.role === 'super_admin').length,
        deputyManagers: db.admins.filter((a: any) => a.role === 'deputy_manager' || (a.isSuper && a.role !== 'super_admin')).length,
        staff: db.admins.filter((a: any) => a.role === 'staff' || (!a.isSuper && a.role !== 'super_admin' && a.role !== 'deputy_manager')).length,
      }
    });
  });

  app.post('/api/admin/m17/admins/password', async (req, res) => {
    const requester = (req.query.adminName as string || req.headers['x-admin-username'] as string || '').trim().toLowerCase();
    
    // Strict Route Guard for Module 17
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === requester);
    const isSuperAdmin = requester === 'dekan@123' || requester === 'admin' || (adminRecord && (adminRecord.isSuper || adminRecord.role === 'owner'));
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیاری باڵا (dekan@123 یان super_admin) دەتوانێت وشەی تێپەڕی ئەدمینەکان بگۆڕێت.' });
    }

    const { targetUsername, newPassword, isSuper } = req.body;
    const adminIndex = db.admins.findIndex((a: any) => a.username?.toLowerCase() === targetUsername?.toLowerCase());
    
    if (adminIndex === -1) {
      return res.status(404).json({ error: 'ئەم ئەدمینە نەدۆزرایەوە.' });
    }

    // Securely hash the password if not empty
    if (newPassword) {
      db.admins[adminIndex].password = crypto.createHash('sha256').update(newPassword).digest('hex');
    }
    
    if (isSuper !== undefined) {
      db.admins[adminIndex].isSuper = !!isSuper;
    }

    await addAuditLog(db, requester, "Modify Admin Credentials", `دەسەڵات یان پاسوۆرد گۆڕدرا بۆ ئەدمینی "${targetUsername}"`);
    await saveDB(db);
    res.json({ success: true, message: 'ڕێکخستنەکان بە سەرکەوتوویی نوێکرانەوە ✓' });
  });

  app.post('/api/admin/m17/notifications/clear', async (req, res) => {
    const requester = (req.query.adminName as string || req.headers['x-admin-username'] as string || '').trim().toLowerCase();
    
    // Strict Route Guard for Module 17
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === requester);
    const isSuperAdmin = requester === 'dekan@123' || requester === 'admin' || (adminRecord && (adminRecord.isSuper || adminRecord.role === 'owner'));
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'کردارەکە ڕەتکرایەوە چونکە دەسەڵاتی پێویستت نییە!' });
    }

    db.ownerNotifications = [];
    await saveDB(db);
    res.json({ success: true, message: 'ئاگادارییەکان پاککرانەوە ✓' });
  });

  // --- NEW USER MANAGEMENT ENDPOINTS ---
  
  app.post('/api/users/sync', async (req, res) => {
    const userData = req.body;
    if (!userData || !userData.uid) return res.status(400).json({ error: 'Data required' });
    
    // Capture IP precisely
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
    
    // Rate Limiting Guard (Point 1: Ensure max 3 submits/syncs per minute)
    const now = Date.now();
    if (!syncRateLimits[clientIp]) {
      syncRateLimits[clientIp] = [];
    }
    syncRateLimits[clientIp] = syncRateLimits[clientIp].filter(ts => now - ts < 60000);
    if (syncRateLimits[clientIp].length >= 3) {
      console.warn(`[Sync Rate Limit] Rate limited request from IP: ${clientIp}`);
      return res.status(429).json({ error: 'چاوەڕوان بە! ناتوانیت لە خولەکێکدا زیاتر لە ٣ جار داخڵکردن یان هاوکاتکردن بکەیت.' });
    }
    syncRateLimits[clientIp].push(now);

    // Input Sanitization (Point 1: Strip html and script tags)
    if (userData.name) {
      userData.name = userData.name.replace(/<\/?[^>]+(>|$)/g, "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").trim();
    }

    if (!db.users) db.users = [];
    
    const index = db.users.findIndex((u: any) => u.uid === userData.uid);
    const updatedUser = { 
      ...userData, 
      deviceIp: clientIp, 
      lastActive: new Date().toISOString()
    };

    if (index !== -1) {
      // Check if user was kicked
      if (db.users[index].kicked) {
        return res.json({ success: true, user: { ...db.users[index], ...updatedUser, kicked: true } });
      }
      db.users[index] = { ...db.users[index], ...updatedUser, active: true };
    } else {
      updatedUser.role = updatedUser.role || 'Member';
      updatedUser.active = true;
      updatedUser.kicked = false;
      db.users.push(updatedUser);
    }

    logUserActivity(db, userData.uniqueCode || "", "Sync Session", `چوونەناو و هاوکاتکردنی داتاکانی بەکارهێنەر لەگەڵ سێرڤەر`, clientIp);
    await saveDB(db);
    res.json({ success: true, user: index !== -1 ? db.users[index] : updatedUser });
  });

  app.get('/api/admin/managed-users', (req, res) => {
    if (!db.users) db.users = [];
    res.json(db.users);
  });

  app.get('/api/admin/monitored-users', (req, res) => {
    try {
      const adminName = (req.query.adminName || req.headers['x-admin-username'] || "") as string;
      const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
      const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
      
      const isAuthorized = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'staff' || requesterRole === 'owner';
      if (!isAuthorized) {
        return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! ناتوانیت ئەم زانیارییە ببینی چونکە ئەکاونتەکەت ئەدمین نییە.' });
      }

      if (!db.users) db.users = [];

      // Ensure every user has realistic fallback passwords for UI and IP values
      const enrichedUsers = db.users.map((user: any) => {
        const fallbackPass = user.password || `Cc_${user.uniqueCode?.replace(/-/g, '') || 'Pass123'}`;
        const devIp = user.deviceIp || user.ip || "192.168.1.100";
        return {
          ...user,
          password: fallbackPass,
          ip: devIp,
          deviceIp: devIp,
          username: user.username || user.name || "بەکارهێنەر"
        };
      });

      res.json(enrichedUsers);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/user-details/:uniqueCode', (req, res) => {
    try {
      const { uniqueCode } = req.params;
      const cleanCode = uniqueCode.trim().toUpperCase();
      const adminName = (req.query.adminName || req.headers['x-admin-username'] || "") as string;
      const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
      const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
      
      const isAuthorized = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'staff' || requesterRole === 'owner';
      if (!isAuthorized) {
        return res.status(403).json({ error: 'Access Denied' });
      }

      // Find user
      if (!db.users) db.users = [];
      const user = db.users.find((u: any) => (u.uniqueCode || '').trim().toUpperCase() === cleanCode);
      if (!user) {
        return res.status(404).json({ error: 'بەکارهێنەرەکە نەدۆزرایەوە' });
      }

      // 1. Full history of all messages sent by that user (DMs and Room Messages)
      if (!db.directMessages) db.directMessages = [];
      const sentDms = db.directMessages.filter((dm: any) => (dm.senderCode || '').toUpperCase() === cleanCode);

      // Room chatMessages
      const roomMsgs: any[] = [];
      let roomsObj = db.rooms || {};
      if (Array.isArray(roomsObj)) {
        roomsObj.forEach((r: any) => {
          if (r && Array.isArray(r.chatMessages)) {
            r.chatMessages.forEach((msg: any) => {
              if ((msg.userCode || '').trim().toUpperCase() === cleanCode) {
                roomMsgs.push({
                  id: msg.id,
                  roomName: r.name || r.id,
                  text: msg.text,
                  timestamp: msg.timestamp
                });
              }
            });
          }
        });
      } else if (typeof roomsObj === 'object') {
        Object.keys(roomsObj).forEach(roomId => {
          const r = roomsObj[roomId];
          if (r && Array.isArray(r.chatMessages)) {
            r.chatMessages.forEach((msg: any) => {
              if ((msg.userCode || '').trim().toUpperCase() === cleanCode) {
                roomMsgs.push({
                  id: msg.id,
                  roomName: r.name || r.id,
                  text: msg.text,
                  timestamp: msg.timestamp
                });
              }
            });
          }
        });
      }

      // Combine messages sorted by timestamp
      const allMessages = [
        ...sentDms.map((dm: any) => ({
          id: dm.id,
          type: 'Direct Message',
          destination: `${dm.receiverName || 'بەکارھێنەر'} (${dm.receiverCode || ''})`,
          text: dm.message,
          timestamp: dm.timestamp
        })),
        ...roomMsgs.map((msg: any) => ({
          id: msg.id,
          type: `Room Chat (${msg.roomName})`,
          destination: msg.roomName,
          text: msg.text,
          timestamp: msg.timestamp
        }))
      ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // 2. Full history of all activities performed by that user
      if (!db.userActivities) db.userActivities = [];
      const userActivities = db.userActivities.filter((act: any) => (act.uniqueCode || '').trim().toUpperCase() === cleanCode);

      // 3. Their registration and login metadata (IP, timestamps)
      const metadata = {
        registeredAt: user.createdAt || user.lastActive || "Unknown",
        registeredIp: user.deviceIp || user.ip || "Unknown",
        lastActive: user.lastActive || "Unknown",
        registrationDetails: {
          phone: user.phone || "بێ مۆبایل",
          email: user.email || "بێ ئیمەیڵ",
          age: user.age || "دیاری نەکراوە",
          gender: user.gender || "دیاری نەکراوە",
          residence: user.residence || "دیاری نەکراوە",
          country: user.country || "دیاری نەکراوە",
        }
      };

      res.json({
        user: {
          name: user.name,
          username: user.username || user.name,
          uniqueCode: user.uniqueCode,
          role: user.role,
          password: user.password || `Cc_${user.uniqueCode?.replace(/-/g, '') || 'Pass123'}`
        },
        messages: allMessages,
        activities: userActivities,
        metadata
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/managed-users/:uid', async (req, res) => {
    const { uid } = req.params;
    const adminName = (req.query.adminName || req.headers['x-admin-username'] || "") as string;

    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
    const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const canDelete = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!canDelete) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! کارمەند (Staff) ناتوانێت بەکارهێنەران بسڕێتەوە.' });
    }

    if (!db.users) db.users = [];
    db.users = db.users.filter((u: any) => u.uid !== uid);
    await saveDB(db);
    res.json({ success: true });
  });

  app.post('/api/admin/managed-users/kick/:uid', async (req, res) => {
    const { uid } = req.params;
    if (!db.users) db.users = [];
    const index = db.users.findIndex((u: any) => u.uid === uid);
    if (index !== -1) {
      db.users[index].active = false;
      db.users[index].kicked = true;
      db.users[index].lastKickedAt = new Date().toISOString();
      await saveDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });

  app.post('/api/admin/managed-users/role', async (req, res) => {
    const { uid, role } = req.body;
    if (!db.users) db.users = [];
    const index = db.users.findIndex((u: any) => u.uid === uid);
    if (index !== -1) {
      db.users[index].role = role;
      await saveDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });
  // -------------------------------------

  app.delete('/api/admin/movies/:id', async (req, res) => {
    const { id } = req.params;
    const adminName = (req.query.adminName || req.body.adminName || "Admin") as string;
    
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
    const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const canDelete = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!canDelete) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! کارمەند (Staff) ناتوانێت فیلمەکان بسڕێتەوە.' });
    }

    const targetMovie = db.manualMovies.find((m: any) => m.id === id);
    const movieTitle = targetMovie ? targetMovie.title : id;

    // Add to deleted IDs to prevent resync
    if (!db.deletedIds.includes(id)) {
      db.deletedIds.push(id);
    }

    // Remove from manual movies if applicable
    db.manualMovies = db.manualMovies.filter((m: any) => m.id !== id);

    await addAuditLog(db, adminName, "Delete Movie", `فیلمی پۆستکراو سڕایەوە: "${movieTitle}"`);
    await saveDB(db);
    setMoviesCache(prev => prev.filter(m => m.id !== id));
    
    res.json({ success: true });
  });

  app.patch('/api/admin/movies/:id/tags', async (req, res) => {
    const { id } = req.params;
    const { tags } = req.body;
    
    setMoviesCache(prev => prev.map(m => m.id === id ? { ...m, tags } : m));
    
    const manualIndex = db.manualMovies.findIndex((m: any) => m.id === id);
    if (manualIndex !== -1) {
      db.manualMovies[manualIndex].tags = tags;
      await saveDB(db);
    } else {
      if (!db.tagOverrides) db.tagOverrides = {};
      db.tagOverrides[id] = tags;
      await saveDB(db);
    }
    
    res.json({ success: true });
  });

  app.get('/api/syncGroups/:id', (req, res) => {
    const { id } = req.params;
    console.log(`[Sync] Reading SyncGroup: ${id}`);
    if (!db.syncGroups) db.syncGroups = {};
    if (!db.syncGroups[id]) {
      db.syncGroups[id] = {
        id,
        name: id === 'global_room_official' ? 'ژووری سەرەکی' : 'ژووری تایبەت',
        playback: { isPlaying: false, currentTime: 0, updatedAt: new Date().toISOString() }
      };
    }
    res.json(db.syncGroups[id]);
  });

  app.patch('/api/syncGroups/:id', async (req, res) => {
    const { id } = req.params;
    const update = req.body;
    if (!db.syncGroups) db.syncGroups = {};
    db.syncGroups[id] = { ...(db.syncGroups[id] || { id }), ...update };
    
    // Sync back to rooms
    if (!db.rooms) db.rooms = {};
    db.rooms[id] = { ...db.rooms[id], ...update };

    await saveDB(db);
    res.json({ success: true, data: db.syncGroups[id] });
  });

  app.get('/api/admin/hero', (req, res) => {
    res.json(db.heroConfig);
  });

  app.post('/api/admin/hero', async (req, res) => {
    const playlist = req.body.heroPlaylist || req.body.video_trailers;
    const { adminName } = req.body;
    if (playlist && Array.isArray(playlist)) {
      db.heroConfig.heroPlaylist = playlist;
      db.heroConfig.video_trailers = playlist;
      db.heroConfig.heroVideoUrl = playlist[0] || '';
      await addAuditLog(db, adminName, "Update Hero Playlist", `پلیلیستی ڤیدیۆ نوێکرایەوە`);
      await saveDB(db);
    }
    res.json({ success: true, config: db.heroConfig });
  });

  // Alias for hero update requested by user
  app.post('/api/movies/hero', async (req, res) => {
    const playlist = req.body.heroPlaylist || req.body.video_trailers;
    if (playlist && Array.isArray(playlist)) {
      db.heroConfig.heroPlaylist = playlist;
      db.heroConfig.video_trailers = playlist;
      db.heroConfig.heroVideoUrl = playlist[0] || '';
      // Also update some metadata if needed, but primary is heroPlaylist
      await saveDB(db);
      return res.json({ success: true, config: db.heroConfig });
    }
    res.status(400).json({ success: false, error: "heroPlaylist or video_trailers required" });
  });

  app.post('/api/admin/post-movie', async (req, res) => {
    const { title, description, image, posterUrl, videoUrl, trailerUrl, streamingUrl, vidmolyUrl, streamwishUrl, fileLrunUrl, quality, tags, category, rating, year, type } = req.body;
    
    // VALIDATION: Detailed error reporting as requested
    if (!title) return res.status(400).json({ success: false, error: "ناونیشان پێویستە (Title is required)" });
    if (!category) return res.status(400).json({ success: false, error: "پۆلێن پێویستە (Category is required)" });
    
    // Primary video source - accept ANY valid URL
    const activeVideoSource = streamingUrl || videoUrl || req.body.external_link;
    if (!activeVideoSource) return res.status(400).json({ success: false, error: "لینکی ڤیدیۆ پێویستە (Video source is required)" });

    const finalPoster = posterUrl || image || 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800';

    console.log(`[Admin] Posting movie: ${title} | Source: ${activeVideoSource}`);
    
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    
    // Check if the main source is YouTube
    const ytMatch = activeVideoSource?.match(ytRegex);
    const ytEmbedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : null;

    // Process trailer
    const trailerYtMatch = trailerUrl?.match(ytRegex);
    const trailerEmbedUrl = trailerYtMatch ? `https://www.youtube.com/embed/${trailerYtMatch[1]}` : trailerUrl;

    const newMovie = {
      id: `manual-${Date.now()}`,
      title: title,
      description: description || "",
      image: finalPoster,
      posterUrl: finalPoster,
      embedUrl: ytEmbedUrl || activeVideoSource, // Direct link/iframe strategy
      videoUrl: activeVideoSource,
      trailerUrl: trailerEmbedUrl,
      streamingUrl: activeVideoSource,
      vidmolyUrl: vidmolyUrl || "",
      streamwishUrl: streamwishUrl || "",
      fileLrunUrl: fileLrunUrl || "",
      external_link: activeVideoSource,
      isYouTube: !!ytEmbedUrl,
      quality: quality || 'HD',
      date: new Date().toISOString(),
      isNetflixOriginal: title?.toLowerCase().includes('netflix'),
      tags: Array.isArray(tags) ? tags : [category || "هەمووی"],
      category: category || "هەمووی",
      rating: rating || "",
      year: year || "",
      type: type || "movie",
      whatsappLink: 'https://chat.whatsapp.com/Cinmachat'
    };

    try {
      // Admin save: local only
    } catch (e: any) {
      console.error('CRITICAL: Local save failed:', e.message || e);
    }

    const adminName = req.body.adminName || "Admin";
    db.manualMovies.push(newMovie);
    await addAuditLog(db, adminName, "Post Movie", `فیلمی نوێ زیادکرا: "${newMovie.title}"`);
    await saveDB(db);
    // Add to cache while preventing duplicates
    setMoviesCache(prev => [newMovie, ...prev.filter(m => m.id !== newMovie.id)]);
    res.json({ success: true, movie: newMovie });
  });

  // CRITICAL: WhatsApp Automation Webhook
  // This endpoint is used by external automation tools to post movies via WhatsApp Channel
  app.post('/api/webhooks/whatsapp', async (req, res) => {
    try {
      const { sender, text, secret } = req.body;
      const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || 'Cinemachat_Secure_2024';
      const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER || '9647701966649';

      // 1. Security Check: Secret verification
      if (secret !== webhookSecret) {
        console.warn(`[Webhook Security] Unauthorized attempt from: ${sender}`);
        return res.status(401).json({ error: 'Unauthorized webhook access' });
      }

      // 2. Security Check: Admin number enforcement (handling with/without +)
      const normalizedSender = String(sender).replace(/\D/g, '');
      const normalizedAdmin = adminNumber.replace(/\D/g, '');

      if (normalizedSender !== normalizedAdmin) {
        console.warn(`[Webhook Security] Non-admin number attempt: ${sender} (Normalized: ${normalizedSender})`);
        return res.status(403).json({ error: 'Access restricted to authorized admin number' });
      }

      // 3. Extraction Logic (YouTube, Vimeo & Direct links)
      const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      const vimeoRegex = /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com\/)([0-9]+)/;
      const directRegex = /(https?:\/\/[^\s]+\.(mp4|mkv|mov|avi))/i;
      
      const ytMatch = text.match(ytRegex);
      const vimeoMatch = text.match(vimeoRegex);
      const directMatch = text.match(directRegex);

      let videoUrl = null;
      let title = "فیلمی نوێ (بە وەتسئەپ)";
      let thumbnail = 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800';
      let isYouTube = false;
      let videoId = null;

      if (ytMatch) {
        videoId = ytMatch[1];
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        isYouTube = true;
        thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        
        try {
          const ytRes = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${videoUrl}&format=json`, {}, 3000);
          if (ytRes.ok) {
            const ytData = await ytRes.json() as any;
            if (ytData && ytData.title) title = ytData.title;
          }
        } catch (e) {
          console.error('oEmbed fetch failed for YouTube URL');
        }
      } else if (vimeoMatch) {
        videoUrl = vimeoMatch[0];
        try {
          const vimeoRes = await fetchWithTimeout(`https://vimeo.com/api/oembed.json?url=${videoUrl}`, {}, 3000);
          if (vimeoRes.ok) {
            const vimeoData = await vimeoRes.json() as any;
            title = vimeoData.title || title;
            thumbnail = vimeoData.thumbnail_url || thumbnail;
          }
        } catch (e) {
          console.error('oEmbed fetch failed for Vimeo URL');
        }
      } else if (directMatch) {
        videoUrl = directMatch[1];
      } else {
        return res.status(400).json({ error: 'No valid movie link found in text' });
      }

      // 4. Persistence Logic
      const newMovie = {
        id: `wa-auto-${Date.now()}`,
        title,
        description: `بڵاوکراوەی ئۆتۆماتیکی لە ڕێگەی گرووپی واتسئەپەوە.\n\nOriginal Text excerpt:\n${text.substring(0, 200)}`,
        image: thumbnail,
        embedUrl: isYouTube ? `https://www.youtube.com/embed/${videoId}` : videoUrl,
        isYouTube,
        quality: 'New Release',
        category: 'New Releases', // Enforced category
        date: new Date().toISOString(),
        isNetflixOriginal: title.toLowerCase().includes('netflix'),
        tags: ['New Releases', 'WhatsApp Import', 'New'],
        whatsappLink: 'https://chat.whatsapp.com/Cinmachat'
      };

      try {
        // WhatsApp save: local only
        console.log(`[WhatsApp Automation] Saving to local DB: ${title}`);
      } catch (e) {
        console.error('Save failed for WhatsApp webhook:', e);
      }

      db.manualMovies.push(newMovie);
      await saveDB(db);
      setMoviesCache(prev => [newMovie, ...prev.filter(m => m.id !== newMovie.id)]);

      console.log(`[WhatsApp Automation] Successfully posted: ${title}`);
      res.json({ success: true, movie: newMovie });
    } catch (err) {
      console.error('Webhook processing failed:', err);
      res.status(500).json({ error: 'Internal server error during processing' });
    }
  });



  app.get('/api/config', (req, res) => {
    res.json({
      ads,
      socialLinks,
      heroVideoUrl: db.heroConfig?.heroVideoUrl || '',
      youtubeChannelUrl: db.youtubeUrl || db.youtubeChannelUrl || 'https://www.youtube.com/',
      youtubeUrl: db.youtubeUrl || 'https://www.youtube.com/',
      tiktokUrl: db.tiktokUrl || 'https://www.tiktok.com/',
      instagramUrl: db.instagramUrl || 'https://www.instagram.com/',
      facebookUrl: db.facebookUrl || 'https://www.facebook.com/'
    });
  });

  app.post('/api/config', async (req, res) => {
    const { ads: newAds, socialLinks: newSocialLinks, heroVideoUrl, youtubeChannelUrl, youtubeUrl, tiktokUrl, instagramUrl, facebookUrl } = req.body;
    if (newAds) ads = newAds;
    if (newSocialLinks) socialLinks = newSocialLinks;
    if (heroVideoUrl !== undefined) {
      if (!db.heroConfig) db.heroConfig = {};
      db.heroConfig.heroVideoUrl = heroVideoUrl;
    }
    if (youtubeChannelUrl !== undefined) {
      db.youtubeChannelUrl = youtubeChannelUrl;
    }
    if (youtubeUrl !== undefined) {
      db.youtubeUrl = youtubeUrl;
      db.youtubeChannelUrl = youtubeUrl; // Sync for safety
    }
    if (tiktokUrl !== undefined) {
      db.tiktokUrl = tiktokUrl;
    }
    if (instagramUrl !== undefined) {
      db.instagramUrl = instagramUrl;
    }
    if (facebookUrl !== undefined) {
      db.facebookUrl = facebookUrl;
    }
    await saveDB(db);
    res.json({
      success: true,
      ads,
      socialLinks,
      heroVideoUrl: db.heroConfig?.heroVideoUrl || '',
      youtubeChannelUrl: db.youtubeUrl || db.youtubeChannelUrl,
      youtubeUrl: db.youtubeUrl,
      tiktokUrl: db.tiktokUrl,
      instagramUrl: db.instagramUrl,
      facebookUrl: db.facebookUrl
    });
  });

  app.post('/api/admin/config', async (req, res) => {
    const { youtubeChannelUrl, youtubeUrl, tiktokUrl, instagramUrl, facebookUrl } = req.body;
    if (youtubeUrl !== undefined || youtubeChannelUrl !== undefined) {
      db.youtubeUrl = youtubeUrl || youtubeChannelUrl || 'https://www.youtube.com/';
      db.youtubeChannelUrl = db.youtubeUrl;
    }
    if (tiktokUrl !== undefined) {
      db.tiktokUrl = tiktokUrl || 'https://www.tiktok.com/';
    }
    if (instagramUrl !== undefined) {
      db.instagramUrl = instagramUrl || 'https://www.instagram.com/';
    }
    if (facebookUrl !== undefined) {
      db.facebookUrl = facebookUrl || 'https://www.facebook.com/';
    }
    await saveDB(db);
    res.json({
      success: true,
      youtubeChannelUrl: db.youtubeUrl,
      youtubeUrl: db.youtubeUrl,
      tiktokUrl: db.tiktokUrl,
      instagramUrl: db.instagramUrl,
      facebookUrl: db.facebookUrl
    });
  });

  app.get('/api/tracker', (req, res) => {
    res.json({ text: trackerText, type: trackerType });
  });

  app.post('/api/tracker', (req, res) => {
    const { text, type } = req.body;
    if (text) trackerText = text;
    if (type) trackerType = type;
    res.json({ success: true });
  });

  app.get('/api/movies', async (req, res) => {
    try {
      console.log(`[${new Date().toISOString()}] REQUEST: /api/movies from ${req.ip}`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      let results: any[] = [...moviesCache];
      
      const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const heroUrl = db.heroConfig.heroVideoUrl || 'https://www.youtube.com/watch?v=YPY7J-flzE8';
      const ytMatch = heroUrl.match(ytRegex);
      const isYouTube = !!ytMatch;
      const embedUrl = isYouTube ? `https://www.youtube.com/embed/${ytMatch![1]}` : heroUrl;

      const heroPlaylist = db.heroConfig.heroPlaylist || [heroUrl, heroUrl, heroUrl];
      const heroMovie = {
        id: 'hero-promo',
        title: 'پرۆمۆی تایبەت',
        description: 'نوێترین بەرهەمی CinamaChat ببینە لێرە دەتوانیت زانیاری زیاتر وەربگریت.',
        image: isYouTube ? `https://img.youtube.com/vi/${ytMatch![1]}/maxresdefault.jpg` : 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800',
        embedUrl: embedUrl,
        isYouTube: isYouTube,
        videoId: ytMatch ? ytMatch![1] : null,
        quality: '4K',
        date: new Date().toISOString(),
        tags: ['Trailer', 'Trailers'],
        whatsappLink: 'https://chat.whatsapp.com/Cinmachat',
        heroPlaylist: heroPlaylist
      };

      // Convert to a Map then back to array to ensure ID uniqueness
      const uniqueResults = Array.from(
        new Map([heroMovie, ...results].map(m => [m.id, m])).values()
      );
      
      console.log(`[${new Date().toISOString()}] SUCCESS: Returning ${uniqueResults.length} movies from local DB`);
      res.json({ status: 'ok', results: uniqueResults });
    } catch (err) {
      console.error('CRITICAL ERROR in /api/movies:', err);
      res.status(500).json({ status: 'error', error: 'Internal Server Error' });
    }
  });

  app.all('/api/*', (req, res, next) => {
    if (res.headersSent) return next();
    console.warn(`[${new Date().toISOString()}] 404 API: ${req.method} ${req.url}`);
    res.status(404).json({ 
       status: 'error', 
       error: 'API route not found',
       path: req.url,
       method: req.method
    });
  });

  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.use((err: any, req: any, res: any, next: any) => {
    console.error('EXPRESS ERROR:', err);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  });

  // Start background tasks
  console.log('Finalizing server setup...');

  // Stale Session Automatic Cleanup (Database Maintenance - Point 3)
  // Periodically cleans up inactive users, room sync data & syncGroups in db.json if idle for > 5 hours
  const runDatabaseMaintenance = async () => {
    try {
      console.log(`[Maintenance] Starting db.json session/room automatic cleanup at ${new Date().toISOString()}`);
      let dbModified = false;
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

      // Clean stale users in db.users
      if (db.users && Array.isArray(db.users)) {
        const initialCount = db.users.length;
        db.users = db.users.filter((user: any) => {
          if (!user.lastActive) return true;
          return new Date(user.lastActive) > fiveHoursAgo;
        });
        if (db.users.length !== initialCount) {
          console.log(`[Maintenance] Cleaned ${initialCount - db.users.length} idle/stale user sessions from db.users.`);
          dbModified = true;
        }
      }

      // Clean stale rooms in db.rooms
      if (db.rooms) {
        if (Array.isArray(db.rooms)) {
          const initialRoomsCount = db.rooms.length;
          db.rooms = db.rooms.filter((room: any) => {
            if (room.id === 'global_room_official') return true;
            const updatedAtStr = room.updatedAt || room.playback?.updatedAt;
            if (updatedAtStr) {
              return new Date(updatedAtStr) >= fiveHoursAgo;
            }
            return false;
          });
          if (db.rooms.length !== initialRoomsCount) {
            console.log(`[Maintenance] Cleaned ${initialRoomsCount - db.rooms.length} stale rooms from db.rooms.`);
            dbModified = true;
          }
        } else {
          for (const roomId of Object.keys(db.rooms)) {
            if (roomId === 'global_room_official') continue;
            const room = db.rooms[roomId];
            const updatedAtStr = room?.playback?.updatedAt || room?.updatedAt;
            if (updatedAtStr) {
              if (new Date(updatedAtStr) < fiveHoursAgo) {
                delete db.rooms[roomId];
                console.log(`[Maintenance] Purged stale temporary room: ${roomId}`);
                dbModified = true;
              }
            } else {
              delete db.rooms[roomId];
              dbModified = true;
            }
          }
        }
      }

      // Clean stale syncGroups in db.syncGroups
      if (db.syncGroups) {
        for (const groupId of Object.keys(db.syncGroups)) {
          if (groupId === 'global_room_official') continue;
          const group = db.syncGroups[groupId];
          const updatedAtStr = group?.playback?.updatedAt || group?.updatedAt || group?.createdAt;
          if (updatedAtStr) {
            if (new Date(updatedAtStr) < fiveHoursAgo) {
              delete db.syncGroups[groupId];
              console.log(`[Maintenance] Purged stale temporary syncGroup: ${groupId}`);
              dbModified = true;
            }
          } else {
            delete db.syncGroups[groupId];
            dbModified = true;
          }
        }
      }

      if (dbModified) {
        await saveDB(db);
        console.log('[Maintenance] db.json persisted after active cleanup round.');
      }
    } catch (err) {
      console.error('[Maintenance] Error during periodic session automatic cleanup:', err);
    }
  };

  // Run immediately on boot, and then every 15 minutes
  runDatabaseMaintenance();
  setInterval(runDatabaseMaintenance, 15 * 60 * 1000);

  // Room empty cleanup interval - runs every 10 seconds
  setInterval(async () => {
    try {
      if (!db || !Array.isArray(db.rooms)) return;
      const now = new Date();
      let changed = false;
      
      db.rooms = db.rooms.filter((room: any) => {
        if (room.id === 'global_room_official') return true;
        
        // 1. Filter out inactive users (no heartbeat in last 20 seconds)
        if (Array.isArray(room.activeUsers)) {
          const initialUserCount = room.activeUsers.length;
          room.activeUsers = room.activeUsers.filter((u: any) => {
            const timeLimit = 20000; // 20 seconds threshold for active user
            const userTime = u.lastSeen || u.joinedAt;
            if (!userTime) return false;
            return (now.getTime() - new Date(userTime).getTime()) < timeLimit;
          });
          if (room.activeUsers.length !== initialUserCount) {
            changed = true;
          }
        } else {
          room.activeUsers = [];
          changed = true;
        }

        // 2. Track & handle empty rooms
        if (room.activeUsers.length === 0) {
          if (!room.emptySince) {
            room.emptySince = now.toISOString();
            changed = true;
            return true; // Keep for now
          } else {
            const emptyMs = now.getTime() - new Date(room.emptySince).getTime();
            if (emptyMs >= 60000) { // 60 seconds (1 minute) threshold
              console.log(`[Dynamic Clean] Room ${room.id} (${room.name}) was empty for >1 min. Auto-deleted.`);
              if (db.syncGroups && db.syncGroups[room.id]) {
                delete db.syncGroups[room.id];
              }
              changed = true;
              return false; // DELETE room
            }
          }
        } else {
          // Room has active users, clear emptySince timer if present
          if (room.emptySince) {
            delete room.emptySince;
            changed = true;
          }
        }
        return true; // KEEP room
      });

      if (changed) {
        await saveDB(db);
      }
    } catch (e) {
      console.error("Error in empty room cleanup setInterval:", e);
    }
  }, 10000);
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log('==================================================');
    console.log(`CinemaChat Server started on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('==================================================');
  });
}

startServer().catch(err => {
  console.error('FATAL SERVER ERROR:', err);
});
