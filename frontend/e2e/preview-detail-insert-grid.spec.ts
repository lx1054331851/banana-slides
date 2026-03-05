import { test, expect, type Page as PlaywrightPage } from '@playwright/test'

test.use({ baseURL: process.env.BASE_URL || 'http://localhost:3000' })

type MockSlide = {
  id: string
  page_id: string
  order_index: number
  status: string
  outline_content: { title: string; points: string[] }
  description_content?: { text: string } | null
  generated_image_path?: string | null
  preview_image_path?: string | null
  updated_at?: string
}

type MockProjectState = {
  projectId: string
  addPageCalls: any[]
  project: {
    id: string
    project_id: string
    status: string
    creation_type: string
    pages: MockSlide[]
  }
}

const nowIso = () => new Date().toISOString()

const makePage = (index: number): MockSlide => {
  const id = `page-${index + 1}`
  return {
    id,
    page_id: id,
    order_index: index,
    status: 'COMPLETED',
    outline_content: { title: `Slide ${index + 1}`, points: [`Point ${index + 1}`] },
    description_content: { text: `Description ${index + 1}` },
    generated_image_path: `/files/mock/${id}.jpg`,
    preview_image_path: `/files/mock/${id}.jpg`,
    updated_at: nowIso(),
  }
}

const setupCommonRoutes = async (page: PlaywrightPage) => {
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { image_resolution: '2K', ai_provider_format: 'gemini' },
      }),
    })
  })
  await page.route('**/api/access-code/check', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { required: false } }),
    })
  })
  await page.route('**/api/user-templates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { templates: [] } }),
    })
  })
  await page.route('**/api/settings/provider-profiles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { profiles: [] } }),
    })
  })
}

const setupProjectRoutes = async (page: PlaywrightPage, state: MockProjectState) => {
  await page.route(`**/api/reference-files/project/${state.projectId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { files: [] } }),
    })
  })

  await page.route(`**/api/projects/${state.projectId}/pages/*/image-versions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { versions: [] } }),
    })
  })

  await page.route(`**/api/projects/${state.projectId}/pages`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    const body = route.request().postDataJSON() as any
    state.addPageCalls.push(body)
    const rawIndex = Number(body?.order_index ?? state.project.pages.length)
    const orderIndex = Math.max(0, Math.min(rawIndex, state.project.pages.length))
    const newId = `page-inserted-${state.addPageCalls.length}`
    const inserted: MockSlide = {
      id: newId,
      page_id: newId,
      order_index: orderIndex,
      status: body?.description_content ? 'DESCRIPTION_GENERATED' : 'DRAFT',
      outline_content: body?.outline_content || { title: '新页面', points: [] },
      description_content: body?.description_content || null,
      generated_image_path: null,
      preview_image_path: null,
      updated_at: nowIso(),
    }
    state.project.pages.splice(orderIndex, 0, inserted)
    state.project.pages = state.project.pages.map((p, idx) => ({ ...p, order_index: idx }))

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: inserted }),
    })
  })

  await page.route(`**/api/projects/${state.projectId}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: state.project,
      }),
    })
  })
}

