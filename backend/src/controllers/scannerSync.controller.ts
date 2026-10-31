import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/response';

interface SessionData {
  queue: string[];
  lastActivity: number;
  connectedPhones: number;
}

// In-memory sessions store
const sessions = new Map<string, SessionData>();

// Periodic cleanup of stale sessions (> 1 hour inactivity)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of sessions.entries()) {
    if (now - val.lastActivity > 60 * 60 * 1000) {
      sessions.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getOrCreateSession(sessionId: string): SessionData {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { queue: [], lastActivity: Date.now(), connectedPhones: 0 };
    sessions.set(sessionId, session);
  }
  session.lastActivity = Date.now();
  return session;
}

/**
 * Mobile camera sends scanned barcode to the station session
 */
export async function pushScan(req: Request, res: Response) {
  try {
    const { session, code } = req.body;
    if (!session || !code) {
      return errorResponse(res, 'Session and code are required', 'MISSING_PARAMS', 400);
    }

    const cleanCode = String(code).trim().toUpperCase();
    const sessionData = getOrCreateSession(session);
    
    // Deduplicate: Don't push if the same code is already queued at the end
    if (sessionData.queue.length === 0 || sessionData.queue[sessionData.queue.length - 1] !== cleanCode) {
      sessionData.queue.push(cleanCode);
    }

    return successResponse(res, `Code "${cleanCode}" transmitted to desktop station`, {
      code: cleanCode,
      queueLength: sessionData.queue.length,
    });
  } catch (error: any) {
    return errorResponse(res, error.message || 'Failed to push scan', 'PUSH_ERROR', 500);
  }
}

/**
 * Clear all queued scans for a session
 */
export async function clearQueue(req: Request, res: Response) {
  try {
    const session = String(req.query.session || req.body?.session || '').trim();
    if (session) {
      const sessionData = sessions.get(session);
      if (sessionData) {
        sessionData.queue = [];
      }
    }
    return successResponse(res, 'Queue cleared');
  } catch (error: any) {
    return errorResponse(res, error.message || 'Failed to clear queue', 'CLEAR_ERROR', 500);
  }
}

/**
 * Desktop station polls for newly arrived scans from paired mobile
 */
export async function pollScans(req: Request, res: Response) {
  try {
    const session = String(req.query.session || '').trim();
    if (!session) {
      return errorResponse(res, 'Session ID is required', 'SESSION_REQUIRED', 400);
    }

    const sessionData = sessions.get(session);
    if (!sessionData || sessionData.queue.length === 0) {
      return successResponse(res, 'No new scans', {
        codes: [],
        scans: [],
        connectedPhones: sessionData?.connectedPhones || 0,
      });
    }

    // Drain and return all queued codes
    const codes = [...sessionData.queue];
    sessionData.queue = [];
    sessionData.lastActivity = Date.now();

    return successResponse(res, `Retrieved ${codes.length} scan(s)`, {
      codes,
      scans: codes,
      connectedPhones: sessionData.connectedPhones,
    });
  } catch (error: any) {
    return errorResponse(res, error.message || 'Failed to poll scans', 'POLL_ERROR', 500);
  }
}

/**
 * Mobile phone registers heart-beat / connection to session
 */
export async function registerPhone(req: Request, res: Response) {
  try {
    const { session } = req.body;
    if (!session) {
      return errorResponse(res, 'Session ID required', 'SESSION_REQUIRED', 400);
    }

    const sessionData = getOrCreateSession(session);
    sessionData.connectedPhones += 1;

    return successResponse(res, 'Mobile scanner paired successfully', {
      connected: true,
      session,
    });
  } catch (error: any) {
    return errorResponse(res, error.message || 'Failed to register phone', 'CONNECT_ERROR', 500);
  }
}
