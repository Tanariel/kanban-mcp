/**
 * @fileoverview Action (activity log) operations for the MCP Kanban server
 *
 * This module provides functions for retrieving card action history in the Planka Kanban board.
 * Actions represent the activity log/audit trail for cards.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";

// Schema definitions
const PlankaActionSchema = z.object({
    id: z.string(),
    type: z.enum(["createCard", "moveCard", "commentCard"]),
    data: z.record(z.any()),
    cardId: z.string(),
    userId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
});

/**
 * Schema for getting card actions
 * @property {string} cardId - The ID of the card
 */
export const GetCardActionsSchema = z.object({
    cardId: z.string().describe("Card ID"),
});

/**
 * Schema for getting a specific action
 * @property {string} id - The ID of the action
 */
export const GetActionSchema = z.object({
    id: z.string().describe("Action ID"),
});

// Type exports
export type GetCardActionsOptions = z.infer<typeof GetCardActionsSchema>;

// Response schemas
const ActionsResponseSchema = z.object({
    items: z.array(PlankaActionSchema),
    included: z.record(z.any()).optional(),
});

const ActionResponseSchema = z.object({
    item: PlankaActionSchema,
    included: z.record(z.any()).optional(),
});

// Function implementations
/**
 * Retrieves all actions (activity history) for a specific card
 *
 * @param {string} cardId - The ID of the card
 * @returns {Promise<object>} Actions with included user data
 */
export async function getCardActions(cardId: string) {
    try {
        const response = await plankaRequest(`/api/cards/${cardId}/actions`);
        const parsedResponse = ActionsResponseSchema.parse(response);

        // Return full response with included data for user/card context
        return {
            actions: parsedResponse.items,
            included: parsedResponse.included || {},
        };
    } catch (error) {
        throw new Error(
            `Failed to get card actions: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Retrieves a specific action by ID
 *
 * @param {string} id - The ID of the action
 * @returns {Promise<object>} The requested action
 */
export async function getAction(id: string) {
    try {
        const response = await plankaRequest(`/api/actions/${id}`);
        const parsedResponse = ActionResponseSchema.parse(response);
        return parsedResponse.item;
    } catch (error) {
        throw new Error(
            `Failed to get action: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Gets a formatted activity summary for a card
 *
 * @param {string} cardId - The ID of the card
 * @returns {Promise<object>} Formatted activity summary
 */
export async function getCardActivitySummary(cardId: string) {
    try {
        const result = await getCardActions(cardId);
        const actions = result.actions;
        const included = result.included;

        // Get users map for name lookup
        const usersMap = new Map();
        if (included.users && Array.isArray(included.users)) {
            included.users.forEach((user: any) => {
                usersMap.set(user.id, user);
            });
        }

        // Format actions with user names
        const formattedActions = actions.map((action: any) => {
            const user = usersMap.get(action.userId);
            const userName = user
                ? user.name || user.username || user.email
                : "Unknown user";

            return {
                id: action.id,
                type: action.type,
                user: userName,
                userId: action.userId,
                data: action.data,
                createdAt: action.createdAt,
            };
        });

        // Group by action type
        const summary = {
            totalActions: formattedActions.length,
            byType: {
                createCard: formattedActions.filter((a) => a.type === "createCard")
                    .length,
                moveCard: formattedActions.filter((a) => a.type === "moveCard")
                    .length,
                commentCard: formattedActions.filter((a) =>
                    a.type === "commentCard"
                ).length,
            },
            recentActions: formattedActions.slice(0, 10), // Last 10 actions
            allActions: formattedActions,
        };

        return summary;
    } catch (error) {
        throw new Error(
            `Failed to get card activity summary: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}