import { chromium } from '@playwright/test'
import { readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'

if (!process.env.TUTOR_HARNESS_URL) throw new Error('Set TUTOR_HARNESS_URL to a local, isolated Harness instance URL.')
const parsed = new URL(process.env.TUTOR_HARNESS_URL)
if (parsed.hostname !== '127.0.0.1') throw new Error('Harness smoke test accepts only loopback instances.')
const root = join(process.env.LOCALAPPDATA, 'ms-playwright')
const executablePath = process.env.TUTOR_CHROME_PATH ?? (await readdir(root))
  .filter(x => /^chromium-\d+$/.test(x)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  .map(x => join(root, x, 'chrome-win64', 'chrome.exe')).find(existsSync)
const browser = await chromium.launch({ executablePath, headless: true })
let page
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1280 } })
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.TUTOR_HARNESS_URL, { waitUntil: 'networkidle' })
  const continueButton = page.getByRole('button', { name: '继续', exact: true })
  await page.waitForTimeout(1000)
  if (await continueButton.count()) await continueButton.click()
  await page.waitForTimeout(250)
  await page.keyboard.press('Escape')
  const workbench = page.getByRole('region', { name: '循思数学草稿本' })
  const composer = page.locator('[data-lexical-editor="true"]').first()
  await composer.fill('请保留这段未发送的草稿。')
  assert.equal(await workbench.count(), 0)
  await page.getByRole('button', { name: '循思', exact: true }).click()
  await workbench.waitFor()
  assert.equal(await composer.count(), 0)
  await page.getByLabel('题目 / 已知条件').fill(String.raw`在直角三角形 \(ABC\) 中，\(\angle A=90^\circ\)，\(AB=4\)，\(AC=3\)。求 \(BC\) 的长度，并说明依据。`)
  await page.getByRole('button', { name: '完成编辑', exact: true }).click()
  assert.equal(await workbench.locator('.st-workspace').evaluate(element => getComputedStyle(element).gridTemplateAreas), '"writing help"')
  await page.getByLabel('第 1 步说明').fill('已知两条直角边。\n我想用图中的条件求 BC，应该先观察哪里？')
  const board = page.locator('.st-diagram-board')
  await page.getByRole('button', { name: '作图', exact: true }).click()
  await board.getByRole('img', { name: '平面几何图' }).waitFor()
  await board.getByRole('button', { name: '应用到本步' }).click()
  assert.equal(await board.getByRole('combobox', { name: '作图类型', exact: true }).isVisible(), false)
  await page.locator('.st-problem-reading math').nth(1).evaluate(math => {
    const range = document.createRange()
    range.selectNodeContents(math)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    math.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await page.getByRole('button', { name: '标注选中文字', exact: true }).click()
  const question = '我知道两条直角边，但想不通该用哪个关系把它们和 BC 连起来。'
  await page.getByLabel('想法和卡点').fill(question)
  const helpResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/help/ask'), { timeout: 100000 })
  await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click()
  const help = await helpResponse
  assert.equal(help.status(), 200)
  assert.match(help.headers()['content-type'], /application\/x-ndjson/)
  const reply = page.getByRole('region', { name: 'DeepSeek 回复' })
  const replyError = workbench.locator('.st-feedback-error')
  await reply.or(replyError).first().waitFor({ timeout: 100000 })
  await page.locator('.st-feedback-pending').waitFor({ state: 'hidden', timeout: 100000 })
  if (await replyError.isVisible()) throw new Error(await replyError.innerText())
  const input = help.request().postDataJSON()
  const result = await page.evaluate(annotationId => {
    for (const key of Object.keys(localStorage).filter(key => key.startsWith('dsh-socratic-tutor:v1:'))) {
      const notebook = JSON.parse(localStorage.getItem(key))
      const record = notebook.requests.find(record => record.annotationId === annotationId && record.answer)
      if (record) return { record }
    }
  }, input.annotationId)
  assert.ok(result)
  assert.ok(result.record.answer.trim())
  assert.equal(input.document.steps[0].diagram.kind, 'triangle')
  assert.equal(input.discussion.message, question)
  assert.equal(input.document.annotations[0].quote, String.raw`\(\angle A=90^\circ\)`)
  assert.equal(result.record.annotationId, input.annotationId)
  assert.equal(result.record.level, 1)
  await page.getByRole('region', { name: 'DeepSeek 回复' }).waitFor()
  assert.equal(await page.evaluate(async () => (await fetch('socratic-tutor/help/ask', { method: 'POST' })).status), 401)
  await mkdir('artifacts', { recursive: true })
  const pane = await workbench.boundingBox()
  const content = await workbench.locator('.st-workspace').boundingBox()
  assert.ok(pane && content)
  await page.screenshot({ path: 'artifacts/harness-annotation.png', clip: {
    x: pane.x, y: pane.y, width: pane.width, height: Math.min(pane.height, content.y + content.height - pane.y + 12),
  } })
  await page.getByRole('button', { name: '返回对话', exact: true }).click()
  assert.equal(await composer.innerText(), '请保留这段未发送的草稿。')
  assert.equal(await workbench.count(), 0)
  await page.getByRole('button', { name: '循思', exact: true }).click()
  assert.match(await workbench.getByLabel('第 1 步说明').inputValue(), /已知两条直角边/)
  await page.getByRole('button', { name: '标注 1', exact: true }).click()
  await page.locator('.st-discussion-message').getByText(question).waitFor()
  await page.getByRole('region', { name: 'DeepSeek 回复' }).waitFor()
  const live = process.env.TUTOR_TEST_HANDWRITING === 'live'
  if (live || process.env.TUTOR_TEST_HANDWRITING === '1') {
    await page.getByRole('button', { name: '手绘', exact: true }).click()
    await page.getByText('转成可编辑公式', { exact: true }).click()
    const modelPicker = page.getByRole('combobox', { name: '手写识别模型', exact: true })
    await modelPicker.click({ timeout: 15000 })
    await page.getByRole('listbox', { name: '手写识别模型', exact: true })
      .getByRole('option', { name: live ? /DeepSeek.*Flash/i : /测试专用/ }).first().click()
    const canvas = page.getByLabel('手绘草稿画布')
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    assert.ok(box)
    const strokes = live
      ? [[[110, 101], [134, 126]], [[134, 101], [110, 126]], [[158, 105], [198, 105]], [[178, 85], [178, 125]], [[220, 91], [235, 79], [235, 126]], [[222, 126], [248, 126]]]
      : [[[100, 85], [140, 125]], [[140, 85], [100, 125]]]
    for (const stroke of strokes) {
      const [[x, y], ...rest] = stroke
      await page.mouse.move(box.x + x, box.y + y)
      await page.mouse.down()
      for (const [nextX, nextY] of rest) await page.mouse.move(box.x + nextX, box.y + nextY, { steps: 10 })
      await page.mouse.up()
    }
    const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/handwriting/recognize'), { timeout: 65000 })
    await page.getByRole('button', { name: '识别公式', exact: true }).click()
    const recognition = await response
    const result = await recognition.json()
    assert.equal(recognition.status(), 200, result.error)
    await page.getByRole('button', { name: '插入为新步骤', exact: true }).waitFor()
    const recognized = await page.locator('math-field[aria-label="手写识别结果"]').evaluate(el => el.value)
    if (live) {
      assert.equal(recognized.replace(/\s+/g, ''), 'x+1')
      await page.screenshot({ path: 'artifacts/handwriting-live-recognized.png', fullPage: true })
    } else {
      assert.match(recognized, /x/)
      assert.match(recognized, /1/)
    }
    await page.getByRole('button', { name: '填入当前步骤', exact: true }).click()
    assert.equal(await page.getByLabel('手绘草稿面板').count(), 0)
    assert.equal(await page.locator('.st-step math-field').first().evaluate(el => el.value), recognized)
    assert.equal(await composer.count(), 0)
    const rejectedStatus = await page.evaluate(async () => (await fetch('socratic-tutor/handwriting/models')).status)
    assert.equal(rejectedStatus, 401)
    await page.screenshot({ path: live ? 'artifacts/handwriting-live-inserted.png' : 'artifacts/handwriting-harness.png', fullPage: true })
    console.log(live ? `PASS: DeepSeek Flash recognized ${recognized} and inserted it into the current step.` : 'PASS: native Harness image attachment -> test adapter -> editable LaTeX -> selected step. Unauthorized requests rejected.')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.st-workspace')).gridTemplateAreas === '"writing" "help"')
  assert.equal(await workbench.locator('.st-body').evaluate(body => body.scrollWidth <= body.clientWidth), true)
  assert.deepEqual(errors, [])
  console.log(`PASS: native Harness L1 reply rendered in notebook, composer draft preserved, unauthorized request rejected. Reply: ${result.record.answer}`)
} catch (error) {
  await mkdir('artifacts', { recursive: true })
  await page?.screenshot({ path: 'artifacts/harness-failure.png', fullPage: true })
  console.log('Harness failure context:', (await page?.locator('body').innerText())?.slice(-1800))
  throw error
} finally { await browser.close() }