test.describe('Detail/Preview dynamic insert and preview sidebar modes', () => {
  test('preview supports list+grid insert, 2/3 max resize, and no edge-drag resize conflict', async ({ page }) => {
    const projectId = 'mock-preview-insert-grid'
    const state: MockProjectState = {
      projectId,
      addPageCalls: [],
      project: {
        id: projectId,
        project_id: projectId,
        status: 'COMPLETED',
        creation_type: 'idea',
        pages: Array.from({ length: 18 }, (_, i) => makePage(i)),
      },
    }

    await setupCommonRoutes(page)
    await setupProjectRoutes(page, state)

    await page.goto(`/project/${projectId}/preview`)
    await expect(page.locator('text=共 18 页')).toBeVisible({ timeout: 10000 })

    // List mode insert: click the first insert-after button (appears below card in list mode)
    const insertButtons = page.locator('aside button[aria-label="在此页后新增页面"]')
    await insertButtons.first().click({ force: true })
    await expect(page.locator('text=共 19 页')).toBeVisible({ timeout: 10000 })
    expect(state.addPageCalls[0]?.order_index).toBe(1)

    // Switch to grid mode and insert again (button appears at right side in grid mode)
    await page.locator('aside button[aria-label="网格"]').click()
    await expect(page.locator('aside button[aria-label="列表"]')).toBeVisible()
    await insertButtons.first().click({ force: true })
    await expect(page.locator('text=共 20 页')).toBeVisible({ timeout: 10000 })
    expect(state.addPageCalls[1]?.order_index).toBe(1)

    // Sidebar max width should be <= 2/3 viewport and > 1/2 viewport after drag
    const resizeHandle = page.locator('aside > div.cursor-col-resize').first()
    const handleBox = await resizeHandle.boundingBox()
    const viewport = page.viewportSize()
    expect(handleBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    if (!handleBox || !viewport) return

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(viewport.width - 8, handleBox.y + handleBox.height / 2, { steps: 12 })
    await page.mouse.up()

    const aside = page.locator('aside').first()
    const sidebarWidth = await aside.evaluate((el) => el.getBoundingClientRect().width)
    expect(sidebarWidth).toBeLessThanOrEqual(Math.round(viewport.width * (2 / 3)) + 4)
    const previousMax = Math.min(520, Math.round(viewport.width * 0.5))
    expect(sidebarWidth).toBeGreaterThan(previousMax + 8)

    // Scroll behavior should still work near right edge, and should not trigger width resize
    await page.locator('aside button[aria-label="列表"]').click()
    const scrollContainer = page.locator('aside div.flex-1.overflow-y-auto').first()
    await scrollContainer.hover()
    await page.mouse.wheel(0, 900)
    const scrollTopAfterWheel = await scrollContainer.evaluate((el) => el.scrollTop)
    expect(scrollTopAfterWheel).toBeGreaterThan(0)

    const widthBeforeEdgeDrag = await aside.evaluate((el) => el.getBoundingClientRect().width)
    const scrollerBox = await scrollContainer.boundingBox()
    expect(scrollerBox).not.toBeNull()
    if (!scrollerBox) return

    await page.mouse.move(scrollerBox.x + scrollerBox.width - 2, scrollerBox.y + 60)
    await page.mouse.down()
    await page.mouse.move(scrollerBox.x + scrollerBox.width - 2, scrollerBox.y + 260, { steps: 10 })
    await page.mouse.up()

    const widthAfterEdgeDrag = await aside.evaluate((el) => el.getBoundingClientRect().width)
    expect(Math.abs(widthAfterEdgeDrag - widthBeforeEdgeDrag)).toBeLessThan(4)
  })

  test('detail supports add-first-page and insert-after-card', async ({ page }) => {
    const projectId = 'mock-detail-insert'
    const state: MockProjectState = {
      projectId,
      addPageCalls: [],
      project: {
        id: projectId,
        project_id: projectId,
        status: 'OUTLINE_GENERATED',
        creation_type: 'idea',
        pages: [],
      },
    }

    await setupCommonRoutes(page)
    await setupProjectRoutes(page, state)

    await page.goto(`/project/${projectId}/detail`)
    await expect(page.locator('button:has-text("添加第一页")')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("添加第一页")').click()

    await expect(page.locator('text=第 1 页')).toBeVisible({ timeout: 10000 })
    expect(state.addPageCalls[0]?.order_index).toBe(0)

    await page.locator('[data-testid="description-card-content"]').first().hover()
    const detailInsertButtons = page.locator('button[aria-label="在此页后新增页面"]')
    await detailInsertButtons.first().click({ force: true })

    await expect(page.locator('text=第 2 页')).toBeVisible({ timeout: 10000 })
    expect(state.addPageCalls[1]?.order_index).toBe(1)
  })
})
