import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

const projectBase = () => ({
  id: 'mock-proj',
  project_id: 'mock-proj',
  status: 'IMAGES_GENERATED',
  template_style: '',
  template_style_json: '',
  template_image_path: '',
  updated_at: '2026-03-15T00:00:00Z',
  pages: [
    {
      id: 'p1',
      page_id: 'p1',
      order_index: 0,
      status: 'COMPLETED',
      outline_content: { title: 'Slide 1' },
      generated_image_path: 'mock.jpg',
    },
  ],
})

async function setupMocks(
  page: import('@playwright/test').Page,
  overrides?: Partial<ReturnType<typeof projectBase>>
) {
  let projectState = { ...projectBase(), ...(overrides || {}) }
  const projectUpdatePayloads: any[] = []
  let templateUploadCalls = 0

  await page.route('**/api/access-code/check', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
  })

  await page.route('**/api/projects/*/template', async (route) => {
    if (route.request().method() === 'POST') {
      templateUploadCalls += 1
      projectState = { ...projectState, template_image_path: '/files/mock-proj/template/applied.png', updated_at: '2026-03-15T00:00:01Z' }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { template_image_url: projectState.template_image_path } }),
      })
      return
    }
    await route.fallback()
  })

  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: projectState }),
      })
      return
    }

    const body = route.request().postDataJSON?.() || {}
    projectUpdatePayloads.push(body)
    projectState = { ...projectState, ...body }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: projectState }),
    })
  })

  await page.route('**/api/user-templates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          templates: [
            {
              template_id: 'user-1',
              name: '我的模版 1',
              template_image_url: '/files/user-templates/user-1/original.png',
              thumb_url: '/files/user-templates/user-1/thumb.png',
            },
          ],
        },
      }),
    })
  })

  await page.route('**/api/preset-templates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          templates: [
            {
              template_id: 'preset-1',
              name: '图片模版 1',
              template_image_url: '/files/preset-templates/preset-1/original.png',
              thumb_url: '/files/preset-templates/preset-1/thumb.png',
            },
          ],
        },
      }),
    })
  })

  await page.route('**/api/style-presets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          presets: [
            {
              id: 'style-1',
              name: 'JSON 模版 1',
              style_json: '{"theme":"alpha"}',
              preview_images: {
                cover_url: '/files/style-presets/style-1/cover.png',
                toc_url: '/files/style-presets/style-1/toc.png',
                detail_url: '/files/style-presets/style-1/detail.png',
                ending_url: '/files/style-presets/style-1/ending.png',
              },
            },
          ],
        },
      }),
    })
  })

  await page.route('**/api/materials**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          materials: [
            {
              id: 'm1',
              url: '/files/materials/m1.png',
              filename: 'material-1.png',
              name: '素材 1',
              prompt: '素材 1',
            },
          ],
        },
      }),
    })
  })

  await page.route('**/api/projects?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          projects: [{ project_id: 'mock-proj', idea_prompt: 'Mock Project' }],
          total: 1,
        },
      }),
    })
  })

  await page.route('**/api/settings', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })

  await page.route('**/image-versions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { versions: [] } }) })
  })

  await page.route('**/files/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from([]) })
  })

  return {
    getProjectState: () => projectState,
    getTemplateUploadCalls: () => templateUploadCalls,
    getProjectUpdatePayloads: () => projectUpdatePayloads,
  }
}

test.describe('Preview template selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenHelpModal', 'true')
      sessionStorage.clear()
    })
  })

  test('opens selector modal with three tabs and new title', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)

    await page.getByText(/选择模版|Select Template/).click()

    await expect(page.getByRole('heading', { name: /选择模版|Select Template/ })).toBeVisible()
    await expect(page.getByTestId('template-selector-tab-image')).toBeVisible()
    await expect(page.getByTestId('template-selector-tab-json')).toBeVisible()
    await expect(page.getByTestId('template-selector-tab-material')).toBeVisible()
    await expect(page.getByText(/使用文字描述风格|Use text description for style/)).toHaveCount(0)
    await expect(page.getByText(/上传模板|Upload Template/)).toHaveCount(0)
    await expect(page.getByTestId('template-selector-apply')).toBeDisabled()
  })

  test('selecting a card stays in draft until apply, and closing discards draft', async ({ page }) => {
    const mocks = await setupMocks(page)
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)

    await page.getByText(/选择模版|Select Template/).click()
    await page.getByTestId('template-selector-tab-json').click()
    await page.getByTestId('template-card-style-style-1').click()

    await expect(page.getByText(/已选中待应用|Pending Apply/)).toBeVisible()
    expect(mocks.getProjectUpdatePayloads()).toHaveLength(0)
    expect(mocks.getTemplateUploadCalls()).toBe(0)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: /选择模版|Select Template/ })).toHaveCount(0)

    await page.getByText(/选择模版|Select Template/).click()
    await expect(page.getByTestId('template-selector-apply')).toBeDisabled()
    expect(mocks.getProjectUpdatePayloads()).toHaveLength(0)
  })

  test('applying image template clears template_style_json', async ({ page }) => {
    const mocks = await setupMocks(page, { template_style_json: '{"theme":"existing"}' })
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)

    await page.getByText(/选择模版|Select Template/).click()
    await page.getByTestId('template-card-preset-preset-1').click()
    await page.getByTestId('template-selector-apply').click()

    await expect(page.getByRole('heading', { name: /选择模版|Select Template/ })).toHaveCount(0)
    expect(mocks.getTemplateUploadCalls()).toBe(1)
    expect(mocks.getProjectUpdatePayloads()).toEqual(
      expect.arrayContaining([expect.objectContaining({ template_style_json: '' })])
    )
  })

  test('material tab only selects existing materials and can apply them as template', async ({ page }) => {
    const mocks = await setupMocks(page)
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)

    await page.getByText(/选择模版|Select Template/).click()
    await page.getByTestId('template-selector-tab-material').click()

    await expect(page.getByTestId('template-selector-open-material-library')).toBeVisible()
    await expect(page.locator('input[type="file"][accept="image/*"]')).toHaveCount(0)
    await expect(page.getByText(/生成素材|Generate Material/)).toHaveCount(0)

    await page.getByTestId('material-card-m1').click()
    await page.getByTestId('template-selector-apply').click()

    expect(mocks.getTemplateUploadCalls()).toBe(1)
    expect(mocks.getProjectUpdatePayloads()).toEqual(
      expect.arrayContaining([expect.objectContaining({ template_style_json: '' })])
    )
  })

  test('applying json template marks json current and clears image current state', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)

    await page.getByText(/选择模版|Select Template/).click()
    await page.getByTestId('template-selector-tab-json').click()
    await page.getByTestId('template-card-style-style-1').click()
    await page.getByTestId('template-selector-apply').click()

    await page.getByText(/选择模版|Select Template/).click()
    await expect(page.getByTestId('template-card-style-style-1').getByText(/当前使用|Current/)).toBeVisible()

    await page.getByTestId('template-selector-tab-image').click()
    await expect(page.locator('[data-testid^="template-card-user-"]').first()).not.toContainText(/当前使用|Current/)
    await expect(page.locator('[data-testid^="template-card-preset-"]').first()).not.toContainText(/当前使用|Current/)
  })
})
