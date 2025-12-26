import { ReactRenderer } from '@tiptap/react';
import type { QueryClient } from '@tanstack/react-query';
import type { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import MentionSuggestionList, { type MentionSuggestionItem } from '../components/MentionSuggestionList';
import type { ServerMember } from '../../../shared/types';

type MentionProps = {
  id: string;
  label?: string;
};

type MentionSuggestionParams = {
  queryClient: QueryClient;
  serverId: string;
};

function getItems(queryClient: QueryClient, serverId: string, query: string): MentionSuggestionItem[] {
  const members = (queryClient.getQueryData<ServerMember[]>(['members', serverId]) ?? []).filter((m) => {
    if (!m.userId) return false;
    // Exclude webhook "virtual members" from mention suggestions.
    if (m.channelId) return false;
    // Back-compat guard: webhook members include a synthetic email like `webhook-<id>@internal.mew`.
    if (m.userId.isBot && typeof m.userId.email === 'string' && m.userId.email.startsWith('webhook-')) return false;
    return true;
  });

  const lowerQuery = query.toLowerCase();
  const memberSuggestions: MentionSuggestionItem[] = members
    .filter((m) => m.userId.username.toLowerCase().includes(lowerQuery))
    .slice(0, 10)
    .map((m) => ({ id: m.userId._id, label: m.userId.username, avatarUrl: m.userId.avatarUrl }));

  const globals: MentionSuggestionItem[] = [];
  if ('everyone'.includes(lowerQuery)) globals.push({ id: 'everyone', label: 'everyone', isGlobal: true });
  if ('here'.includes(lowerQuery)) globals.push({ id: 'here', label: 'here', isGlobal: true });

  return [...globals, ...memberSuggestions].slice(0, 10);
}

export function createMentionSuggestion({
  queryClient,
  serverId,
}: MentionSuggestionParams): Omit<SuggestionOptions<MentionSuggestionItem, MentionProps>, 'editor'> {
  return {
    items: ({ query }) => getItems(queryClient, serverId, query),
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: 'mention',
            attrs: props,
          },
          { type: 'text', text: ' ' },
        ])
        .run();
    },
    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionSuggestionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'top-start',
          });
        },
        onUpdate(props) {
          component?.updateProps(props);

          if (!props.clientRect || !popup) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as any,
          });
        },
        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            popup?.[0].hide();
            return true;
          }
          return (component?.ref as any)?.onKeyDown?.(props) ?? false;
        },
        onExit() {
          popup?.[0].destroy();
          popup = null;
          component?.destroy();
          component = null;
        },
      };
    },
  };
}
