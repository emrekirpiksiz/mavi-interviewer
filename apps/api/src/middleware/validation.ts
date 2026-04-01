import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ============================================
// ZOD VALIDATION SCHEMAS
// ============================================

// ---------- Common Schemas ----------

const companySchema = z.object({
  name: z.string().min(1, 'Şirket adı gerekli'),
  industry: z.string().optional(),
  size: z.string().optional(),
  tech_stack: z.array(z.string()).optional(),
});

const positionSchema = z.object({
  company: companySchema,
  title: z.string().min(1, 'Pozisyon başlığı gerekli'),
  responsibilities: z.array(z.string()).min(1, 'En az bir sorumluluk gerekli'),
  requirements: z.array(z.string()).min(1, 'En az bir gereksinim gerekli'),
});

const experienceSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  duration: z.string().min(1),
  description: z.string().optional(),
});

const educationSchema = z.object({
  degree: z.string().min(1),
  school: z.string().min(1),
  duration: z.string().min(1),
  gpa: z.string().optional(),
});

const candidateSchema = z.object({
  name: z.string().min(1, 'Aday adı gerekli'),
  experiences: z.array(experienceSchema).optional(),
  education: z.array(educationSchema).optional(),
  skills: z.array(z.string()).optional(),
});

const topicScoringSchema = z.object({
  scale: z.string(),
  minimum_expected: z.number(),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

const interviewTopicSchema = z.object({
  category: z.enum(['technical', 'behavioral', 'experience', 'motivation', 'soft_skills']),
  topic: z.string().min(1, 'Konu başlığı gerekli'),
  description: z.string().optional(),
  scoring: topicScoringSchema.optional(),
  evaluation_guide: z.string().optional(),
});

// ---------- Settings Schema ----------

const cameraSettingsSchema = z.object({
  enabled: z.boolean(),
  recordVideo: z.boolean().optional(),
});

const sessionSettingsSchema = z.object({
  camera: cameraSettingsSchema.optional(),
});

// ---------- Request Schemas ----------

export const createSessionSchema = z.object({
  position: positionSchema,
  interview_topics: z.array(interviewTopicSchema).min(1, 'En az bir görüşme konusu gerekli'),
  candidate: candidateSchema,
  settings: sessionSettingsSchema.optional(),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('Geçerli bir session ID gerekli'),
});

// ---------- Types ----------

export type CreateSessionBody = z.infer<typeof createSessionSchema>;
export type SessionIdParams = z.infer<typeof sessionIdParamSchema>;

// ---------- Validation Middleware ----------

/**
 * Generic validation middleware factory
 */
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

/**
 * Validate request body
 */
export function validateBody<T extends z.ZodSchema>(schema: T) {
  return validate(schema, 'body');
}

/**
 * Validate request params
 */
export function validateParams<T extends z.ZodSchema>(schema: T) {
  return validate(schema, 'params');
}

/**
 * Validate request query
 */
export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return validate(schema, 'query');
}
