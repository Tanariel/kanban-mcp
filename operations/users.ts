/**
 * @fileoverview User operations for the MCP Kanban server
 *
 * This module provides functions for managing users in the Planka Kanban board,
 * including retrieving, searching, and looking up users.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaUserSchema } from "../common/types.js";

// Schema definitions
/**
 * Schema for getting all users
 */
export const GetUsersSchema = z.object({
    // No parameters needed
});

/**
 * Schema for getting a specific user
 * @property {string} id - The ID of the user
 */
export const GetUserSchema = z.object({
    id: z.string().describe("User ID"),
});

/**
 * Schema for searching users by name
 * @property {string} name - The name to search for
 */
export const SearchUsersByNameSchema = z.object({
    name: z.string().describe("Name to search for (partial match)"),
});

/**
 * Schema for searching users by email
 * @property {string} email - The email to search for
 */
export const SearchUsersByEmailSchema = z.object({
    email: z.string().describe("Email to search for (exact match)"),
});

/**
 * Schema for searching users by username
 * @property {string} username - The username to search for
 */
export const SearchUsersByUsernameSchema = z.object({
    username: z.string().describe("Username to search for (exact match)"),
});

// Type exports
export type SearchUsersByNameOptions = z.infer<typeof SearchUsersByNameSchema>;
export type SearchUsersByEmailOptions = z.infer<
    typeof SearchUsersByEmailSchema
>;
export type SearchUsersByUsernameOptions = z.infer<
    typeof SearchUsersByUsernameSchema
>;

// Response schemas
const UsersResponseSchema = z.object({
    items: z.array(PlankaUserSchema),
    included: z.record(z.any()).optional(),
});

const UserResponseSchema = z.object({
    item: PlankaUserSchema,
    included: z.record(z.any()).optional(),
});

// Function implementations
/**
 * Retrieves all users
 *
 * @returns {Promise<Array<object>>} Array of all users
 */
export async function getUsers() {
    try {
        const response = await plankaRequest("/api/users");
        const parsedResponse = UsersResponseSchema.parse(response);
        return parsedResponse.items;
    } catch (error) {
        throw new Error(
            `Failed to get users: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Retrieves a specific user by ID
 *
 * @param {string} id - The ID of the user
 * @returns {Promise<object>} The requested user
 */
export async function getUser(id: string) {
    try {
        const response = await plankaRequest(`/api/users/${id}`);
        const parsedResponse = UserResponseSchema.parse(response);
        return parsedResponse.item;
    } catch (error) {
        throw new Error(
            `Failed to get user: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Searches for users by name (partial match, case-insensitive)
 *
 * @param {string} name - The name to search for
 * @returns {Promise<Array<object>>} Array of matching users
 */
export async function searchUsersByName(name: string) {
    try {
        const users = await getUsers();
        const searchLower = name.toLowerCase();

        return users.filter((user: any) => {
            const userName = user.name || "";
            return userName.toLowerCase().includes(searchLower);
        });
    } catch (error) {
        throw new Error(
            `Failed to search users by name: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Searches for users by email (exact match, case-insensitive)
 *
 * @param {string} email - The email to search for
 * @returns {Promise<Array<object>>} Array of matching users (0 or 1)
 */
export async function searchUsersByEmail(email: string) {
    try {
        const users = await getUsers();
        const searchLower = email.toLowerCase();

        return users.filter((user: any) => {
            const userEmail = user.email || "";
            return userEmail.toLowerCase() === searchLower;
        });
    } catch (error) {
        throw new Error(
            `Failed to search users by email: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Searches for users by username (exact match, case-insensitive)
 *
 * @param {string} username - The username to search for
 * @returns {Promise<Array<object>>} Array of matching users (0 or 1)
 */
export async function searchUsersByUsername(username: string) {
    try {
        const users = await getUsers();
        const searchLower = username.toLowerCase();

        return users.filter((user: any) => {
            const userUsername = user.username || "";
            return userUsername.toLowerCase() === searchLower;
        });
    } catch (error) {
        throw new Error(
            `Failed to search users by username: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Gets a user ID by name (convenience function)
 *
 * @param {string} name - The name to search for
 * @returns {Promise<string | null>} The user ID if found, null otherwise
 */
export async function getUserIdByName(name: string): Promise<string | null> {
    const users = await searchUsersByName(name);
    return users.length > 0 ? users[0].id : null;
}