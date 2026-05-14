<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import type { Note, NotesSummary } from '../types/note'
import { summarizeNotes } from '../services/annaToolClient'

const notes = ref<Note[]>([])
const newNoteContent = ref('')
const summaryResult = ref<NotesSummary | null>(null)
const summarizing = ref(false)

const noteCount = computed(() => notes.value.length)

function createNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function addNote() {
  const content = newNoteContent.value.trim()

  if (!content) {
    ElMessage.warning('Please enter note content')
    return
  }

  const nextOrder = notes.value.length + 1

  notes.value.push({
    id: createNoteId(),
    content,
    order: nextOrder,
    createdAt: new Date().toISOString(),
  })

  newNoteContent.value = ''
  summaryResult.value = null
  ElMessage.success('Note added')
}

function deleteNote(id: string) {
  notes.value = notes.value
    .filter((note) => note.id !== id)
    .map((note, index) => ({
      ...note,
      order: index + 1,
    }))

  summaryResult.value = null
  ElMessage.info('Note deleted')
}

function formatTime(createdAt: string | String): string {
  const date = new Date(createdAt.toString())

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

async function summarize() {
  if (notes.value.length === 0) {
    ElMessage.warning('No notes to summarize')
    return
  }

  summarizing.value = true
  summaryResult.value = null

  try {
    summaryResult.value = await summarizeNotes(notes.value)
    ElMessage.success('Summary generated')
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to summarize notes'

    ElMessage.error(message)
  } finally {
    summarizing.value = false
  }
}
</script>

<template>
  <div class="note-app">
    <el-card class="input-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>Create Note</span>
        </div>
      </template>

      <div class="input-row">
        <el-input
          v-model="newNoteContent"
          placeholder="Enter note content..."
          clearable
          @keyup.enter="addNote"
        />

        <el-button type="primary" @click="addNote">
          Add
        </el-button>
      </div>
    </el-card>

    <el-card class="list-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>Notes ({{ noteCount }})</span>

          <el-button
            type="success"
            :loading="summarizing"
            :disabled="noteCount === 0"
            @click="summarize"
          >
            Summarize
          </el-button>
        </div>
      </template>

      <el-empty v-if="noteCount === 0" description="No notes yet" />

      <el-table v-else :data="notes" stripe style="width: 100%">
        <el-table-column prop="order" label="#" width="60" />

        <el-table-column prop="content" label="Content" />

        <el-table-column label="Time" width="140">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="Action" width="90" align="center">
          <template #default="{ row }">
            <el-button
              type="danger"
              size="small"
              circle
              @click="deleteNote(row.id)"
            >
              <el-icon>
                <Delete />
              </el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="summaryResult" class="summary-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>Summary</span>
        </div>
      </template>

      <el-descriptions :column="1" border>
        <el-descriptions-item label="Summary">
          {{ summaryResult.summary }}
        </el-descriptions-item>

        <el-descriptions-item label="Count">
          {{ summaryResult.count }}
        </el-descriptions-item>

        <el-descriptions-item label="Categories">
          <el-tag
            v-for="cat in summaryResult.categories"
            :key="cat"
            style="margin-right: 8px"
          >
            {{ cat }}
          </el-tag>
        </el-descriptions-item>

        <el-descriptions-item
          v-if="summaryResult.highlights?.length"
          label="Highlights"
        >
          <div class="highlight-list">
            <div
              v-for="item in summaryResult.highlights"
              :key="item"
              class="highlight-item"
            >
              {{ item }}
            </div>
          </div>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.note-app {
  max-width: 720px;
  margin: 40px auto;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.input-row {
  display: flex;
  gap: 12px;
}

.highlight-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.highlight-item {
  color: #606266;
}
</style>