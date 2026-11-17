import type { HandwritingService, Recognition, VisionCatalog } from '../handwriting'
import { tutorRequest, type TutorBoot } from './tutor-request'

declare global {
  interface Window { __SOCRATIC_HANDWRITING__?: TutorBoot }
}

export const handwritingService: HandwritingService = {
  async models(signal) {
    const boot = window.__SOCRATIC_HANDWRITING__
    if (!boot) return { models: [], message: '预览页可以手写和保存图片。请在 Harness 内打开插件，复用其已连接的 DeepSeek 等图片模型进行自动识别。' }
    return tutorRequest<VisionCatalog>(boot, 'models', signal, '手写识别')
  },
  async recognize(input, signal) {
    const boot = window.__SOCRATIC_HANDWRITING__
    if (!boot) throw new Error('请在已配置视觉模型的 Harness 中使用自动识别。')
    return tutorRequest<Recognition>(boot, 'recognize', signal, '手写识别', input)
  },
}
