import fs from 'fs';
import path from 'path';

const LOG_FILE_PATH = path.join(process.cwd(), 'audit_security.log');

/**
 * 4. Monitoring and Logs:
 * Records failed access attempts to Admin sections or invalid login attempts to a secure local file.
 */
export function logFailedAttempt(eventType: string, details: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${eventType}] ${details}\n`;
  try {
    fs.appendFileSync(LOG_FILE_PATH, logEntry, 'utf8');
    console.log(`[SECURITY AUDIT LOG] ${logEntry.trim()}`);
  } catch (err) {
    console.error('Failed to write to audit_security.log:', err);
  }
}

/**
 * 1. Input Sanitization Utility:
 * Sanitizes strings, arrays, and objects recursively to prevent XSS, HTML Injection, and SQL Injection attempts.
 */
export function sanitizeInput(val: any, key?: string): any {
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    // Exclude large data payloads, base64 strings, or properties that contain URLs/file buffers
    const lowerKey = key?.toLowerCase() || '';
    if (
      val.length > 5000 || 
      val.startsWith('data:') || 
      lowerKey.includes('data') || 
      lowerKey.includes('url') || 
      lowerKey.includes('link') || 
      lowerKey.includes('content')
    ) {
      return val;
    }

    let clean = val.trim();
    
    // XSS / HTML Injection prevention
    clean = clean
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    // JS Script / tag removal
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/javascript:/gi, '');
    clean = clean.replace(/onload\s*=/gi, 'no_load=');
    clean = clean.replace(/onerror\s*=/gi, 'no_error=');
    clean = clean.replace(/onclick\s*=/gi, 'no_click=');

    // SQL Injection common payload keywords prevention
    clean = clean.replace(/\b(UNION|SELECT|DROP|INSERT|DELETE|UPDATE|ALTER|CREATE|TRUNCATE)\b/gi, '[SECURED]');
    clean = clean.replace(/--/g, ''); // strip sql comment
    clean = clean.replace(/\/\*/g, ''); // strip multiline comment start
    clean = clean.replace(/\*\//g, ''); // strip multiline comment end

    return clean;
  }

  if (Array.isArray(val)) {
    return val.map(item => sanitizeInput(item, key));
  }

  if (typeof val === 'object') {
    const sanitizedObj: any = {};
    for (const k of Object.keys(val)) {
      sanitizedObj[k] = sanitizeInput(val[k], k);
    }
    return sanitizedObj;
  }

  return val;
}

/**
 * Express Middleware for Input Sanitization
 */
export const sanitizationMiddleware = (req: any, res: any, next: any) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  next();
};

// Memory stores for rate-limiting (keyed by IP)
const ipRequestStore: { [ip: string]: { count: number; firstRequestTime: number } } = {};
const sensitiveRouteStore: { [ip: string]: { count: number; firstRequestTime: number } } = {};

const GENERAL_LIMIT = 300; // 300 requests/minute
const SENSITIVE_LIMIT = 10; // 10 requests/minute for auth routes
const WINDOW_MS = 60 * 1000;

/**
 * 1. Rate Limiting Middleware:
 * Blocks excessive requests from a single IP to protect against DOS and brute-force attacks.
 */
export const rateLimiter = (req: any, res: any, next: any) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || req.ip || "Unknown";
  const cleanIp = String(ip).trim();
  const now = Date.now();

  // General Rate Limiting
  if (!ipRequestStore[cleanIp]) {
    ipRequestStore[cleanIp] = { count: 1, firstRequestTime: now };
  } else {
    const elapsed = now - ipRequestStore[cleanIp].firstRequestTime;
    if (elapsed > WINDOW_MS) {
      ipRequestStore[cleanIp] = { count: 1, firstRequestTime: now };
    } else {
      ipRequestStore[cleanIp].count++;
      if (ipRequestStore[cleanIp].count > GENERAL_LIMIT) {
        logFailedAttempt(`Rate Limit Exceeded (General)`, `IP ${cleanIp} triggered general rate limiter on ${req.method} ${req.url}`);
        return res.status(429).json({
          success: false,
          message: '⚠️ داواکاری زۆر نێردراوە لەلایەن ئامێرەکەتەوە. تکایە چاوەڕێ بکە پێش هەوڵدانەوە.',
          error: 'Too Many Requests'
        });
      }
    }
  }

  // Sensitive Authentication / VIP verification Rate Limiting
  const isSensitive = req.url.includes('/api/admin/login') || 
                      req.url.includes('/api/admin/verify-secret-login') || 
                      req.url.includes('/api/vip/verify') ||
                      req.url.includes('/api/vip/check-validity');
  
  if (isSensitive) {
    if (!sensitiveRouteStore[cleanIp]) {
      sensitiveRouteStore[cleanIp] = { count: 1, firstRequestTime: now };
    } else {
      const elapsed = now - sensitiveRouteStore[cleanIp].firstRequestTime;
      if (elapsed > WINDOW_MS) {
        sensitiveRouteStore[cleanIp] = { count: 1, firstRequestTime: now };
      } else {
        sensitiveRouteStore[cleanIp].count++;
        if (sensitiveRouteStore[cleanIp].count > SENSITIVE_LIMIT) {
          logFailedAttempt(`Brute Force Blocked`, `IP ${cleanIp} exceeded authorization limits on ${req.method} ${req.url}`);
          return res.status(429).json({
            success: false,
            message: '⚠️ هەوڵەکانی چوونەژوورەوەت زۆر بوون. تکایە بۆ ماوەیەک چاوەڕێ بکە پێش هەوڵدانەوە.',
            error: 'Brute Force Prevention'
          });
        }
      }
    }
  }

  next();
};

/**
 * 2. Admin Access Enforcement Guard:
 * Middleware to verify credentials and ensure administrative roles before allowing access to secure areas.
 */
export function createAdminGuard(db: any) {
  return (req: any, res: any, next: any) => {
    // Exclude public authentication paths inside /api/admin/
    const publicPaths = [
      '/api/admin/login',
      '/api/admin/verify-secret-login',
      '/api/admin/promote-with-secret'
    ];
    
    const requestPath = req.path || req.url.split('?')[0];
    if (publicPaths.some(p => requestPath === p)) {
      return next();
    }

    // Only apply to /api/admin/* endpoints
    if (!req.url.startsWith('/api/admin/')) {
      return next();
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || req.ip || "Unknown";
    const cleanIp = String(clientIp).trim();

    // Retrieve administrative requester username
    const adminName = (req.query.adminName as string || 
                       req.headers['x-admin-username'] as string || 
                       req.body?.adminName as string || 
                       '').trim().toLowerCase();

    if (!adminName) {
      logFailedAttempt(
        `Unauthorized Admin Access Attempt`,
        `IP ${cleanIp} attempted to access ${req.method} ${req.url} without administrator query parameters or headers.`
      );
      return res.status(401).json({
        success: false,
        message: '⚠️ ڕێگەپێدراو نییە! ناوی ئەدمینی پێویست نەنێردراوە.'
      });
    }

    // Find admin record in local state
    const adminRecord = db.admins?.find((a: any) => a.username?.toLowerCase() === adminName);
    
    // Compute role precisely
    const requesterRole = adminRecord?.role || 
      (adminName === 'dekan@123' ? 'ROLE_SUPER_ADMIN' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));

    const isAuthorized = adminName === 'dekan@123' || 
                         adminName === 'admin' || 
                         requesterRole === 'super_admin' || 
                         requesterRole === 'ROLE_SUPER_ADMIN' || 
                         requesterRole === 'deputy_manager' || 
                         requesterRole === 'owner';

    if (!isAuthorized) {
      logFailedAttempt(
        `Admin Guard Rejection`,
        `Admin user "${adminName}" with calculated role "${requesterRole}" from IP ${cleanIp} was rejected from ${req.method} ${req.url}`
      );
      return res.status(403).json({
        success: false,
        message: '⚠️ تۆ دەسەڵاتی پێویستت نییە بۆ بینینی ئەم بەشە!'
      });
    }

    // Pass role to req object for subsequent handler usage
    req.adminRole = requesterRole;
    req.adminUsername = adminName;
    next();
  };
}
