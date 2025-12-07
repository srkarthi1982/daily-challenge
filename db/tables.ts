/**
 * Daily Challenge - small daily tasks across categories (learning, wellness, etc.).
 *
 * Design goals:
 * - Challenge definitions (system or user).
 * - Daily assignment logs per user.
 * - Track completion status and reflections.
 */

import { defineTable, column, NOW } from "astro:db";

export const ChallengeDefinitions = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    // null => global/system challenge
    userId: column.text({ optional: true }),

    title: column.text(),                             // "Read 10 pages", "Walk 5,000 steps"
    description: column.text({ optional: true }),
    category: column.text({ optional: true }),        // "learning", "fitness", "mindfulness", etc.
    difficulty: column.text({ optional: true }),      // "easy", "medium", "hard"

    suggestedFrequency: column.text({ optional: true }), // "daily", "weekdays", "weekends"
    estimatedMinutes: column.number({ optional: true }),

    isSystem: column.boolean({ default: false }),
    isActive: column.boolean({ default: true }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const DailyChallengeAssignments = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    challengeId: column.text({
      references: () => ChallengeDefinitions.columns.id,
    }),

    assignmentDate: column.date({ default: NOW }),     // date for which this challenge applies
    status: column.text({ optional: true }),           // "pending", "completed", "skipped"
    completedAt: column.date({ optional: true }),

    reflection: column.text({ optional: true }),       // short note if user wants
    rating: column.number({ optional: true }),         // 1-5 rating on how they felt about it

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  ChallengeDefinitions,
  DailyChallengeAssignments,
} as const;
