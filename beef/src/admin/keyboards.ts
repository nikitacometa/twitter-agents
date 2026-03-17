import { InlineKeyboard } from 'grammy';

export function ratingKeyboard(sessionId: string, variantIdx: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔥 FIRE', `rate:${sessionId}:${String(variantIdx)}:fire`)
    .text('✅ POST', `rate:${sessionId}:${String(variantIdx)}:post`)
    .row()
    .text('🔄 ITERATE', `rate:${sessionId}:${String(variantIdx)}:iterate`)
    .text('❌ REJECT', `rate:${sessionId}:${String(variantIdx)}:reject`);
}

export function confirmKeyboard(sessionId: string, variantIdx: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Queue for posting', `queue:${sessionId}:${String(variantIdx)}`)
    .text('🗑 Discard', `discard:${sessionId}`);
}
