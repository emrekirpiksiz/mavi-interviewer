import { Router, type Request, type Response } from 'express';
import type { Router as RouterType } from 'express';

// ============================================
// MOCK ATS ROUTES
// ============================================

const router: RouterType = Router();

// ---------- POST /mock-ats/callback ----------
// Mock endpoint to receive transcript from Interview API
// In production, this would be on the ATS side

router.post('/callback', (req: Request, res: Response) => {
  console.log('========================================');
  console.log('MOCK ATS: Transcript Callback Received');
  console.log('========================================');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('========================================');

  // Return success response
  res.json({
    success: true,
    message: 'Transcript received',
  });
});

export default router;
