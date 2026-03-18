import { InlineKeyboard } from 'grammy';

export function ratingKeyboard(sessionId: string, variantIdx: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔥 GOLD', `rate:${sessionId}:${String(variantIdx)}:fire`)
    .text('✅ GOOD', `rate:${sessionId}:${String(variantIdx)}:post`)
    .text('❌ BAD', `rate:${sessionId}:${String(variantIdx)}:reject`)
    .row()
    .text('✏️ EDIT', `edit:${sessionId}:${String(variantIdx)}`);
}

export function sessionDoneKeyboard(sessionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Done — show summary', `done:${sessionId}`);
}

export function confirmKeyboard(sessionId: string, variantIdx: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Queue for posting', `queue:${sessionId}:${String(variantIdx)}`)
    .text('🗑 Discard', `discard:${sessionId}`);
}
