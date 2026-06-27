import { createRouter, createWebHistory } from 'vue-router'

import AgentWorkspace from '@/views/AgentWorkspace.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'agent-workspace',
      component: AgentWorkspace,
    },
  ],
})
