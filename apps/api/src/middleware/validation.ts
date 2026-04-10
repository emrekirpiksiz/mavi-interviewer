import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ============================================
// ZOD VALIDATION SCHEMAS
// ============================================

// ---------- Assessment Schema ----------

const assessmentSchema = z.object({
  title: z.string().min(1, 'Değerlendirme başlığı gerekli'),
  introText: z.string().min(1, 'Giriş metni gerekli'),
  closingText: z.string().min(1, 'Kapanış metni gerekli'),
});

const questionSchema = z.object({
  id: z.string().min(1, 'Soru ID gerekli'),
  order: z.number().int().min(1, 'Sıra numarası 1 veya üzeri olmalı'),
  text: z.string().min(1, 'Soru metni gerekli'),
  category: z.string().min(1, 'Kategori gerekli'),
  correctOnWrong: z.boolean(),
  correctAnswer: z.string().min(1, 'Doğru cevap gerekli'),
});

const candidateSchema = z.object({
  name: z.string().min(1, 'Aday adı gerekli'),
  email: z.string().email().optional(),
  personnelCode: z.string().optional(),
  position: z.string().optional(),
  store: z.string().optional(),
});

const settingsSchema = z.object({
  cameraMonitoring: z.boolean().optional(),
  maxDurationMinutes: z.number().int().min(1).max(120).optional(),
  language: z.string().optional(),
});

// ---------- Request Schemas ----------

export const createSessionSchema = z.object({
  assessment: assessmentSchema,
  questions: z.array(questionSchema).min(1, 'En az bir soru gerekli'),
  candidate: candidateSchema,
  settings: settingsSchema.optional(),
  externalId: z.string().optional(),
  callbackUrl: z.string().url('Geçerli bir URL gerekli').optional(),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('Geçerli bir session ID gerekli'),
});

// ---------- Types ----------

export type CreateSessionBody = z.infer<typeof createSessionSchema>;
export type SessionIdParams = z.infer<typeof sessionIdParamSchema>;

// ---------- Validation Middleware ----------

export function validate<T extends z.ZodSchema>(
  schema: T,
  source: 'body' | 'params' | 'query' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = source === 'body' ? req.body : source === 'params' ? req.params : req.query;
      schema.parse(data);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: messages.join(', '),
          },
        });
        return;
      }
      next(error);
    }
  };
}

export function validateBody<T extends z.ZodSchema>(schema: T) {
  return validate(schema, 'body');
}

export function validateParams<T extends z.ZodSchema>(schema: T) {
  return validate(schema, 'params');
}

export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return validate(schema, 'query');
}
