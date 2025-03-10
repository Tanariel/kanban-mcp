import { z } from "zod";
import { getCard } from "../operations/cards.js";
import { getTasks } from "../operations/tasks.js";
import { getComments } from "../operations/comments.js";
import { getLabels } from "../operations/labels.js";
import { getLists } from "../operations/lists.js";

export const getCardDetailsSchema = z.object({
    cardId: z.string().describe("The ID of the card to get details for"),
});

export type GetCardDetailsParams = z.infer<typeof getCardDetailsSchema>;

export async function getCardDetails(params: GetCardDetailsParams) {
    const { cardId } = params;

    try {
        // Get the card details
        const card = await getCard(cardId);

        if (!card) {
            throw new Error(`Card with ID ${cardId} not found`);
        }

        // Get tasks for the card
        const tasks = await getTasks(card.id);

        // Get comments for the card
        const comments = await getComments(card.id);

        // Get labels for the card's board
        // Note: We need to get the board ID from the card's listId
        // First, get the list to find its boardId
        const list = await getLists(card.listId);
        const boardId = list[0]?.boardId;

        if (!boardId) {
            throw new Error(`Could not determine board ID for card ${cardId}`);
        }

        const labels = await getLabels(boardId);

        // Filter to just the labels assigned to this card
        // Note: We need to get the labelIds from the card's data
        // This might require additional API calls or data structure knowledge
        // For now, we'll return all labels for the board

        // Calculate task completion percentage
        const completedTasks = tasks.filter((task: any) =>
            task.isCompleted
        ).length;
        const totalTasks = tasks.length;
        const completionPercentage = totalTasks > 0
            ? Math.round((completedTasks / totalTasks) * 100)
            : 0;

        // Sort comments by date (newest first)
        const sortedComments = comments.sort((a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Check if the most recent comment is likely from a human (not the LLM)
        // This is a heuristic and might need adjustment
        const hasRecentHumanFeedback = sortedComments.length > 0 &&
            sortedComments[0].data &&
            !sortedComments[0].data.text.includes("Implemented feature") &&
            !sortedComments[0].data.text.includes("Awaiting human review");

        return {
            card,
            tasks: {
                items: tasks,
                total: totalTasks,
                completed: completedTasks,
                completionPercentage,
            },
            comments: sortedComments,
            labels,
            analysis: {
                hasRecentHumanFeedback,
                isComplete: completionPercentage === 100,
                needsAttention: hasRecentHumanFeedback || completedTasks === 0,
            },
        };
    } catch (error) {
        console.error("Error in getCardDetails:", error);
        throw error;
    }
}
