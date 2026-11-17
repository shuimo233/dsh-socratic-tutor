export type TutorBoot = { path: string; token: string }

export async function tutorResponse(boot: TutorBoot, action: string, signal: AbortSignal, feature: string, body?: unknown, accept = 'application/json'): Promise<Response> {
  let response: Response
  try {
    response = await fetch(new URL(`${boot.path}/${action}`, document.baseURI), {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal,
      headers: { 'X-Socratic-Token': boot.token, Accept: accept, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(`无法连接${feature}，请确认 Harness 正在运行。`)
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `${feature}暂时不可用，请稍后重试。`)
  }
  return response
}

export async function tutorRequest<T>(boot: TutorBoot, action: string, signal: AbortSignal, feature: string, body?: unknown): Promise<T> {
  const response = await tutorResponse(boot, action, signal, feature, body)
  const data: unknown = await response.json().catch(() => null)
  if (data === null) throw new Error(`${feature}暂时不可用，请稍后重试。`)
  return data as T
}
