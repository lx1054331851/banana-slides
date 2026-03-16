import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.BASE_URL || 'http://localhost:3000' });

test.describe('Preview single edit model override', () => {
  test('uses per-edit model override only for current submit and removes top run override UI', async ({ page }) => {
    const projectId = 'mock-single-edit-model';
    const pageId = 'page-1';
    const projectDefaultModel = 'gemini-3-pro-image-preview';
    const pickedModel = 'gemini-3.1-flash-image-preview';

    let capturedEditPayload: any = null;

    const projectData = {
      id: projectId,
      project_id: projectId,
      status: 'COMPLETED',
      creation_type: 'idea',
      generation_defaults: {
        image: {
          source: 'gemini',
          model: projectDefaultModel,
          resolution: '4K',
        },
      },
      pages: [
        {
          id: pageId,
          page_id: pageId,
          order_index: 0,
          status: 'COMPLETED',
          outline_content: { title: 'Slide 1', points: ['Point 1'] },
          description_content: { text: 'Description 1' },
          generated_image_path: `/files/mock/${pageId}.jpg`,
          preview_image_path: `/files/mock/${pageId}.jpg`,
          updated_at: new Date().toISOString(),
        },
      ],
    };

    await page.route('**/api/settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { image_resolution: '2K', ai_provider_format: 'gemini' },
        }),
      });
    });

    await page.route('**/api/access-code/check', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { required: false } }),
      });
    });

    await page.route('**/api/user-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { templates: [] } }),
      });
    });

    await page.route(`**/api/reference-files/project/${projectId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { files: [] } }),
      });
    });

    await page.route(`**/api/projects/${projectId}/pages/${pageId}/image-versions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { versions: [] } }),
      });
    });

    await page.route(`**/api/projects/${projectId}/detect/cover-ending-fields`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { fields: [] } }),
      });
    });

    await page.route(`**/api/projects/${projectId}/pages/${pageId}/edit/image`, async (route) => {
      capturedEditPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: 'task-edit-1',
            page_id: pageId,
            status: 'PENDING',
          },
        }),
      });
    });

    await page.route(`**/api/projects/${projectId}/tasks/task-edit-1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: 'task-edit-1',
            status: 'COMPLETED',
            progress: { total: 1, completed: 1, failed: 0 },
          },
        }),
      });
    });

    await page.route(`**/api/projects/${projectId}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: projectData }),
      });
    });

    await page.goto(`/project/${projectId}/preview`);
    await expect(page.locator('text=共 1 页')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('text=This Run Override')).toHaveCount(0);
    await expect(page.getByTestId('preview-mode-text')).toHaveCount(0);
    await expect(page.getByTestId('preview-mode-image')).toHaveCount(0);
    await expect(page.getByTestId('preview-editor-pane')).toBeVisible();

    const modelSelect = page.getByTestId('preview-edit-run-image-model');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toHaveValue(projectDefaultModel);

    await modelSelect.selectOption(pickedModel);
    await page.getByTestId('preview-primary-generate').click();

    await expect.poll(() => capturedEditPayload).not.toBeNull();
    expect(capturedEditPayload.generation_override?.image?.model).toBe(pickedModel);
    await expect(modelSelect).toHaveValue(projectDefaultModel);
  });
});
