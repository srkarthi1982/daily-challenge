import { defineAction, ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  ChallengeDefinitions,
  DailyChallengeAssignments,
  and,
  db,
  eq,
  or,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function getDefinitionForUser(definitionId: string, userId: string) {
  const [definition] = await db
    .select()
    .from(ChallengeDefinitions)
    .where(eq(ChallengeDefinitions.id, definitionId));

  if (!definition) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Challenge definition not found.",
    });
  }

  if (definition.userId && definition.userId !== userId && !definition.isSystem) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "You do not have access to this challenge definition.",
    });
  }

  return definition;
}

async function getOwnedAssignment(assignmentId: string, userId: string) {
  const [assignment] = await db
    .select()
    .from(DailyChallengeAssignments)
    .where(and(eq(DailyChallengeAssignments.id, assignmentId), eq(DailyChallengeAssignments.userId, userId)));

  if (!assignment) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Assignment not found.",
    });
  }

  return assignment;
}

export const server = {
  createDefinition: defineAction({
    input: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      difficulty: z.string().optional(),
      suggestedFrequency: z.string().optional(),
      estimatedMinutes: z.number().optional(),
      isActive: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const [definition] = await db
        .insert(ChallengeDefinitions)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          title: input.title,
          description: input.description,
          category: input.category,
          difficulty: input.difficulty,
          suggestedFrequency: input.suggestedFrequency,
          estimatedMinutes: input.estimatedMinutes,
          isSystem: false,
          isActive: input.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { success: true, data: { definition } };
    },
  }),

  updateDefinition: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        title: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.string().optional(),
        suggestedFrequency: z.string().optional(),
        estimatedMinutes: z.number().optional(),
        isActive: z.boolean().optional(),
      })
      .refine(
        (input) =>
          input.title !== undefined ||
          input.description !== undefined ||
          input.category !== undefined ||
          input.difficulty !== undefined ||
          input.suggestedFrequency !== undefined ||
          input.estimatedMinutes !== undefined ||
          input.isActive !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      const definition = await getDefinitionForUser(input.id, user.id);

      if (definition.userId && definition.userId !== user.id) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "You cannot update this challenge.",
        });
      }

      const [updated] = await db
        .update(ChallengeDefinitions)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
          ...(input.suggestedFrequency !== undefined
            ? { suggestedFrequency: input.suggestedFrequency }
            : {}),
          ...(input.estimatedMinutes !== undefined
            ? { estimatedMinutes: input.estimatedMinutes }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(ChallengeDefinitions.id, input.id))
        .returning();

      return { success: true, data: { definition: updated } };
    },
  }),

  listDefinitions: defineAction({
    input: z.object({
      includeInactive: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const filters = [
        or(eq(ChallengeDefinitions.userId, user.id), eq(ChallengeDefinitions.userId, null)),
      ];

      if (!input.includeInactive) {
        filters.push(eq(ChallengeDefinitions.isActive, true));
      }

      const definitions = await db.select().from(ChallengeDefinitions).where(and(...filters));

      return { success: true, data: { items: definitions, total: definitions.length } };
    },
  }),

  createAssignment: defineAction({
    input: z.object({
      challengeId: z.string().min(1),
      assignmentDate: z.date().optional(),
      status: z.string().optional(),
      completedAt: z.date().optional(),
      reflection: z.string().optional(),
      rating: z.number().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getDefinitionForUser(input.challengeId, user.id);

      const [assignment] = await db
        .insert(DailyChallengeAssignments)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          challengeId: input.challengeId,
          assignmentDate: input.assignmentDate ?? new Date(),
          status: input.status ?? "pending",
          completedAt: input.completedAt,
          reflection: input.reflection,
          rating: input.rating,
          createdAt: new Date(),
        })
        .returning();

      return { success: true, data: { assignment } };
    },
  }),

  updateAssignment: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        status: z.string().optional(),
        completedAt: z.date().optional(),
        reflection: z.string().optional(),
        rating: z.number().optional(),
      })
      .refine(
        (input) =>
          input.status !== undefined ||
          input.completedAt !== undefined ||
          input.reflection !== undefined ||
          input.rating !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedAssignment(input.id, user.id);

      const [assignment] = await db
        .update(DailyChallengeAssignments)
        .set({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
          ...(input.reflection !== undefined ? { reflection: input.reflection } : {}),
          ...(input.rating !== undefined ? { rating: input.rating } : {}),
        })
        .where(eq(DailyChallengeAssignments.id, input.id))
        .returning();

      return { success: true, data: { assignment } };
    },
  }),

  listAssignments: defineAction({
    input: z
      .object({
        challengeId: z.string().optional(),
      })
      .optional(),
    handler: async (input, context) => {
      const user = requireUser(context);

      const filters = [eq(DailyChallengeAssignments.userId, user.id)];
      if (input?.challengeId) {
        await getDefinitionForUser(input.challengeId, user.id);
        filters.push(eq(DailyChallengeAssignments.challengeId, input.challengeId));
      }

      const assignments = await db
        .select()
        .from(DailyChallengeAssignments)
        .where(and(...filters));

      return { success: true, data: { items: assignments, total: assignments.length } };
    },
  }),
};
