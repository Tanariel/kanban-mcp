/**
 * @fileoverview Notification operations for the MCP Kanban server
 *
 * This module provides functions for managing notifications in the Planka Kanban board,
 * including retrieving, marking as read, and batch updating notifications.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";

// Schema definitions
const PlankaNotificationSchema = z.object({
    id: z.string(),
    userId: z.string(),
    actionId: z.string(),
    cardId: z.string(),
    isRead: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
});

/**
 * Schema for getting notifications
 */
export const GetNotificationsSchema = z.object({
    // No parameters needed
});

/**
 * Schema for getting a specific notification
 * @property {string} id - The ID of the notification
 */
export const GetNotificationSchema = z.object({
    id: z.string().describe("Notification ID"),
});

/**
 * Schema for marking notifications as read
 * @property {Array<string>} ids - Array of notification IDs to mark as read
 */
export const MarkNotificationsAsReadSchema = z.object({
    ids: z.array(z.string()).describe("Array of notification IDs to mark as read"),
});

// Type exports
export type MarkNotificationsAsReadOptions = z.infer<
    typeof MarkNotificationsAsReadSchema
>;

// Response schemas
const NotificationsResponseSchema = z.object({
    items: z.array(PlankaNotificationSchema),
    included: z.record(z.any()).optional(),
});

const NotificationResponseSchema = z.object({
    item: PlankaNotificationSchema,
    included: z.record(z.any()).optional(),
});

// Function implementations
/**
 * Retrieves all notifications for the current user
 *
 * @returns {Promise<Array<object>>} Array of notifications with included card/action data
 */
export async function getNotifications() {
    try {
        const response = await plankaRequest("/api/notifications");
        const parsedResponse = NotificationsResponseSchema.parse(response);

        // Return full response with included data for context
        return {
            notifications: parsedResponse.items,
            included: parsedResponse.included || {},
        };
    } catch (error) {
        throw new Error(
            `Failed to get notifications: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Retrieves a specific notification by ID
 *
 * @param {string} id - The ID of the notification
 * @returns {Promise<object>} The requested notification
 */
export async function getNotification(id: string) {
    try {
        const response = await plankaRequest(`/api/notifications/${id}`);
        const parsedResponse = NotificationResponseSchema.parse(response);
        return parsedResponse.item;
    } catch (error) {
        throw new Error(
            `Failed to get notification: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Marks multiple notifications as read
 *
 * @param {Array<string>} ids - Array of notification IDs to mark as read
 * @returns {Promise<Array<object>>} Array of updated notifications
 */
export async function markNotificationsAsRead(ids: string[]) {
    try {
        // Planka v1 requires updating notifications individually
        const updates = await Promise.all(
            ids.map(async (id) => {
                const response = await plankaRequest(`/api/notifications/${id}`, {
                    method: "PATCH",
                    body: {
                        isRead: true,
                    },
                });
                const parsedResponse = NotificationResponseSchema.parse(response);
                return parsedResponse.item;
            }),
        );

        return updates;
    } catch (error) {
        throw new Error(
            `Failed to mark notifications as read: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Gets unread notifications count
 *
 * @returns {Promise<number>} Number of unread notifications
 */
export async function getUnreadNotificationsCount(): Promise<number> {
    try {
        const result = await getNotifications();
        return result.notifications.filter((n: any) => !n.isRead).length;
    } catch (error) {
        throw new Error(
            `Failed to get unread notifications count: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Marks all notifications as read
 *
 * @returns {Promise<Array<object>>} Array of updated notifications
 */
export async function markAllNotificationsAsRead() {
    try {
        const result = await getNotifications();
        const unreadIds = result.notifications
            .filter((n: any) => !n.isRead)
            .map((n: any) => n.id);

        if (unreadIds.length === 0) {
            return [];
        }

        return await markNotificationsAsRead(unreadIds);
    } catch (error) {
        throw new Error(
            `Failed to mark all notifications as read: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}