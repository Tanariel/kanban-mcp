/**
 * @fileoverview Card membership operations for the MCP Kanban server
 *
 * This module provides functions for managing card memberships (assigning users to cards)
 * in the Planka Kanban board, including adding and removing members from cards.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaCardMembershipSchema } from "../common/types.js";

// Schema definitions
/**
 * Schema for adding a member to a card
 * @property {string} cardId - The ID of the card
 * @property {string} userId - The ID of the user to add
 */
export const AddCardMemberSchema = z.object({
    cardId: z.string().describe("Card ID"),
    userId: z.string().describe("User ID to add to the card"),
});

/**
 * Schema for removing a member from a card
 * @property {string} cardId - The ID of the card
 * @property {string} userId - The ID of the user to remove
 */
export const RemoveCardMemberSchema = z.object({
    cardId: z.string().describe("Card ID"),
    userId: z.string().describe("User ID to remove from the card"),
});

/**
 * Schema for getting card members
 * @property {string} cardId - The ID of the card
 */
export const GetCardMembersSchema = z.object({
    cardId: z.string().describe("Card ID"),
});

// Type exports
export type AddCardMemberOptions = z.infer<typeof AddCardMemberSchema>;
export type RemoveCardMemberOptions = z.infer<typeof RemoveCardMemberSchema>;
export type GetCardMembersOptions = z.infer<typeof GetCardMembersSchema>;

// Response schemas
const CardMembershipResponseSchema = z.object({
    item: PlankaCardMembershipSchema,
    included: z.record(z.any()).optional(),
});

// Function implementations
/**
 * Adds a user as a member to a card
 *
 * @param {AddCardMemberOptions} options - Options for adding a member
 * @param {string} options.cardId - The ID of the card
 * @param {string} options.userId - The ID of the user to add
 * @returns {Promise<object>} The created card membership
 * @throws {Error} If adding the member fails
 */
export async function addCardMember(options: AddCardMemberOptions) {
    try {
        const response = await plankaRequest(
            `/api/cards/${options.cardId}/card-memberships`,
            {
                method: "POST",
                body: {
                    userId: options.userId,
                },
            },
        );
        const parsedResponse = CardMembershipResponseSchema.parse(response);
        return parsedResponse.item;
    } catch (error) {
        throw new Error(
            `Failed to add member to card: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Removes a user from a card
 *
 * @param {RemoveCardMemberOptions} options - Options for removing a member
 * @param {string} options.cardId - The ID of the card
 * @param {string} options.userId - The ID of the user to remove
 * @returns {Promise<object>} The deleted card membership
 * @throws {Error} If removing the member fails
 */
export async function removeCardMember(options: RemoveCardMemberOptions) {
    try {
        const response = await plankaRequest(
            `/api/cards/${options.cardId}/card-memberships/userId:${options.userId}`,
            {
                method: "DELETE",
            },
        );
        const parsedResponse = CardMembershipResponseSchema.parse(response);
        return parsedResponse.item;
    } catch (error) {
        throw new Error(
            `Failed to remove member from card: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Gets all members of a card
 *
 * @param {string} cardId - The ID of the card
 * @returns {Promise<Array<{membership: object, user: object}>>} Array of card members with their details
 */
export async function getCardMembers(cardId: string) {
    try {
        // Get the card which includes memberships and users in the response
        const response = await plankaRequest(`/api/cards/${cardId}`) as {
            item: any;
            included?: {
                cardMemberships?: any[];
                users?: any[];
            };
        };

        // Extract card memberships and users from the included field
        const cardMemberships = response?.included?.cardMemberships || [];
        const users = response?.included?.users || [];

        // Match memberships with user details
        const members = cardMemberships.map((membership: any) => {
            const user = users.find((u: any) => u.id === membership.userId);
            return {
                membership,
                user,
            };
        });

        return members;
    } catch (error) {
        throw new Error(
            `Failed to get card members: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}