import React from 'react';
import { Icon } from '@iconify/react';
import type { Message } from '../../../shared/types';
import MessageContent from '../messages/MessageContent';

interface ForwardCardProps {
  payload: any;
  serverId?: string;
  channelId?: string;
}

export const ForwardCard: React.FC<ForwardCardProps> = ({ payload, serverId, channelId }) => {
  const forwardedFromLabel = payload?.forwardedFromLabel as string | undefined;
  const forwardedMessage = payload?.forwardedMessage as Partial<Message> | undefined;

  if (!forwardedMessage) return null;

  const author = (forwardedMessage as any).author as any;
  const authorName = author?.username || 'Unknown';
  const avatarUrl = author?.avatar; // 假设有 avatar 字段，如果没有可忽略

  return (
    <div className="flex flex-col gap-1 max-w-[600px] mt-1 group">
      {/* Header: 类似 Discord 的回复/引用提示 */}
      <div className="flex items-center gap-1.5 text-[0.75rem] font-medium text-[#949BA4] select-none ml-1">
        <Icon icon="mdi:forward" width="14" className="opacity-70" />
        <span>
          Forwarded
          {forwardedFromLabel && (
            <>
              <span className="mx-1">from</span>
              <span className="text-[#DBDEE1] hover:underline cursor-pointer transition-colors">
                {forwardedFromLabel}
              </span>
            </>
          )}
        </span>
      </div>

      {/* Main Card: 类似 Discord Embed 样式 */}
      <div className="relative flex bg-[#2B2D31] hover:bg-[#2E3035] rounded-[4px] overflow-hidden transition-colors duration-200">
        
        {/* Left Accent Bar: 装饰性左侧竖条，Discord Embed 经典设计 */}
        <div className="w-[4px] bg-[#1E1F22] shrink-0 opacity-50"></div>

        <div className="py-2.5 px-3 w-full">
          {/* Author Info */}
          <div className="flex items-center gap-2 mb-1.5">
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={authorName} 
                className="w-4 h-4 rounded-full bg-[#1E1F22]"
              />
            ) : (
              // 如果没有头像，显示一个默认的占位图标
              <div className="w-4 h-4 rounded-full bg-[#5865F2] flex items-center justify-center text-[8px] text-white">
                {authorName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-bold text-sm text-[#F2F3F5] hover:underline cursor-pointer">
              {authorName}
            </span>
            <span className="text-[0.65rem] text-[#949BA4] hidden group-hover:inline-block">
              {/* 这里可以放原消息时间，如果有的话 */}
              {/* Original message */}
            </span>
          </div>

          {/* Message Content */}
          <div className="text-[0.9375rem] leading-[1.375rem] text-[#DBDEE1] font-normal">
            <MessageContent
              message={forwardedMessage as Message}
              serverId={serverId}
              channelId={channelId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForwardCard;