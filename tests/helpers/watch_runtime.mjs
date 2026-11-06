// SPDX-License-Identifier: GPL-3.0-only
// Simulate the production cold-start sequence after the metadata-only page:
// storage -> one Wear receiver -> shelf. This is a source/runtime-stub check,
// not evidence of GT4 device lifecycle behavior.
export async function initializeWatchRuntime(load, options = {}) {
  const resume = options.resume || '1';
  const selectedBookId = options.selectedBookId || '';
  const app = (await load('app.js')).default;
  if (typeof app.onCreate === 'function') app.onCreate();

  const storageModule = await load('pages/storage/storage.js');
  const storagePage = Object.create(storageModule.default);
  storagePage.data = Object.assign({}, storageModule.default.data);
  storagePage.resume = resume;
  storagePage.selectedBookId = selectedBookId;
  storagePage.onInit();

  const receiverModule = await load('pages/receiver/receiver.js');
  const receiverPage = Object.create(receiverModule.default);
  receiverPage.data = Object.assign({}, receiverModule.default.data);
  receiverPage.resume = resume;
  receiverPage.selectedBookId = selectedBookId;
  receiverPage.onInit();

  const indexModule = await load('pages/index/index.js');
  const page = Object.create(indexModule.default);
  page.data = Object.assign({}, indexModule.default.data);
  page.token = 0;
  page.external = [];
  page.resume = resume;
  page.selectedBookId = selectedBookId;
  page.onInit();

  return { app, page, storagePage, receiverPage,
    wear: await load('wear/WearReceiver.js') };
}
