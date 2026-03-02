import { expect, test } from '@playwright/test';

function extractRoomId(text) {
  const match = text.match(/房间号：([A-Z0-9]{6})/);
  return match ? match[1] : null;
}

test('invite-link join shows consistent room state in both clients', async ({ browser, baseURL }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto(baseURL);

  await pageA.getByTestId('name-input').fill('E2E_A');
  await pageA.getByTestId('hello-btn').click();
  await pageA.getByTestId('create-room-btn').click();

  const roomInfoA = pageA.getByTestId('room-info');
  await expect(roomInfoA).toContainText('房间号：');
  const roomTextA = await roomInfoA.textContent();
  const roomId = extractRoomId(roomTextA || '');
  expect(roomId).toBeTruthy();

  await pageA.getByTestId('copy-invite-btn').click();
  const inviteLink = await pageA.getByTestId('copy-invite-btn').getAttribute('data-invite-link');
  expect(inviteLink).toBeTruthy();
  expect(inviteLink).toContain(`room=${roomId}`);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto(inviteLink);
  await pageB.getByTestId('name-input').fill('E2E_B');
  await pageB.getByTestId('hello-btn').click();

  const roomInfoB = pageB.getByTestId('room-info');
  await expect(roomInfoB).toContainText(`房间号：${roomId}`);
  await expect(roomInfoA).toContainText(`房间号：${roomId}`);

  await expect(pageA.getByTestId('players')).toContainText('E2E_A');
  await expect(pageA.getByTestId('players')).toContainText('E2E_B');
  await expect(pageB.getByTestId('players')).toContainText('E2E_A');
  await expect(pageB.getByTestId('players')).toContainText('E2E_B');

  await contextB.close();
  await contextA.close();
});
