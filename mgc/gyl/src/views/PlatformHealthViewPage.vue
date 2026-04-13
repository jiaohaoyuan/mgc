<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import axios from 'axios'

const health = reactive({
  runtime: {
    uptime_seconds: 0,
    node_version: ''
  },
  services: [] as any[],
  task_status: {
    total: 0,
    running: 0,
    success: 0,
    failed: 0
  },
  storage: {
    db_file: '',
    db_file_size_mb: 0,
    rss_memory_mb: 0
  },
  recent_errors: [] as any[]
})
let timer: number | null = null

const fetchHealth = async () => {
  const { data } = await axios.get('/platform/health')
  Object.assign(health, data?.data || {})
}

const statusTagType = (status: string) => {
  if (status === 'UP') return 'success'
  if (status === 'WARN') return 'warning'
  return 'danger'
}

onMounted(async () => {
  await fetchHealth()
  timer = window.setInterval(() => { void fetchHealth() }, 60000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="header-row">
          <div class="head">系统健康与运维视图</div>
          <el-button type="primary" @click="fetchHealth">刷新</el-button>
        </div>
      </template>

      <div class="summary">
        <span>运行时长(秒) {{ health.runtime.uptime_seconds }}</span>
        <span>任务总数 {{ health.task_status.total }}</span>
        <span>运行中 {{ health.task_status.running }}</span>
        <span>失败任务 {{ health.task_status.failed }}</span>
      </div>

      <el-table :data="health.services" border>
        <el-table-column prop="service_name" label="服务" min-width="180" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="240" />
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header><div class="head">存储状态</div></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="DB 文件">{{ health.storage.db_file }}</el-descriptions-item>
        <el-descriptions-item label="Node 版本">{{ health.runtime.node_version }}</el-descriptions-item>
        <el-descriptions-item label="DB 文件大小(MB)">{{ Number(health.storage.db_file_size_mb || 0).toFixed(3) }}</el-descriptions-item>
        <el-descriptions-item label="RSS 内存(MB)">{{ Number(health.storage.rss_memory_mb || 0).toFixed(2) }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <template #header><div class="head">最近错误</div></template>
      <el-table :data="health.recent_errors" border>
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="message" label="错误信息" min-width="300" show-overflow-tooltip />
        <el-table-column prop="trace_id" label="TraceId" min-width="220" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" min-width="170" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.header-row { display: flex; align-items: center; justify-content: space-between; }
.head { font-size: 16px; font-weight: 600; }
.summary { display: flex; gap: 18px; margin-bottom: 12px; color: #475569; font-size: 13px; flex-wrap: wrap; }
</style>
