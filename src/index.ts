import type { Context } from '@deepseek-ai/cordis'
import { registerHandwriting } from './handwriting-server'
import { registerPractice } from './practice-server'
import { registerHelp } from './help-server'
export const name = 'socratic-tutor'
export const inject = ['webServer', 'llm', 'attachments']
export function apply(ctx: Context): void {
  registerHandwriting(ctx)
  registerPractice(ctx)
  registerHelp(ctx)
}
