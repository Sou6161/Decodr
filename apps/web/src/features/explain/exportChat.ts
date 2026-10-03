import type { ConversationWithMessages } from '@decodr/types';
import { MessageRole } from '@decodr/types';

/**
 * Turns a conversation into a markdown document and downloads it.
 *
 * An explanation is usually worth passing to a teammate, and copying each answer
 * by hand loses the questions that framed them.
 */
export function exportConversation(
  conversation: ConversationWithMessages,
  projectName: string,
): void {
  const lines = [
    `# ${conversation.title}`,
    '',
    `Project: **${projectName}** · exported ${new Date().toLocaleDateString()}`,
    '',
    '---',
    '',
  ];

  for (const m of conversation.messages) {
    if (m.role === MessageRole.User) {
      lines.push(`## ${m.content.trim()}`, '');
    } else {
      lines.push(m.content.trim(), '');
      if (m.contextPaths.length > 0) {
        lines.push(`_Files read: ${m.contextPaths.map((p) => `\`${p}\``).join(', ')}_`, '');
      }
      lines.push('---', '');
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(projectName)}-${slug(conversation.title)}.md`;
  a.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'chat'
  );
}
