import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';

// --- Types ---

interface CollectedMessage {
  type: 'roast' | 'feedback';
  authorId: number;
  authorName: string;
  text: string;
  sourceType: 'forwarded' | 'text' | 'voice' | 'video_note';
  timestamp: Date;
}

interface RoastGroup {
  roastText: string;
  feedback: Array<{
    authorName: string;
    sourceType: string;
    text: string;
  }>;
}

export interface FeedbackSession {
  chatId: number;
  startedBy: { id: number; name: string };
  startedAt: Date;
  messages: CollectedMessage[];
  timeoutHandle: ReturnType<typeof setTimeout>;
}

// --- Collector ---

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class FeedbackCollector {
  private session: FeedbackSession | null = null;
  private readonly logger: Logger;
  private readonly dataDir: string;
  private onTimeout: ((chatId: number) => void) | null = null;

  constructor(logger: Logger, dataDir: string = './data') {
    this.logger = logger;
    this.dataDir = dataDir;
  }

  get active(): boolean {
    return this.session !== null;
  }

  get chatId(): number | null {
    return this.session?.chatId ?? null;
  }

  setTimeoutCallback(cb: (chatId: number) => void): void {
    this.onTimeout = cb;
  }

  start(chatId: number, userId: number, userName: string): void {
    if (this.session) {
      clearTimeout(this.session.timeoutHandle);
    }
    this.session = {
      chatId,
      startedBy: { id: userId, name: userName },
      startedAt: new Date(),
      messages: [],
      timeoutHandle: setTimeout(() => {
        const sid = this.session?.chatId;
        this.session = null;
        if (sid != null && this.onTimeout) this.onTimeout(sid);
      }, SESSION_TIMEOUT_MS),
    };
    this.logger.info({ chatId, userId }, 'Feedback session started');
  }

  addMessage(msg: Omit<CollectedMessage, 'timestamp'>): void {
    if (!this.session) return;
    this.session.messages.push({ ...msg, timestamp: new Date() });
    this.logger.debug(
      { type: msg.type, sourceType: msg.sourceType, author: msg.authorName },
      'Feedback message collected',
    );
  }

  get messageCount(): number {
    return this.session?.messages.length ?? 0;
  }

  /**
   * Finalize session: group messages, build report, save to file, return report text.
   */
  async finalize(): Promise<{ report: string; filePath: string } | null> {
    if (!this.session || this.session.messages.length === 0) {
      this.cancel();
      return null;
    }

    clearTimeout(this.session.timeoutHandle);
    const session = this.session;
    this.session = null;

    const { groups, generalFeedback } = this.groupMessages(session.messages);
    const evaluators = this.extractEvaluators(session.messages);
    const report = this.formatReport(session, groups, generalFeedback, evaluators);

    const dir = join(this.dataDir, 'feedback-sessions');
    await mkdir(dir, { recursive: true });
    const ts = session.startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const filePath = join(dir, `${ts}.md`);
    await writeFile(filePath, report, 'utf-8');

    this.logger.info(
      { roasts: groups.length, feedbackItems: generalFeedback.length + groups.reduce((s, g) => s + g.feedback.length, 0), filePath },
      'Feedback session finalized',
    );

    return { report, filePath };
  }

  cancel(): void {
    if (this.session) {
      clearTimeout(this.session.timeoutHandle);
      this.session = null;
    }
  }

  // --- Private ---

  /**
   * Group messages by sequence: each forwarded roast starts a new group,
   * all subsequent feedback messages attach to it.
   */
  private groupMessages(messages: CollectedMessage[]): {
    groups: RoastGroup[];
    generalFeedback: Array<{ authorName: string; sourceType: string; text: string }>;
  } {
    const groups: RoastGroup[] = [];
    const generalFeedback: Array<{ authorName: string; sourceType: string; text: string }> = [];
    let currentGroup: RoastGroup | null = null;

    for (const msg of messages) {
      if (msg.type === 'roast') {
        currentGroup = { roastText: msg.text, feedback: [] };
        groups.push(currentGroup);
      } else {
        const entry = { authorName: msg.authorName, sourceType: msg.sourceType, text: msg.text };
        if (currentGroup) {
          currentGroup.feedback.push(entry);
        } else {
          generalFeedback.push(entry);
        }
      }
    }

    return { groups, generalFeedback };
  }

  private extractEvaluators(messages: CollectedMessage[]): string[] {
    const seen = new Map<number, string>();
    for (const msg of messages) {
      if (msg.type === 'feedback' && !seen.has(msg.authorId)) {
        seen.set(msg.authorId, msg.authorName);
      }
    }
    return [...seen.values()];
  }

  private formatReport(
    session: FeedbackSession,
    groups: RoastGroup[],
    generalFeedback: Array<{ authorName: string; sourceType: string; text: string }>,
    evaluators: string[],
  ): string {
    const totalFeedback = generalFeedback.length + groups.reduce((s, g) => s + g.feedback.length, 0);
    const lines: string[] = [];

    lines.push('# Human Feedback Session');
    lines.push(`Date: ${session.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    lines.push(`Started by: ${session.startedBy.name}`);
    lines.push(`Evaluators: ${evaluators.length > 0 ? evaluators.join(', ') : session.startedBy.name}`);
    lines.push(`Roasts reviewed: ${String(groups.length)} | Feedback items: ${String(totalFeedback)}`);
    lines.push('');

    if (generalFeedback.length > 0) {
      lines.push('## General Feedback');
      lines.push('');
      for (const fb of generalFeedback) {
        lines.push(`- [${fb.authorName}, ${fb.sourceType}]: "${fb.text}"`);
      }
      lines.push('');
    }

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      lines.push(`## Roast ${String(i + 1)}/${String(groups.length)}`);
      lines.push('```');
      lines.push(g.roastText);
      lines.push('```');
      lines.push('');

      if (g.feedback.length > 0) {
        lines.push('### Feedback');
        for (const fb of g.feedback) {
          lines.push(`- [${fb.authorName}, ${fb.sourceType}]: "${fb.text}"`);
        }
      } else {
        lines.push('*No feedback provided*');
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
