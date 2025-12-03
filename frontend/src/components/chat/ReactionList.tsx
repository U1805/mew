import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Reaction } from '../../types';

interface DisplayReaction extends Reaction {
    isExiting?: boolean;
}

interface ReactionListProps {
    reactions?: Reaction[];
    currentUserId?: string;
    onReactionClick: (emoji: string) => void;
}

const ReactionList: React.FC<ReactionListProps> = ({ reactions = [], currentUserId, onReactionClick }) => {
    const [displayReactions, setDisplayReactions] = useState<DisplayReaction[]>([]);

    useEffect(() => {
        setDisplayReactions(prev => {
            const incoming = reactions || [];
            const incomingMap = new Map(incoming.map(r => [r.emoji, r]));
            const nextState: DisplayReaction[] = [];
            const processedEmojis = new Set<string>();

            prev.forEach(p => {
                if (incomingMap.has(p.emoji)) {
                    nextState.push({ ...incomingMap.get(p.emoji)!, isExiting: false });
                    processedEmojis.add(p.emoji);
                } else {
                    nextState.push({ ...p, isExiting: true });
                }
            });

            incoming.forEach(inc => {
                if (!processedEmojis.has(inc.emoji)) {
                    nextState.push({ ...inc, isExiting: false });
                }
            });

            return nextState;
        });
    }, [reactions]);

    const handleAnimationEnd = (emoji: string) => {
        setDisplayReactions(prev => prev.filter(r => !(r.emoji === emoji && r.isExiting)));
    };

    if (displayReactions.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1 mt-1.5">
            {displayReactions.map((r) => {
                const hasReacted = currentUserId && r.userIds.includes(currentUserId);
                return (
                    <div
                        key={r.emoji}
                        onClick={() => !r.isExiting && onReactionClick(r.emoji)}
                        onAnimationEnd={() => r.isExiting && handleAnimationEnd(r.emoji)}
                        className={clsx(
                            "flex items-center px-1.5 py-0.5 rounded-[8px] cursor-pointer border transition-all select-none active:scale-95",
                            r.isExiting ? "animate-scale-out pointer-events-none" : "animate-pop",
                            hasReacted
                                ? "bg-[#373A53] border-mew-accent/50"
                                : "bg-[#2B2D31] border-transparent hover:border-[#4E5058] hover:bg-[#35373C]"
                        )}
                    >
                        <span className="mr-1.5 text-base leading-none">{r.emoji}</span>
                        <span className={clsx("text-xs font-bold", hasReacted ? "text-mew-accent" : "text-mew-textMuted")}>
                            {r.userIds.length}
                        </span>
                    </div>
                )
            })}
        </div>
    );
};

export default ReactionList;
