<template>
  <div class="file-tree">
    <template v-for="node in visibleNodes" :key="node.path">
      <button
        v-if="node.kind === 'folder'"
        class="file-tree__item file-tree__item--folder"
        :style="{ paddingLeft: `${12 + node.depth * 14}px` }"
        type="button"
        @click="toggleFolder(node.path)"
      >
        <ChevronDown v-if="isExpanded(node.path)" :size="14" class="file-tree__chevron" />
        <ChevronRight v-else :size="14" class="file-tree__chevron" />
        <FolderOpen v-if="isExpanded(node.path)" :size="15" />
        <Folder v-else :size="15" />
        <span>{{ node.name }}</span>
      </button>
      <button
        v-else
        class="file-tree__item"
        :class="{ 'file-tree__item--active': node.path === selectedPath }"
        :style="{ paddingLeft: `${26 + node.depth * 14}px` }"
        type="button"
        @click="emit('select', node.path)"
      >
        <FileText :size="15" />
        <span>{{ node.name }}</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import type { WorkspaceFile } from '@/types/agent'

interface Props {
  files: WorkspaceFile[]
  selectedPath: string
}

interface FileTreeNode {
  kind: 'file' | 'folder'
  name: string
  path: string
  depth: number
  children: FileTreeNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [path: string]
}>()

const expandedFolders = ref<Set<string>>(new Set())

const treeNodes = computed<FileTreeNode[]>(() => buildFileTree(props.files))
const visibleNodes = computed<FileTreeNode[]>(() => flattenVisibleNodes(treeNodes.value))

watch(
  () => props.files,
  (files) => {
    const nextExpanded = new Set(expandedFolders.value)

    for (const path of collectFolderPaths(files)) {
      nextExpanded.add(path)
    }

    expandedFolders.value = nextExpanded
  },
  { immediate: true },
)

function buildFileTree(files: WorkspaceFile[]): FileTreeNode[] {
  const roots: FileTreeNode[] = []
  const folders = new Map<string, FileTreeNode>()

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean)
    let siblings = roots
    let folderPath = ''

    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1

      if (isFile) {
        siblings.push({
          kind: 'file',
          name: segment,
          path: file.path,
          depth: index,
          children: [],
        })
        return
      }

      folderPath = folderPath ? `${folderPath}/${segment}` : segment
      let folder = folders.get(folderPath)

      if (!folder) {
        folder = {
          kind: 'folder',
          name: segment,
          path: folderPath,
          depth: index,
          children: [],
        }
        folders.set(folderPath, folder)
        siblings.push(folder)
      }

      siblings = folder.children
    })
  }

  return sortTreeNodes(roots)
}

function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortTreeNodes(node.children),
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'folder' ? -1 : 1
      }

      return a.name.localeCompare(b.name)
    })
}

function flattenVisibleNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  const result: FileTreeNode[] = []

  for (const node of nodes) {
    result.push(node)

    if (node.kind === 'folder' && expandedFolders.value.has(node.path)) {
      result.push(...flattenVisibleNodes(node.children))
    }
  }

  return result
}

function collectFolderPaths(files: WorkspaceFile[]): string[] {
  const paths = new Set<string>()

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean)
    let folderPath = ''

    segments.slice(0, -1).forEach((segment) => {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment
      paths.add(folderPath)
    })
  }

  return [...paths]
}

function isExpanded(path: string): boolean {
  return expandedFolders.value.has(path)
}

function toggleFolder(path: string): void {
  const nextExpanded = new Set(expandedFolders.value)

  if (nextExpanded.has(path)) {
    nextExpanded.delete(path)
  } else {
    nextExpanded.add(path)
  }

  expandedFolders.value = nextExpanded
}
</script>

<style scoped>
.file-tree {
  min-height: 0;
  overflow: auto;
}

.file-tree__item {
  display: flex;
  width: 100%;
  height: 32px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text-color-primary);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}

.file-tree__item:hover,
.file-tree__item--active {
  background: var(--ui-fill-color-light);
}

.file-tree__item--folder {
  font-weight: 650;
}

.file-tree__chevron,
.file-tree__item svg {
  flex: 0 0 auto;
}

.file-tree__chevron {
  color: var(--ui-text-color-secondary);
}

.file-tree__item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
