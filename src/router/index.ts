import { createRouter, createWebHistory } from 'vue-router'

import AgentWorkspace from '@/views/AgentWorkspace.vue'
import DemoPreview from '@/views/DemoPreview.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/demo/:caseId',
      name: 'demo-preview',
      component: DemoPreview,
    },
    {
      path: '/',
      name: 'agent-workspace',
      component: AgentWorkspace,
    },
  ],
})
