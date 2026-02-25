/**
 * E2E mock test for style workflow page (/project/:id/style)
 */
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

async function setupMocks(page: import('@playwright/test').Page) {
  // AccessCodeGuard: bypass
  await page.route('**/api/access-code/check', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
  })
  // Output language
  await page.route('**/api/output-language', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
  })
  // Project GET
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { project_id: 'mock-proj', id: 'mock-proj', creation_type: 'outline', template_style: '', pages: [], status: 'DRAFT' }
        }),
      })
      return
    }
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
  // generate outline
  await page.route('**/api/projects/*/generate/outline', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })
  // Task status
  await page.route('**/api/projects/*/tasks/*', async (route) => {
    const taskId = route.request().url().split('/').pop()
    if (taskId === 'regen-task') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: 'regen-task',
            task_type: 'STYLE_PREVIEW_REGENERATE',
            status: 'COMPLETED',
            progress: {
              total: 4,
              completed: 4,
              failed: 0,
              preview_images: {
                cover_url: '/files/mock-proj/style-previews/rec-1/cover_regen.png',
                toc_url: '/files/mock-proj/style-previews/rec-1/toc_regen.png',
                detail_url: '/files/mock-proj/style-previews/rec-1/detail_regen.png',
                ending_url: '/files/mock-proj/style-previews/rec-1/ending_regen.png',
              },
            },
          },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          task_id: 'task-1',
          task_type: 'STYLE_RECOMMENDATIONS',
          status: 'COMPLETED',
          progress: {
            total: 12,
            completed: 12,
            failed: 0,
            recommendations: [
              {
                id: 'rec-1',
                name: '风格1',
                rationale: 'r1',
                style_json: { a: 1 },
                sample_pages: { cover: 'c', toc: 't', detail: 'd', ending: 'e' },
                preview_images: {
                  cover_url: '/files/mock-proj/style-previews/rec-1/cover.png',
                  toc_url: '/files/mock-proj/style-previews/rec-1/toc.png',
                  detail_url: '/files/mock-proj/style-previews/rec-1/detail.png',
                  ending_url: '/files/mock-proj/style-previews/rec-1/ending.png',
                },
              },
              {
                id: 'rec-2',
                name: '风格2',
                rationale: 'r2',
                style_json: { a: 2 },
                sample_pages: { cover: 'c', toc: 't', detail: 'd', ending: 'e' },
                preview_images: { cover_url: '', toc_url: '', detail_url: '', ending_url: '' },
              },
              {
                id: 'rec-3',
                name: '风格3',
                rationale: 'r3',
                style_json: { a: 3 },
                sample_pages: { cover: 'c', toc: 't', detail: 'd', ending: 'e' },
                preview_images: { cover_url: '', toc_url: '', detail_url: '', ending_url: '' },
              },
            ],
          },
        },
      }),
    })
  })
  // Regen previews endpoint
  await page.route('**/api/projects/*/style/recommendations/*/previews', async (route) => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ success: true, data: { task_id: 'regen-task' } }) })
  })
  // File serving
  await page.route('**/files/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from([]) })
  })
  // style templates/presets (optional)
  await page.route('**/api/style-templates**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { templates: [] } }) })
  })
  await page.route('**/api/style-presets**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { presets: [] } }) })
  })
}

test('style workflow renders recommendations and can trigger regenerate', async ({ page }) => {
  await setupMocks(page)
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))

  await page.goto(`${BASE_URL}/project/mock-proj/style?taskId=task-1`)
  await expect(page.getByText('风格预览确认')).toBeVisible()

  // 3 cards
  await expect(page.getByText('风格1')).toBeVisible()
  await expect(page.getByText('风格2')).toBeVisible()
  await expect(page.getByText('风格3')).toBeVisible()

  // Regenerate first card
  await page.getByRole('button', { name: '重跑本组预览' }).first().click()
  // After regen completed, cover image should exist (src updated via override)
  const coverImg = page.locator('img[alt="风格1-封面"]')
  await expect(coverImg).toHaveAttribute('src', /cover_regen\.png/)
})
