import { test, expect, devices, type Page } from '@playwright/test';

test('on a phone, search, play and mirror a move, then resume and record practice', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'], browserName: 'chromium' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '街舞动作库.' })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索动作' }).fill('Running Man');
  await expect(page.locator('.move-card')).toHaveCount(1);
  await page.locator('.move-card h3').click();
  await expect(page.getByRole('heading', { name: 'Running Man' })).toBeVisible();
  await page.getByRole('button', { name: '播放示范' }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByLabel('播放速度').selectOption('0.5');
  await expect.poll(() => page.locator('video').evaluate(video => video.playbackRate)).toBe(0.5);
  await page.getByRole('button', { name: '镜像' }).click();
  await expect(page.locator('video')).toHaveClass('mirrored');
  await page.getByRole('button', { name: '添加到计划' }).click();
  await expect(page.getByText('已添加到我的练习')).toBeVisible();
  await page.getByRole('link', { name: '计划', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的练习' })).toBeVisible();
  await page.getByLabel('每个动作拍数').fill('1');
  await page.getByRole('button', { name: '开始练习' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '我的练习' })).toBeVisible();
  await page.getByRole('button', { name: '开始计时' }).click();
  await expect(page.getByRole('heading', { name: '练习记录' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的练习' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '我的练习' })).toBeVisible();
  await context.close();
});

async function authenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
}

test('register and sign in with a real virtual passkey, reject reuse', async ({ browser, request }) => {
  const { code } = await (await request.post('/test/invite')).json();
  const context = await browser.newContext();
  const page = await context.newPage();
  await authenticator(page);
  await page.goto('/account#invite=' + code);
  await page.getByLabel('昵称').fill('测试舞者');
  await page.getByRole('button', { name: '创建 Passkey' }).click();
  await expect(page.getByRole('link', { name: '测试舞者 已同步' })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/account#invite=' + code);
  await page.getByLabel('昵称').fill('重复测试');
  await page.getByRole('button', { name: '创建 Passkey' }).click();
  await expect(page.getByRole('alert')).toHaveText('邀请已使用或已过期。');
  await page.getByRole('button', { name: '已有账号？登录' }).click();
  await page.getByRole('button', { name: '用 Passkey 登录' }).click();
  await expect(page.getByRole('link', { name: '测试舞者 已同步' })).toBeVisible();
  await context.close();
});

test('explain an empty search and recover from a video load failure', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '搜索动作' }).fill('No such dance');
  await expect(page.getByRole('heading', { name: '没有匹配的动作' })).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page.locator('.move-card')).toHaveCount(24);

  const video = '**/media/running-man.mp4';
  await page.route(video, route => route.abort());
  await page.getByRole('link', { name: '跟练 Running Man' }).click();
  await expect(page.getByRole('button', { name: '重试视频' })).toBeVisible();
  await page.unroute(video);
  await page.getByRole('button', { name: '重试视频' }).click();
  await page.getByRole('button', { name: '播放示范' }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
});
