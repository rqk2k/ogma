import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import MainView from './views/MainView.vue';
import SettingsView from './views/SettingsView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'main', component: MainView },
  { path: '/settings', name: 'settings', component: SettingsView },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.name === 'settings') return true;
  const has = await window.api.hasApiKey();
  if (!has) return { name: 'settings' };
  return true;
});
