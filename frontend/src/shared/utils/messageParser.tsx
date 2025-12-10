import React from 'react';
import { Mention } from '../../features/chat/messages/Mention';

/**
 * Parses a message content string and replaces mention syntax with components.
 * Handles <@userId>, @everyone, and @here.
 * @param content The raw message content string.
 * @returns An array of strings and React elements to be rendered.
 */
export const parseMessageContent = (content: string) => {
    // Split by user mentions, @everyone, and @here, keeping the delimiters
    const parts = content.split(/(<@[a-zA-Z0-9_]+>|@everyone|@here)/g);

    return parts.map((part, index) => {
        const userMentionMatch = part.match(/^<@([a-zA-Z0-9_]+)>$/);
        if (userMentionMatch) {
            return <Mention key={index} userId={userMentionMatch[1]} />;
        }

        if (part === '@everyone' || part === '@here') {
            return (
                <span key={index} className="inline-flex items-center px-1 rounded-[3px] font-medium bg-[#F0B232]/30 text-[#F0B232] mx-0.5 align-baseline">
                    {part}
                </span>
            );
        }

        // Filter out empty strings that can result from the split
        if (part) {
            return <span key={index}>{part}</span>;
        }

        return null;
    });
};